struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var o: VSOut;
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  o.uv = vec2f(x, y);
  o.pos = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  return o;
}

fn lightTransmittance(pos: vec3f, dens0: f32) -> f32 {
  let steps = max(1u, U.debugFlags.z);
  let sun = U.sunDir;
  var t = 0.0;
  var tau = dens0 * U.optical.y * 12.0;
  var stepLen = 55.0;
  for (var i = 0u; i < 8u; i++) {
    if (i >= steps) { break; }
    t += stepLen;
    let p = pos + sun * t;
    let s = evaluateSculpted(p, stepLen);
    tau += s.density * U.optical.y * stepLen;
    stepLen *= 1.6;
  }
  return exp(-min(tau, 16.0));
}

fn marchCloud(ro: vec3f, rd: vec3f) -> vec4f {
  let halfM = U.optical.z;
  let topM = U.optical.w;
  let boxMin = vec3f(-halfM, 0.0, -halfM);
  let boxMax = vec3f(halfM, topM, halfM);
  let hit = rayBox(ro, rd, boxMin, boxMax);
  if (hit.y < 0.0 || hit.x > hit.y) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let t0 = max(hit.x, 0.0);
  let t1 = min(hit.y, U.quality.w);
  if (t1 <= t0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  let debugMode = U.debugFlags.x;
  if (debugMode == 4u) {
    let p = ro + rd * ((t0 + t1) * 0.5);
    let w = sampleWeather(p);
    let cov = coverageSignal(w);
    return vec4f(cov, w.g, w.b, 0.0);
  }

  // 射线起点抖动，减轻等密度面同心细线
  let jitter = fract(sin(dot(ro + rd * t0, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
  var t = t0 + jitter * min(U.quality.x, 40.0);
  var transmittance = 1.0;
  var radiance = vec3f(0.0);
  var dbgSupport = 0.0;
  var dbgAfter = 0.0;
  var dbgDens = 0.0;
  let minStep = U.quality.x;
  let maxStep = U.quality.y;
  let maxIter = u32(U.quality.z);

  for (var i = 0u; i < 512u; i++) {
    if (i >= maxIter || t >= t1 || transmittance < 0.01) { break; }
    let pos = ro + rd * t;
    var stepLen = maxStep;
    let probe = evaluateSculpted(pos, stepLen);
    if (probe.support > 0.001 || probe.density > 0.001) {
      stepLen = select(minStep, minStep * 0.4, probe.density < 0.18);
    } else {
      stepLen = mix(minStep, maxStep, 0.7);
    }
    stepLen = min(stepLen, t1 - t);
    let s = evaluateSculpted(pos, stepLen);
    dbgSupport = max(dbgSupport, s.support);
    dbgAfter = max(dbgAfter, s.afterShape);
    dbgDens = max(dbgDens, s.density);

    // 薄边：散射保留、消光压低 → 羽化而不画硬轮廓线
    if (s.density > 0.002) {
      let dens = s.density;
      let typeW = mix(1.0, 1.12, s.typeMix);
      let sigmaS = dens * U.optical.x * typeW;
      let sigmaT = dens * U.optical.y * typeW;
      var tSun = lightTransmittance(pos, dens);
      let powder = 1.0 - exp(-dens * 3.0);
      tSun *= mix(1.25, powder, softstep(0.04, 0.3, dens));
      tSun = max(tSun, 0.15);
      let cosTheta = dot(rd, U.sunDir);
      let phase = dualLobeHG(cosTheta);
      let ambient = vec3f(0.6, 0.68, 0.8) * mix(0.95, 1.25, s.height01);
      let sunCol = vec3f(1.05, 0.96, 0.88) * 2.2;
      var multi = 0.28;
      var mAmp = 0.55;
      var mTau = -log(max(1e-4, tSun));
      for (var o: i32 = 0; o < 3; o++) {
        multi += mAmp * exp(-mTau);
        mTau *= 0.45;
        mAmp *= 0.55;
      }
      let inScatter = (sunCol * tSun * phase + ambient * multi) * sigmaS;
      let absorb = exp(-sigmaT * stepLen);
      radiance += transmittance * inScatter * ((1.0 - absorb) / max(1e-4, sigmaT));
      transmittance *= absorb;
    }
    t += stepLen;
  }

  if (debugMode == 1u) {
    return vec4f(vec3f(dbgSupport * 1.4), 0.0);
  }
  if (debugMode == 2u) {
    return vec4f(vec3f(dbgAfter * 1.4), 0.0);
  }
  if (debugMode == 3u) {
    return vec4f(vec3f(dbgDens * 1.6), 0.0);
  }
  return vec4f(radiance, transmittance);
}

@fragment
fn fs(inp: VSOut) -> @location(0) vec4f {
  let ndc = vec2f(inp.uv.x * 2.0 - 1.0, 1.0 - inp.uv.y * 2.0);
  let far = U.invViewProj * vec4f(ndc, 1.0, 1.0);
  let near = U.invViewProj * vec4f(ndc, 0.0, 1.0);
  let farW = far.xyz / far.w;
  let nearW = near.xyz / near.w;
  let rd = normalize(farW - nearW);
  let ro = U.cameraPos;

  let bg = sampleBackground(ro, rd);
  let cloud = marchCloud(ro, rd);
  var color = cloud.rgb + bg * cloud.a;
  if (U.debugFlags.x >= 1u && U.debugFlags.x <= 4u) {
    color = cloud.rgb;
  }
  color *= U.hero2.z;
  color = color / (color + vec3f(1.0));
  return vec4f(pow(saturate3(color), vec3f(1.0 / 2.2)), 1.0);
}
