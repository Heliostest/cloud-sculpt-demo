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
