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

struct SheetRecipe {
  familyStrength: f32,
  densityMultiplier: f32,
  macroVariationStrength: f32,
  bottomErosionStrength: f32,
  bottomDroopStrength: f32,
  directionalFiberStrength: f32,
};

struct SheetProfile {
  bottomStart: f32,
  bottomEnd: f32,
  topStart: f32,
  topEnd: f32,
};

struct CellularRecipe {
  familyStrength: f32,
  baseCellMeters: f32,
  verticalFrequency: f32,
  crossFrequency: f32,
  connectivity: f32,
  valleyDensity: f32,
  peakDensity: f32,
  warpStrength: f32,
  rippleStrength: f32,
};

struct CellularProfile {
  bottomStart: f32,
  bottomEnd: f32,
  topStart: f32,
  topEnd: f32,
};

struct FiberRecipe {
  familyStrength: f32,
  baseWidthMeters: f32,
  longFrequency: f32,
  verticalFrequency: f32,
  crossFrequency: f32,
  curlStrength: f32,
  branchStrength: f32,
  valleyDensity: f32,
  peakDensity: f32,
};

struct FiberProfile {
  bottomStart: f32,
  bottomEnd: f32,
  topStart: f32,
  topEnd: f32,
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

fn blendIndependentMorphology(
  base: DensitySample,
  shaped: DensitySample,
  strength: f32,
) -> DensitySample {
  if (strength != strength || strength <= 0.0) {
    return base;
  }
  let weight = saturate(strength);
  return DensitySample(
    mix(sanitizeMorphologyDensity(base.support), sanitizeMorphologyDensity(shaped.support), weight),
    mix(sanitizeMorphologyDensity(base.afterShape), sanitizeMorphologyDensity(shaped.afterShape), weight),
    mix(sanitizeMorphologyDensity(base.density), sanitizeMorphologyDensity(shaped.density), weight),
    mix(base.typeMix, shaped.typeMix, weight),
    mix(base.height01, shaped.height01, weight),
    mix(saturate(base.densityCoverage), saturate(shaped.densityCoverage), weight),
  );
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

fn cellularFamilyCarrier(
  position: vec3f,
  phase: vec3f,
  lod: MorphologyLod,
) -> f32 {
  let q = position * (MORPHOLOGY_TWO_PI * lod.frequencyScale)
    + phase * MORPHOLOGY_TWO_PI;
  let bentX = q.x + sin(q.z * 0.31 + phase.y * MORPHOLOGY_TWO_PI) * 0.68;
  let bentZ = q.z + sin(q.x * 0.27 + phase.z * MORPHOLOGY_TWO_PI) * 0.68;
  let broadCells = cos(bentX) * cos(bentZ);
  var signal = broadCells;
  if (lod.detailWeight > 1e-4) {
    let staggered = cos(bentX * 0.57 + bentZ * 0.83 + q.y * 0.31);
    signal = mix(broadCells, staggered, 0.3 * lod.detailWeight);
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
  // high-sheet is a performance-specialized approximation of the canonical
  // Ac/As families. It consumes the same cell scale/strength, sheet
  // uniformity, vertical development and erosion recipe fields. Fiber angle,
  // fiber strength and anvil strength are intentionally ignored on this path.
  let morphology = U.hpHighMorphology0;
  let cellScale = max(morphology.y, 0.05);
  let recipeCellStrength = saturate(morphology.z);
  let sheetUniformity = saturate(morphology.w);
  let verticalDevelopment = saturate(morphology.x);
  let cellStrength = mix(U.hpHigh3.z, U.hpHigh3.y, typeMix)
    * recipeCellStrength
    * mix(1.0, 0.45, sheetUniformity);
  let baseUv = highWeatherUv(worldPos);
  let windUv = U.windOffset * U.hpHigh1.w;
  let warpUv = baseUv * U.hpHigh2.zw + windUv * 0.5;
  let warp = (textureSampleLevel(highWarpTex, weatherSamp, warpUv, 0.0).rg * 2.0 - 1.0) * U.hpHigh3.x;
  let cellUv = baseUv * U.hpHigh2.xy / cellScale + windUv + warp;
  let cellRaw = saturate(textureSampleLevel(highCellTex, weatherSamp, cellUv, 0.0).r);
  let cellShaped = pow(max(cellRaw, 0.001), max(U.hpHigh3.w, 0.01));

  let coverForHeight = pow(coverage, max(U.hpHigh4.w, 0.01));
  let authoredCenter = (U.hpHigh4.x + U.hpHigh4.y) * 0.5;
  let authoredHalfSpan = (U.hpHigh4.y - U.hpHigh4.x) * 0.5
    * mix(0.58, 1.28, verticalDevelopment);
  let authoredBottom = authoredCenter - authoredHalfSpan;
  let authoredTop = authoredCenter + authoredHalfSpan;
  let drivenTop = mix(authoredBottom, authoredTop, coverForHeight);
  let thickFactor = mix(1.0, cellShaped, saturate(cellStrength * 0.5));
  let effectiveTop = authoredBottom + (drivenTop - authoredBottom) * thickFactor;
  let effectiveBottom = authoredBottom
    - (authoredTop - authoredBottom) * U.hpHigh4.z * coverForHeight;

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
  let erosionScale = max(U.hpHighMorphology1.w, 0.0);
  var density = (
    baseDensity * mix(1.0, cellFactor, 1.0 - sheetUniformity * 0.72)
      - wisp * U.hpHigh6.z * erosionScale * typeMix
  ) * bandMask;
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

fn legacyStratocumulusStrength(genusIndex: f32, weather: vec4f) -> f32 {
  // Preserve the authored weather-B mask and the preset override while the
  // body-local cellular family is introduced on top of this compatibility
  // scaffold. These branches are algebraically identical to stage 4.
  let scMask = select(weather.b, saturate(U.hpSc2.z), U.hpSc2.z >= 0.0);
  var strength = saturate(U.hpSc0.x * scMask);
  if (abs(genusIndex - GENUS_STRATOCUMULUS) < 0.5) {
    strength = 1.0;
  }
  return strength;
}

fn legacyStratocumulusCell(worldPos: vec3f, strength: f32) -> f32 {
  if (strength <= 0.0) {
    return 1.0;
  }
  return saturate(
    textureSampleLevel(
      scCellTex,
      weatherSamp,
      weatherUv(worldPos) * U.hpSc2.xy,
      0.0,
    ).r * U.hpSc1.y,
  );
}

fn legacyStratocumulusCoverage(
  rawCoverage: f32,
  hpCoverage: f32,
  cell: f32,
  strength: f32,
) -> f32 {
  let scCoverage = saturate(
    pow(saturate(rawCoverage), max(U.hpSc1.w, 0.001)) * U.hpSc1.z,
  );
  return mix(hpCoverage, scCoverage * cell, strength);
}

fn legacyStratocumulusHeight(
  normalizedHeight: f32,
  hpHeight: f32,
  strength: f32,
) -> f32 {
  let compressedHeight = saturate(normalizedHeight / max(U.hpSc0.y, 0.01));
  return mix(hpHeight, compressedHeight, strength);
}

fn legacyStratocumulusCellFactor(cell: f32, strength: f32) -> f32 {
  if (strength <= 0.0) {
    return 1.0;
  }
  let shaped = pow(max(cell, 0.001), max(U.hpSc0.w, 0.01));
  let factor = mix(1.0, shaped, U.hpSc1.x);
  return mix(1.0, factor, strength);
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
  let scStrength = legacyStratocumulusStrength(genusIndex, w);
  let scCell = legacyStratocumulusCell(worldPos, scStrength);
  densityCoverage = legacyStratocumulusCoverage(
    w.r,
    densityCoverage,
    scCell,
    scStrength,
  );
  *outDensityCoverage = densityCoverage;
  let heightCoverage = hpLoHeightCoverage(w.r);
  let coverForTop = pow(saturate(heightCoverage), max(U.hpCoverTop.z, 0.01));
  let topScale = mix(1.0, max(U.hpCoverTop.y, 1.0), coverForTop * U.hpCoverTop.x);
  let heightForLut = h01 / (1.0 + (topScale - 1.0) * h01);
  let localHeight = legacyStratocumulusHeight(h01, heightForLut, scStrength);
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
  density *= legacyStratocumulusCellFactor(scCell, scStrength);
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

fn sheetVerticalProfile(height: f32, profile: SheetProfile) -> f32 {
  if (height < profile.bottomStart || height > profile.topEnd) {
    return 0.0;
  }
  let bottom = smoothstep(profile.bottomStart, profile.bottomEnd, height);
  let top = 1.0 - smoothstep(profile.topStart, profile.topEnd, height);
  return saturate(bottom * top);
}

fn evaluateSheetFoundation(
  context: CloudGenusDensityContext,
  recipe: SheetRecipe,
  profile: SheetProfile,
) -> f32 {
  if (recipe.familyStrength <= 1e-5 || context.densityScale <= 1e-5) {
    return 0.0;
  }

  // Sheet coverage comes directly from the weather field. Uniformity fills
  // sparse values inside that finite support, but never creates density when
  // coverage is zero or beyond the weather-map boundary.
  let rawCoverage = saturate(context.weather.r);
  if (rawCoverage <= 1e-5) {
    return 0.0;
  }
  let weatherSupport = smoothstep(0.0, 0.12, rawCoverage);
  let sheetUniformity = saturate(context.morphology0.w);
  let sheetCoverage = mix(rawCoverage, weatherSupport, sheetUniformity);

  let lod = morphologyLod(context);
  let layerHeight = max(context.topM - context.baseM, 1.0);
  let macroScaleM = max(
    1200.0,
    layerHeight * max(context.morphology0.y, 0.05) * 1.6,
  );
  let macroCoordinate = anisotropicCoordinate(
    context.bodyLocalMeters / macroScaleM,
    vec3f(1.0, 0.08, 1.0),
  );
  let macroVariation = sheetMacroVariation(
    macroCoordinate,
    context.bodyPhase,
    lod,
  );

  // A small height offset lets thick rain sheets hang lower in broad pockets.
  // The offset disappears above the lower half so the top remains calm.
  let bodyHeight = saturate(context.normalizedHeight);
  let bottomRegion = 1.0 - smoothstep(0.2, 0.55, bodyHeight);
  let profileHeight = saturate(
    bodyHeight
      + (1.0 - macroVariation)
        * max(recipe.bottomDroopStrength, 0.0)
        * bottomRegion,
  );
  let verticalShape = sheetVerticalProfile(profileHeight, profile);
  if (verticalShape <= 0.0) {
    return 0.0;
  }

  let variationWeight = saturate(
    recipe.macroVariationStrength * mix(1.0, 0.35, sheetUniformity),
  );
  let macroFactor = mix(1.0, macroVariation, variationWeight);
  let lowerEdge = 1.0 - smoothstep(profile.bottomEnd, profile.topStart, profileHeight);
  let softEdge = 1.0 - smoothstep(0.45, 0.95, verticalShape);
  let erosionRegion = saturate(max(lowerEdge, softEdge * 0.35));
  let erosionWeight = saturate(
    recipe.bottomErosionStrength
      * max(context.morphology1.w, 0.0)
      * saturate(context.detailAmount)
      * erosionRegion,
  );
  let erosionFactor = mix(1.0, mix(0.72, 1.0, macroVariation), erosionWeight);

  var fiberFactor = 1.0;
  let fiberStrength = saturate(recipe.directionalFiberStrength);
  if (fiberStrength > 1e-5) {
    let fiberCoordinate = rotateMorphologyXZ(
      macroCoordinate * vec3f(0.55, 0.15, 2.2),
      context.morphology1.y,
    );
    let fiber = ridgeFiberCarrier(fiberCoordinate, context.bodyPhase.zxy, lod);
    fiberFactor = 1.0 + (fiber - 0.5) * fiberStrength * 0.16;
  }

  return sanitizeMorphologyDensity(
    sheetCoverage
      * verticalShape
      * macroFactor
      * erosionFactor
      * fiberFactor
      * context.densityScale
      * max(recipe.densityMultiplier, 0.0),
  );
}

fn evaluateSheetFamily(
  context: CloudGenusDensityContext,
  compatibility: DensitySample,
  recipe: SheetRecipe,
  profile: SheetProfile,
) -> DensitySample {
  if (recipe.familyStrength <= 1e-5) {
    return compatibility;
  }
  let sheetDensity = evaluateSheetFoundation(context, recipe, profile);
  return safeMorphBlend(
    compatibility,
    replaceSampleDensity(compatibility, sheetDensity),
    recipe.familyStrength,
  );
}

fn cellularVerticalProfile(height: f32, profile: CellularProfile) -> f32 {
  if (height < profile.bottomStart || height > profile.topEnd) {
    return 0.0;
  }
  let bottom = smoothstep(profile.bottomStart, profile.bottomEnd, height);
  let top = 1.0 - smoothstep(profile.topStart, profile.topEnd, height);
  return saturate(bottom * top);
}

fn bodyLocalCellularCoordinate(
  context: CloudGenusDensityContext,
  recipe: CellularRecipe,
) -> vec3f {
  let cellMeters = max(
    120.0,
    recipe.baseCellMeters * max(context.morphology0.y, 0.05),
  );
  let phaseAngle = (context.bodyPhase.x - 0.5) * 1.2;
  let rotated = rotateMorphologyXZ(context.bodyLocalMeters / cellMeters, phaseAngle);
  return anisotropicCoordinate(
    rotated,
    vec3f(1.0, max(recipe.verticalFrequency, 0.02), max(recipe.crossFrequency, 0.05)),
  );
}

fn evaluateCellularFamily(
  context: CloudGenusDensityContext,
  compatibility: DensitySample,
  recipe: CellularRecipe,
  profile: CellularProfile,
) -> DensitySample {
  let familyStrength = saturate(recipe.familyStrength * context.morphology0.z);
  if (familyStrength <= 1e-5 || compatibility.density <= 0.0) {
    return compatibility;
  }

  let profileBand = cellularVerticalProfile(
    saturate(context.normalizedHeight),
    profile,
  );
  let lod = morphologyLod(context);
  let coordinate = bodyLocalCellularCoordinate(context, recipe);
  // Keep a broad, cheap coordinate bend in simple/far modes so the remaining
  // single carrier does not collapse into a regular checkerboard. Only the
  // second cellular octave and directional ripple disappear with detail LOD.
  let warpWeight = saturate(
    recipe.warpStrength * mix(0.4, 1.0, lod.detailWeight),
  );
  let warp = vec3f(
    sin(
      coordinate.z * 0.43
        + sin(coordinate.x * 0.19 + context.bodyPhase.x * MORPHOLOGY_TWO_PI)
        + context.bodyPhase.y * MORPHOLOGY_TWO_PI
    ),
    0.0,
    sin(
      coordinate.x * 0.37
        + sin(coordinate.z * 0.23 + context.bodyPhase.y * MORPHOLOGY_TWO_PI)
        + context.bodyPhase.z * MORPHOLOGY_TWO_PI
    ),
  ) * warpWeight;
  let warpedCoordinate = coordinate + warp;
  let macroCell = cellularFamilyCarrier(warpedCoordinate, context.bodyPhase, lod);
  var cellSignal = macroCell;
  if (!context.simpleMode && lod.detailWeight > 1e-4) {
    let detailCell = cellularFamilyCarrier(
      warpedCoordinate * vec3f(1.83, 1.15, 1.67),
      context.bodyPhase.zxy,
      MorphologyLod(lod.frequencyScale, lod.detailWeight * 0.7),
    );
    cellSignal = mix(
      macroCell,
      macroCell * mix(0.58, 1.18, detailCell),
      0.38 * lod.detailWeight,
    );
  }

  let rippleWeight = saturate(recipe.rippleStrength * lod.detailWeight);
  if (rippleWeight > 1e-5) {
    let ripple = 0.5 + 0.5 * sin(
      (warpedCoordinate.x * 1.9 + warpedCoordinate.z * 0.63)
        * MORPHOLOGY_TWO_PI
        + context.bodyPhase.y * MORPHOLOGY_TWO_PI,
    );
    let rippleFactor = mix(0.82, 1.12, ripple);
    cellSignal *= mix(1.0, rippleFactor, rippleWeight);
  }
  cellSignal = saturate(cellSignal);

  let sheetUniformity = saturate(context.morphology0.w);
  let connectivity = saturate(recipe.connectivity * sheetUniformity);
  let cellMask = smoothstep(
    mix(0.56, 0.34, connectivity),
    mix(0.88, 0.66, connectivity),
    cellSignal,
  );
  let connectedMask = max(cellMask, connectivity * 0.52);
  let cellFactor = mix(
    max(recipe.valleyDensity, 0.0),
    max(recipe.peakDensity, 0.0),
    connectedMask,
  );
  let shapedDensity = compatibility.density * profileBand * cellFactor;
  return safeMorphBlend(
    compatibility,
    replaceSampleDensity(compatibility, shapedDensity),
    familyStrength,
  );
}

fn fiberVerticalProfile(height: f32, profile: FiberProfile) -> f32 {
  if (height < profile.bottomStart || height > profile.topEnd) {
    return 0.0;
  }
  let bottom = smoothstep(profile.bottomStart, profile.bottomEnd, height);
  let top = 1.0 - smoothstep(profile.topStart, profile.topEnd, height);
  return saturate(bottom * top);
}

fn morphologyHash13(position: vec3f) -> f32 {
  return fract(sin(dot(position, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}

fn cirrusLocalUnit(
  context: CloudGenusDensityContext,
  recipe: FiberRecipe,
) -> vec3f {
  // CloudBody rotation is already removed. This second rotation is the authored
  // mean wind direction shared by every finite fiber in the bundle.
  return rotateMorphologyXZ(context.bodyLocalUnit, context.morphology1.y);
}

fn cirrusFiberPrimitive(
  position: vec3f,
  seed: vec3f,
  strandOrder: f32,
  widthScale: f32,
  verticalScale: f32,
  curlStrength: f32,
) -> vec2f {
  let rootX = mix(-0.92, -0.76, morphologyHash13(seed + vec3f(1.7, 9.2, 2.4)));
  let centerY = mix(0.47, 0.55, morphologyHash13(seed + vec3f(4.1, 7.6, 9.3)));
  let halfLength = mix(0.48, 0.92, morphologyHash13(seed + vec3f(6.4, 3.3, 1.2)));
  let centerX = rootX + halfLength;
  let along = (position.x - centerX) / halfLength;
  let progress = saturate(along * 0.5 + 0.5);

  // The bundle shares a wind direction, not a single root. Staggered starts
  // avoid a perspective fan while the finite centreline still cannot repeat.
  let rootZ = strandOrder * 0.48
    + mix(-0.13, 0.13, morphologyHash13(seed + vec3f(8.3, 2.8, 5.1)));
  let tipZ = rootZ
    + strandOrder * 0.16
    + mix(-0.16, 0.16, morphologyHash13(seed + vec3f(3.7, 5.9, 8.2)));
  let bend = (morphologyHash13(seed + vec3f(2.1, 6.8, 7.4)) - 0.5)
    * 0.92 * curlStrength;
  let hook = (morphologyHash13(seed + vec3f(9.7, 1.9, 3.6)) - 0.5)
    * 0.72 * curlStrength;
  let curveZ = mix(rootZ, tipZ, progress)
    + bend * progress * (1.0 - progress)
    + hook * progress * progress * (progress - 0.62);

  // Ice crystals gradually fall out toward one end of the fibre. The curve is
  // still volumetric: this moves the centreline instead of extruding a 2D mask.
  let fallProgress = 1.0 - smoothstep(0.08, 0.92, progress);
  let fallDepth = mix(
    0.018,
    0.16,
    morphologyHash13(seed + vec3f(5.5, 4.4, 8.8)),
  );
  let fallY = centerY
    - fallDepth * fallProgress * fallProgress * curlStrength;

  let width = mix(
    0.035,
    0.07,
    morphologyHash13(seed + vec3f(3.2, 8.1, 6.7)),
  ) * widthScale;
  let verticalWidth = width
    * mix(0.18, 0.32, morphologyHash13(seed + vec3f(7.9, 5.6, 2.5)))
    * verticalScale;
  let radial = length(vec2f(
    (position.z - curveZ) / max(width, 0.005),
    (position.y - fallY) / max(verticalWidth, 0.005),
  ));
  let rootMask = smoothstep(-1.0, -0.82, along);
  let tipMask = rootMask * (1.0 - smoothstep(0.68, 1.0, along));
  let broadSupport = (1.0 - smoothstep(0.72, 1.45, radial)) * tipMask;
  let coreDensity = (1.0 - smoothstep(0.25, 1.0, radial)) * tipMask;
  return vec2f(broadSupport, coreDensity);
}

fn evaluateCirrusBundleField(
  context: CloudGenusDensityContext,
  localUnit: vec3f,
  recipe: FiberRecipe,
) -> vec2f {
  let authoredWidth = recipe.baseWidthMeters / 1100.0;
  let widthScale = clamp(
    authoredWidth * mix(0.55, 0.8, saturate(context.morphology0.y)),
    0.5,
    1.0,
  );
  let verticalScale = clamp(sqrt(1.25 / max(recipe.verticalFrequency, 0.05)), 0.65, 1.5);
  let lengthScale = clamp(sqrt(0.1 / max(recipe.longFrequency, 0.01)), 0.7, 1.35);
  let curlStrength = saturate(recipe.curlStrength);
  var broadSupport = 0.0;
  var coreDensity = 0.0;

  for (var fiberIndex = 0u; fiberIndex < 7u; fiberIndex += 1u) {
    let index = f32(fiberIndex);
    let strandOrder = index / 6.0 * 2.0 - 1.0;
    let seed = context.bodyPhase
      + vec3f(index * 1.731, index * 2.417, index * 3.113);
    let angle = (morphologyHash13(seed + vec3f(4.6, 2.2, 7.5)) - 0.5)
      * 0.14 * curlStrength;
    var fiberPosition = rotateMorphologyXZ(localUnit, angle);
    fiberPosition.x /= lengthScale;
    let fiber = cirrusFiberPrimitive(
      fiberPosition,
      seed,
      strandOrder,
      widthScale,
      verticalScale,
      curlStrength,
    );
    let fiberWeight = select(
      saturate(recipe.branchStrength) * 0.78,
      1.0,
      fiberIndex < 5u,
    );
    broadSupport = max(broadSupport, fiber.x * fiberWeight);
    coreDensity = max(coreDensity, fiber.y * fiberWeight);
  }
  return vec2f(broadSupport, coreDensity);
}

fn sampleCirrusEdgeNoise(
  context: CloudGenusDensityContext,
  localMeters: vec3f,
  lod: MorphologyLod,
) -> f32 {
  // The WaterThreeJS sky reference uses a roughly 0.55:3.2 anisotropy. Here
  // that idea is lifted into 3D: slow variation along wind, rapid variation
  // through and across the finite envelope.
  let edgeScale = vec3f(0.00018, 0.0017, 0.00105) * lod.frequencyScale;
  let edgeLod = volumeFootprintLod(context.stepLen, edgeScale, 64.0, 0.0);
  let edge = textureSampleLevel(hpDetailTex, detailSamp,
    shearNoiseXZ(localMeters, -0.17, 0.23) * edgeScale
      + context.bodyPhase.zxy * vec3f(3.17, 2.29, 4.03),
    edgeLod,
  );
  return mix(edge.r, edge.g, 0.55 * lod.detailWeight);
}

fn evaluateFiberFamily(
  context: CloudGenusDensityContext,
  recipe: FiberRecipe,
  profile: FiberProfile,
) -> DensitySample {
  let densityCoverage = hpLoCoverage(context.weather.r);
  let outsideLayer = altitude(context.worldPos) < context.baseM
    || altitude(context.worldPos) > context.topM;
  if (outsideLayer || context.densityScale <= 1e-5 || densityCoverage < 0.1) {
    return DensitySample(0.0, 0.0, 0.0, 0.0, context.normalizedHeight, 0.0);
  }

  let lod = morphologyLod(context);
  let localUnit = cirrusLocalUnit(context, recipe);
  let bundle = evaluateCirrusBundleField(context, localUnit, recipe);
  let edgeNoise = sampleCirrusEdgeNoise(context, context.bodyLocalMeters, lod);
  let verticalShape = fiberVerticalProfile(context.normalizedHeight, profile);
  let erosionWeight = saturate(
    max(context.morphology1.w, 0.0) * context.detailAmount * lod.detailWeight,
  );
  let featheredNoise = mix(0.38, 1.0, smoothstep(0.22, 0.82, edgeNoise));
  let edgeFactor = mix(0.78, featheredNoise, max(0.45, erosionWeight));
  let support = sanitizeMorphologyDensity(
    densityCoverage * verticalShape * bundle.x * context.densityScale,
  );
  let afterShape = sanitizeMorphologyDensity(verticalShape * bundle.x);
  let density = sanitizeMorphologyDensity(
    support
      * mix(bundle.y, edgeFactor, 0.48)
      * max(recipe.peakDensity, 0.0),
  );
  return DensitySample(
    support,
    afterShape,
    density,
    0.0,
    context.normalizedHeight,
    densityCoverage,
  );
}

fn evaluateCumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CUMULUS);
  return evaluateCumulusFamily(context, compatibility);
}

fn evaluateStratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_STRATUS);
  let recipe = SheetRecipe(1.0, 0.72, 0.22, 0.22, 0.015, 0.0);
  let profile = SheetProfile(0.03, 0.18, 0.58, 0.86);
  return evaluateSheetFamily(context, compatibility, recipe, profile);
}

fn evaluateStratocumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_STRATOCUMULUS);
  let recipe = CellularRecipe(1.0, 1700.0, 0.18, 0.62, 0.5, 0.38, 1.28, 0.15, 0.06);
  let profile = CellularProfile(0.01, 0.08, 0.24, 0.4);
  return evaluateCellularFamily(context, compatibility, recipe, profile);
}

fn evaluateCumulonimbusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CUMULONIMBUS);
  return evaluateCumulonimbusFamily(context, compatibility);
}

