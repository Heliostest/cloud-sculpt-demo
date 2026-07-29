struct DensitySample {
  support: f32,
  afterShape: f32,
  density: f32,
  typeMix: f32,
  height01: f32,
};

fn sampleWeather(worldPos: vec3f) -> vec4f {
  let uv = worldPos.xz * U.weatherRepeat + U.weatherOffset + U.windOffset;
  return textureSampleLevel(weatherTex, weatherSamp, uv, 0.0);
}

fn coverageSignal(w: vec4f) -> f32 {
  let macroCov = pow(saturate(w.r), U.weatherExponent);
  let meso = saturate(w.g * U.mesoContrast);
  // meso 只做轻破碎，避免斑块被撕成碎末
  return macroCov * mix(1.0, meso, U.mesoStrength * 0.55);
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
  let typeMix = saturate(w.b);
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

fn sampleShape(worldPos: vec3f) -> f32 {
  let p = worldPos * U.shapeRepeat + U.shapeOffset + vec3f(U.windOffset.x, U.time * 0.002, U.windOffset.y) * 0.35;
  let s = textureSampleLevel(shapeTex, shapeSamp, p, 0.0);
  return saturate(s.r * 0.88 + s.g * 0.1 + s.b * 0.02);
}

fn sampleDetail(worldPos: vec3f) -> vec2f {
  let morph = vec3f(U.detailMorph * 0.37, U.detailMorph * 0.21, -U.detailMorph * 0.29);
  let p = worldPos * U.detailRepeat + U.detailOffset + morph;
  let d = textureSampleLevel(detailTex, detailSamp, p, 0.0);
  return vec2f(d.r, d.g);
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
  outSupport: ptr<function, f32>,
  outAfterShape: ptr<function, f32>,
  outDensity: ptr<function, f32>,
  outType: ptr<function, f32>,
  outH: ptr<function, f32>
) {
  let ls = layerSupport(worldPos, baseM, topM, densScale, w);
  let support = ls.x;
  let typeMix = ls.y;
  let h01 = ls.z;

  *outSupport = support;
  *outType = typeMix;
  *outH = h01;
  if (support <= 0.0) {
    *outAfterShape = 0.0;
    *outDensity = 0.0;
    return;
  }

  let shape = sampleShape(worldPos);
  let shapeAmount = U.shapeAmount * shapeAmt * mix(0.85, 0.65, typeMix);
  let d0 = support;
  let d1 = remapClamped(d0, (1.0 - shape) * shapeAmount * 0.7, 1.0);
  *outAfterShape = d1;

  let detailOff = (U.debugFlags.y & 1u) != 0u;
  let detailWave = 1.0 / max(1e-5, U.detailRepeat);
  let detailFade = 1.0 - softstep(0.45 * detailWave, 1.1 * detailWave, stepLen);
  if (detailOff || detailAmt <= 1e-4 || d1 < 0.01 || detailFade <= 0.01) {
    *outDensity = d1;
    return;
  }

  let det = sampleDetail(worldPos);
  let billowy = det.x;
  let wispy = det.y;
  let detailStr = U.detailStrength * detailAmt * mix(0.75, 1.0, typeMix) * detailFade;
  let topW = softstep(0.35, 0.9, h01);
  let edgeMask = 1.0 - softstep(0.12, 0.55, d1);

  let thrB = billowy * detailStr * mix(0.18, 0.4, topW) * mix(0.55, 1.0, edgeMask);
  let thrW = max(0.0, thrB - U.wispyEdgeWidth * 0.75);
  let erodeB = densityRemap(d1, thrB);
  var erodeW = densityRemap(d1, thrW + wispy * detailStr * 0.28 * (1.0 - 0.35 * topW) * edgeMask);
  erodeW *= 1.0 - softstep(0.88, 1.0, h01);

  let coreMix = softstep(0.0, max(U.wispyEdgeWidth, 0.12), erodeB);
  var density = mix(erodeW, erodeB, coreMix);
  density = pow(saturate(density), 0.92);
  *outDensity = min(1.0, density);
}

fn distanceFade(worldPos: vec3f) -> f32 {
  // 相对相机距离淡出，替代世界原点 XZ 硬边
  let maxD = max(5000.0, U.quality.w * 0.92);
  let d = length(worldPos - U.cameraPos);
  return 1.0 - softstep(maxD * 0.82, maxD, d);
}

fn evaluateSculpted(worldPos: vec3f, stepLen: f32) -> DensitySample {
  let edgeFade = distanceFade(worldPos);
  if (edgeFade <= 0.0) {
    return DensitySample(0.0, 0.0, 0.0, 0.0, 0.0);
  }
  let w = sampleWeather(worldPos);
  var bestSupport = 0.0;
  var bestAfter = 0.0;
  var bestDens = 0.0;
  var bestType = w.b;
  var bestH = 0.0;

  if (U.layer0.w > 0.5) {
    var s = 0.0; var a = 0.0; var d = 0.0; var t = 0.0; var h = 0.0;
    evaluateLayer(worldPos, U.layer0.x, U.layer0.y, U.layer0.z, U.layerShapeDetail0.x, U.layerShapeDetail0.y, w, stepLen, &s, &a, &d, &t, &h);
    if (d >= bestDens) {
      bestSupport = s; bestAfter = a; bestDens = d; bestType = t; bestH = h;
    } else if (s > bestSupport) {
      bestSupport = s;
    }
  }
  if (U.layer1.w > 0.5) {
    var s = 0.0; var a = 0.0; var d = 0.0; var t = 0.0; var h = 0.0;
    evaluateLayer(worldPos, U.layer1.x, U.layer1.y, U.layer1.z, U.layerShapeDetail1.x, U.layerShapeDetail1.y, w, stepLen, &s, &a, &d, &t, &h);
    bestSupport = max(bestSupport, s);
    if (d > bestDens) {
      bestAfter = a; bestDens = d; bestType = t; bestH = h;
    }
  }
  if (U.layer2.w > 0.5) {
    var s = 0.0; var a = 0.0; var d = 0.0; var t = 0.0; var h = 0.0;
    evaluateLayer(worldPos, U.layer2.x, U.layer2.y, U.layer2.z, U.layerShapeDetail2.x, U.layerShapeDetail2.y, w, stepLen, &s, &a, &d, &t, &h);
    bestSupport = max(bestSupport, s);
    if (d > bestDens) {
      bestAfter = a; bestDens = d; bestType = t; bestH = h;
    }
  }

  let hs = heroSupport(worldPos);
  if (hs.x > bestSupport) {
    var s = hs.x;
    var typeMix = hs.y;
    var h01 = hs.z;
    let shape = sampleShape(worldPos);
    let d1 = remapClamped(s, (1.0 - shape) * U.shapeAmount * 0.85, 1.0);
    var dens = d1;
    let detailOff = (U.debugFlags.y & 1u) != 0u;
    if (!detailOff && d1 > 0.01) {
      let det = sampleDetail(worldPos);
      let topW = softstep(0.3, 0.88, h01);
      let detailStr = U.detailStrength * mix(0.9, 1.2, typeMix);
      let thrB = (1.0 - saturate(d1)) * 0.35 + det.x * detailStr * mix(0.45, 0.95, topW);
      let thrW = thrB - U.wispyEdgeWidth * 0.85;
      let erodeB = densityRemap(d1, thrB);
      let erodeW = densityRemap(d1, max(thrW, 0.0) + det.y * detailStr * (1.0 - 0.55 * topW) * 0.35);
      dens = mix(erodeW, erodeB, softstep(0.0, max(U.wispyEdgeWidth, 0.08), erodeB));
      dens *= softstep(0.008, 0.05, dens);
    }
    bestSupport = s;
    bestAfter = d1;
    bestDens = dens;
    bestType = typeMix;
    bestH = h01;
  }

  return DensitySample(
    bestSupport * edgeFade,
    bestAfter * edgeFade,
    bestDens * edgeFade,
    bestType,
    bestH
  );
}
