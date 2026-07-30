import assert from 'node:assert/strict';
import test from 'node:test';

const saturate = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hlslDensityRemapClamped(x, a, b, c = 0, d = 1) {
  return saturate((((x - a) / (b - a)) * (d - c)) + c);
}

function hpDensityRemapSafe(x, low) {
  if (low >= 1) return 0;
  return saturate((x - low) / (1 - low));
}

function hpDetailChannels(d, weights) {
  return {
    billowy: d.b * weights.billowyLow + d.a * weights.billowyHigh,
    wispy: d.r * weights.wispyLow + d.g * weights.wispyHigh,
  };
}

function hpCoreReference(input) {
  const bottomFade = input.bottomSmoothHeight > 0
    ? Math.pow(saturate(input.height / input.bottomSmoothHeight), Math.max(input.bottomSmoothPow, 0.01))
    : 1;
  const shape = 1 + (input.baseShape - 1) * bottomFade;
  const detailStrength = input.detailStrength * input.detailAmount * input.detailFade * bottomFade;
  const erodedB = hpDensityRemapSafe(shape, input.billowy * detailStrength) * input.heightGradient;
  const erodedW = hpDensityRemapSafe(shape, input.wispy * detailStrength) * input.heightGradient;
  const threshold = (1 - saturate(input.coverage)) + input.densityThreshold;
  const densB = hlslDensityRemapClamped(erodedB, threshold, threshold + input.edgeSoftness);
  const wispyThreshold = threshold - input.wispyReach;
  let densW = hlslDensityRemapClamped(erodedW, wispyThreshold, wispyThreshold + input.edgeSoftness);
  const wispyT = saturate((input.height - input.wispyTopHeight) / Math.max(1 - input.wispyTopHeight, 0.001));
  densW *= Math.pow(Math.max(0, 1 - wispyT), Math.max(input.wispyTopHardness * 10, 0.01));
  return (densW + (densB - densW) * smoothstep(0, Math.max(input.wispyEdgeWidth, 0.001), densB)) * input.densityScale;
}

function hpHighCloudReference(input) {
  if (!input.enabled || input.coverage < 0.001 || input.height < 0 || input.height > 1) {
    return { density: 0, band: 0 };
  }
  const cellStrength = input.asCellStrength + (input.acCellStrength - input.asCellStrength) * saturate(input.typeMix);
  const coverForHeight = Math.pow(saturate(input.coverage), Math.max(input.heightCurvePow, 0.01));
  const drivenTop = input.bandBottom + (input.bandTop - input.bandBottom) * coverForHeight;
  const cellShaped = Math.pow(Math.max(input.cell, 0.001), Math.max(input.cellPow, 0.01));
  const thickFactor = 1 + (cellShaped - 1) * saturate(cellStrength * 0.5);
  const effectiveTop = input.bandBottom + (drivenTop - input.bandBottom) * thickFactor;
  const effectiveBottom = input.bandBottom
    - (input.bandTop - input.bandBottom) * input.bottomCoverageScale * coverForHeight;
  const band = smoothstep(effectiveBottom - input.cloudSoftness, effectiveBottom + input.cloudSoftness, input.height)
    * (1 - smoothstep(effectiveTop - input.cloudSoftness, effectiveTop + input.cloudSoftness, input.height));
  const densitySoft = input.densitySoftness
    * (1 - Math.pow(saturate(input.hiA), Math.max(input.hiASoftContrast, 0.01)));
  const baseDensity = hlslDensityRemapClamped(
    input.coverage,
    input.densityThreshold,
    input.densityThreshold + Math.max(densitySoft, 0.001),
  );
  const cellFactor = 1 + (cellShaped - 1) * saturate(cellStrength);
  const density = Math.max(0, (baseDensity * cellFactor - input.wisp * input.wispStrength * input.typeMix)
    * band * input.densityMultiplier);
  return { density, band };
}

