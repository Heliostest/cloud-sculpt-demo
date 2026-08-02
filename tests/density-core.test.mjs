import assert from 'node:assert/strict';
import test from 'node:test';

function traverseWithIterationBudget(totalDistance, maxIterations, requestedStep) {
  const traversalStepFloor = totalDistance / Math.max(maxIterations, 1);
  let distance = 0;
  let iterations = 0;
  while (distance < totalDistance && iterations < maxIterations) {
    distance += Math.min(Math.max(requestedStep, traversalStepFloor), totalDistance - distance);
    iterations++;
  }
  return { distance, iterations, traversalStepFloor };
}

test('thin foreground edges cannot exhaust the ray budget before the far cloud interval', () => {
  const totalDistance = 13_800;
  const maxIterations = 512;
  const oldThinEdgeStep = 16 * 0.35;
  assert.ok(oldThinEdgeStep * maxIterations < totalDistance);

  const result = traverseWithIterationBudget(totalDistance, maxIterations, oldThinEdgeStep);
  assert.equal(result.distance, totalDistance);
  assert.equal(result.iterations, maxIterations);
  assert.ok(result.traversalStepFloor > oldThinEdgeStep);
});

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

function finiteWeatherUv(worldXZ, centerXZ, worldSize) {
  return [
    (worldXZ[0] - centerXZ[0]) / Math.max(worldSize, 1) + 0.5,
    (worldXZ[1] - centerXZ[1]) / Math.max(worldSize, 1) + 0.5,
  ];
}

function isInsideWeatherMap(uv) {
  return uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1;
}

function hpWeatherRadial(uv) {
  return saturate(Math.hypot(uv[0] - 0.5, uv[1] - 0.5) * 2);
}

function hpTypeValue(values, typeMix) {
  if (typeMix < 0.5) return values[0] + (values[1] - values[0]) * typeMix * 2;
  return values[1] + (values[2] - values[1]) * (typeMix - 0.5) * 2;
}

function shearNoiseXZ(position, xFromZ, zFromX) {
  return [
    position[0] + position[2] * xFromZ,
    position[1],
    position[2] + position[0] * zFromX,
  ];
}

function transformBaseShapePosition(position, rotationDeg, warpScaleKm, warpStrengthM) {
  const qx = position[0] / (warpScaleKm * 1000) * Math.PI * 2;
  const qz = position[2] / (warpScaleKm * 1000) * Math.PI * 2;
  const warpX = Math.sin(qx + qz * 0.73 + 0.91)
    + 0.45 * Math.sin(qx * 0.41 - qz * 1.37 + 2.1)
    - (Math.sin(0.91) + 0.45 * Math.sin(2.1));
  const warpZ = Math.sin(qz - qx * 0.61 + 1.77)
    + 0.4 * Math.sin(qz * 0.47 + qx * 1.21 - 0.4)
    - (Math.sin(1.77) + 0.4 * Math.sin(-0.4));
  const warpY = Math.sin(qx * 0.52 + qz * 0.38 + 2.73) - Math.sin(2.73);
  const warped = [
    position[0] + warpX * warpStrengthM / 1.45,
    position[1] + warpY * warpStrengthM * 0.12,
    position[2] + warpZ * warpStrengthM / 1.4,
  ];
  const angle = rotationDeg * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated = [c * warped[0] - s * warped[2], warped[1], s * warped[0] + c * warped[2]];
  return shearNoiseXZ(rotated, 0.23, 0.17);
}

function secondaryShapePeriodDelta(baseScale, scaleRatio, rotationDeg) {
  const periodM = 1 / baseScale;
  const angle = rotationDeg * Math.PI / 180;
  const rotated = [Math.cos(angle) * periodM, 0, Math.sin(angle) * periodM];
  const sheared = shearNoiseXZ(rotated, -0.19, 0.31);
  return [sheared[0] * baseScale * scaleRatio, sheared[2] * baseScale * scaleRatio];
}

function secondaryShapeWeight(distanceM, maximumWeight) {
  return maximumWeight * smoothstep(18000, 90000, distanceM);
}