fn evaluateAltocumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_ALTOCUMULUS);
  let recipe = CellularRecipe(1.0, 1400.0, 0.34, 1.0, 0.18, 0.12, 1.45, 0.24, 0.08);
  let profile = CellularProfile(0.1, 0.24, 0.65, 0.85);
  return evaluateCellularFamily(context, compatibility, recipe, profile);
}

fn evaluateAltostratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_ALTOSTRATUS);
  let recipe = SheetRecipe(1.0, 0.48, 0.12, 0.1, 0.0, 0.0);
  let profile = SheetProfile(0.14, 0.28, 0.7, 0.88);
  return evaluateSheetFamily(context, compatibility, recipe, profile);
}

fn evaluateNimbostratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_NIMBOSTRATUS);
  let recipe = SheetRecipe(1.0, 1.28, 0.18, 0.5, 0.06, 0.0);
  let profile = SheetProfile(0.02, 0.16, 0.84, 0.98);
  return evaluateSheetFamily(context, compatibility, recipe, profile);
}

fn evaluateCirrusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let recipe = FiberRecipe(1.0, 1100.0, 0.1, 1.25, 0.3, 0.85, 0.55, 0.0, 1.25);
  let profile = FiberProfile(0.44, 0.49, 0.55, 0.62);
  let familyStrength = saturate(recipe.familyStrength * context.morphology1.x);
  if (familyStrength <= 1e-5) {
    return evaluateCompatibilityDensity(context, GENUS_CIRRUS);
  }
  let shaped = evaluateFiberFamily(context, recipe, profile);
  if (familyStrength >= 1.0 - 1e-5) {
    return shaped;
  }
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CIRRUS);
  return blendIndependentMorphology(compatibility, shaped, familyStrength);
}