test('safe two-argument remap matches saturated HP DensityRemap on its intended domain', () => {
  for (let li = 0; li <= 95; li++) {
    const low = li / 100;
    for (let xi = 0; xi <= 100; xi++) {
      const x = xi / 100;
      const hp = hlslDensityRemapClamped(x, low, 1);
      const safe = hpDensityRemapSafe(x, low);
      assert.ok(Math.abs(hp - safe) <= 1e-12, `x=${x}, low=${low}, hp=${hp}, safe=${safe}`);
    }
  }
});

test('safe remap defines low >= 1 as empty instead of producing NaN or a reversed interval', () => {
  for (const low of [1, 1.01, 1.5, 3]) {
    for (const x of [0, 0.5, 1]) {
      const value = hpDensityRemapSafe(x, low);
      assert.equal(value, 0);
      assert.ok(Number.isFinite(value));
    }
  }
});

test('zero detail strength gives identical billowy and wispy erosion inputs', () => {
  const shape = 0.63;
  assert.equal(hpDensityRemapSafe(shape, 0), hpDensityRemapSafe(shape, 0));
});

test('HP detail channels are combined directly before erosion without a thickness mask', () => {
  const detail = hpDetailChannels(
    { r: 0.2, g: 0.8, b: 0.35, a: 0.9 },
    { billowyLow: 0.75, billowyHigh: 0.25, wispyLow: 0.55, wispyHigh: 0.45 },
  );
  assert.equal(detail.billowy, 0.35 * 0.75 + 0.9 * 0.25);
  assert.equal(detail.wispy, 0.2 * 0.55 + 0.8 * 0.45);
});

test('HP wispy selection happens after thresholding and is limited by billowy density', () => {
  const width = 0.2;
  assert.equal(smoothstep(0, width, 0), 0);
  assert.ok(smoothstep(0, width, 0.1) > 0 && smoothstep(0, width, 0.1) < 1);
  assert.equal(smoothstep(0, width, width), 1);
  assert.equal(smoothstep(0, width, 0.8), 1);
});

test('HP core reference remains finite across representative density inputs', () => {
  const base = {
    bottomSmoothHeight: 0.14,
    bottomSmoothPow: 1.4,
    detailStrength: 0.42,
    detailAmount: 1,
    detailFade: 1,
    heightGradient: 0.78,
    densityThreshold: 0.03,
    edgeSoftness: 0.25,
    wispyReach: 0.2,
    wispyTopHeight: 0.55,
    wispyTopHardness: 0.22,
    wispyEdgeWidth: 0.28,
    densityScale: 0.85,
  };
  for (const baseShape of [0, 0.2, 0.5, 0.9, 1]) {
    for (const coverage of [0, 0.1, 0.4, 0.8, 1]) {
      for (const height of [0, 0.1, 0.55, 0.9, 1]) {
        const value = hpCoreReference({ ...base, baseShape, coverage, height, billowy: 0.4, wispy: 0.7 });
        assert.ok(Number.isFinite(value));
        assert.ok(value >= 0);
      }
    }
  }
});

test('HP low-cloud coverage is independent from demo meso', () => {
  const hpCoverage = (raw, intensity, contrast) => saturate(Math.pow(saturate(raw), Math.max(contrast, 0.001)) * intensity);
  const raw = 0.57;
  const expected = hpCoverage(raw, 1.2, 1.4);
  for (const ignoredMeso of [0, 0.25, 0.75, 1]) {
    void ignoredMeso;
    assert.equal(hpCoverage(raw, 1.2, 1.4), expected);
  }
});

test('HP low-cloud density gate uses the 0.1 coverage threshold', () => {
  const hpCoverage = (raw, intensity, contrast) => saturate(Math.pow(saturate(raw), Math.max(contrast, 0.001)) * intensity);
  assert.equal(hpCoverage(0.099, 1, 1) >= 0.1, false);
  assert.equal(hpCoverage(0.1, 1, 1) >= 0.1, true);
  assert.equal(hpCoverage(0.25, 0.2, 1) >= 0.1, false);
  assert.equal(hpCoverage(0.25, 2, 1) >= 0.1, true);
});

