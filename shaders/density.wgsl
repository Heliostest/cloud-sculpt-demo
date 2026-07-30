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

fn emptyHighCloudSample() -> HighCloudSample {
  return HighCloudSample(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
}

fn highWeatherUv(worldPos: vec3f) -> vec2f {
  return worldPos.xz * U.hpHigh1.x;
}

fn sampleHighWeather(worldPos: vec3f) -> vec4f {
  return textureSampleLevel(highWeatherTex, weatherSamp, highWeatherUv(worldPos) + U.windOffset, 0.0);
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
  if (coverage < 0.001) {
    return HighCloudSample(0.0, coverage, saturate(weather.a), weather.g, normalizedHeight, 0.0);
  }
  let typeMix = select(saturate(weather.g), saturate(U.hpHigh1.y), U.hpHigh1.y >= 0.0);
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

fn coverageSignal(w: vec4f) -> f32 {
  let macroCov = pow(saturate(w.r), U.weatherExponent);
  let meso = saturate(w.g * U.mesoContrast);
  // meso 只做轻破碎，避免斑块被撕成碎末
  return macroCov * mix(1.0, meso, U.mesoStrength * 0.55);
}

fn selectedCloudType(w: vec4f) -> f32 {
  return select(saturate(w.b), saturate(U.hpCore1.w), U.hpCore1.w >= 0.0);
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

fn layerSupport(worldPos: vec3f, baseM: f32, topM: f32, densScale: f32, w: vec4f) -> vec4f {
  if (densScale <= 1e-4 || topM <= baseM) {
    return vec4f(0.0);
  }
  let alt = altitude(worldPos);
  let h01 = saturate((alt - baseM) / max(1.0, topM - baseM));
  let hFade = softstep(0.0, 0.1, h01) * (1.0 - softstep(0.86, 1.0, h01));
  if (hFade <= 0.0) {
    return vec4f(0.0);
  }
  let typeMix = selectedCloudType(w);
  let cov = coverageSignal(w) * anvilFootprintBoost(h01, typeMix);
  let heightScale = shapeAlteringSemiCircle(h01, -0.12);
  let factor = 1.0 - U.coverage * heightScale;
  let filterWidth = mix(0.62, 0.38, typeMix);
  let supportWeather = remapClamped(cov, factor, factor + filterWidth);
  let supportWeatherSoft = supportWeather * supportWeather * (3.0 - 2.0 * supportWeather);
  let profile = verticalProfile(h01, typeMix);
  let support = supportWeatherSoft * profile * densScale * hFade;
  return vec4f(support, typeMix, h01, densScale);
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

fn sampleShapeCurrent(worldPos: vec3f) -> f32 {
  let p = worldPos * U.shapeRepeat + U.shapeOffset + vec3f(U.windOffset.x, U.time * 0.002, U.windOffset.y) * 0.35;
  let s = textureSampleLevel(shapeTex, shapeSamp, p, 0.0);
  return saturate(s.r * 0.88 + s.g * 0.1 + s.b * 0.02);
}

fn sampleBaseShape(worldPos: vec3f, typeMix: f32, shapeAmt: f32) -> f32 {
  if (U.debugFlags.w == 0u) {
    let amount = saturate(U.shapeAmount * shapeAmt * mix(0.85, 0.65, typeMix));
    let current = pow(max(1e-4, sampleShapeCurrent(worldPos)), 0.6);
    return mix(1.0, current, amount);
  }
  let windMeters = vec3f(U.hpDetailMotion.y, 0.0, U.hpDetailMotion.z) * U.time * U.hpShapeScale.w;
  // HP's source asset has substantially richer, less obvious repetition than
  // this demo's generated atlas. Rotate the lattice and bend it with a much
  // lower-frequency world-space field before applying the existing shear.
  // Adjacent 3D texture periods therefore no longer repeat at a fixed world
  // displacement while the local noise character and single-sample cost stay.
  let movingPos = worldPos + windMeters;
  let warpedPos = lowFrequencyShapeWarp(movingPos);
  let rotatedPos = rotateNoiseXZ(warpedPos, U.hpShapeWarp0.x);
  let baseNoisePos = shearNoiseXZ(rotatedPos, 0.23, 0.17);
  let p = baseNoisePos * U.hpShapeScale.xyz;
  let r = textureSampleLevel(shapeTex, shapeSamp, p, max(U.hpLod0.x, 0.0)).r;
  return pow(abs(r), 0.6);
}

fn sampleDetailCurrent(worldPos: vec3f) -> vec2f {
  let morph = vec3f(U.detailMorph * 0.37, U.detailMorph * 0.21, -U.detailMorph * 0.29);
  let p = worldPos * U.detailRepeat + U.detailOffset + morph;
  let d = textureSampleLevel(detailTex, detailSamp, p, 0.0);
  return vec2f(d.r, d.g);
}

fn sampleDetailHp(worldPos: vec3f) -> vec2f {
  let horizontalWind = vec3f(U.hpDetailMotion.y, 0.0, U.hpDetailMotion.z) * U.time * U.hpDetailScale.w;
  let verticalWind = vec3f(0.0, U.time * U.hpDetailMotion.x, 0.0);
  let hpPos = vec3f(worldPos.x, -worldPos.y, worldPos.z) + horizontalWind + verticalWind;
  let detailNoisePos = shearNoiseXZ(hpPos, -0.31, 0.27);
  let d = textureSampleLevel(hpDetailTex, detailSamp, detailNoisePos * U.hpDetailScale.xyz, max(U.hpLod0.y, 0.0));
  let billowy = d.b * U.hpDetailWeights.x + d.a * U.hpDetailWeights.y;
  let wispy = d.r * U.hpDetailWeights.z + d.g * U.hpDetailWeights.w;
  return vec2f(billowy, wispy);
}

// 对齐 HP：baseShape → detail erode → ×heightGradient → coverage threshold → billowy/wispy mix
fn cloudFromShapeCurrent(
  baseShape: f32,
  worldPos: vec3f,
  h01: f32,
  typeMix: f32,
  detailAmt: f32,
  stepLen: f32,
  cov: f32,
  heightGradient: f32,
  densScale: f32
) -> f32 {
  let bottomFade = pow(saturate(h01 / 0.14), 1.4);
  var shape = mix(1.0, baseShape, bottomFade);

  let detailOff = (U.debugFlags.y & 1u) != 0u;
  let detailWave = 1.0 / max(1e-5, U.detailRepeat);
  let detailFade = 1.0 - softstep(0.45 * detailWave, 1.1 * detailWave, stepLen);
  var erodedB = shape;
  var erodedW = shape;
  if (!detailOff && detailAmt > 1e-4 && detailFade > 0.01) {
    let topW = softstep(0.32, 0.88, h01);
    let det = sampleDetailCurrent(worldPos);
    let detailStr = U.detailStrength * detailAmt * mix(0.85, 1.2, typeMix)
      * detailFade * bottomFade * mix(1.0, 1.35, topW);
    erodedB = densityRemap(shape, det.x * detailStr);
    erodedW = densityRemap(shape, det.y * detailStr);
  }
  erodedB *= heightGradient;
  erodedW *= heightGradient;

  let edgeSoft = mix(0.18, 0.32, typeMix);
  let thr = 1.0 - saturate(cov);
  let wispyReach = U.wispyEdgeWidth * 0.9;
  var densB = remapClamped(erodedB, thr, thr + edgeSoft);
  var densW = remapClamped(erodedW, thr - wispyReach, thr - wispyReach + edgeSoft);

  let wispyT = saturate((h01 - 0.55) / 0.45);
  densW *= pow(max(1e-4, 1.0 - wispyT), 2.2);

  let coreMix = softstep(0.0, max(U.wispyEdgeWidth, 0.08), densB);
  return min(1.0, mix(densW, densB, coreMix) * densScale);
}

// HP L1 core. Sampling-quality fade remains outside the mathematical core;
// with detailFade=1 this follows EvaluateCloudProperties' erosion topology.
fn cloudFromShapeHpCore(
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
  if (U.hpCore1.y > 0.0) {
    bottomFade = pow(
      saturate(localHeight / U.hpCore1.y),
      max(U.hpCore1.z, 0.01)
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
    let det = sampleDetailHp(worldPos);
    let typeDetailStrength = mix(hpTypeValue(U.hpTypeDetail.xyz, typeMix), U.hpSc0.z, scStrength);
    let detailStr = U.detailStrength * typeDetailStrength * detailAmt * detailFade * bottomFade;
    erodedB = hpDensityRemapSafe(shape, det.x * detailStr);
    erodedW = hpDensityRemapSafe(shape, det.y * detailStr);
  }
  erodedB *= heightGradient;
  erodedW *= heightGradient;

  let threshold = (1.0 - saturate(densityCoverage)) + U.hpCore0.x;
  let hiAInverseWeight = 1.0 - pow(saturate(U.hpDensityPost0.x), max(U.hpDensityPost0.y, 0.01));
  let edgeSoftness = max(U.hpCore0.z * hiAInverseWeight, 0.001);
  let wispyThreshold = threshold - U.hpCore0.y;
  let densB = remapClamped(erodedB, threshold, threshold + edgeSoftness);
  var densW = remapClamped(erodedW, wispyThreshold, wispyThreshold + edgeSoftness);

  let wispyT = saturate((normalizedHeight - U.hpCore0.w) / max(1.0 - U.hpCore0.w, 0.001));
  densW *= pow(max(0.0, 1.0 - wispyT), max(U.hpCore1.x * 10.0, 0.01));

  let coreMix = smoothstep(0.0, max(U.wispyEdgeWidth, 0.001), densB);
  return mix(densW, densB, coreMix) * densScale;
}

fn cloudFromShape(
  baseShape: f32,
  worldPos: vec3f,
  h01: f32,
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
  if (U.debugFlags.w == 0u) {
    return cloudFromShapeCurrent(baseShape, worldPos, h01, typeMix, detailAmt, stepLen, densityCoverage, heightGradient, densScale);
  }
  return cloudFromShapeHpCore(baseShape, worldPos, h01, localHeight, typeMix, scStrength, simpleMode, detailAmt, stepLen, densityCoverage, heightGradient, densScale);
}

fn evaluateLayer(
  worldPos: vec3f,
  baseM: f32,
  topM: f32,
  densScale: f32,
  shapeAmt: f32,
  detailAmt: f32,
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
  let hFade = softstep(0.0, 0.1, h01) * (1.0 - softstep(0.86, 1.0, h01));
  let typeMix = selectedCloudType(w);
  *outType = typeMix;
  *outH = h01;
  if (alt < baseM || alt > topM || (U.debugFlags.w == 0u && hFade <= 0.0)) {
    *outSupport = 0.0; *outAfterShape = 0.0; *outDensity = 0.0; *outDensityCoverage = 0.0;
    return;
  }

  let covRaw = coverageSignal(w) * anvilFootprintBoost(h01, typeMix);
  let heightScale = shapeAlteringSemiCircle(h01, -0.12);
  let factor = 1.0 - U.coverage * heightScale;
  let filterWidth = mix(0.62, 0.38, typeMix);
  var supportCoverage = remapClamped(covRaw, factor, factor + filterWidth);
  supportCoverage = supportCoverage * supportCoverage * (3.0 - 2.0 * supportCoverage);
  var densityCoverage = supportCoverage;
  var scStrength = 0.0;
  var scCell = 1.0;
  if (U.debugFlags.w == 2u) {
    densityCoverage = hpLoCoverage(w.r);
    scStrength = saturate(U.hpSc0.x * w.a);
    if (scStrength > 0.0) {
      scCell = saturate(textureSampleLevel(scCellTex, weatherSamp, weatherUv(worldPos) * U.hpSc2.xy, 0.0).r * U.hpSc1.y);
      let scCoverage = saturate(pow(saturate(w.r), max(U.hpSc1.w, 0.001)) * U.hpSc1.z);
      densityCoverage = mix(densityCoverage, scCoverage * scCell, scStrength);
    }
  }
  *outDensityCoverage = densityCoverage;
  var localHeight = h01;
  var profile = verticalProfile(h01, typeMix) * hFade;
  if (U.debugFlags.w != 0u) {
    let heightCoverage = hpLoHeightCoverage(w.r);
    let coverForTop = pow(saturate(heightCoverage), max(U.hpCoverTop.z, 0.01));
    let topScale = mix(1.0, max(U.hpCoverTop.y, 1.0), coverForTop * U.hpCoverTop.x);
    let heightForLut = h01 / (1.0 + (topScale - 1.0) * h01);
    let scCompressedHeight = saturate(h01 / max(U.hpSc0.y, 0.01));
    localHeight = mix(heightForLut, scCompressedHeight, scStrength);
    let profiles = hpProfiles(localHeight, weatherUv(worldPos));
    profile = mix(hpTypeValue(profiles, typeMix), profiles.r, scStrength);
  }
  let modelSupportCoverage = select(supportCoverage, densityCoverage, U.debugFlags.w == 2u);
  let support = modelSupportCoverage * profile * densScale;
  *outSupport = support;
  let coverageGate = select(0.001, 0.1, U.debugFlags.w == 2u);
  if (densityCoverage < coverageGate || profile <= 0.0) {
    *outAfterShape = 0.0;
    *outDensity = 0.0;
    return;
  }

  // HP: baseShape = pow(noise, 0.6)，与 coverage 解耦
  let baseShape = sampleBaseShape(worldPos, typeMix, shapeAmt);
  *outAfterShape = baseShape * profile;
  var density = cloudFromShape(baseShape, worldPos, h01, localHeight, typeMix, scStrength, simpleMode, detailAmt, stepLen, densityCoverage, profile, densScale);
  if (U.debugFlags.w != 0u) {
    density *= hpTypeValue(U.hpTypeDensity.xyz, typeMix) * U.hpTypeDensity.w;
    if (scStrength > 0.0) {
      let scCellShaped = pow(max(scCell, 0.001), max(U.hpSc0.w, 0.01));
      let scCellFactor = mix(1.0, scCellShaped, U.hpSc1.x);
      density *= mix(1.0, scCellFactor, scStrength);
    }
    if (U.hpDensityPost0.z > 0.0) {
      density *= hpDensityDarkScale(densityCoverage);
    }
  }
  *outDensity = density;
}

fn distanceFade(worldPos: vec3f) -> f32 {
  // 相对相机距离淡出，替代世界原点 XZ 硬边
  let maxD = max(5000.0, U.quality.w * 0.92);
  let d = length(worldPos - U.cameraPos);
  return 1.0 - softstep(maxD * 0.82, maxD, d);
}

fn evaluateSculpted(worldPos: vec3f, stepLen: f32, simpleMode: bool) -> DensitySample {
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
  var bestType = w.b;
  var bestH = 0.0;
  var bestDensityCoverage = 0.0;

  if (U.layer0.w > 0.5) {
    var s = 0.0; var a = 0.0; var d = 0.0; var t = 0.0; var h = 0.0; var c = 0.0;
    evaluateLayer(worldPos, U.layer0.x, U.layer0.y, U.layer0.z, U.layerShapeDetail0.x, U.layerShapeDetail0.y, w, stepLen, simpleMode, &s, &a, &d, &t, &h, &c);
    bestDensityCoverage = max(bestDensityCoverage, c);
    if (d >= bestDens) {
      bestSupport = s; bestAfter = a; bestDens = d; bestType = t; bestH = h;
    } else if (s > bestSupport) {
      bestSupport = s;
    }
  }
  if (U.layer1.w > 0.5) {
    var s = 0.0; var a = 0.0; var d = 0.0; var t = 0.0; var h = 0.0; var c = 0.0;
    evaluateLayer(worldPos, U.layer1.x, U.layer1.y, U.layer1.z, U.layerShapeDetail1.x, U.layerShapeDetail1.y, w, stepLen, simpleMode, &s, &a, &d, &t, &h, &c);
    bestDensityCoverage = max(bestDensityCoverage, c);
    bestSupport = max(bestSupport, s);
    if (d > bestDens) {
      bestAfter = a; bestDens = d; bestType = t; bestH = h;
    }
  }
  if (U.layer2.w > 0.5) {
    var s = 0.0; var a = 0.0; var d = 0.0; var t = 0.0; var h = 0.0; var c = 0.0;
    evaluateLayer(worldPos, U.layer2.x, U.layer2.y, U.layer2.z, U.layerShapeDetail2.x, U.layerShapeDetail2.y, w, stepLen, simpleMode, &s, &a, &d, &t, &h, &c);
    bestDensityCoverage = max(bestDensityCoverage, c);
    bestSupport = max(bestSupport, s);
    if (d > bestDens) {
      bestAfter = a; bestDens = d; bestType = t; bestH = h;
    }
  }

  let hs = heroSupport(worldPos);
  if (hs.x > bestSupport) {
    let typeMix = hs.y;
    let h01 = hs.z;
    var profile = verticalProfile(h01, typeMix);
    if (U.debugFlags.w != 0u) {
      profile = hpProfile(h01, typeMix, lowWeatherUv);
    }
    let baseShape = sampleBaseShape(worldPos, typeMix, 1.0);
    bestSupport = hs.x;
    bestAfter = baseShape * profile;
    bestDens = cloudFromShape(baseShape, worldPos, h01, h01, typeMix, 0.0, simpleMode, 1.0, stepLen, U.hero2.x, profile, U.hero2.y);
    if (U.debugFlags.w != 0u) {
      bestDens *= hpTypeValue(U.hpTypeDensity.xyz, typeMix) * U.hpTypeDensity.w;
      if (U.hpDensityPost0.z > 0.0) {
        bestDens *= hpDensityDarkScale(U.hero2.x);
      }
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