fn evaluateCirrostratusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CIRROSTRATUS);
  let recipe = SheetRecipe(
    1.0,
    0.28,
    0.08,
    0.04,
    0.0,
    min(saturate(context.morphology1.x), 0.18),
  );
  let profile = SheetProfile(0.4, 0.48, 0.62, 0.7);
  return evaluateSheetFamily(context, compatibility, recipe, profile);
}

fn evaluateCirrocumulusDensity(context: CloudGenusDensityContext) -> DensitySample {
  let compatibility = evaluateCompatibilityDensity(context, GENUS_CIRROCUMULUS);
  // A broader, more strongly warped carrier keeps the small cloudlets legible
  // without exposing a regular 3D lattice in top and oblique validation views.
  let recipe = CellularRecipe(1.0, 1000.0, 0.55, 0.5, 0.1, 0.06, 1.55, 0.15, 0.2);
  let profile = CellularProfile(0.34, 0.44, 0.56, 0.68);
  return evaluateCellularFamily(context, compatibility, recipe, profile);
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

fn evaluateLocalCumulonimbusDensity(
  worldPos: vec3f,
  stepLen: f32,
  simpleMode: bool,
) -> DensitySample {
  if (U.hero0.w < 0.5) {
    return DensitySample(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  }
  let baseM = U.hero1.y;
  let topM = baseM + max(50.0, U.hero1.z);
  let bounds = vec4f(
    U.hero0.xy,
    max(vec2f(U.hero0.z, U.hero1.x), vec2f(1.0)),
  );
  let transform = vec4f(0.0, 0.3, 1.0, 0.0);
  let horizontalMask = layerHorizontalMask(worldPos, bounds, transform);
  if (horizontalMask <= 0.0) {
    return DensitySample(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  }

  let localFrame = deriveCloudBodyLocalFrame(
    8u,
    worldPos,
    baseM,
    topM,
    bounds,
    transform,
  );
  var localWeather = sampleWeather(worldPos);
  // Body coverage scales the canonical weather field instead of replacing it;
  // local-volume therefore retains the same large-scale Cb gaps as volume.
  localWeather.r = saturate(localWeather.r * U.hero2.x);
  let context = CloudGenusDensityContext(
    worldPos,
    8u,
    localFrame.meters,
    localFrame.unit,
    localFrame.normalizedHeight,
    localFrame.phase,
    baseM,
    topM,
    U.hero2.y,
    U.hero2.z,
    0.0,
    localWeather,
    U.heroMorphology0,
    U.heroMorphology1,
    stepLen,
    simpleMode,
  );
  let sample = evaluateCumulonimbusDensity(context);
  return DensitySample(
    sample.support * horizontalMask,
    sample.afterShape * horizontalMask,
    sample.density * horizontalMask,
    sample.typeMix,
    sample.height01,
    sample.densityCoverage * horizontalMask,
  );
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
  // Every family eventually rejects samples outside its authored height band.
  // Cache the shared altitude for static bodies before body-local transforms,
  // weather sampling and genus dispatch. Moving bodies repeat the exact test
  // after transport because their spherical altitude can change slightly.
  let sampleAltitude = altitude(worldPos);
  var bestSupport = 0.0;
  var bestAfter = 0.0;
  var bestDens = 0.0;
  var bestType = w.g;
  var bestH = 0.0;
  var bestDensityCoverage = 0.0;

  let volumeBodyCount = min(U.debugFlags.w, 8u);
  for (var layerIndex = 0u; layerIndex < 8u; layerIndex += 1u) {
    if (layerIndex >= volumeBodyCount) {
      break;
    }
    let layer = B.layers[layerIndex];
    if (layer.w <= 0.5
        || layer.z <= 1e-4
        || layer.y <= layer.x) {
      continue;
    }
    let motion = B.layerMotion[layerIndex];
    let bodyMoves = motion.x != 0.0 || motion.y != 0.0 || motion.z != 0.0;
    if (!bodyMoves && (sampleAltitude < layer.x || sampleAltitude > layer.y)) {
      continue;
    }
    let shapeDetail = B.layerShapeDetails[layerIndex];
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
    if (bodyMoves) {
      let transportedAltitude = altitude(densityPos);
      if (transportedAltitude < layer.x || transportedAltitude > layer.y) {
        continue;
      }
    }
    // Static bodies share the already sampled world-space weather value.
    // Moving/morphing bodies retain their transported weather coordinates.
    var bodyWeather = w;
    if (bodyMoves) {
      let bodyWeatherUv = weatherUv(densityPos);
      if (!isInsideWeatherMap(bodyWeatherUv)) {
        continue;
      }
      bodyWeather = sampleWeather(densityPos);
    }
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

  let localSample = evaluateLocalCumulonimbusDensity(worldPos, stepLen, simpleMode);
  bestDensityCoverage = max(bestDensityCoverage, localSample.densityCoverage);
  bestSupport = max(bestSupport, localSample.support);
  if (localSample.density > bestDens) {
    bestAfter = localSample.afterShape;
    bestDens = localSample.density;
    bestType = localSample.typeMix;
    bestH = localSample.height01;
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
