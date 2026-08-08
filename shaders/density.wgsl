struct DensitySample {
  support: f32,
  afterShape: f32,
  density: f32,
  typeMix: f32,
  height01: f32,
  densityCoverage: f32,
};

struct HighCloudSample {
  density: f32,
  coverage: f32,
  msWeight: f32,
  typeMix: f32,
  height01: f32,
  bandMask: f32,
};

// Immutable inputs shared by every genus evaluator. Keeping this context
// stable lets each genus replace only its morphology without touching body
// transport, lifecycle, weather sampling, or the ray marcher.
struct CloudGenusDensityContext {
  worldPos: vec3f,
  bodyIndex: u32,
  bodyLocalMeters: vec3f,
  bodyLocalUnit: vec3f,
  normalizedHeight: f32,
  bodyPhase: vec3f,
  baseM: f32,
  topM: f32,
  densityScale: f32,
  detailAmount: f32,
  cumulusDevelopment: f32,
  weather: vec4f,
  morphology0: vec4f,
  morphology1: vec4f,
  stepLen: f32,
  simpleMode: bool,
};

const GENUS_CUMULUS: f32 = 0.0;
const GENUS_STRATUS: f32 = 1.0;
const GENUS_STRATOCUMULUS: f32 = 2.0;
const GENUS_CUMULONIMBUS: f32 = 3.0;
const GENUS_ALTOCUMULUS: f32 = 4.0;
const GENUS_ALTOSTRATUS: f32 = 5.0;
const GENUS_NIMBOSTRATUS: f32 = 6.0;
const GENUS_CIRRUS: f32 = 7.0;
const GENUS_CIRROSTRATUS: f32 = 8.0;
const GENUS_CIRROCUMULUS: f32 = 9.0;
const UNBOUNDED_BODY_LOCAL_SCALE_M: f32 = 10000.0;
const MAX_MORPHOLOGY_DENSITY: f32 = 10000.0;
const MORPHOLOGY_TWO_PI: f32 = 6.28318530718;

struct CloudBodyLocalFrame {
  meters: vec3f,
  unit: vec3f,
  normalizedHeight: f32,
  phase: vec3f,
};

struct MorphologyLod {
  frequencyScale: f32,
  detailWeight: f32,
};