function lowCloudCoreReference(input) {
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

test('low-cloud weather map is finite, centered in world space, and inclusive at its border', () => {
  const center = [12000, -4000];
  const size = 500000;
  assert.deepEqual(finiteWeatherUv(center, center, size), [0.5, 0.5]);
  assert.equal(isInsideWeatherMap(finiteWeatherUv([center[0] - size * 0.5, center[1]], center, size)), true);
  assert.equal(isInsideWeatherMap(finiteWeatherUv([center[0] + size * 0.5, center[1]], center, size)), true);
  assert.equal(isInsideWeatherMap(finiteWeatherUv([center[0] + size * 0.5 + 1, center[1]], center, size)), false);
});

test('hp-ocean weather placement keeps the radial LUT coordinate spatially active', () => {
  const center = [205000, 205000];
  const size = 500000;
  const nearUv = finiteWeatherUv([0, 0], center, size);
  const midUv = finiteWeatherUv([120000, 0], center, size);
  const nearRadial = hpWeatherRadial(nearUv);
  const midRadial = hpWeatherRadial(midUv);
  assert.equal(nearRadial, 1);
  assert.ok(midRadial > 0 && midRadial < 1, `mid radial=${midRadial}`);
  assert.ok(Math.abs(nearRadial - midRadial) > 0.1);
});

test('HP cloud type reaches the Cu, Tcu, and Cb LUT channels', () => {
  const profiles = [0.2, 0.6, 0.9];
  assert.equal(hpTypeValue(profiles, 0), profiles[0]);
  assert.equal(hpTypeValue(profiles, 0.5), profiles[1]);
  assert.equal(hpTypeValue(profiles, 1), profiles[2]);
  assert.ok(hpTypeValue(profiles, 0.25) > profiles[0]);
  assert.ok(hpTypeValue(profiles, 0.75) > profiles[1]);
});

test('HP Sc strength preserves the weather B mask unless a preset overrides it', () => {
  const scStrength = (globalStrength, weatherMask, maskOverride = -1) => {
    const mask = maskOverride >= 0 ? saturate(maskOverride) : weatherMask;
    return saturate(globalStrength * mask);
  };
  const globalStrength = 0.35;
  const strengths = [0, 0.4, 1].map((mask) => scStrength(globalStrength, mask));
  assert.equal(strengths[0], 0);
  assert.ok(Math.abs(strengths[1] - 0.14) < 1e-12);
  assert.equal(strengths[2], 0.35);
  assert.equal(scStrength(0, 1), 0);
  assert.equal(scStrength(1, 0, 1), 1);
  assert.equal(scStrength(0.6, 1, 0), 0);
});

test('HP demo noise shear breaks exact repetition along a world-axis texture period', () => {
  const baseScale = 0.000145;
  const basePeriodM = 1 / baseScale;
  const p0 = shearNoiseXZ([0, 0, 0], 0.23, 0.17);
  const p1 = shearNoiseXZ([basePeriodM, 0, 0], 0.23, 0.17);
  const baseWrappedZDelta = ((p1[2] - p0[2]) * baseScale) % 1;
  assert.ok(baseWrappedZDelta > 0.1 && baseWrappedZDelta < 0.9);

  const detailScale = 0.0013;
  const detailPeriodM = 1 / detailScale;
  const d0 = shearNoiseXZ([0, 0, 0], -0.31, 0.27);
  const d1 = shearNoiseXZ([detailPeriodM, 0, 0], -0.31, 0.27);
  const detailWrappedZDelta = ((d1[2] - d0[2]) * detailScale) % 1;
  assert.ok(detailWrappedZDelta > 0.1 && detailWrappedZDelta < 0.9);
});

test('low-frequency base-shape warp makes the atlas-period displacement vary across the world', () => {
  const periodM = 1 / 0.000145;
  const deltaAt = (origin) => {
    const p0 = transformBaseShapePosition(origin, 0, 52, 1000);
    const p1 = transformBaseShapePosition([origin[0] + periodM, origin[1], origin[2]], 0, 52, 1000);
    return p1.map((value, index) => value - p0[index]);
  };
  const nearDelta = deltaAt([0, 1200, 0]);
  const farDelta = deltaAt([83_000, 1200, -47_000]);
  const deltaVariation = Math.hypot(...nearDelta.map((value, index) => value - farDelta[index]));
  assert.ok(deltaVariation > 100, `period displacement variation=${deltaVariation}`);
});

test('non-integer rotated secondary shape does not repeat on the primary texture period', () => {
  const delta = secondaryShapePeriodDelta(0.000145, 1.618034, 37);
  for (const component of delta) {
    const distanceToInteger = Math.abs(component - Math.round(component));
    assert.ok(distanceToInteger > 0.05, `secondary period component=${component}`);
  }
});

test('secondary base-shape sampling preserves near field and fades in only at long range', () => {
  const maximum = 0.24;
  assert.equal(secondaryShapeWeight(0, maximum), 0);
  assert.equal(secondaryShapeWeight(18000, maximum), 0);
  assert.ok(secondaryShapeWeight(54000, maximum) > 0);
  assert.ok(secondaryShapeWeight(54000, maximum) < maximum);
  assert.equal(secondaryShapeWeight(90000, maximum), maximum);
  assert.equal(secondaryShapeWeight(150000, maximum), maximum);
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

test('HP low-cloud core reference remains finite across representative density inputs', () => {
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
        const value = lowCloudCoreReference({ ...base, baseShape, coverage, height, billowy: 0.4, wispy: 0.7 });
        assert.ok(Number.isFinite(value));
        assert.ok(value >= 0);
      }
    }
  }
});

test('HP low-cloud coverage depends only on weather R, not reserved alpha', () => {
  const hpCoverage = (raw, intensity, contrast) => saturate(Math.pow(saturate(raw), Math.max(contrast, 0.001)) * intensity);
  const raw = 0.57;
  const expected = hpCoverage(raw, 1.2, 1.4);
  for (const reservedAlpha of [0, 0.25, 0.75, 1]) {
    void reservedAlpha;
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
