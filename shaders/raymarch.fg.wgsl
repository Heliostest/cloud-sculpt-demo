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

// A static integer avalanche hash avoids the diagonal lattice of IGN while
// keeping the first sample stable in this single-frame (non-TAA) renderer.
fn hashU32(value: u32) -> u32 {
  var x = value;
  x = ((x >> 16u) ^ x) * 0x7feb352du;
  x = ((x >> 15u) ^ x) * 0x846ca68bu;
  return (x >> 16u) ^ x;
}

fn screenSpaceJitter(pixelCoord: vec2f) -> f32 {
  let pixel = vec2u(floor(pixelCoord));
  let seed = (pixel.x * 0x1f123bb5u) ^ (pixel.y * 0x5f356495u);
  return f32(hashU32(seed) & 0x00ffffffu) / 16777216.0;
}

fn lowCloudLightOptics(pos: vec3f, dens0: f32) -> vec2f {
  let steps = max(1u, U.debugFlags.z);
  let sun = U.sunDir;
  var t = 0.0;
  var tau = dens0 * U.optical.y * 12.0;
  var stepLen = 55.0;
  for (var i = 0u; i < 8u; i++) {
    if (i >= steps) { break; }
    t += stepLen;
    let p = pos + sun * t;
    let s = evaluateLowCloud(p, stepLen, false);
    tau += s.density * U.optical.y * stepLen;
    stepLen *= 1.6;
  }
  let opticalDepth = min(tau, 16.0);
  return vec2f(exp(-opticalDepth), opticalDepth);
}

fn hpPhaseFunction(cosTheta: f32, eccentricityScale: f32) -> f32 {
  let forward = U.hpLighting0.y * eccentricityScale;
  let backward = -U.hpLighting0.z * eccentricityScale;
  return henyeyGreenstein(cosTheta, forward) + henyeyGreenstein(cosTheta, backward);
}

fn hpMultiScatterSun(cosTheta: f32, opticalDepth: f32) -> f32 {
  var luminance = 0.0;
  var attenuation = 1.0;
  var contribution = 1.0;
  var eccentricityScale = 1.0;
  for (var octave = 0u; octave < 3u; octave++) {
    let lightT = exp(-min(opticalDepth * attenuation, 16.0));
    luminance += lightT * hpPhaseFunction(cosTheta, eccentricityScale) * contribution;
    attenuation *= U.hpLighting1.x;
    contribution *= U.hpLighting1.y;
    eccentricityScale *= U.hpLighting0.w;
  }
  return luminance;
}

fn highLightTransmittance(pos: vec3f, coverBright: f32) -> f32 {
  let shell = rayCloudShell(pos, U.sunDir, U.hpHigh0.y, U.hpHigh0.z);
  if (shell.y <= 0.0) {
    return 1.0;
  }
  let coverDist = min(max(shell.y, 0.0), 3000.0);
  let stepLen = coverDist / 4.0;
  var extinctionSum = 0.0;
  for (var i = 0u; i < 4u; i++) {
    let p = pos + U.sunDir * (stepLen * (f32(i) + 0.5));
    extinctionSum += evaluateHighCloudDensity(p).density * stepLen;
  }
  let coverAbsorption = 1.0 + saturate(coverBright) * U.hpHighOptical.z;
  let tau = extinctionSum * U.hpHighOptical.y * coverAbsorption;
  return exp(-min(tau, 12.0));
}