fn hashCloudBodyPhase(seed: u32) -> u32 {
  var value = seed;
  value = value ^ (value >> 16u);
  value *= 0x7feb352du;
  value = value ^ (value >> 15u);
  value *= 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn cloudBodyPhase(bodyIndex: u32, center: vec2f) -> vec3f {
  let centerSeed = hashCloudBodyPhase(bitcast<u32>(center.x) ^ 0x68bc21ebu)
    ^ hashCloudBodyPhase(bitcast<u32>(center.y) ^ 0x02e5be93u);
  let seed = hashCloudBodyPhase(bodyIndex ^ centerSeed ^ 0x9e3779b9u);
  return vec3f(
    f32(hashCloudBodyPhase(seed ^ 0xa341316cu)),
    f32(hashCloudBodyPhase(seed ^ 0xc8013ea4u)),
    f32(hashCloudBodyPhase(seed ^ 0xad90777du)),
  ) / 4294967295.0;
}

fn deriveCloudBodyLocalFrame(
  bodyIndex: u32,
  worldPos: vec3f,
  baseM: f32,
  topM: f32,
  bounds: vec4f,
  transform: vec4f,
) -> CloudBodyLocalFrame {
  let centerOffset = worldPos.xz - bounds.xy;
  let c = cos(transform.x);
  let s = sin(transform.x);
  let localXZ = vec2f(
    c * centerOffset.x + s * centerOffset.y,
    -s * centerOffset.x + c * centerOffset.y,
  );
  let heightMeters = altitude(worldPos) - baseM;
  let heightSpan = max(topM - baseM, 1.0);
  let boundedScale = max(bounds.zw, vec2f(1.0));
  let horizontalScale = select(
    vec2f(UNBOUNDED_BODY_LOCAL_SCALE_M),
    boundedScale,
    transform.z >= 0.5,
  );
  let localMeters = vec3f(localXZ.x, heightMeters, localXZ.y);
  let localUnit = vec3f(
    localXZ.x / horizontalScale.x,
    heightMeters / heightSpan,
    localXZ.y / horizontalScale.y,
  );
  return CloudBodyLocalFrame(
    localMeters,
    localUnit,
    saturate(heightMeters / heightSpan),
    cloudBodyPhase(bodyIndex, bounds.xy),
  );
}

fn sanitizeMorphologyDensity(density: f32) -> f32 {
  if (density != density || density <= 0.0) {
    return 0.0;
  }
  return min(density, MAX_MORPHOLOGY_DENSITY);
}

fn replaceSampleDensity(sample: DensitySample, density: f32) -> DensitySample {
  return DensitySample(
    sample.support,
    sample.afterShape,
    sanitizeMorphologyDensity(density),
    sample.typeMix,
    sample.height01,
    sample.densityCoverage,
  );
}

fn safeMorphBlend(
  base: DensitySample,
  shaped: DensitySample,
  strength: f32,
) -> DensitySample {
  // Preserve the exact compatibility value when a family is disabled. This
  // branch is also the migration guarantee for every genus still on the old
  // density core.
  if (strength != strength || strength <= 0.0) {
    return base;
  }
  let weight = saturate(strength);
  let density = mix(
    sanitizeMorphologyDensity(base.density),
    sanitizeMorphologyDensity(shaped.density),
    weight,
  );
  return replaceSampleDensity(base, density);
}

fn verticalBand(h: f32, bottomSoft: f32, topSoft: f32) -> f32 {
  if (h != h || h < 0.0 || h > 1.0) {
    return 0.0;
  }
  let bottomWidth = select(saturate(bottomSoft), 0.0, bottomSoft != bottomSoft);
  let topWidth = select(saturate(topSoft), 0.0, topSoft != topSoft);
  var bottom = 1.0;
  var top = 1.0;
  if (bottomWidth > 1e-5) {
    bottom = smoothstep(0.0, bottomWidth, h);
  }
  if (topWidth > 1e-5) {
    top = 1.0 - smoothstep(1.0 - topWidth, 1.0, h);
  }
  return saturate(bottom * top);
}

fn rotateMorphologyXZ(position: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(
    c * position.x + s * position.z,
    position.y,
    -s * position.x + c * position.z,
  );
}

fn anisotropicCoordinate(position: vec3f, scale: vec3f) -> vec3f {
  let finiteScale = select(abs(scale), vec3f(1.0), scale != scale);
  return position * max(finiteScale, vec3f(1e-5));
}

fn morphologyLod(context: CloudGenusDensityContext) -> MorphologyLod {
  // Probe/light samples enter through simpleMode and must avoid all optional
  // fine structure. Keeping this branch first also makes the cheap path clear
  // to shader compilers and source-level contract tests.
  if (context.simpleMode) {
    return MorphologyLod(0.45, 0.0);
  }

  let maximumDistance = max(5000.0, U.quality.w * 0.92);
  let cameraDistance = length(context.worldPos - U.cameraPos);
  let distanceWeight = 1.0 - smoothstep(
    maximumDistance * 0.25,
    maximumDistance * 0.8,
    cameraDistance,
  );
  let layerHeight = max(context.topM - context.baseM, 1.0);
  let referenceStep = max(16.0, layerHeight / 64.0);
  let stepWeight = 1.0 - smoothstep(
    referenceStep * 1.5,
    referenceStep * 6.0,
    max(context.stepLen, 0.0),
  );
  let detailWeight = saturate(distanceWeight * stepWeight);
  return MorphologyLod(mix(0.45, 1.0, detailWeight), detailWeight);
}

fn cellularCarrier(
  position: vec3f,
  phase: vec3f,
  lod: MorphologyLod,
) -> f32 {
  let q = position * (MORPHOLOGY_TWO_PI * lod.frequencyScale)
    + phase * MORPHOLOGY_TWO_PI;
  let broadCells = cos(q.x) * cos(q.z);
  var signal = broadCells;
  if (lod.detailWeight > 1e-4) {
    let staggeredCells = cos(q.x * 0.57 + q.z * 0.83 + q.y * 0.31);
    signal = mix(broadCells, staggeredCells, 0.3 * lod.detailWeight);
  }
  return saturate(0.5 + 0.5 * signal);
}

fn ridgeFiberCarrier(
  position: vec3f,
  phase: vec3f,
  lod: MorphologyLod,
) -> f32 {
  let q = position * (MORPHOLOGY_TWO_PI * lod.frequencyScale)
    + phase * MORPHOLOGY_TWO_PI;
  let primary = sin(q.z + sin(q.x * 0.37 + phase.x * MORPHOLOGY_TWO_PI));
  var fiberSignal = primary;
  if (lod.detailWeight > 1e-4) {
    let branch = sin((q.y + q.z) * 1.73 + sin(q.x * 0.41 + phase.y));
    fiberSignal = mix(primary, branch, 0.28 * lod.detailWeight);
  }
  let ridge = saturate(1.0 - abs(fiberSignal));
  return smoothstep(0.32, 0.88, ridge);
}

fn sheetMacroVariation(
  position: vec3f,
  phase: vec3f,
  lod: MorphologyLod,
) -> f32 {
  let q = position * (MORPHOLOGY_TWO_PI * lod.frequencyScale)
    + phase * MORPHOLOGY_TWO_PI;
  let broad = sin(q.x * 0.31 + q.z * 0.23);
  var signal = broad;
  if (lod.detailWeight > 1e-4) {
    let cross = cos(q.z * 0.19 - q.x * 0.17 + q.y * 0.11);
    signal = mix(broad, cross, 0.35 * lod.detailWeight);
  }
  return saturate(0.75 + signal * 0.2);
}

fn emptyHighCloudSample() -> HighCloudSample {
  return HighCloudSample(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
}

fn highWeatherUv(worldPos: vec3f) -> vec2f {
  return worldPos.xz * U.hpHigh1.x;
}

fn sampleHighWeather(worldPos: vec3f) -> vec4f {
  return textureSampleLevel(highWeatherTex, weatherSamp, highWeatherUv(worldPos) + U.windOffset, 0.0);
}

fn highCloudTypeMix(genusIndex: f32) -> f32 {
  if (abs(genusIndex - GENUS_ALTOCUMULUS) < 0.5) {
    return 1.0;
  }
  // Altostratus is the broad-sheet endpoint and the safe fallback.
  return 0.0;
}

fn evaluateHighCloudDensity(worldPos: vec3f) -> HighCloudSample {
  if (U.hpHigh0.x < 0.5) {
    return emptyHighCloudSample();
  }
  let baseAlt = U.hpHigh0.y;
  let topAlt = max(baseAlt + 1.0, U.hpHigh0.z);
  let alt = altitude(worldPos);
  if (alt < baseAlt || alt > topAlt) {
    return emptyHighCloudSample();
  }
  let normalizedHeight = saturate((alt - baseAlt) / (topAlt - baseAlt));
  let weather = sampleHighWeather(worldPos);
  let coverage = saturate(weather.r);
  let typeMix = highCloudTypeMix(U.hpHigh1.y);
  if (coverage < 0.001) {
    return HighCloudSample(0.0, coverage, saturate(weather.a), typeMix, normalizedHeight, 0.0);
  }
  let cellStrength = mix(U.hpHigh3.z, U.hpHigh3.y, typeMix);
  let baseUv = highWeatherUv(worldPos);
  let windUv = U.windOffset * U.hpHigh1.w;
  let warpUv = baseUv * U.hpHigh2.zw + windUv * 0.5;
  let warp = (textureSampleLevel(highWarpTex, weatherSamp, warpUv, 0.0).rg * 2.0 - 1.0) * U.hpHigh3.x;
  let cellUv = baseUv * U.hpHigh2.xy + windUv + warp;
  let cellRaw = saturate(textureSampleLevel(highCellTex, weatherSamp, cellUv, 0.0).r);
  let cellShaped = pow(max(cellRaw, 0.001), max(U.hpHigh3.w, 0.01));

  let coverForHeight = pow(coverage, max(U.hpHigh4.w, 0.01));
  let drivenTop = mix(U.hpHigh4.x, U.hpHigh4.y, coverForHeight);
  let thickFactor = mix(1.0, cellShaped, saturate(cellStrength * 0.5));
  let effectiveTop = U.hpHigh4.x + (drivenTop - U.hpHigh4.x) * thickFactor;
  let effectiveBottom = U.hpHigh4.x - (U.hpHigh4.y - U.hpHigh4.x) * U.hpHigh4.z * coverForHeight;

  let distXZ = length((worldPos - U.cameraPos).xz);
  let distT = smoothstep(U.hpHigh6.w, max(U.hpHigh6.w + 1.0, U.hpHigh7.x), distXZ);
  let horizonShift = distT * effectiveBottom;
  let adjustedBottom = effectiveBottom - horizonShift;
  let adjustedTop = effectiveTop - horizonShift;
  let bandSoft = max(U.hpHigh5.z, 0.001);
  let bandMask = smoothstep(adjustedBottom - bandSoft, adjustedBottom + bandSoft, normalizedHeight)
    * (1.0 - smoothstep(adjustedTop - bandSoft, adjustedTop + bandSoft, normalizedHeight));

  let wispUv = baseUv * U.hpHigh6.xy + windUv;
  let wispRaw = textureSampleLevel(highWispTex, weatherSamp, wispUv, 0.0).r;
  let wisp = saturate(wispRaw * wispRaw);
  let densitySoft = U.hpHigh5.y * (1.0 - pow(saturate(weather.a), max(U.hpHigh5.w, 0.01)));
  let baseDensity = remapClamped(coverage, U.hpHigh5.x, U.hpHigh5.x + max(densitySoft, 0.001));
  let cellFactor = mix(1.0, cellShaped, saturate(cellStrength));
  var density = (baseDensity * cellFactor - wisp * U.hpHigh6.z * typeMix) * bandMask;
  if (U.hpDensityPost0.z > 0.0) {
    let darkWeight = 1.0 - pow(saturate(weather.a), max(U.hpDensityPost0.w, 0.01));
    density *= 1.0 - saturate(U.hpDensityPost0.z * darkWeight);
  }
  density = max(0.0, density * U.hpHigh1.z);
  return HighCloudSample(density, coverage, saturate(weather.a), typeMix, normalizedHeight, bandMask);
}

fn sampleWeather(worldPos: vec3f) -> vec4f {
  let uv = weatherUv(worldPos);
  if (!isInsideWeatherMap(uv)) {
    return vec4f(0.0);
  }
  return textureSampleLevel(weatherTex, weatherClampSamp, uv, 0.0);
}

fn weatherUv(worldPos: vec3f) -> vec2f {
  return (worldPos.xz - U.weatherMapCenter) / max(U.weatherMapWorldSize, 1.0) + vec2f(0.5);
}

fn isInsideWeatherMap(uv: vec2f) -> bool {
  return all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0));
}