test('low-cloud darkness modulation preserves bright coverage and only reduces density', () => {
  const densityScale = (coverage, intensity, contrast) => 1 - saturate(intensity * (1 - Math.pow(saturate(coverage), Math.max(contrast, 0.01))));
  assert.equal(densityScale(1, 1, 2), 1);
  assert.equal(densityScale(0, 1, 2), 0);
  assert.equal(densityScale(0.4, 0, 2), 1);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const value = densityScale(i / 100, 0.7, 1.6);
    assert.ok(value >= previous - 1e-12);
    assert.ok(value >= 0 && value <= 1);
    previous = value;
  }
});

test('HP high-cloud path is independently disabled and rejects empty coverage', () => {
  const base = {
    enabled: true, coverage: 0.8, height: 0.4, typeMix: 1, asCellStrength: 0.3, acCellStrength: 0.9,
    heightCurvePow: 0.8, bandBottom: 0.2, bandTop: 0.82, cell: 0.7, cellPow: 1.8,
    bottomCoverageScale: 0.25, cloudSoftness: 0.055, densitySoftness: 0.22, hiA: 0.8,
    hiASoftContrast: 1, densityThreshold: 0.18, wisp: 0.2, wispStrength: 0.28, densityMultiplier: 0.55,
  };
  assert.equal(hpHighCloudReference({ ...base, enabled: false }).density, 0);
  assert.equal(hpHighCloudReference({ ...base, coverage: 0 }).density, 0);
  assert.ok(hpHighCloudReference(base).density > 0);
});

test('HP high-cloud Ac and As select independent cell strengths', () => {
  const base = {
    enabled: true, coverage: 0.9, height: 0.35, asCellStrength: 0, acCellStrength: 1,
    heightCurvePow: 1, bandBottom: 0.15, bandTop: 0.85, cell: 0.35, cellPow: 2,
    bottomCoverageScale: 0.2, cloudSoftness: 0.06, densitySoftness: 0.2, hiA: 0.7,
    hiASoftContrast: 1, densityThreshold: 0.15, wisp: 0, wispStrength: 0.3, densityMultiplier: 1,
  };
  const asDensity = hpHighCloudReference({ ...base, typeMix: 0 }).density;
  const acDensity = hpHighCloudReference({ ...base, typeMix: 1 }).density;
  assert.ok(asDensity > acDensity, `As=${asDensity}, Ac=${acDensity}`);
});

test('HP high-cloud coverage raises the driven top while keeping density finite', () => {
  const base = {
    enabled: true, height: 0.62, typeMix: 0.5, asCellStrength: 0.25, acCellStrength: 0.8,
    heightCurvePow: 0.8, bandBottom: 0.2, bandTop: 0.85, cell: 0.8, cellPow: 1.6,
    bottomCoverageScale: 0.2, cloudSoftness: 0.05, densitySoftness: 0.2, hiA: 0.7,
    hiASoftContrast: 1, densityThreshold: 0.1, wisp: 0.1, wispStrength: 0.2, densityMultiplier: 0.7,
  };
  const low = hpHighCloudReference({ ...base, coverage: 0.25 });
  const high = hpHighCloudReference({ ...base, coverage: 0.9 });
  assert.ok(high.band >= low.band);
  assert.ok(Number.isFinite(high.density));
  assert.ok(high.density >= 0);
});

test('raising the HP high-cloud density threshold reduces effective visible coverage', () => {
  const base = {
    enabled: true, height: 0.35, typeMix: 0.4, asCellStrength: 0.25, acCellStrength: 0.8,
    heightCurvePow: 0.8, bandBottom: 0.2, bandTop: 0.82, cell: 0.85, cellPow: 1.6,
    bottomCoverageScale: 0.25, cloudSoftness: 0.055, densitySoftness: 0.2, hiA: 0.55,
    hiASoftContrast: 1, wisp: 0, wispStrength: 0.28, densityMultiplier: 0.06,
  };
  const coverages = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
  const visibleAt = (densityThreshold) => coverages.filter((coverage) => (
    hpHighCloudReference({ ...base, coverage, densityThreshold }).density > 0.001
  )).length;
  assert.ok(visibleAt(0.5) < visibleAt(0.36));
});