fn marchHighCloud(ro: vec3f, rd: vec3f, rayJitter: f32) -> vec4f {
  if (U.hpHigh0.x < 0.5) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let shell = rayCloudShell(ro, rd, U.hpHigh0.y, U.hpHigh0.z);
  if (shell.y < shell.x) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let t0 = max(shell.x, 0.0);
  let t1 = min(shell.y, U.quality.w);
  if (t1 <= t0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let debugMode = U.debugFlags.x;
  if (debugMode == 6u) {
    let p = ro + rd * ((t0 + t1) * 0.5);
    let w = sampleHighWeather(p);
    return vec4f(w.r, w.g, w.a, 0.0);
  }

  let stepCount = max(4u, min(256u, u32(U.hpHigh0.w)));
  let stepLen = (t1 - t0) / f32(stepCount);
  var t = t0 + rayJitter * stepLen;
  var transmittance = 1.0;
  var radiance = vec3f(0.0);
  var maxBand = 0.0;
  var maxDensity = 0.0;
  for (var i = 0u; i < 256u; i++) {
    if (i >= stepCount || t >= t1 || transmittance < 0.008) { break; }
    let pos = ro + rd * t;
    let s = evaluateHighCloudDensity(pos);
    maxBand = max(maxBand, s.bandMask);
    maxDensity = max(maxDensity, s.density);
    if (s.density > 0.001) {
      // HP uses a dedicated high-cloud view absorption and weather-A weight;
      // sharing the low-cloud extinction makes long, thin slabs turn opaque.
      let sigmaT = s.density * U.hpHighOptical.x * s.msWeight;
      let sigmaS = sigmaT * saturate(U.optical.x / max(1e-5, U.optical.y));
      let midPos = pos + rd * (stepLen * 0.5);
      let tSun = max(0.12, highLightTransmittance(midPos, s.coverage));
      let phase = dualLobeHG(dot(rd, U.sunDir));
      let ambient = vec3f(0.56, 0.66, 0.82) * mix(0.95, 1.25, s.height01);
      let sunCol = vec3f(1.05, 0.97, 0.9) * 1.8;
      let inScatter = (sunCol * tSun * phase + ambient * 0.55) * sigmaS;
      let absorb = exp(-sigmaT * stepLen);
      radiance += transmittance * inScatter * ((1.0 - absorb) / max(1e-4, sigmaT));
      transmittance *= absorb;
    }
    t += stepLen;
  }
  if (debugMode == 7u) {
    return vec4f(vec3f(maxBand), 0.0);
  }
  if (debugMode == 8u) {
    return vec4f(vec3f(maxDensity), 0.0);
  }
  return vec4f(radiance, transmittance);
}

fn marchLowCloud(ro: vec3f, rd: vec3f, rayJitter: f32) -> vec4f {
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
    // Show the HP low-weather RGB layout directly: coverage / type / Sc.
    return vec4f(w.rgb, 0.0);
  }
  if (debugMode == 5u) {
    let p = ro + rd * ((t0 + t1) * 0.5);
    let s = evaluateLowCloud(p, U.quality.x, true);
    return vec4f(vec3f(s.densityCoverage), 0.0);
  }

  var transmittance = 1.0;
  var radiance = vec3f(0.0);
  var dbgSupport = 0.0;
  var dbgAfter = 0.0;
  var dbgDens = 0.0;
  let minStep = U.quality.x;
  let maxStep = U.quality.y;
  let maxIter = u32(U.quality.z);
  // HP derives its fine step from the complete shell interval: with a 4x
  // iteration budget, even an all-cloud ray can still reach the far exit.
  // The demo previously used an absolute minStep * 0.35 here. A translucent
  // foreground edge could therefore consume every iteration after only a few
  // kilometres; the unvisited remainder was then composited as clear sky,
  // which looked like a transparent proxy shell hiding all clouds behind it.
  let traversalStepFloor = (t1 - t0) / f32(max(maxIter, 1u));
  // Jitter across the actual minimum segment used by this ray. Limiting the
  // old offset to minStep left long horizon rays almost phase-aligned after
  // traversalStepFloor raised their effective step to hundreds of metres.
  let initialJitterSpan = min(max(minStep, traversalStepFloor), t1 - t0);
  var t = t0 + rayJitter * initialJitterSpan;
  // 刚离开云面后若干步保持小步长，避免大步跳过后方云体
  var exitHold = 0u;

  for (var i = 0u; i < 768u; i++) {
    if (i >= maxIter || t >= t1 || transmittance < 0.008) { break; }
    let pos = ro + rd * t;
    let probe = evaluateLowCloud(pos, minStep, true);
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
      let ahead = evaluateLowCloud(pos + rd * leap, leap, true);
      // 只用 density 前瞻，避免 support 壳把空步拉小却积不出可见散射
      if (ahead.density > 0.01) {
        stepLen = minStep * 0.55;
        exitHold = 4u;
      } else {
        stepLen = leap;
      }
    }
    // Do not spend the whole finite iteration budget inside a near translucent
    // edge. This is the demo equivalent of HP's stepSmall = totalDist/maxIter.
    stepLen = max(stepLen, traversalStepFloor);
    stepLen = min(stepLen, t1 - t);
    var s = evaluateLowCloud(pos, stepLen, false);
    // Long, almost horizontal segments are where a single point sample most
    // visibly turns density error into a screen-space pattern. Add a midpoint
    // density sample only near supported cloud, but still advance by stepLen so
    // the finite iteration budget reaches the far shell exit.
    let horizonRefinement = 1.0 - smoothstep(0.04, 0.22, abs(rd.y));
    if (horizonRefinement > 0.01
        && stepLen > minStep * 1.25
        && (probe.support > 0.001 || exitHold > 0u)) {
      let refinementPos = pos + rd * (stepLen * 0.5);
      let refinement = evaluateLowCloud(refinementPos, stepLen * 0.5, false);
      let primaryDensity = s.density;
      let pairDensity = 0.5 * (s.density + refinement.density);
      s.support = max(s.support, refinement.support);
      s.afterShape = max(s.afterShape, refinement.afterShape);
      s.density = mix(s.density, pairDensity, horizonRefinement);
      s.densityCoverage = max(s.densityCoverage, refinement.densityCoverage);
      if (refinement.density > primaryDensity) {
        s.typeMix = mix(s.typeMix, refinement.typeMix, horizonRefinement);
        s.height01 = mix(s.height01, refinement.height01, horizonRefinement);
      }
    }
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
      let light = lowCloudLightOptics(midPos, dens);
      let cosTheta = dot(rd, U.sunDir);
      let sunCol = vec3f(1.05, 0.96, 0.88) * 2.1;
      let absorb = exp(-sigmaT * stepLen);
      if (U.hpLighting0.x > 0.5) {
        // HP/HDRP low-cloud path: three Hillaire octaves use independent
        // attenuation, contribution and eccentricity decay.
        let directional = sunCol * hpMultiScatterSun(cosTheta, light.y);
        let sinElevation = max(U.sunDir.y, 0.05);
        let upwardAO = exp(-light.y * sinElevation * max(U.hpLighting2.x, 0.0));
        let ambientTop = vec3f(0.58, 0.66, 0.78) * U.hpLighting1.z * upwardAO;
        let ambientBottom = vec3f(0.42, 0.47, 0.55) * U.hpLighting1.w * (1.0 - s.height01);
        let scatterOD = sigmaS * stepLen;
        var scatterSource = 1.0 - exp(-scatterOD / max(U.hpLighting2.y, 0.001));
        scatterSource = pow(saturate(scatterSource), max(U.hpLighting2.z, 0.01));
        // Unlike the legacy demo path, HP does not multiply low-cloud
        // directional scattering by powder; this preserves the silver edge.
        // Keep the demo's analytic segment integration so energy stays bounded
        // when its adaptive view steps are much shorter than HP/HDRP steps.
        let segmentScatter = sigmaS * ((1.0 - absorb) / max(1e-4, sigmaT));
        radiance += transmittance * (directional + ambientTop + ambientBottom) * segmentScatter * scatterSource;
      } else {
        var tSun = light.x;
        let powder = 1.0 - exp(-dens * 2.0);
        tSun *= mix(1.2, powder, softstep(0.08, 0.4, dens));
        tSun = max(tSun, 0.06);
        let phase = dualLobeHG(cosTheta);
        let ambient = vec3f(0.58, 0.66, 0.78) * mix(0.9, 1.2, s.height01);
        var multi = 0.22;
        var mAmp = 0.5;
        var mTau = -log(max(1e-4, tSun));
        for (var o: i32 = 0; o < 3; o++) {
          multi += mAmp * exp(-mTau);
          mTau *= 0.45;
          mAmp *= 0.55;
        }
        let inScatter = (sunCol * tSun * phase + ambient * multi) * sigmaS;
        radiance += transmittance * inScatter * ((1.0 - absorb) / max(1e-4, sigmaT));
      }
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

fn acesFitted(color: vec3f) -> vec3f {
  // Compact ACES-style curve for the final HDRP-like display transform.
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return saturate3((color * (a * color + vec3f(b))) / (color * (c * color + vec3f(d)) + vec3f(e)));
}

fn linearToSrgb(color: vec3f) -> vec3f {
  let lo = color * 12.92;
  let hi = 1.055 * pow(max(color, vec3f(0.0)), vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(hi, lo, color <= vec3f(0.0031308));
}

fn hpFinalColor(linearHdr: vec3f) -> vec3f {
  var color = max(linearHdr * U.hpPost0.x, vec3f(0.0));
  let luminance = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = mix(vec3f(luminance), color, max(U.hpPost0.z, 0.0));
  color = max((color - vec3f(0.18)) * U.hpPost0.w + vec3f(0.18), vec3f(0.0));
  if (U.hpPost0.y >= 0.5) {
    color = acesFitted(color);
  } else {
    color = color / (color + vec3f(1.0));
  }
  return linearToSrgb(saturate3(color));
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
  let rayJitter = screenSpaceJitter(inp.pos.xy);

  let bg = sampleBackground(ro, rd);
  let lowCloud = marchLowCloud(ro, rd, rayJitter);
  let highCloud = marchHighCloud(ro, rd, rayJitter);
  var cloud = lowCloud;
  if (U.hpHigh0.x >= 0.5) {
    let highBottomAlt = U.hpHigh0.y + U.hpHigh4.x * (U.hpHigh0.z - U.hpHigh0.y);
    if (altitude(ro) >= highBottomAlt) {
      cloud = vec4f(highCloud.rgb + highCloud.a * lowCloud.rgb, highCloud.a * lowCloud.a);
    } else {
      cloud = vec4f(lowCloud.rgb + lowCloud.a * highCloud.rgb, lowCloud.a * highCloud.a);
    }
  }
  var color = cloud.rgb + bg * cloud.a;
  if (U.debugFlags.x >= 1u && U.debugFlags.x <= 5u) {
    color = lowCloud.rgb;
  } else if (U.debugFlags.x >= 6u && U.debugFlags.x <= 8u) {
    color = highCloud.rgb;
  }
  return vec4f(hpFinalColor(color), 1.0);
}