fn selectedCloudType(genusIndex: f32, cumulusDevelopment: f32) -> f32 {
  if (abs(genusIndex - GENUS_CUMULONIMBUS) < 0.5) {
    return 1.0;
  }
  if (abs(genusIndex - GENUS_CUMULUS) < 0.5) {
    // Cu -> TCu occupies the first half of the legacy Cu/TCu/Cb LUT.
    return saturate(cumulusDevelopment) * 0.5;
  }
  // Genera without a dedicated recipe use the neutral Cu compatibility shape
  // until their morphology evaluators are implemented.
  return 0.0;
}

fn hpLoCoverage(rawCoverage: f32) -> f32 {
  return saturate(pow(saturate(rawCoverage), max(U.hpCoverage0.y, 0.001)) * U.hpCoverage0.x);
}

fn hpLoHeightCoverage(rawCoverage: f32) -> f32 {
  return saturate(pow(saturate(rawCoverage), max(U.hpCoverage0.w, 0.001)) * U.hpCoverage0.z);
}

fn hpDensityDarkScale(densityCoverage: f32) -> f32 {
  let darkWeight = 1.0 - pow(saturate(densityCoverage), max(U.hpDensityPost0.w, 0.01));
  return 1.0 - saturate(U.hpDensityPost0.z * darkWeight);
}

fn hpTypeValue(values: vec3f, typeMix: f32) -> f32 {
  if (typeMix < 0.5) {
    return mix(values.x, values.y, typeMix * 2.0);
  }
  return mix(values.y, values.z, (typeMix - 0.5) * 2.0);
}

fn shearNoiseXZ(p: vec3f, xFromZ: f32, zFromX: f32) -> vec3f {
  return vec3f(
    p.x + p.z * xFromZ,
    p.y,
    p.z + p.x * zFromX
  );
}

fn rotateNoiseXZ(p: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}

fn lowFrequencyShapeWarp(p: vec3f) -> vec3f {
  let q = p.xz * U.hpShapeWarp0.y * 6.2831853;
  // Subtract the value at the world origin so enabling de-tiling does not
  // globally phase-shift the already tuned reference camera neighbourhood.
  let warpX = sin(q.x + q.y * 0.73 + 0.91)
    + 0.45 * sin(q.x * 0.41 - q.y * 1.37 + 2.1)
    - (sin(0.91) + 0.45 * sin(2.1));
  let warpZ = sin(q.y - q.x * 0.61 + 1.77)
    + 0.4 * sin(q.y * 0.47 + q.x * 1.21 - 0.4)
    - (sin(1.77) + 0.4 * sin(-0.4));
  let warpY = sin(q.x * 0.52 + q.y * 0.38 + 2.73) - sin(2.73);
  let strength = U.hpShapeWarp0.z;
  return p + vec3f(warpX * strength / 1.45, warpY * strength * 0.12, warpZ * strength / 1.4);
}

fn hpProfiles(localHeight: f32, weatherUV: vec2f) -> vec3f {
  let radialDist = saturate(length(weatherUV - vec2f(0.5)) * 2.0);
  return textureSampleLevel(cloudLutTex, weatherClampSamp, vec2f(localHeight, radialDist), 0.0).rgb;
}

