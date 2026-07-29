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
    let s = evaluateSculpted(p, stepLen, false);
    tau += s.density * U.optical.y * stepLen;
    stepLen *= 1.6;
  }
  return exp(-min(tau, 16.0));
}

fn marchCloud(ro: vec3f, rd: vec3f) -> vec4f {
  let topAlt = U.optical.w;
  var baseAlt = topAlt;
  if (U.layer0.w > 0.5) { baseAlt = min(baseAlt, U.layer0.x); }
  if (U.layer1.w > 0.5) { baseAlt = min(baseAlt, U.layer1.x); }
  if (U.layer2.w > 0.5) { baseAlt = min(baseAlt, U.layer2.x); }
  if (U.hero0.w > 0.5) { baseAlt = min(baseAlt, U.hero1.y); }
  if (baseAlt >= topAlt) { baseAlt = 0.0; }

  let shell = rayCloudShell(ro, rd, baseAlt, topAlt);
  if (shell.y < shell.x) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  // 不再用世界 XZ 盒硬裁（会把地平线远云切掉）
  let t0 = max(shell.x, 0.0);
  let t1 = min(shell.y, U.quality.w);
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
  if (debugMode == 5u) {
    let p = ro + rd * ((t0 + t1) * 0.5);
    let s = evaluateSculpted(p, U.quality.x, true);
    return vec4f(vec3f(s.densityCoverage), 0.0);
  }

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
  // 刚离开云面后若干步保持小步长，避免大步跳过后方云体
  var exitHold = 0u;

  for (var i = 0u; i < 768u; i++) {
    if (i >= maxIter || t >= t1 || transmittance < 0.008) { break; }
    let pos = ro + rd * t;
    let probe = evaluateSculpted(pos, minStep, true);
    var stepLen = minStep;
    if (probe.density > 0.008) {
      stepLen = select(minStep * 0.9, minStep * 0.35, probe.density < 0.22);
      exitHold = 6u;
    } else if (exitHold > 0u) {
      stepLen = minStep * 0.75;
      exitHold -= 1u;
    } else {
      // 空域前瞻：若下一步落在云内则收回步长
      let leap = min(mix(minStep, maxStep, 0.4), t1 - t);
      let ahead = evaluateSculpted(pos + rd * leap, leap, true);
      // 只用 density 前瞻，避免 support 壳把空步拉小却积不出可见散射
      if (ahead.density > 0.01) {
        stepLen = minStep * 0.55;
        exitHold = 4u;
      } else {
        stepLen = leap;
      }
    }
    stepLen = min(stepLen, t1 - t);
    let s = evaluateSculpted(pos, stepLen, false);
    dbgSupport = max(dbgSupport, s.support);
    dbgAfter = max(dbgAfter, s.afterShape);
    dbgDens = max(dbgDens, s.density);

    // 过低密度不积分：否则薄 support 边会变成“看不见却挡后景”的黑壳
    if (s.density > 0.012) {
      let dens = s.density;
      let typeW = mix(1.0, 1.08, s.typeMix);
      // 消光≈散射（高反照率），禁止 sigmaT>>sigmaS 造隐形壳体
      let sigmaT = dens * U.optical.y * typeW;
      let sigmaS = sigmaT * saturate(U.optical.x / max(1e-5, U.optical.y));
      let midPos = pos + rd * (stepLen * 0.5);
      var tSun = lightTransmittance(midPos, dens);
      let powder = 1.0 - exp(-dens * 2.0);
      tSun *= mix(1.2, powder, softstep(0.08, 0.4, dens));
      tSun = max(tSun, 0.06);
      let cosTheta = dot(rd, U.sunDir);
      let phase = dualLobeHG(cosTheta);
      let ambient = vec3f(0.58, 0.66, 0.78) * mix(0.9, 1.2, s.height01);
      let sunCol = vec3f(1.05, 0.96, 0.88) * 2.1;
      var multi = 0.22;
      var mAmp = 0.5;
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
  if (U.debugFlags.x >= 1u && U.debugFlags.x <= 5u) {
    color = cloud.rgb;
  }
  color *= U.hero2.z;
  color = color / (color + vec3f(1.0));
  return vec4f(pow(saturate3(color), vec3f(1.0 / 2.2)), 1.0);
}
