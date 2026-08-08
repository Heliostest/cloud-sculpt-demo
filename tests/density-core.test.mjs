import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const raymarchSource = readFileSync(new URL('../shaders/raymarch.fg.wgsl', import.meta.url), 'utf8');
const densitySource = readFileSync(new URL('../shaders/density.wgsl', import.meta.url), 'utf8');
const commonSource = readFileSync(new URL('../shaders/common.wgsl', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/renderer.ts', import.meta.url), 'utf8');
const packingSource = readFileSync(new URL('../src/cloudBodyPacking.ts', import.meta.url), 'utf8');

function wgslFunctionSource(name, nextMarker) {
  const start = raymarchSource.indexOf(`fn ${name}`);
  const end = raymarchSource.indexOf(nextMarker, start);
  assert.ok(start >= 0, `missing WGSL function ${name}`);
  assert.ok(end > start, `missing WGSL marker after ${name}: ${nextMarker}`);
  return raymarchSource.slice(start, end);
}

function densityWgslFunctionSource(name, nextMarker) {
  const start = densitySource.indexOf(`fn ${name}`);
  const end = densitySource.indexOf(nextMarker, start);
  assert.ok(start >= 0, `missing density WGSL function ${name}`);
  assert.ok(end > start, `missing density WGSL marker after ${name}: ${nextMarker}`);
  return densitySource.slice(start, end);
}

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

function raySphereDistances(origin, direction, radius) {
  const b = origin[0] * direction[0] + origin[1] * direction[1];
  const c = origin[0] ** 2 + origin[1] ** 2 - radius ** 2;
  const h = b * b - c;
  if (h < 0) return null;
  const root = Math.sqrt(h);
  return [-b - root, -b + root];
}

function ellipseSmoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function horizontalEllipseMask(point, bounds, rotationDeg, feather, bounded = true) {
  if (!bounded) return 1;
  const angle = rotationDeg * Math.PI / 180;
  const dx = point[0] - bounds[0];
  const dz = point[1] - bounds[1];
  const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
  const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
  const distance = Math.hypot(localX / bounds[2], localZ / bounds[3]);
  return 1 - ellipseSmoothstep(1 - feather, 1, distance);
}

const floatBits = new DataView(new ArrayBuffer(4));

function f32Bits(value) {
  floatBits.setFloat32(0, Math.fround(value), true);
  return floatBits.getUint32(0, true);
}

function hashCloudBodyPhase(seed) {
  let value = seed >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function cloudBodyPhase(bodyIndex, center) {
  const centerSeed = (
    hashCloudBodyPhase(f32Bits(center[0]) ^ 0x68bc21eb)
    ^ hashCloudBodyPhase(f32Bits(center[1]) ^ 0x02e5be93)
  ) >>> 0;
  const seed = hashCloudBodyPhase((bodyIndex ^ centerSeed ^ 0x9e3779b9) >>> 0);
  return [0xa341316c, 0xc8013ea4, 0xad90777d]
    .map((salt) => hashCloudBodyPhase((seed ^ salt) >>> 0) / 0xffffffff);
}

function deriveCloudBodyLocalFrame({
  bodyIndex,
  worldXZ,
  altitudeM,
  baseM,
  topM,
  center,
  radii,
  rotationDeg,
  bounded,
}) {
  const angle = rotationDeg * Math.PI / 180;
  const dx = worldXZ[0] - center[0];
  const dz = worldXZ[1] - center[1];
  const localX = Math.cos(angle) * dx + Math.sin(angle) * dz;
  const localZ = -Math.sin(angle) * dx + Math.cos(angle) * dz;
  const heightMeters = altitudeM - baseM;
  const heightSpan = Math.max(topM - baseM, 1);
  const horizontalScale = bounded
    ? radii.map((radius) => Math.max(radius, 1))
    : [10_000, 10_000];
  return {
    meters: [localX, heightMeters, localZ],
    unit: [localX / horizontalScale[0], heightMeters / heightSpan, localZ / horizontalScale[1]],
    normalizedHeight: Math.min(1, Math.max(0, heightMeters / heightSpan)),
    phase: cloudBodyPhase(bodyIndex, center),
  };
}

function sanitizeMorphologyDensity(density) {
  if (Number.isNaN(density) || density <= 0) return 0;
  return Math.min(density, 10_000);
}

function replaceSampleDensity(sample, density) {
  return { ...sample, density: sanitizeMorphologyDensity(density) };
}

function safeMorphBlend(base, shaped, strength) {
  if (Number.isNaN(strength) || strength <= 0) return base;
  const weight = Math.min(1, Math.max(0, strength));
  const density = sanitizeMorphologyDensity(base.density)
    + (sanitizeMorphologyDensity(shaped.density) - sanitizeMorphologyDensity(base.density)) * weight;
  return replaceSampleDensity(base, density);
}

function verticalBand(height, bottomSoft, topSoft) {
  if (Number.isNaN(height) || height < 0 || height > 1) return 0;
  const bottomWidth = Number.isNaN(bottomSoft) ? 0 : Math.min(1, Math.max(0, bottomSoft));
  const topWidth = Number.isNaN(topSoft) ? 0 : Math.min(1, Math.max(0, topSoft));
  const bottom = bottomWidth > 1e-5 ? ellipseSmoothstep(0, bottomWidth, height) : 1;
  const top = topWidth > 1e-5 ? 1 - ellipseSmoothstep(1 - topWidth, 1, height) : 1;
  return Math.min(1, Math.max(0, bottom * top));
}

function rotateMorphologyXZ(position, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c * position[0] + s * position[2],
    position[1],
    -s * position[0] + c * position[2],
  ];
}

function anisotropicCoordinate(position, scale) {
  return position.map((value, index) => {
    const finiteScale = Number.isNaN(scale[index]) ? 1 : Math.abs(scale[index]);
    return value * Math.max(finiteScale, 1e-5);
  });
}

function morphologyLodReference({
  simpleMode,
  cameraDistance,
  maximumDistance,
  baseM,
  topM,
  stepLen,
}) {
  if (simpleMode) return { frequencyScale: 0.45, detailWeight: 0 };
  const distanceWeight = 1 - ellipseSmoothstep(
    maximumDistance * 0.25,
    maximumDistance * 0.8,
    cameraDistance,
  );
  const layerHeight = Math.max(topM - baseM, 1);
  const referenceStep = Math.max(16, layerHeight / 64);
  const stepWeight = 1 - ellipseSmoothstep(
    referenceStep * 1.5,
    referenceStep * 6,
    Math.max(stepLen, 0),
  );
  const detailWeight = Math.min(1, Math.max(0, distanceWeight * stepWeight));
  return { frequencyScale: 0.45 + (1 - 0.45) * detailWeight, detailWeight };
}

function cellularCarrierReference(position, phase, lod) {
  const q = position.map((value, index) => value * Math.PI * 2 * lod.frequencyScale + phase[index] * Math.PI * 2);
  const broadCells = Math.cos(q[0]) * Math.cos(q[2]);
  let signal = broadCells;
  if (lod.detailWeight > 1e-4) {
    const staggeredCells = Math.cos(q[0] * 0.57 + q[2] * 0.83 + q[1] * 0.31);
    signal = broadCells + (staggeredCells - broadCells) * 0.3 * lod.detailWeight;
  }
  return Math.min(1, Math.max(0, 0.5 + 0.5 * signal));
}

function ridgeFiberCarrierReference(position, phase, lod) {
  const q = position.map((value, index) => value * Math.PI * 2 * lod.frequencyScale + phase[index] * Math.PI * 2);
  const primary = Math.sin(q[2] + Math.sin(q[0] * 0.37 + phase[0] * Math.PI * 2));
  let fiberSignal = primary;
  if (lod.detailWeight > 1e-4) {
    const branch = Math.sin((q[1] + q[2]) * 1.73 + Math.sin(q[0] * 0.41 + phase[1]));
    fiberSignal = primary + (branch - primary) * 0.28 * lod.detailWeight;
  }
  const ridge = Math.min(1, Math.max(0, 1 - Math.abs(fiberSignal)));
  return ellipseSmoothstep(0.32, 0.88, ridge);
}

function sheetMacroVariationReference(position, phase, lod) {
  const q = position.map((value, index) => value * Math.PI * 2 * lod.frequencyScale + phase[index] * Math.PI * 2);
  const broad = Math.sin(q[0] * 0.31 + q[2] * 0.23);
  let signal = broad;
  if (lod.detailWeight > 1e-4) {
    const cross = Math.cos(q[2] * 0.19 - q[0] * 0.17 + q[1] * 0.11);
    signal = broad + (cross - broad) * 0.35 * lod.detailWeight;
  }
  return Math.min(1, Math.max(0, 0.75 + signal * 0.2));
}

function cumulusMorphologyFactor({ height, development, verticalDevelopment, carrier, erosionScale }) {
  const finiteDevelopment = Math.min(1, Math.max(0, development));
  const verticalArtDirection = Math.min(1, Math.max(0, verticalDevelopment));
  const domeDevelopment = Math.min(1, Math.max(0,
    finiteDevelopment * (0.55 + (1.25 - 0.55) * verticalArtDirection)
      + (verticalArtDirection - 0.55) * 0.25,
  ));
  const erosionAmount = Math.min(1, Math.max(0, Math.max(erosionScale, 0.05) / 2));
  const cauliflower = ellipseSmoothstep(
    0.58 + (0.34 - 0.58) * erosionAmount,
    0.9 + (0.7 - 0.9) * erosionAmount,
    carrier,
  );
  const baseProtection = ellipseSmoothstep(0.12, 0.22, height);
  const topProtection = 1 - ellipseSmoothstep(0.94, 1, height);
  const morphologyBand = Math.min(1, Math.max(0, baseProtection * topProtection));
  const domeWeight = ellipseSmoothstep(
    0.62 + (0.32 - 0.62) * domeDevelopment,
    0.84 + (0.56 - 0.84) * domeDevelopment,
    height,
  );
  const cellFactor = 0.76 + (1.24 - 0.76) * cauliflower;
  const domeFactor = 1 + domeWeight
    * domeDevelopment
    * (0.8 + (1.2 - 0.8) * verticalArtDirection)
    * 0.22;
  return 1 + (cellFactor * domeFactor - 1) * morphologyBand;
}

function cumulonimbusAnvilWeight(height, strength) {
  const anvilBand = ellipseSmoothstep(0.7, 0.82, height)
    * (1 - ellipseSmoothstep(0.96, 1, height));
  return Math.min(1, Math.max(0, anvilBand * strength));
}

function sheetVerticalProfileReference(height, profile) {
  if (height < profile.bottomStart || height > profile.topEnd) return 0;
  const bottom = ellipseSmoothstep(profile.bottomStart, profile.bottomEnd, height);
  const top = 1 - ellipseSmoothstep(profile.topStart, profile.topEnd, height);
  return Math.min(1, Math.max(0, bottom * top));
}

function sheetFoundationReference({
  rawCoverage,
  sheetUniformity,
  densityScale,
  detailAmount,
  erosionScale,
  height,
  macroVariation,
  fiber = 0.5,
  recipe,
  profile,
}) {
  if (recipe.familyStrength <= 1e-5 || densityScale <= 1e-5 || rawCoverage <= 1e-5) return 0;
  const weatherSupport = ellipseSmoothstep(0, 0.12, Math.min(1, Math.max(0, rawCoverage)));
  const uniformity = Math.min(1, Math.max(0, sheetUniformity));
  const sheetCoverage = rawCoverage + (weatherSupport - rawCoverage) * uniformity;
  const bottomRegion = 1 - ellipseSmoothstep(0.2, 0.55, height);
  const profileHeight = Math.min(1, Math.max(0,
    height + (1 - macroVariation) * Math.max(recipe.bottomDroopStrength, 0) * bottomRegion,
  ));
  const verticalShape = sheetVerticalProfileReference(profileHeight, profile);
  if (verticalShape <= 0) return 0;
  const variationWeight = Math.min(1, Math.max(0,
    recipe.macroVariationStrength * (1 + (0.35 - 1) * uniformity),
  ));
  const macroFactor = 1 + (macroVariation - 1) * variationWeight;
  const lowerEdge = 1 - ellipseSmoothstep(profile.bottomEnd, profile.topStart, profileHeight);
  const softEdge = 1 - ellipseSmoothstep(0.45, 0.95, verticalShape);
  const erosionRegion = Math.min(1, Math.max(0, Math.max(lowerEdge, softEdge * 0.35)));
  const erosionWeight = Math.min(1, Math.max(0,
    recipe.bottomErosionStrength
      * Math.max(erosionScale, 0)
      * Math.min(1, Math.max(0, detailAmount))
      * erosionRegion,
  ));
  const erosionTarget = 0.72 + (1 - 0.72) * macroVariation;
  const erosionFactor = 1 + (erosionTarget - 1) * erosionWeight;
  const fiberFactor = 1 + (fiber - 0.5)
    * Math.min(1, Math.max(0, recipe.directionalFiberStrength))
    * 0.16;
  return sanitizeMorphologyDensity(
    sheetCoverage
      * verticalShape
      * macroFactor
      * erosionFactor
      * fiberFactor
      * densityScale
      * Math.max(recipe.densityMultiplier, 0),
  );
}

function fiberVerticalProfileReference(height, profile) {
  if (height < profile.bottomStart || height > profile.topEnd) return 0;
  const bottom = ellipseSmoothstep(profile.bottomStart, profile.bottomEnd, height);
  const top = 1 - ellipseSmoothstep(profile.topStart, profile.topEnd, height);
  return Math.min(1, Math.max(0, bottom * top));
}

function fiberDensityReference({
  compatibilityDensity,
  height,
  fiberStrength,
  fiberSignal,
  macroSupport = 1,
  erosionScale,
  tailSignal,
  recipe,
  profile,
}) {
  const strength = Math.min(1, Math.max(0, recipe.familyStrength * fiberStrength));
  if (strength <= 1e-5 || compatibilityDensity <= 0) return compatibilityDensity;
  const profileBand = fiberVerticalProfileReference(height, profile);
  const erosionAmount = Math.min(1, Math.max(0, Math.max(erosionScale, 0) / 2));
  const tailMask = ellipseSmoothstep(
    0.28 + (0.6 - 0.28) * erosionAmount,
    0.88,
    Math.min(1, Math.max(0, tailSignal)),
  );
  const breakupFactor = 1 + (tailMask - 1) * erosionAmount;
  const ridgeMask = ellipseSmoothstep(
    0.48,
    0.88,
    Math.min(1, Math.max(0, fiberSignal * breakupFactor)),
  );
  const fiberMask = ridgeMask * ellipseSmoothstep(
    0.12,
    0.82,
    Math.min(1, Math.max(0, macroSupport)),
  );
  const fiberFactor = Math.min(
    recipe.valleyDensity + (recipe.peakDensity - recipe.valleyDensity) * fiberMask,
    1.35,
  );
  const shaped = sanitizeMorphologyDensity(compatibilityDensity * profileBand * fiberFactor);
  return sanitizeMorphologyDensity(compatibilityDensity + (shaped - compatibilityDensity) * strength);
}

function bodyLifecycleScale(enabled, life, peak, time) {
  if (!enabled) return 1;
  const birth = life[0];
  const grow = Math.max(birth, life[1]);
  const decay = Math.max(grow, life[2]);
  const death = Math.max(decay, life[3]);
  if (time < birth || time >= death) return 0;
  if (time < grow) return ellipseSmoothstep(birth, Math.max(birth + 0.001, grow), time) * peak;
  if (time < decay) return peak;
  return (1 - ellipseSmoothstep(decay, Math.max(decay + 0.001, death), time)) * peak;
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

test('view marches use non-lattice pixel jitter and cover the effective step span', () => {
  const highMarch = wgslFunctionSource('marchHighCloud', '\nfn marchLowCloud');
  const lowMarch = wgslFunctionSource('marchLowCloud', '\nfn acesFitted');
  const fragment = raymarchSource.slice(raymarchSource.indexOf('@fragment'));

  assert.match(raymarchSource, /fn hashU32\(value: u32\) -> u32/);
  assert.match(raymarchSource, /fn screenSpaceJitter\(pixelCoord: vec2f\) -> f32/);
  assert.match(raymarchSource, /vec2u\(floor\(pixelCoord\)\)/);
  assert.doesNotMatch(raymarchSource, /0\.06711056|0\.00583715|52\.9829189/);
  assert.match(fragment, /let rayJitter = screenSpaceJitter\(inp\.pos\.xy\);/);

  assert.match(highMarch, /fn marchHighCloud\(ro: vec3f, rd: vec3f, rayJitter: f32\)/);
  assert.match(highMarch, /var t = t0 \+ rayJitter \* stepLen;/);
  assert.doesNotMatch(highMarch, /dot\(ro \+ rd \* t0/);

  assert.match(lowMarch, /fn marchLowCloud\(ro: vec3f, rd: vec3f, rayJitter: f32\)/);
  assert.match(lowMarch, /let initialJitterSpan = min\(max\(minStep, traversalStepFloor\), t1 - t0\);/);
  assert.match(lowMarch, /var t = t0 \+ rayJitter \* initialJitterSpan;/);
  assert.doesNotMatch(lowMarch, /dot\(ro \+ rd \* t0/);
});

test('low-cloud volume mip follows the ray segment footprint', () => {
  assert.match(densitySource, /fn volumeFootprintLod\(/);
  assert.match(densitySource, /log2\(max\(footprintTexels, 1\.0\)\)/);
  assert.match(densitySource, /fn sampleBaseShape\(worldPos: vec3f, stepLen: f32\)/);
  assert.match(densitySource, /volumeFootprintLod\(stepLen, U\.hpShapeScale\.xyz, 128\.0, U\.hpLod0\.x\)/);
  assert.match(densitySource, /fn sampleDetailHp\(worldPos: vec3f, stepLen: f32\)/);
  assert.match(densitySource, /volumeFootprintLod\(stepLen, U\.hpDetailScale\.xyz, 64\.0, U\.hpLod0\.y\)/);
  assert.doesNotMatch(densitySource, /let lod = max\(U\.hpLod0\.x, 0\.0\)/);
});

test('long near-horizontal cloud segments receive a second density sample without reducing traversal distance', () => {
  const lowMarch = wgslFunctionSource('marchLowCloud', '\nfn acesFitted');
  assert.match(lowMarch, /let horizonRefinement = 1\.0 - smoothstep\(/);
  assert.match(lowMarch, /pos \+ rd \* \(stepLen \* 0\.5\)/);
  assert.match(lowMarch, /evaluateLowCloud\(refinementPos, stepLen \* 0\.5, false\)/);
  assert.match(lowMarch, /0\.5 \* \(s\.density \+ refinement\.density\)/);
  assert.match(lowMarch, /t \+= stepLen;/);
});

test('each low-cloud layer sends its own genus and cumulus development to the density evaluator', () => {
  const genusConstants = [
    'CUMULUS', 'STRATUS', 'STRATOCUMULUS', 'CUMULONIMBUS', 'ALTOCUMULUS',
    'ALTOSTRATUS', 'NIMBOSTRATUS', 'CIRRUS', 'CIRROSTRATUS', 'CIRROCUMULUS',
  ];
  for (const [index, genus] of genusConstants.entries()) {
    assert.match(densitySource, new RegExp(`const GENUS_${genus}: f32 = ${index}\\.0;`));
  }
  assert.match(commonSource, /struct CloudBodyUniforms/);
  assert.match(commonSource, /layers: array<vec4f, 8>/);
  assert.match(commonSource, /layerShapeDetails: array<vec4f, 8>/);
  assert.match(commonSource, /layerBounds: array<vec4f, 8>/);
  assert.match(commonSource, /layerBoundTransforms: array<vec4f, 8>/);
  assert.match(commonSource, /layerMotion: array<vec4f, 8>/);
  assert.match(commonSource, /layerLife: array<vec4f, 8>/);
  assert.match(commonSource, /layerMorphology0: array<vec4f, 8>/);
  assert.match(commonSource, /layerMorphology1: array<vec4f, 8>/);
  assert.match(commonSource, /@group\(0\) @binding\(15\) var<uniform> B: CloudBodyUniforms/);
  assert.match(packingSource, /CLOUD_BODY_FLOATS_PER_RECORD_SET = 8 \* 4/);
  assert.match(packingSource, /selectVolumeCloudBodies\(bodies/);
  assert.match(packingSource, /target\[shapeOffset\] = CLOUD_GENUS_INDEX\[body\.genus\]/);
  assert.match(packingSource, /target\[shapeOffset \+ 2\] = body\.cumulusDevelopment;/);
  assert.match(packingSource, /target\[boundsOffset\] = body\.centerX;/);
  assert.match(packingSource, /target\[transformOffset\] = \(body\.rotationDeg \* Math\.PI\) \/ 180;/);
  assert.match(packingSource, /target\[transformOffset \+ 2\] = body\.bounded \? 1 : 0;/);
  assert.match(packingSource, /target\[transformOffset \+ 3\] = body\.lifeStart;/);
  assert.match(packingSource, /target\[motionOffset \+ 2\] = body\.morphRate;/);
  assert.match(packingSource, /target\[lifeOffset \+ 3\] = body\.lifeDeath;/);
  assert.match(packingSource, /target\[morphology0Offset\] = body\.morphology\.verticalDevelopment;/);
  assert.match(packingSource, /target\[morphology1Offset \+ 1\] = \(body\.morphology\.fiberAngleDeg \* Math\.PI\) \/ 180;/);
  assert.match(rendererSource, /packVolumeCloudBodies\(volumeBodies, cloudBodyF32\)/);
  assert.doesNotMatch(rendererSource, /params\.layers/);
  assert.match(rendererSource, /const localBody = cloudBodies\.find/);
  assert.doesNotMatch(rendererSource, /params\.hero/);
  assert.match(densitySource, /fn selectedCloudType\(genusIndex: f32, cumulusDevelopment: f32\)/);
  assert.match(densitySource, /for \(var layerIndex = 0u; layerIndex < 8u; layerIndex \+= 1u\)/);
  assert.match(densitySource, /let layer = B\.layers\[layerIndex\]/);
  assert.match(densitySource, /let shapeDetail = B\.layerShapeDetails\[layerIndex\]/);
  assert.match(densitySource, /B\.layerMorphology0\[layerIndex\]/);
  assert.match(densitySource, /B\.layerMorphology1\[layerIndex\]/);
  assert.match(densitySource, /fn layerHorizontalMask\(worldPos: vec3f, bounds: vec4f, transform: vec4f\) -> f32/);
  assert.match(densitySource, /B\.layerBounds\[layerIndex\]/);
  assert.match(densitySource, /B\.layerBoundTransforms\[layerIndex\]/);
  assert.match(densitySource, /density \*= horizontalMask;/);
  assert.match(densitySource, /dispatchCloudGenusDensity\(context, shapeDetail\.x\)/);
  assert.match(densitySource, /shapeDetail\.z,/);
  assert.doesNotMatch(densitySource, /U\.layer[012]/);
  assert.doesNotMatch(packingSource, /params\.layers/);
});

test('all ten cloud genera have explicit density evaluators behind one dispatcher', () => {
  const evaluatorNames = [
    'Cumulus', 'Stratus', 'Stratocumulus', 'Cumulonimbus', 'Altocumulus',
    'Altostratus', 'Nimbostratus', 'Cirrus', 'Cirrostratus', 'Cirrocumulus',
  ];
  for (const evaluatorName of evaluatorNames) {
    assert.match(densitySource, new RegExp(`fn evaluate${evaluatorName}Density\\(`));
  }

  const dispatcherStart = densitySource.indexOf('fn dispatchCloudGenusDensity');
  const dispatcherEnd = densitySource.indexOf('\nfn distanceFade', dispatcherStart);
  assert.ok(dispatcherStart >= 0, 'missing WGSL function dispatchCloudGenusDensity');
  assert.ok(dispatcherEnd > dispatcherStart, 'missing WGSL marker after dispatchCloudGenusDensity');
  const dispatcher = densitySource.slice(dispatcherStart, dispatcherEnd);
  for (const evaluatorName of evaluatorNames) {
    assert.match(dispatcher, new RegExp(`evaluate${evaluatorName}Density\\(context\\)`));
  }
  assert.match(densitySource, /let layerSample = dispatchCloudGenusDensity\(context, shapeDetail\.x\);/);
});

test('cloud genus contexts expose deterministic body-local morphology coordinates to family evaluators', () => {
  const contextStart = densitySource.indexOf('struct CloudGenusDensityContext');
  const contextEnd = densitySource.indexOf('\n};', contextStart);
  const context = densitySource.slice(contextStart, contextEnd);
  for (const field of [
    'bodyIndex: u32',
    'bodyLocalMeters: vec3f',
    'bodyLocalUnit: vec3f',
    'normalizedHeight: f32',
    'bodyPhase: vec3f',
  ]) {
    assert.match(context, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(densitySource, /const UNBOUNDED_BODY_LOCAL_SCALE_M: f32 = 10000\.0;/);
  assert.match(densitySource, /fn deriveCloudBodyLocalFrame\(/);
  assert.match(densitySource, /let centerOffset = worldPos\.xz - bounds\.xy;/);
  assert.match(densitySource, /c \* centerOffset\.x \+ s \* centerOffset\.y/);
  assert.match(densitySource, /-s \* centerOffset\.x \+ c \* centerOffset\.y/);
  assert.match(densitySource, /let heightMeters = altitude\(worldPos\) - baseM;/);
  assert.match(densitySource, /let localFrame = deriveCloudBodyLocalFrame\(\s*layerIndex,\s*densityPos,/);

  const compatibilityStart = densitySource.indexOf('fn evaluateCompatibilityDensity');
  const compatibilityEnd = densitySource.indexOf('\nfn cumulusCellCoordinate', compatibilityStart);
  const compatibility = densitySource.slice(compatibilityStart, compatibilityEnd);
  for (const unusedField of ['bodyIndex', 'bodyLocalMeters', 'bodyLocalUnit', 'normalizedHeight', 'bodyPhase']) {
    assert.doesNotMatch(compatibility, new RegExp(`context\\.${unusedField}`));
  }

  assert.doesNotMatch(
    densitySource,
    /fn evaluateCirrusDensity\(context: CloudGenusDensityContext\) -> DensitySample \{\s*return evaluateCompatibilityDensity/,
  );
  assert.match(
    densitySource,
    /fn evaluateCumulusDensity\(context: CloudGenusDensityContext\)[\s\S]*evaluateCumulusFamily\(context, compatibility\)/,
  );
  assert.match(
    densitySource,
    /fn evaluateCumulonimbusDensity\(context: CloudGenusDensityContext\)[\s\S]*evaluateCumulonimbusFamily\(context, compatibility\)/,
  );
  for (const evaluatorName of ['Stratus', 'Altostratus', 'Nimbostratus', 'Cirrostratus']) {
    assert.match(
      densitySource,
      new RegExp(`fn evaluate${evaluatorName}Density\\(context: CloudGenusDensityContext\\)[\\s\\S]*evaluateSheetFamily\\(context, compatibility, recipe, profile\\)`),
    );
  }
  for (const evaluatorName of ['Stratocumulus', 'Altocumulus', 'Cirrocumulus']) {
    assert.match(
      densitySource,
      new RegExp(`fn evaluate${evaluatorName}Density\\(context: CloudGenusDensityContext\\)[\\s\\S]*evaluateCellularFamily\\(context, compatibility, recipe, profile\\)`),
    );
  }
});

test('body-local coordinates invert rotation and stay finite for bounded and unbounded bodies', () => {
  const baseInput = {
    bodyIndex: 3,
    worldXZ: [370, -140],
    altitudeM: 2100,
    baseM: 1500,
    topM: 3500,
    center: [120, -340],
    radii: [1000, 500],
    rotationDeg: 0,
    bounded: true,
  };
  const zeroRotation = deriveCloudBodyLocalFrame(baseInput);
  assert.deepEqual(zeroRotation.meters, [250, 600, 200]);
  assert.deepEqual(zeroRotation.unit, [0.25, 0.3, 0.4]);
  assert.equal(zeroRotation.normalizedHeight, 0.3);

  const quarterTurn = deriveCloudBodyLocalFrame({ ...baseInput, rotationDeg: 90 });
  assert.ok(Math.abs(quarterTurn.meters[0] - 200) < 1e-9);
  assert.ok(Math.abs(quarterTurn.meters[2] + 250) < 1e-9);

  const unbounded = deriveCloudBodyLocalFrame({
    ...baseInput,
    worldXZ: [9e8, -7e8],
    radii: [Number.MAX_VALUE, Number.MAX_VALUE],
    topM: 1500,
    bounded: false,
  });
  assert.equal(unbounded.unit[0], unbounded.meters[0] / 10_000);
  assert.equal(unbounded.unit[2], unbounded.meters[2] / 10_000);
  for (const value of [...unbounded.meters, ...unbounded.unit, unbounded.normalizedHeight, ...unbounded.phase]) {
    assert.ok(Number.isFinite(value));
  }
});

test('body morphology phase is stable for the same body and distinguishes centers and indices', () => {
  const phase = cloudBodyPhase(2, [1200, -4500]);
  assert.deepEqual(cloudBodyPhase(2, [1200, -4500]), phase);
  assert.notDeepEqual(cloudBodyPhase(3, [1200, -4500]), phase);
  assert.notDeepEqual(cloudBodyPhase(2, [-4500, 1200]), phase);
  assert.equal(phase.every((value) => Number.isFinite(value) && value >= 0 && value <= 1), true);
});

test('shared morphology helpers exist without changing the compatibility evaluators', () => {
  const helperStart = densitySource.indexOf('fn sanitizeMorphologyDensity');
  const helperEnd = densitySource.indexOf('\nfn emptyHighCloudSample', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helpers = densitySource.slice(helperStart, helperEnd);
  for (const helperName of [
    'sanitizeMorphologyDensity',
    'replaceSampleDensity',
    'safeMorphBlend',
    'verticalBand',
    'rotateMorphologyXZ',
    'anisotropicCoordinate',
    'morphologyLod',
    'cellularCarrier',
    'ridgeFiberCarrier',
    'sheetMacroVariation',
  ]) {
    assert.match(helpers, new RegExp(`fn ${helperName}\\(`));
  }
  assert.doesNotMatch(helpers, /textureSample/);

  const lodStart = helpers.indexOf('fn morphologyLod');
  const cellularStart = helpers.indexOf('fn cellularCarrier');
  const lodSource = helpers.slice(lodStart, cellularStart);
  assert.match(lodSource, /if \(context\.simpleMode\) \{\s*return MorphologyLod\(0\.45, 0\.0\);/);
  assert.match(lodSource, /length\(context\.worldPos - U\.cameraPos\)/);
  assert.match(lodSource, /max\(context\.stepLen, 0\.0\)/);

  const compatibilityStart = densitySource.indexOf('fn evaluateCompatibilityDensity');
  const compatibilityEnd = densitySource.indexOf('\nfn cumulusCellCoordinate', compatibilityStart);
  const compatibility = densitySource.slice(compatibilityStart, compatibilityEnd);
  assert.doesNotMatch(
    compatibility,
    /replaceSampleDensity|safeMorphBlend|verticalBand|cellularCarrier|ridgeFiberCarrier|sheetMacroVariation/,
  );
});

test('density replacement and morphology blending preserve compatibility metadata and finite density', () => {
  const base = {
    support: 0.8,
    afterShape: 0.65,
    density: 0.4,
    typeMix: 0.25,
    height01: 0.6,
    densityCoverage: 0.7,
  };
  const shaped = { ...base, density: 1.2, support: 0.1, typeMix: 0.9 };

  assert.deepEqual(safeMorphBlend(base, shaped, 0), base);
  assert.deepEqual(safeMorphBlend(base, shaped, Number.NaN), base);
  assert.deepEqual(safeMorphBlend(base, shaped, 1), { ...base, density: 1.2 });
  assert.deepEqual(safeMorphBlend(base, shaped, 0.5), { ...base, density: 0.8 });
  assert.deepEqual(replaceSampleDensity(base, -3), { ...base, density: 0 });
  assert.deepEqual(replaceSampleDensity(base, Number.POSITIVE_INFINITY), { ...base, density: 10_000 });

  for (const density of [Number.NaN, Number.NEGATIVE_INFINITY, -1, 0, 0.4, 10, Number.POSITIVE_INFINITY]) {
    for (const strength of [0.1, 0.5, 1, 2]) {
      const result = safeMorphBlend(base, { ...shaped, density }, strength);
      assert.ok(Number.isFinite(result.density));
      assert.ok(result.density >= 0 && result.density <= 10_000);
      assert.equal(result.support, base.support);
      assert.equal(result.typeMix, base.typeMix);
      assert.equal(result.height01, base.height01);
    }
  }
});

test('vertical bands and morphology coordinates are bounded, directional, and finite', () => {
  assert.equal(verticalBand(-0.01, 0.2, 0.3), 0);
  assert.equal(verticalBand(1.01, 0.2, 0.3), 0);
  assert.equal(verticalBand(0.5, 0.2, 0.3), 1);
  assert.equal(verticalBand(0, 0, 0), 1);
  assert.equal(verticalBand(Number.NaN, 0.2, 0.3), 0);

  const quarterTurn = rotateMorphologyXZ([2, 5, 3], Math.PI / 2);
  assert.ok(Math.abs(quarterTurn[0] - 3) < 1e-12);
  assert.equal(quarterTurn[1], 5);
  assert.ok(Math.abs(quarterTurn[2] + 2) < 1e-12);
  assert.deepEqual(anisotropicCoordinate([1, 2, -3], [2, 0.5, -4]), [2, 1, -12]);
  assert.deepEqual(anisotropicCoordinate([1, 2, -3], [Number.NaN, 0, 1]), [1, 0.00002, -3]);

  for (let height = -0.2; height <= 1.2; height += 0.025) {
    const band = verticalBand(height, 0.18, 0.24);
    assert.ok(Number.isFinite(band));
    assert.ok(band >= 0 && band <= 1);
  }
});

test('analytic family carriers are deterministic, bounded, and respect morphology LOD', () => {
  const near = morphologyLodReference({
    simpleMode: false,
    cameraDistance: 0,
    maximumDistance: 100_000,
    baseM: 1000,
    topM: 4000,
    stepLen: 16,
  });
  const far = morphologyLodReference({
    simpleMode: false,
    cameraDistance: 90_000,
    maximumDistance: 100_000,
    baseM: 1000,
    topM: 4000,
    stepLen: 500,
  });
  const simple = morphologyLodReference({
    simpleMode: true,
    cameraDistance: 0,
    maximumDistance: 100_000,
    baseM: 1000,
    topM: 4000,
    stepLen: 16,
  });
  assert.ok(near.detailWeight > far.detailWeight);
  assert.equal(far.detailWeight, 0);
  assert.deepEqual(simple, { frequencyScale: 0.45, detailWeight: 0 });

  const phase = [0.13, 0.57, 0.91];
  for (const lod of [near, far, simple]) {
    for (const position of [[0, 0, 0], [0.2, 0.6, -0.4], [12, -3, 8]]) {
      const values = [
        cellularCarrierReference(position, phase, lod),
        ridgeFiberCarrierReference(position, phase, lod),
        sheetMacroVariationReference(position, phase, lod),
      ];
      assert.deepEqual(values, [
        cellularCarrierReference(position, phase, lod),
        ridgeFiberCarrierReference(position, phase, lod),
        sheetMacroVariationReference(position, phase, lod),
      ]);
      for (const value of values) {
        assert.ok(Number.isFinite(value));
        assert.ok(value >= 0 && value <= 1);
      }
    }
  }
});

test('Cu and TCu share a continuous cumulus family without reading Cb or fiber controls', () => {
  const evaluator = densityWgslFunctionSource('evaluateCumulusFamily', '\nfn cumulonimbusCellCoordinate');
  assert.match(evaluator, /let cellStrength = saturate\(context\.morphology0\.z\);/);
  assert.match(evaluator, /if \(cellStrength <= 1e-5 \|\| compatibility\.density <= 0\.0\) \{\s*return compatibility;/);
  assert.match(evaluator, /let development = saturate\(context\.cumulusDevelopment\);/);
  assert.match(evaluator, /let verticalDevelopment = max\(context\.morphology0\.x, 0\.0\);/);
  assert.match(evaluator, /let domeDevelopment = saturate\(/);
  assert.match(evaluator, /let cellScale = max\(context\.morphology0\.y, 0\.05\);/);
  assert.match(evaluator, /let erosionScale = max\(context\.morphology1\.w, 0\.05\);/);
  assert.match(evaluator, /return safeMorphBlend\(/);
  assert.doesNotMatch(evaluator, /morphology1\.[xz]/);
  assert.doesNotMatch(evaluator, /anvil|fiber/i);

  for (const height of [0, 0.08, 0.17, 0.35, 0.6, 0.85, 1]) {
    let previous = cumulusMorphologyFactor({
      height,
      development: 0,
      verticalDevelopment: 0.55,
      carrier: 0.7,
      erosionScale: 1,
    });
    assert.ok(Number.isFinite(previous));
    for (let index = 1; index <= 100; index++) {
      const next = cumulusMorphologyFactor({
        height,
        development: index / 100,
        verticalDevelopment: 0.55,
        carrier: 0.7,
        erosionScale: 1,
      });
      assert.ok(Number.isFinite(next));
      assert.ok(Math.abs(next - previous) < 0.02, `height=${height}, development=${index / 100}`);
      previous = next;
    }
  }

  const protectedBase = [0, 0.04, 0.1].map((height) => cumulusMorphologyFactor({
    height,
    development: 1,
    verticalDevelopment: 1,
    carrier: 0,
    erosionScale: 2,
  }));
  assert.deepEqual(protectedBase, [1, 1, 1]);

  const lowArtDome = cumulusMorphologyFactor({
    height: 0.7,
    development: 0.5,
    verticalDevelopment: 0,
    carrier: 0.7,
    erosionScale: 1,
  });
  const highArtDome = cumulusMorphologyFactor({
    height: 0.7,
    development: 0.5,
    verticalDevelopment: 1,
    carrier: 0.7,
    erosionScale: 1,
  });
  assert.ok(highArtDome > lowArtDome);
});

test('Cb carves vertically elongated upper cells and adds an anvil only in the high band', () => {
  const coordinate = densityWgslFunctionSource('cumulonimbusCellCoordinate', '\nfn cumulonimbusAnvilDensity');
  assert.match(coordinate, /let verticalStretch = mix\(1\.6, 3\.2, saturate\(verticalDevelopment\)\);/);
  assert.match(coordinate, /vec3f\(1\.0, 1\.0 \/ verticalStretch, 1\.0\)/);

  const anvil = densityWgslFunctionSource('cumulonimbusAnvilDensity', '\nfn evaluateCumulonimbusFamily');
  assert.match(anvil, /if \(anvilStrength <= 1e-5\) \{\s*return towerDensity;/);
  assert.match(anvil, /smoothstep\(0\.7, 0\.82, bodyHeight\)/);
  assert.match(anvil, /let radial = length\(context\.bodyLocalUnit\.xz\);/);
  assert.match(anvil, /let anvilRadius = mix\(0\.52, 1\.0, saturate\(anvilStrength\)\);/);

  const evaluator = densityWgslFunctionSource('evaluateCumulonimbusFamily', '\nfn evaluateCumulusDensity');
  assert.match(evaluator, /if \(cellStrength <= 1e-5 \|\| compatibility\.support <= 0\.0\) \{\s*return compatibility;/);
  assert.match(evaluator, /if \(!context\.simpleMode && lod\.detailWeight > 1e-4\)/);
  assert.match(evaluator, /let scaffold = 0\.58;/);
  assert.match(evaluator, /smoothstep\(0\.26, 0\.52, bodyHeight\)/);
  assert.match(evaluator, /cumulonimbusAnvilDensity\(/);

  for (const height of [0, 0.2, 0.5, 0.69]) {
    assert.equal(cumulonimbusAnvilWeight(height, 1), 0);
  }
  assert.ok(cumulonimbusAnvilWeight(0.82, 1) > 0.99);
  assert.equal(cumulonimbusAnvilWeight(0.82, 0), 0);
  assert.equal(cumulonimbusAnvilWeight(1, 1), 0);

  const dispatcherEnd = densitySource.indexOf('\nfn distanceFade');
  const horizontalMaskStart = densitySource.indexOf('fn layerHorizontalMask');
  const layerEvaluationStart = densitySource.indexOf('let layerSample = dispatchCloudGenusDensity');
  const horizontalApplication = densitySource.indexOf('density *= horizontalMask;', layerEvaluationStart);
  assert.ok(dispatcherEnd < horizontalMaskStart);
  assert.ok(layerEvaluationStart >= 0 && horizontalApplication > layerEvaluationStart);
});

test('sheet foundation builds finite weather-bounded curtains without the Cu LUT', () => {
  const foundation = densityWgslFunctionSource('evaluateSheetFoundation', '\nfn evaluateSheetFamily');
  assert.match(foundation, /if \(recipe\.familyStrength <= 1e-5 \|\| context\.densityScale <= 1e-5\)/);
  assert.match(foundation, /let rawCoverage = saturate\(context\.weather\.r\);/);
  assert.match(foundation, /if \(rawCoverage <= 1e-5\) \{\s*return 0\.0;/);
  assert.match(foundation, /let sheetUniformity = saturate\(context\.morphology0\.w\);/);
  assert.match(foundation, /let sheetCoverage = mix\(rawCoverage, weatherSupport, sheetUniformity\);/);
  assert.match(foundation, /sheetMacroVariation\(/);
  assert.match(foundation, /recipe\.bottomErosionStrength[\s\S]*context\.morphology1\.w[\s\S]*context\.detailAmount/);
  assert.doesNotMatch(foundation, /hpProfiles|hpProfile\(|cloudLutTex|selectedCloudType|cellularCarrier|sampleBaseShape/);

  const family = densityWgslFunctionSource('evaluateSheetFamily', '\nfn evaluateCumulusDensity');
  assert.match(family, /if \(recipe\.familyStrength <= 1e-5\) \{\s*return compatibility;/);
  assert.match(family, /let sheetDensity = evaluateSheetFoundation\(context, recipe, profile\);/);
  assert.match(family, /return safeMorphBlend\(/);

  const recipe = {
    familyStrength: 1,
    densityMultiplier: 0.72,
    macroVariationStrength: 0.22,
    bottomErosionStrength: 0.22,
    bottomDroopStrength: 0.015,
    directionalFiberStrength: 0,
  };
  const profile = { bottomStart: 0.03, bottomEnd: 0.18, topStart: 0.58, topEnd: 0.86 };
  const common = {
    rawCoverage: 0.18,
    densityScale: 0.8,
    detailAmount: 0.6,
    erosionScale: 0.35,
    macroVariation: 0.74,
    recipe,
    profile,
  };
  assert.equal(sheetFoundationReference({ ...common, rawCoverage: 0, sheetUniformity: 1, height: 0.4 }), 0);
  assert.equal(sheetFoundationReference({
    ...common,
    sheetUniformity: 1,
    height: 0.4,
    recipe: { ...recipe, familyStrength: 0 },
  }), 0);
  const weatherDriven = sheetFoundationReference({ ...common, sheetUniformity: 0, height: 0.4 });
  const uniformCurtain = sheetFoundationReference({ ...common, sheetUniformity: 1, height: 0.4 });
  assert.ok(uniformCurtain > weatherDriven);
  for (let height = -0.1; height <= 1.1; height += 0.01) {
    const density = sheetFoundationReference({ ...common, sheetUniformity: 0.95, height });
    assert.ok(Number.isFinite(density));
    assert.ok(density >= 0 && density <= 10_000);
  }
});

test('St, As, Ns, and Cs use distinct sheet thickness, density, droop, and fiber recipes', () => {
  const evaluators = {
    Stratus: densityWgslFunctionSource('evaluateStratusDensity', '\nfn evaluateStratocumulusDensity'),
    Altostratus: densityWgslFunctionSource('evaluateAltostratusDensity', '\nfn evaluateNimbostratusDensity'),
    Nimbostratus: densityWgslFunctionSource('evaluateNimbostratusDensity', '\nfn evaluateCirrusDensity'),
    Cirrostratus: densityWgslFunctionSource('evaluateCirrostratusDensity', '\nfn evaluateCirrocumulusDensity'),
  };
  for (const source of Object.values(evaluators)) {
    assert.match(source, /evaluateCompatibilityDensity\(context, GENUS_/);
    assert.match(source, /return evaluateSheetFamily\(context, compatibility, recipe, profile\);/);
    assert.doesNotMatch(source, /evaluateCumulusFamily|evaluateCumulonimbusFamily|cellularCarrier/);
  }
  assert.match(evaluators.Stratus, /SheetRecipe\(1\.0, 0\.72, 0\.22, 0\.22, 0\.015, 0\.0\)/);
  assert.match(evaluators.Altostratus, /SheetRecipe\(1\.0, 0\.48, 0\.12, 0\.1, 0\.0, 0\.0\)/);
  assert.match(evaluators.Nimbostratus, /SheetRecipe\(1\.0, 1\.28, 0\.18, 0\.5, 0\.06, 0\.0\)/);
  assert.match(evaluators.Cirrostratus, /min\(saturate\(context\.morphology1\.x\), 0\.18\)/);

  const recipes = {
    st: { familyStrength: 1, densityMultiplier: 0.72, macroVariationStrength: 0.22, bottomErosionStrength: 0.22, bottomDroopStrength: 0.015, directionalFiberStrength: 0 },
    as: { familyStrength: 1, densityMultiplier: 0.48, macroVariationStrength: 0.12, bottomErosionStrength: 0.1, bottomDroopStrength: 0, directionalFiberStrength: 0 },
    ns: { familyStrength: 1, densityMultiplier: 1.28, macroVariationStrength: 0.18, bottomErosionStrength: 0.5, bottomDroopStrength: 0.06, directionalFiberStrength: 0 },
    cs: { familyStrength: 1, densityMultiplier: 0.28, macroVariationStrength: 0.08, bottomErosionStrength: 0.04, bottomDroopStrength: 0, directionalFiberStrength: 0.18 },
  };
  const profiles = {
    st: { bottomStart: 0.03, bottomEnd: 0.18, topStart: 0.58, topEnd: 0.86 },
    as: { bottomStart: 0.14, bottomEnd: 0.28, topStart: 0.7, topEnd: 0.88 },
    ns: { bottomStart: 0.02, bottomEnd: 0.16, topStart: 0.84, topEnd: 0.98 },
    cs: { bottomStart: 0.4, bottomEnd: 0.48, topStart: 0.62, topEnd: 0.7 },
  };
  const samples = {};
  for (const genus of Object.keys(recipes)) {
    samples[genus] = Array.from({ length: 101 }, (_, index) => sheetFoundationReference({
      rawCoverage: 0.6,
      sheetUniformity: genus === 'st' ? 0.95 : genus === 'as' ? 0.9 : 0.98,
      densityScale: 1,
      detailAmount: 0.5,
      erosionScale: 0.35,
      height: index / 100,
      macroVariation: 0.75,
      recipe: recipes[genus],
      profile: profiles[genus],
    }));
  }
  const nonzeroCount = (values) => values.filter((value) => value > 1e-6).length;
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(nonzeroCount(samples.cs) < nonzeroCount(samples.as));
  assert.ok(nonzeroCount(samples.as) < nonzeroCount(samples.ns));
  assert.ok(average(samples.ns) > average(samples.as) * 2);

  const nsWithoutDroop = sheetFoundationReference({
    rawCoverage: 0.6,
    sheetUniformity: 0.98,
    densityScale: 1,
    detailAmount: 0.5,
    erosionScale: 0.25,
    height: 0.015,
    macroVariation: 0,
    recipe: { ...recipes.ns, bottomDroopStrength: 0 },
    profile: profiles.ns,
  });
  const nsWithDroop = sheetFoundationReference({
    rawCoverage: 0.6,
    sheetUniformity: 0.98,
    densityScale: 1,
    detailAmount: 0.5,
    erosionScale: 0.25,
    height: 0.015,
    macroVariation: 0,
    recipe: recipes.ns,
    profile: profiles.ns,
  });
  assert.equal(nsWithoutDroop, 0);
  assert.ok(nsWithDroop > 0);

  const csLowFiber = sheetFoundationReference({
    rawCoverage: 0.6,
    sheetUniformity: 0.98,
    densityScale: 1,
    detailAmount: 0.15,
    erosionScale: 0.25,
    height: 0.55,
    macroVariation: 0.75,
    fiber: 0,
    recipe: recipes.cs,
    profile: profiles.cs,
  });
  const csHighFiber = sheetFoundationReference({
    rawCoverage: 0.6,
    sheetUniformity: 0.98,
    densityScale: 1,
    detailAmount: 0.15,
    erosionScale: 0.25,
    height: 0.55,
    macroVariation: 0.75,
    fiber: 1,
    recipe: recipes.cs,
    profile: profiles.cs,
  });
  assert.ok(csHighFiber > csLowFiber);
  assert.ok(csHighFiber / csLowFiber < 1.03);
});

test('legacy Sc compatibility math is extracted without losing the weather-B mask', () => {
  const strength = densityWgslFunctionSource('legacyStratocumulusStrength', '\nfn legacyStratocumulusCell');
  const cell = densityWgslFunctionSource('legacyStratocumulusCell', '\nfn legacyStratocumulusCoverage');
  const coverage = densityWgslFunctionSource('legacyStratocumulusCoverage', '\nfn legacyStratocumulusHeight');
  const height = densityWgslFunctionSource('legacyStratocumulusHeight', '\nfn legacyStratocumulusCellFactor');
  const factor = densityWgslFunctionSource('legacyStratocumulusCellFactor', '\nfn evaluateLowCloudLayer');
  assert.match(strength, /select\(weather\.b, saturate\(U\.hpSc2\.z\), U\.hpSc2\.z >= 0\.0\)/);
  assert.match(strength, /abs\(genusIndex - GENUS_STRATOCUMULUS\) < 0\.5/);
  assert.match(cell, /textureSampleLevel\(\s*scCellTex,[\s\S]*weatherUv\(worldPos\) \* U\.hpSc2\.xy/);
  assert.match(coverage, /pow\(saturate\(rawCoverage\), max\(U\.hpSc1\.w, 0\.001\)\) \* U\.hpSc1\.z/);
  assert.match(coverage, /return mix\(hpCoverage, scCoverage \* cell, strength\);/);
  assert.match(height, /saturate\(normalizedHeight \/ max\(U\.hpSc0\.y, 0\.01\)\)/);
  assert.match(factor, /pow\(max\(cell, 0\.001\), max\(U\.hpSc0\.w, 0\.01\)\)/);
  assert.match(factor, /return mix\(1\.0, factor, strength\);/);

  const core = densityWgslFunctionSource('evaluateLowCloudLayer', '\n// Compatibility bridge');
  for (const helper of [
    'legacyStratocumulusStrength',
    'legacyStratocumulusCell',
    'legacyStratocumulusCoverage',
    'legacyStratocumulusHeight',
    'legacyStratocumulusCellFactor',
  ]) {
    assert.match(core, new RegExp(`${helper}\\(`));
  }
  assert.doesNotMatch(core, /textureSampleLevel\(scCellTex/);
});

test('Sc, Ac, and Cc share body-local cells with ordered scale, connectivity, profile, and LOD', () => {
  const carrier = densityWgslFunctionSource('cellularFamilyCarrier', '\nfn ridgeFiberCarrier');
  assert.match(carrier, /let bentX = q\.x \+ sin\(q\.z \* 0\.31/);
  assert.match(carrier, /let bentZ = q\.z \+ sin\(q\.x \* 0\.27/);
  assert.doesNotMatch(carrier, /textureSample/);

  const coordinate = densityWgslFunctionSource('bodyLocalCellularCoordinate', '\nfn evaluateCellularFamily');
  assert.match(coordinate, /recipe\.baseCellMeters \* max\(context\.morphology0\.y, 0\.05\)/);
  assert.match(coordinate, /rotateMorphologyXZ\(context\.bodyLocalMeters \/ cellMeters, phaseAngle\)/);
  assert.match(coordinate, /max\(recipe\.verticalFrequency, 0\.02\)/);
  assert.match(coordinate, /max\(recipe\.crossFrequency, 0\.05\)/);

  const family = densityWgslFunctionSource('evaluateCellularFamily', '\nfn evaluateCumulusDensity');
  assert.match(family, /let familyStrength = saturate\(recipe\.familyStrength \* context\.morphology0\.z\);/);
  assert.match(family, /if \(familyStrength <= 1e-5 \|\| compatibility\.density <= 0\.0\) \{\s*return compatibility;/);
  assert.match(family, /if \(!context\.simpleMode && lod\.detailWeight > 1e-4\)/);
  assert.match(family, /let rippleWeight = saturate\(recipe\.rippleStrength \* lod\.detailWeight\);/);
  assert.match(family, /let macroCell = cellularFamilyCarrier\(/);
  assert.match(family, /let sheetUniformity = saturate\(context\.morphology0\.w\);/);
  assert.match(family, /let connectivity = saturate\(recipe\.connectivity \* sheetUniformity\);/);
  assert.match(family, /return safeMorphBlend\(/);
  assert.doesNotMatch(family, /textureSample/);

  const evaluators = {
    sc: densityWgslFunctionSource('evaluateStratocumulusDensity', '\nfn evaluateCumulonimbusDensity'),
    ac: densityWgslFunctionSource('evaluateAltocumulusDensity', '\nfn evaluateAltostratusDensity'),
    cc: densityWgslFunctionSource('evaluateCirrocumulusDensity', '\nfn dispatchCloudGenusDensity'),
  };
  assert.match(evaluators.sc, /CellularRecipe\(1\.0, 1700\.0, 0\.18, 0\.62, 0\.5, 0\.38, 1\.28, 0\.15, 0\.06\)/);
  assert.match(evaluators.ac, /CellularRecipe\(1\.0, 1400\.0, 0\.34, 1\.0, 0\.18, 0\.12, 1\.45, 0\.24, 0\.08\)/);
  assert.match(evaluators.cc, /CellularRecipe\(1\.0, 1000\.0, 0\.22, 1\.15, 0\.1, 0\.06, 1\.55, 0\.32, 0\.2\)/);
  for (const source of Object.values(evaluators)) {
    assert.match(source, /evaluateCompatibilityDensity\(context, GENUS_/);
    assert.match(source, /return evaluateCellularFamily\(context, compatibility, recipe, profile\);/);
  }

  const effectiveCellMeters = {
    sc: 1700 * 1.2,
    ac: 1400 * 0.7,
    cc: 1000 * 0.35,
  };
  assert.ok(effectiveCellMeters.sc > effectiveCellMeters.ac);
  assert.ok(effectiveCellMeters.ac > effectiveCellMeters.cc);

  const profiles = {
    sc: { bottomStart: 0.01, bottomEnd: 0.08, topStart: 0.24, topEnd: 0.4 },
    ac: { bottomStart: 0.1, bottomEnd: 0.24, topStart: 0.65, topEnd: 0.85 },
    cc: { bottomStart: 0.34, bottomEnd: 0.44, topStart: 0.56, topEnd: 0.68 },
  };
  const profileCount = (profile) => Array.from({ length: 101 }, (_, index) => index / 100)
    .filter((heightValue) => sheetVerticalProfileReference(heightValue, profile) > 0).length;
  assert.ok(profileCount(profiles.sc) < profileCount(profiles.ac));
  assert.ok(profileCount(profiles.cc) < profileCount(profiles.sc));

  const connectivity = {
    sc: 0.5 * 0.6,
    ac: 0.18 * 0.4,
    cc: 0.1 * 0.35,
  };
  assert.ok(connectivity.sc > connectivity.ac);
  assert.ok(connectivity.ac > connectivity.cc);
  const simpleLod = morphologyLodReference({
    simpleMode: true,
    cameraDistance: 0,
    maximumDistance: 100_000,
    baseM: 6000,
    topM: 10_000,
    stepLen: 16,
  });
  assert.equal(0.2 * simpleLod.detailWeight, 0, 'simple mode disables the Cc ripple');
});

test('Ci uses sparse rotated-fBm support with curled body-local fibers and a stable LOD fallback', () => {
  const coordinate = densityWgslFunctionSource('bodyLocalFiberCoordinate', '\nfn evaluateFiberFamily');
  assert.match(coordinate, /recipe\.baseWidthMeters \* max\(context\.morphology0\.y, 0\.05\)/);
  assert.match(coordinate, /rotateMorphologyXZ\(\s*context\.bodyLocalMeters \/ fiberWidthMeters,\s*context\.morphology1\.y/);
  assert.match(coordinate, /max\(recipe\.longFrequency, 0\.01\)/);
  assert.match(coordinate, /max\(recipe\.verticalFrequency, 0\.05\)/);
  assert.match(coordinate, /max\(recipe\.crossFrequency, 0\.05\)/);

  const macro = densityWgslFunctionSource('cirrusMacroFbm', '\nfn sheetMacroVariation');
  assert.match(macro, /position \* vec2f\(0\.52, 1\.45\)/);
  assert.match(macro, /point\.x \* 1\.6 - point\.y \* 1\.2/);
  assert.match(macro, /point\.x \* 1\.2 \+ point\.y \* 1\.6/);
  assert.match(macro, /if \(lod\.detailWeight > 1e-4\)/);
  assert.equal((macro.match(/morphologyValueNoise2\(point\)/g) ?? []).length, 4);

  const family = densityWgslFunctionSource('evaluateFiberFamily', '\nfn evaluateCumulusDensity');
  assert.match(family, /let familyStrength = saturate\(recipe\.familyStrength \* context\.morphology1\.x\);/);
  assert.match(family, /if \(familyStrength <= 1e-5 \|\| compatibility\.density <= 0\.0\) \{\s*return compatibility;/);
  assert.match(family, /let curlWeight = saturate\(/);
  assert.match(family, /let macroNoise = cirrusMacroFbm\(/);
  assert.match(family, /let macroSupport = smoothstep\(0\.34, 0\.64, macroNoise\);/);
  assert.match(family, /let flowNoise = morphologyValueNoise2\(/);
  assert.match(family, /let flowOffset = \(flowNoise - 0\.5\) \* 1\.8 \* curlWeight;/);
  assert.match(family, /coordinate \+ curl \+ vec3f\(0\.0, 0\.0, flowOffset\)/);
  assert.match(family, /let broadFiber = ridgeFiberCarrier\(/);
  assert.match(family, /if \(!context\.simpleMode && lod\.detailWeight > 1e-4\)/);
  assert.match(family, /recipe\.branchStrength[\s\S]*context\.detailAmount[\s\S]*lod\.detailWeight/);
  assert.match(family, /let erosionAmount = saturate\(max\(context\.morphology1\.w, 0\.0\) \/ 2\.0\);/);
  assert.match(family, /let forkDirection = select\(-1\.0, 1\.0, sin\(phase\.x \+ phase\.z\) >= 0\.0\);/);
  assert.match(family, /sin\(warpedCoordinate\.z \* 0\.33 \+ phase\.x\) \* 1\.15/);
  assert.match(family, /let breakupFactor = mix\(1\.0, tailMask, erosionAmount\);/);
  assert.match(family, /let ridgeMask = smoothstep\(\s*0\.48,\s*0\.88,/);
  assert.match(family, /let fiberMask = ridgeMask \* smoothstep\(0\.12, 0\.82, macroSupport\);/);
  assert.match(family, /let fiberFactor = min\([\s\S]*1\.35/);
  assert.match(family, /return safeMorphBlend\(/);
  assert.doesNotMatch(family, /textureSample/);

  const evaluator = densityWgslFunctionSource('evaluateCirrusDensity', '\nfn evaluateCirrostratusDensity');
  assert.match(evaluator, /evaluateCompatibilityDensity\(context, GENUS_CIRRUS\)/);
  assert.match(evaluator, /FiberRecipe\(1\.0, 1100\.0, 0\.1, 1\.25, 0\.3, 0\.85, 0\.55, 0\.0, 1\.25\)/);
  assert.match(evaluator, /FiberProfile\(0\.44, 0\.49, 0\.55, 0\.62\)/);
  assert.match(evaluator, /return evaluateFiberFamily\(context, compatibility, recipe, profile\);/);

  const recipe = {
    familyStrength: 1,
    valleyDensity: 0,
    peakDensity: 1.25,
  };
  const profile = { bottomStart: 0.44, bottomEnd: 0.49, topStart: 0.55, topEnd: 0.62 };
  const compatibilityDensity = 0.7;
  assert.equal(fiberDensityReference({
    compatibilityDensity,
    height: 0.52,
    fiberStrength: 0,
    fiberSignal: 0.8,
    erosionScale: 1.3,
    tailSignal: 0.7,
    recipe,
    profile,
  }), compatibilityDensity);
  assert.equal(fiberDensityReference({
    compatibilityDensity,
    height: 0.2,
    fiberStrength: 1,
    fiberSignal: 1,
    erosionScale: 1.3,
    tailSignal: 1,
    recipe,
    profile,
  }), 0);
  assert.equal(fiberDensityReference({
    compatibilityDensity,
    height: 0.52,
    fiberStrength: 1,
    fiberSignal: 1,
    macroSupport: 0,
    erosionScale: 0,
    tailSignal: 1,
    recipe,
    profile,
  }), 0, 'macro support removes globally repeated fibers outside cirrus bands');

  for (let height = -0.1; height <= 1.1; height += 0.025) {
    for (let fiberSignal = 0; fiberSignal <= 1; fiberSignal += 0.1) {
      const density = fiberDensityReference({
        compatibilityDensity,
        height,
        fiberStrength: 1,
        fiberSignal,
        erosionScale: 1.3,
        tailSignal: 0.65,
        recipe,
        profile,
      });
      assert.ok(Number.isFinite(density));
      assert.ok(density >= 0 && density <= compatibilityDensity * 1.35 + 1e-6);
    }
  }

  const simpleLod = morphologyLodReference({
    simpleMode: true,
    cameraDistance: 0,
    maximumDistance: 100_000,
    baseM: 7000,
    topM: 12_000,
    stepLen: 16,
  });
  assert.equal(simpleLod.detailWeight, 0, 'simple mode keeps only the broad Ci fiber');
});

test('per-body motion transports the density domain and lifecycle scales density smoothly', () => {
  assert.equal(bodyLifecycleScale(false, [2, 4, 8, 10], 1.5, 100), 1);
  assert.equal(bodyLifecycleScale(true, [2, 4, 8, 10], 1.5, 1), 0);
  assert.ok(bodyLifecycleScale(true, [2, 4, 8, 10], 1.5, 3) > 0);
  assert.equal(bodyLifecycleScale(true, [2, 4, 8, 10], 1.5, 6), 1.5);
  assert.ok(bodyLifecycleScale(true, [2, 4, 8, 10], 1.5, 9) < 1.5);
  assert.equal(bodyLifecycleScale(true, [2, 4, 8, 10], 1.5, 10), 0);

  assert.match(densitySource, /fn bodyLifecycleScale\(/);
  assert.match(densitySource, /let motion = B\.layerMotion\[layerIndex\]/);
  assert.match(densitySource, /let bodyTime = max\(0\.0, U\.time - B\.layerBoundTransforms\[layerIndex\]\.w\);/);
  assert.match(densitySource, /let transport = motion\.xy \* U\.time;/);
  assert.match(densitySource, /let transportedPos = vec3f\(worldPos\.x - transport\.x/);
  assert.match(densitySource, /let densityPos = transportedPos \+ vec3f\(/);
  assert.match(densitySource, /layer\.z \* lifeScale,/);
  assert.match(densitySource, /let bodyWeather = sampleWeather\(densityPos\);/);
});

test('rotated elliptical bounds preserve global decks and feather local cloud edges', () => {
  const bounds = [100, -200, 1000, 400];
  assert.equal(horizontalEllipseMask([100000, 100000], bounds, 0, 0.25, false), 1);
  assert.equal(horizontalEllipseMask([100, -200], bounds, 0, 0.25), 1);
  assert.equal(horizontalEllipseMask([1200, -200], bounds, 0, 0.25), 0);
  assert.ok(horizontalEllipseMask([950, -200], bounds, 0, 0.25) > 0);
  assert.ok(horizontalEllipseMask([950, -200], bounds, 0, 0.25) < 1);
  assert.equal(horizontalEllipseMask([100, 500], bounds, 90, 0.25), 1);
  assert.equal(horizontalEllipseMask([950, -200], bounds, 90, 0.25), 0);
});

test('the independent high-cloud path maps an explicit Ac or As genus on the GPU', () => {
  assert.match(rendererSource, /const highBody = cloudBodies\.find/);
  assert.match(rendererSource, /f32\[157\] = highBody \? CLOUD_GENUS_INDEX\[highBody\.genus\] : 0;/);
  assert.doesNotMatch(
    rendererSource,
    /params\.(?:highCloudEnabled|highCloudGenus|highBaseKm|highTopKm|highDensityMultiplier|highWispStrength)/,
  );
  assert.match(densitySource, /fn highCloudTypeMix\(genusIndex: f32\) -> f32/);
  assert.match(densitySource, /let typeMix = highCloudTypeMix\(U\.hpHigh1\.y\);/);
  assert.doesNotMatch(densitySource, /select\(saturate\(weather\.g\), saturate\(U\.hpHigh1\.y\)/);
});

test('ground occludes far-side clouds before the cloud shell entry', () => {
  const planetRadius = 6_360_000;
  const cameraAltitude = 282.8;
  const cloudBase = 400;
  const angle = -1 * Math.PI / 180;
  const origin = [0, planetRadius + cameraAltitude];
  const direction = [Math.cos(angle), Math.sin(angle)];
  const ground = raySphereDistances(origin, direction, planetRadius);
  const cloudBaseShell = raySphereDistances(origin, direction, planetRadius + cloudBase);
  assert.ok(ground && cloudBaseShell);
  assert.ok(ground[0] > 0, `ground entry=${ground[0]}`);
  assert.ok(cloudBaseShell[1] > ground[0], `cloud entry=${cloudBaseShell[1]}, ground=${ground[0]}`);

  const highMarch = wgslFunctionSource('marchHighCloud', '\nfn marchLowCloud');
  const lowMarch = wgslFunctionSource('marchLowCloud', '\nfn acesFitted');
  assert.match(commonSource, /fn rayGroundDistance\(ro: vec3f, rd: vec3f\) -> f32/);
  assert.match(highMarch, /let groundT = rayGroundDistance\(ro, rd\);/);
  assert.match(lowMarch, /let groundT = rayGroundDistance\(ro, rd\);/);
  assert.match(highMarch, /t1 = min\(t1, groundT\);/);
  assert.match(lowMarch, /t1 = min\(t1, groundT\);/);
});

test('low-density cloud integration fades continuously instead of switching at a hard threshold', () => {
  const lowMarch = wgslFunctionSource('marchLowCloud', '\nfn acesFitted');
  assert.doesNotMatch(lowMarch, /if \(s\.density > 0\.012\)/);
  assert.match(lowMarch, /let densityGate = smoothstep\(/);
  assert.match(lowMarch, /let dens = s\.density \* densityGate;/);
  assert.match(lowMarch, /if \(dens > 1e-5\)/);
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

test('HP Cu development and Cb endpoint reach the Cu, TCu, and Cb LUT channels', () => {
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