fn hpProfile(localHeight: f32, typeMix: f32, weatherUV: vec2f) -> f32 {
  return hpTypeValue(hpProfiles(localHeight, weatherUV), typeMix);
}

fn cuDomeProfile(h01: f32) -> f32 {
  let base = softstep(0.0, 0.1, h01);
  let top = 1.0 - softstep(0.72, 1.0, h01);
  let dome = shapeAlteringSemiCircle(h01, -0.2);
  return base * top * mix(0.8, 1.0, dome);
}

fn cbProfile(h01: f32) -> f32 {
  let base = softstep(0.0, 0.07, h01);
  let body = shapeAlteringSemiCircle(h01, -0.08);
  let anvil = select(1.0, mix(1.0, 0.62, softstep(0.58, 0.92, h01)), h01 > 0.58);
  let top = 1.0 - softstep(0.9, 1.0, h01);
  return base * body * anvil * top;
}

fn verticalProfile(h01: f32, typeMix: f32) -> f32 {
  return mix(cuDomeProfile(h01), cbProfile(h01), saturate(typeMix));
}

fn anvilFootprintBoost(h01: f32, typeMix: f32) -> f32 {
  let anvil = softstep(0.58, 0.9, h01) * typeMix;
  return 1.0 + anvil * 0.9;
}

fn heroSupport(worldPos: vec3f) -> vec4f {
  if (U.hero0.w < 0.5) {
    return vec4f(0.0);
  }
  let center = vec2f(U.hero0.x, U.hero0.y);
  let radii = max(vec2f(U.hero0.z, U.hero1.x), vec2f(1.0));
  let d = (worldPos.xz - center) / radii;
  let ell = length(d);
  let fade = 1.0 - softstep(0.7, 1.08, ell);
  if (fade <= 0.0) {
    return vec4f(0.0);
  }
  let baseM = U.hero1.y;
  let thick = max(50.0, U.hero1.z);
  let h01 = saturate((altitude(worldPos) - baseM) / thick);
  let typeMix = saturate(U.hero1.w);
  let anvilR = anvilFootprintBoost(h01, typeMix);
  let ell2 = length((worldPos.xz - center) / (radii * anvilR));
  let fade2 = 1.0 - softstep(0.7, 1.08, ell2);
  let profile = verticalProfile(h01, typeMix);
  let support = fade2 * profile * U.hero2.x * U.hero2.y;
  return vec4f(support, typeMix, h01, 1.0);
}

fn volumeFootprintLod(stepLen: f32, scale: vec3f, texelsPerAxis: f32, manualOffset: f32) -> f32 {
  let maxScale = max(max(abs(scale.x), abs(scale.y)), abs(scale.z));
  let footprintTexels = max(stepLen, 1.0) * maxScale * texelsPerAxis;
  return max(manualOffset, 0.0) + log2(max(footprintTexels, 1.0));
}

fn sampleBaseShape(worldPos: vec3f, stepLen: f32) -> f32 {
  let windMeters = vec3f(U.hpDetailMotion.y, 0.0, U.hpDetailMotion.z) * U.time * U.hpShapeScale.w;
  // HP's source asset has substantially richer, less obvious repetition than
  // this demo's generated atlas. First rotate and bend the primary lattice.
  // A second independently rotated, non-integer-scale sample fades in only at
  // long range, where atlas repetition is visible but local shape fidelity is
  // less sensitive to the extra blend.
  let movingPos = worldPos + windMeters;
  let warpedPos = lowFrequencyShapeWarp(movingPos);
  let rotatedPos = rotateNoiseXZ(warpedPos, U.hpShapeWarp0.x);
  let baseNoisePos = shearNoiseXZ(rotatedPos, 0.23, 0.17);
  let p = baseNoisePos * U.hpShapeScale.xyz;
  let lod = volumeFootprintLod(stepLen, U.hpShapeScale.xyz, 128.0, U.hpLod0.x);
  let primary = pow(abs(textureSampleLevel(shapeTex, shapeSamp, p, lod).r), 0.6);

  let distanceXZ = distance(worldPos.xz, U.cameraPos.xz);
  let secondaryWeight = saturate(U.hpShapeBlend0.z) * softstep(18000.0, 90000.0, distanceXZ);
  if (secondaryWeight <= 0.0001) {
    return primary;
  }
  let secondaryRotated = rotateNoiseXZ(warpedPos, U.hpShapeWarp0.x + U.hpShapeBlend0.y);
  let secondaryNoisePos = shearNoiseXZ(secondaryRotated, -0.19, 0.31);
  let ratio = max(U.hpShapeBlend0.x, 0.01);
  let secondaryP = secondaryNoisePos * U.hpShapeScale.xyz * ratio + vec3f(0.173, 0.071, -0.114);
  let secondaryLod = volumeFootprintLod(stepLen, U.hpShapeScale.xyz * ratio, 128.0, U.hpLod0.x);
  let secondary = pow(abs(textureSampleLevel(shapeTex, shapeSamp, secondaryP, secondaryLod).r), 0.6);
  return mix(primary, secondary, secondaryWeight);
}

fn sampleDetailHp(worldPos: vec3f, stepLen: f32) -> vec2f {
  let horizontalWind = vec3f(U.hpDetailMotion.y, 0.0, U.hpDetailMotion.z) * U.time * U.hpDetailScale.w;
  let verticalWind = vec3f(0.0, U.time * U.hpDetailMotion.x, 0.0);
  let hpPos = vec3f(worldPos.x, -worldPos.y, worldPos.z) + horizontalWind + verticalWind;
  let detailNoisePos = shearNoiseXZ(hpPos, -0.31, 0.27);
  let lod = volumeFootprintLod(stepLen, U.hpDetailScale.xyz, 64.0, U.hpLod0.y);
  let d = textureSampleLevel(hpDetailTex, detailSamp, detailNoisePos * U.hpDetailScale.xyz, lod);
  let billowy = d.b * U.hpDetailWeights.x + d.a * U.hpDetailWeights.y;
  let wispy = d.r * U.hpDetailWeights.z + d.g * U.hpDetailWeights.w;
  return vec2f(billowy, wispy);
}

// HP L1 core. Sampling-quality fade remains outside the mathematical core;
// with detailFade=1 this follows EvaluateCloudProperties' erosion topology.
fn cloudFromShape(
  baseShape: f32,
  worldPos: vec3f,
  normalizedHeight: f32,
  localHeight: f32,
  typeMix: f32,
  scStrength: f32,
  simpleMode: bool,
  detailAmt: f32,
  stepLen: f32,
  densityCoverage: f32,
  heightGradient: f32,
  densScale: f32
) -> f32 {
  var bottomFade = 1.0;
  if (U.hpLow1.y > 0.0) {
    bottomFade = pow(
      saturate(localHeight / U.hpLow1.y),
      max(U.hpLow1.z, 0.01)
    );
  }
  let shape = mix(1.0, baseShape, bottomFade);

  let detailOff = (U.debugFlags.y & 1u) != 0u;
  let detailWave = 1.0 / max(1e-5, U.detailRepeat);
  let detailFadeByStep = 1.0 - softstep(0.45 * detailWave, 1.1 * detailWave, stepLen);
  let detailFade = select(1.0, detailFadeByStep, U.hpLod0.w >= 0.5);
  var erodedB = shape;
  var erodedW = shape;
  if (!simpleMode && U.hpLod0.z < 0.5 && !detailOff && detailAmt > 1e-4 && detailFade > 0.01) {
    let det = sampleDetailHp(worldPos, stepLen);
    let typeDetailStrength = mix(hpTypeValue(U.hpTypeDetail.xyz, typeMix), U.hpSc0.z, scStrength);
    let detailStr = U.detailStrength * typeDetailStrength * detailAmt * detailFade * bottomFade;
    erodedB = hpDensityRemapSafe(shape, det.x * detailStr);
    erodedW = hpDensityRemapSafe(shape, det.y * detailStr);
  }
  erodedB *= heightGradient;
  erodedW *= heightGradient;

  let threshold = (1.0 - saturate(densityCoverage)) + U.hpLow0.x;
  let hiAInverseWeight = 1.0 - pow(saturate(U.hpDensityPost0.x), max(U.hpDensityPost0.y, 0.01));
  let edgeSoftness = max(U.hpLow0.z * hiAInverseWeight, 0.001);
  let wispyThreshold = threshold - U.hpLow0.y;
  let densB = remapClamped(erodedB, threshold, threshold + edgeSoftness);
  var densW = remapClamped(erodedW, wispyThreshold, wispyThreshold + edgeSoftness);

  let wispyT = saturate((normalizedHeight - U.hpLow0.w) / max(1.0 - U.hpLow0.w, 0.001));
  densW *= pow(max(0.0, 1.0 - wispyT), max(U.hpLow1.x * 10.0, 0.01));

  let coreMix = smoothstep(0.0, max(U.wispyEdgeWidth, 0.001), densB);
  return mix(densW, densB, coreMix) * densScale;
}

fn evaluateLowCloudLayer(
  worldPos: vec3f,
  baseM: f32,
  topM: f32,
  densScale: f32,
  detailAmt: f32,
  genusIndex: f32,
  cumulusDevelopment: f32,
  w: vec4f,
  stepLen: f32,
  simpleMode: bool,
  outSupport: ptr<function, f32>,
  outAfterShape: ptr<function, f32>,
  outDensity: ptr<function, f32>,
  outType: ptr<function, f32>,
  outH: ptr<function, f32>,
  outDensityCoverage: ptr<function, f32>
) {
  if (densScale <= 1e-4 || topM <= baseM) {
    *outSupport = 0.0; *outAfterShape = 0.0; *outDensity = 0.0; *outType = 0.0; *outH = 0.0; *outDensityCoverage = 0.0;
    return;
  }
  let alt = altitude(worldPos);
  let h01 = saturate((alt - baseM) / max(1.0, topM - baseM));
  let typeMix = selectedCloudType(genusIndex, cumulusDevelopment);
  *outType = typeMix;
  *outH = h01;
  if (alt < baseM || alt > topM) {
    *outSupport = 0.0; *outAfterShape = 0.0; *outDensity = 0.0; *outDensityCoverage = 0.0;
    return;
  }

  var densityCoverage = hpLoCoverage(w.r);
  // A negative override preserves the authored weather-map Sc mask. Presets
  // can opt into a uniform Sc deck without changing any existing cloud type.
  let scMask = select(w.b, saturate(U.hpSc2.z), U.hpSc2.z >= 0.0);
  var scStrength = saturate(U.hpSc0.x * scMask);
  if (abs(genusIndex - GENUS_STRATOCUMULUS) < 0.5) {
    scStrength = 1.0;
  }
  var scCell = 1.0;
  if (scStrength > 0.0) {
    scCell = saturate(textureSampleLevel(scCellTex, weatherSamp, weatherUv(worldPos) * U.hpSc2.xy, 0.0).r * U.hpSc1.y);
    let scCoverage = saturate(pow(saturate(w.r), max(U.hpSc1.w, 0.001)) * U.hpSc1.z);
    densityCoverage = mix(densityCoverage, scCoverage * scCell, scStrength);
  }
  *outDensityCoverage = densityCoverage;
  let heightCoverage = hpLoHeightCoverage(w.r);
  let coverForTop = pow(saturate(heightCoverage), max(U.hpCoverTop.z, 0.01));
  let topScale = mix(1.0, max(U.hpCoverTop.y, 1.0), coverForTop * U.hpCoverTop.x);
  let heightForLut = h01 / (1.0 + (topScale - 1.0) * h01);
  let scCompressedHeight = saturate(h01 / max(U.hpSc0.y, 0.01));
  let localHeight = mix(heightForLut, scCompressedHeight, scStrength);
  let profiles = hpProfiles(localHeight, weatherUv(worldPos));
  let profile = mix(hpTypeValue(profiles, typeMix), profiles.r, scStrength);
  let support = densityCoverage * profile * densScale;
  *outSupport = support;
  if (densityCoverage < 0.1 || profile <= 0.0) {
    *outAfterShape = 0.0;
    *outDensity = 0.0;
    return;
  }

  // HP: baseShape = pow(noise, 0.6)，与 coverage 解耦
  let baseShape = sampleBaseShape(worldPos, stepLen);
  *outAfterShape = baseShape * profile;
  var density = cloudFromShape(baseShape, worldPos, h01, localHeight, typeMix, scStrength, simpleMode, detailAmt, stepLen, densityCoverage, profile, densScale);
  density *= hpTypeValue(U.hpTypeDensity.xyz, typeMix) * U.hpTypeDensity.w;
  if (scStrength > 0.0) {
    let scCellShaped = pow(max(scCell, 0.001), max(U.hpSc0.w, 0.01));
    let scCellFactor = mix(1.0, scCellShaped, U.hpSc1.x);
    density *= mix(1.0, scCellFactor, scStrength);
  }
  if (U.hpDensityPost0.z > 0.0) {
    density *= hpDensityDarkScale(densityCoverage);
  }
  *outDensity = density;
}

// Compatibility bridge: every family starts from the pre-dispatch HP density
// implementation. Family morphology may replace only the density channel, so
// support, coverage, type mix, and the established vertical LUT remain stable.
fn evaluateCompatibilityDensity(
  context: CloudGenusDensityContext,
  genusIndex: f32
) -> DensitySample {
  var support = 0.0;
  var afterShape = 0.0;
  var density = 0.0;
  var typeMix = 0.0;
  var height01 = 0.0;
  var densityCoverage = 0.0;
  evaluateLowCloudLayer(
    context.worldPos,
    context.baseM,
    context.topM,
    context.densityScale,
    context.detailAmount,
    genusIndex,
    context.cumulusDevelopment,
    context.weather,
    context.stepLen,
    context.simpleMode,
    &support,
    &afterShape,
    &density,
    &typeMix,
    &height01,
    &densityCoverage,
  );
  return DensitySample(support, afterShape, density, typeMix, height01, densityCoverage);
}

fn cumulusCellCoordinate(
  context: CloudGenusDensityContext,
  development: f32,
  verticalDevelopment: f32,
  cellScale: f32,
) -> vec3f {
  let layerHeight = max(context.topM - context.baseM, 1.0);
  let safeCellScale = max(cellScale, 0.05);
  let horizontalCellM = max(
    160.0,
    layerHeight * mix(0.48, 0.32, development) * safeCellScale,
  );
  let verticalStretch = mix(
    0.9,
    1.85,
    saturate(development * max(verticalDevelopment, 0.0)),
  );
  return anisotropicCoordinate(
    context.bodyLocalMeters / horizontalCellM,
    vec3f(1.0, 1.0 / verticalStretch, 1.0),
  );
}

fn evaluateCumulusFamily(
  context: CloudGenusDensityContext,
  compatibility: DensitySample,
) -> DensitySample {
  // morphology0.z is the family migration switch. Zero must preserve the HP
  // Cu/TCu result bit-for-bit, including density values outside the body.
  let cellStrength = saturate(context.morphology0.z);
  if (cellStrength <= 1e-5 || compatibility.density <= 0.0) {
    return compatibility;
  }

  let development = saturate(context.cumulusDevelopment);
  let verticalDevelopment = max(context.morphology0.x, 0.0);
  let verticalArtDirection = saturate(verticalDevelopment);
  let domeDevelopment = saturate(
    development * mix(0.55, 1.25, verticalArtDirection)
      + (verticalArtDirection - 0.55) * 0.25,
  );
  let cellScale = max(context.morphology0.y, 0.05);
  let erosionScale = max(context.morphology1.w, 0.05);
  let lod = morphologyLod(context);
  let cellCoordinate = cumulusCellCoordinate(
    context,
    development,
    verticalDevelopment,
    cellScale,
  );
  let carrier = cellularCarrier(cellCoordinate, context.bodyPhase, lod);
  let erosionAmount = saturate(erosionScale / 2.0);
  let cauliflower = smoothstep(
    mix(0.58, 0.34, erosionAmount),
    mix(0.9, 0.7, erosionAmount),
    carrier,
  );

  // Keep the cloud base flat: morphology fades in above the lower 16% of the
  // established HP envelope. Development continuously raises the dome weight
  // and elongates cells, while the HP Cu->TCu LUT still owns the main profile.
  let bodyHeight = saturate(context.normalizedHeight);
  let baseProtection = smoothstep(0.12, 0.22, bodyHeight);
  let topProtection = 1.0 - smoothstep(0.94, 1.0, bodyHeight);
  let morphologyBand = saturate(baseProtection * topProtection);
  let domeWeight = smoothstep(
    mix(0.62, 0.32, domeDevelopment),
    mix(0.84, 0.56, domeDevelopment),
    bodyHeight,
  );
  let cellFactor = mix(0.76, 1.24, cauliflower);
  let domeFactor = 1.0 + domeWeight
    * domeDevelopment
    * mix(0.8, 1.2, verticalArtDirection)
    * 0.22;
  let shapedDensity = compatibility.density
    * mix(1.0, cellFactor * domeFactor, morphologyBand);
  return safeMorphBlend(
    compatibility,
    replaceSampleDensity(compatibility, shapedDensity),
    cellStrength,
  );
}

fn cumulonimbusCellCoordinate(
  context: CloudGenusDensityContext,
  cellScale: f32,
  verticalDevelopment: f32,
) -> vec3f {
  let layerHeight = max(context.topM - context.baseM, 1.0);
  let horizontalCellM = max(280.0, layerHeight * 0.16 * max(cellScale, 0.05));
  let verticalStretch = mix(1.6, 3.2, saturate(verticalDevelopment));
  return anisotropicCoordinate(
    context.bodyLocalMeters / horizontalCellM,
    vec3f(1.0, 1.0 / verticalStretch, 1.0),
  );
}

fn cumulonimbusAnvilDensity(
  context: CloudGenusDensityContext,
  compatibility: DensitySample,
  towerDensity: f32,
  anvilStrength: f32,
) -> f32 {
  if (anvilStrength <= 1e-5) {
    return towerDensity;
  }

  // The anvil exists only in the high band. Its body-local radial mask expands
  // horizontally with strength; the regular layerHorizontalMask is applied
  // after genus dispatch, so bounded bodies retain their authored feather.
  let bodyHeight = saturate(context.normalizedHeight);
  let anvilBand = smoothstep(0.7, 0.82, bodyHeight)
    * (1.0 - smoothstep(0.96, 1.0, bodyHeight));
  let anvilRadius = mix(0.52, 1.0, saturate(anvilStrength));
  let radial = length(context.bodyLocalUnit.xz);
  let footprint = 1.0 - smoothstep(anvilRadius * 0.68, anvilRadius, radial);
  let anvilFoundation = compatibility.support
    * compatibility.densityCoverage
    * mix(0.36, 0.64, saturate(anvilStrength))
    * footprint;
  let expandedDensity = max(towerDensity, anvilFoundation);
  return mix(
    towerDensity,
    expandedDensity,
    saturate(anvilBand * anvilStrength),
  );
}

fn evaluateCumulonimbusFamily(
  context: CloudGenusDensityContext,
  compatibility: DensitySample,
) -> DensitySample {
  let cellStrength = saturate(context.morphology0.z);
  if (cellStrength <= 1e-5 || compatibility.support <= 0.0) {
    return compatibility;
  }

  let verticalDevelopment = max(context.morphology0.x, 0.0);
  let cellScale = max(context.morphology0.y, 0.05);
  let erosionScale = max(context.morphology1.w, 0.05);
  let lod = morphologyLod(context);
  let cellCoordinate = cumulonimbusCellCoordinate(
    context,
    cellScale,
    verticalDevelopment,
  );
  let macroCell = cellularCarrier(cellCoordinate, context.bodyPhase, lod);
  var detailCell = macroCell;
  if (!context.simpleMode && lod.detailWeight > 1e-4) {
    detailCell = cellularCarrier(
      cellCoordinate * vec3f(1.85, 1.2, 1.85),
      context.bodyPhase.zxy,
      MorphologyLod(lod.frequencyScale, lod.detailWeight * 0.65),
    );
  }
  let convectiveCell = mix(macroCell, macroCell * detailCell, 0.42 * lod.detailWeight);
  let erosionAmount = saturate(erosionScale / 2.0);
  let cauliflower = smoothstep(
    mix(0.55, 0.3, erosionAmount),
    mix(0.88, 0.66, erosionAmount),
    convectiveCell,
  );

  let bodyHeight = saturate(context.normalizedHeight);
  let upperGate = smoothstep(0.26, 0.52, bodyHeight)
    * (1.0 - smoothstep(0.94, 1.0, bodyHeight));
  let scaffold = 0.58;
  let carvedTower = compatibility.density
    * mix(scaffold, 1.48, cauliflower);
  let towerDensity = mix(compatibility.density, carvedTower, upperGate);
  let anvilDensity = cumulonimbusAnvilDensity(
    context,
    compatibility,
    towerDensity,
    saturate(context.morphology1.z),
  );
  return safeMorphBlend(
    compatibility,
    replaceSampleDensity(compatibility, anvilDensity),
    cellStrength,
  );
}

fn evaluateCumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CUMULUS);
  return evaluateCumulusFamily(context, compatibility);
}

fn evaluateStratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_STRATUS);
}

fn evaluateStratocumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_STRATOCUMULUS);
}

fn evaluateCumulonimbusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CUMULONIMBUS);
  return evaluateCumulonimbusFamily(context, compatibility);
}

fn evaluateAltocumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_ALTOCUMULUS);
}

fn evaluateAltostratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_ALTOSTRATUS);
}

fn evaluateNimbostratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_NIMBOSTRATUS);
}

fn evaluateCirrusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_CIRRUS);
}

fn evaluateCirrostratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_CIRROSTRATUS);
}

fn evaluateCirrocumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  return evaluateCompatibilityDensity(context, GENUS_CIRROCUMULUS);
}

fn dispatchCloudGenusDensity(
  context: CloudGenusDensityContext,
  genusIndex: f32
) -> DensitySample {
  if (abs(genusIndex - GENUS_CUMULUS) < 0.5) {
    return evaluateCumulusDensity(context);
  }
  if (abs(genusIndex - GENUS_STRATUS) < 0.5) {
    return evaluateStratusDensity(context);
  }
  if (abs(genusIndex - GENUS_STRATOCUMULUS) < 0.5) {
    return evaluateStratocumulusDensity(context);
  }
  if (abs(genusIndex - GENUS_CUMULONIMBUS) < 0.5) {
    return evaluateCumulonimbusDensity(context);
  }
  if (abs(genusIndex - GENUS_ALTOCUMULUS) < 0.5) {
    return evaluateAltocumulusDensity(context);
  }
  if (abs(genusIndex - GENUS_ALTOSTRATUS) < 0.5) {
    return evaluateAltostratusDensity(context);
  }
  if (abs(genusIndex - GENUS_NIMBOSTRATUS) < 0.5) {
    return evaluateNimbostratusDensity(context);
  }
  if (abs(genusIndex - GENUS_CIRRUS) < 0.5) {
    return evaluateCirrusDensity(context);
  }
  if (abs(genusIndex - GENUS_CIRROSTRATUS) < 0.5) {
    return evaluateCirrostratusDensity(context);
  }
  if (abs(genusIndex - GENUS_CIRROCUMULUS) < 0.5) {
    return evaluateCirrocumulusDensity(context);
  }

  // Preserve the old unknown-index behaviour: neutral Cu-compatible shape,
  // without applying the Cu development continuum.
  return evaluateCompatibilityDensity(context, -1.0);
}

fn distanceFade(worldPos: vec3f) -> f32 {
  // 相对相机距离淡出，替代世界原点 XZ 硬边
  let maxD = max(5000.0, U.quality.w * 0.92);
  let d = length(worldPos - U.cameraPos);
  return 1.0 - softstep(maxD * 0.82, maxD, d);
}

fn layerHorizontalMask(worldPos: vec3f, bounds: vec4f, transform: vec4f) -> f32 {
  if (transform.z < 0.5) {
    return 1.0;
  }
  let delta = worldPos.xz - bounds.xy;
  let c = cos(transform.x);
  let s = sin(transform.x);
  let localPos = vec2f(c * delta.x + s * delta.y, -s * delta.x + c * delta.y);
  let ellipseDistance = length(localPos / max(bounds.zw, vec2f(1.0)));
  let feather = clamp(transform.y, 0.001, 0.95);
  return 1.0 - smoothstep(1.0 - feather, 1.0, ellipseDistance);
}

fn bodyLifecycleScale(enabled: f32, life: vec4f, peakDensity: f32, time: f32) -> f32 {
  if (enabled < 0.5) {
    return 1.0;
  }
  let birth = life.x;
  let grow = max(birth, life.y);
  let decay = max(grow, life.z);
  let death = max(decay, life.w);
  if (time < birth || time >= death) {
    return 0.0;
  }
  let peak = max(0.0, peakDensity);
  if (time < grow) {
    return smoothstep(birth, max(birth + 0.001, grow), time) * peak;
  }
  if (time < decay) {
    return peak;
  }
  return (1.0 - smoothstep(decay, max(decay + 0.001, death), time)) * peak;
}

fn evaluateLowCloud(worldPos: vec3f, stepLen: f32, simpleMode: bool) -> DensitySample {
  let edgeFade = distanceFade(worldPos);
  if (edgeFade <= 0.0) {
    return DensitySample(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  }
  let lowWeatherUv = weatherUv(worldPos);
  if (!isInsideWeatherMap(lowWeatherUv)) {
    return DensitySample(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  }
  let w = sampleWeather(worldPos);
  var bestSupport = 0.0;
  var bestAfter = 0.0;
  var bestDens = 0.0;
  var bestType = w.g;
  var bestH = 0.0;
  var bestDensityCoverage = 0.0;

  for (var layerIndex = 0u; layerIndex < 8u; layerIndex += 1u) {
    let layer = B.layers[layerIndex];
    if (layer.w <= 0.5) {
      continue;
    }
    let shapeDetail = B.layerShapeDetails[layerIndex];
    let motion = B.layerMotion[layerIndex];
    let bodyTime = max(0.0, U.time - B.layerBoundTransforms[layerIndex].w);
    let lifeScale = bodyLifecycleScale(motion.w, B.layerLife[layerIndex], shapeDetail.w, bodyTime);
    if (lifeScale <= 0.0001) {
      continue;
    }
    let transport = motion.xy * U.time;
    let transportedPos = vec3f(worldPos.x - transport.x, worldPos.y, worldPos.z - transport.y);
    let morphPhase = U.time * motion.z * 6.2831853;
    let morphAmount = saturate(abs(motion.z) * 10.0) * 450.0;
    let densityPos = transportedPos + vec3f(
      sin(morphPhase) * morphAmount,
      0.0,
      (cos(morphPhase) - 1.0) * morphAmount,
    );
    let bodyWeatherUv = weatherUv(densityPos);
    if (!isInsideWeatherMap(bodyWeatherUv)) {
      continue;
    }
    let bodyWeather = sampleWeather(densityPos);
    let horizontalMask = layerHorizontalMask(
      transportedPos,
      B.layerBounds[layerIndex],
      B.layerBoundTransforms[layerIndex],
    );
    if (horizontalMask <= 0.0) {
      continue;
    }
    let localFrame = deriveCloudBodyLocalFrame(
      layerIndex,
      densityPos,
      layer.x,
      layer.y,
      B.layerBounds[layerIndex],
      B.layerBoundTransforms[layerIndex],
    );
    let context = CloudGenusDensityContext(
      densityPos,
      layerIndex,
      localFrame.meters,
      localFrame.unit,
      localFrame.normalizedHeight,
      localFrame.phase,
      layer.x,
      layer.y,
      layer.z * lifeScale,
      shapeDetail.y,
      shapeDetail.z,
      bodyWeather,
      B.layerMorphology0[layerIndex],
      B.layerMorphology1[layerIndex],
      stepLen,
      simpleMode,
    );
    let layerSample = dispatchCloudGenusDensity(context, shapeDetail.x);
    var support = layerSample.support;
    var afterShape = layerSample.afterShape;
    var density = layerSample.density;
    let typeMix = layerSample.typeMix;
    let height01 = layerSample.height01;
    var densityCoverage = layerSample.densityCoverage;
    support *= horizontalMask;
    afterShape *= horizontalMask;
    density *= horizontalMask;
    densityCoverage *= horizontalMask;
    bestDensityCoverage = max(bestDensityCoverage, densityCoverage);
    bestSupport = max(bestSupport, support);
    // Preserve the legacy tie behaviour: an enabled first layer owns the
    // zero-density baseline, while later layers must strictly exceed it.
    if (density > bestDens || (layerIndex == 0u && density >= bestDens)) {
      bestAfter = afterShape;
      bestDens = density;
      bestType = typeMix;
      bestH = height01;
    }
  }

  let hs = heroSupport(worldPos);
  if (hs.x > bestSupport) {
    let typeMix = hs.y;
    let h01 = hs.z;
    let profile = hpProfile(h01, typeMix, lowWeatherUv);
    let baseShape = sampleBaseShape(worldPos, stepLen);
    bestSupport = hs.x;
    bestAfter = baseShape * profile;
    bestDens = cloudFromShape(baseShape, worldPos, h01, h01, typeMix, 0.0, simpleMode, 1.0, stepLen, U.hero2.x, profile, U.hero2.y);
    bestDens *= hpTypeValue(U.hpTypeDensity.xyz, typeMix) * U.hpTypeDensity.w;
    if (U.hpDensityPost0.z > 0.0) {
      bestDens *= hpDensityDarkScale(U.hero2.x);
    }
    bestType = typeMix;
    bestH = h01;
    bestDensityCoverage = max(bestDensityCoverage, U.hero2.x);
  }

  return DensitySample(
    bestSupport * edgeFade,
    bestAfter * edgeFade,
    bestDens * edgeFade,
    bestType,
    bestH,
    bestDensityCoverage
  );
}
