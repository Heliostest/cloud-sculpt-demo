fn skyColor(rd: vec3f, sunDir: vec3f) -> vec3f {
  // Linear HDR input, like HDRP's sky before post processing. rd.y=0 must
  // select the horizon anchor; the legacy 0.5 bias washed the gradient out.
  let up = saturate(rd.y);
  let zenith = max(U.hpSky0.rgb, vec3f(0.0));
  let horizon = max(U.hpSky1.rgb, vec3f(0.0));
  var col = mix(horizon, zenith, pow(up, max(U.hpSky0.w, 0.01)));
  let sun = pow(saturate(dot(rd, sunDir)), 1800.0);
  let glow = pow(saturate(dot(rd, sunDir)), 24.0);
  col += vec3f(1.0, 0.92, 0.75) * sun * 4.0;
  col += vec3f(1.0, 0.72, 0.42) * glow * 0.22;
  return col * U.hpSky1.w;
}

fn groundColor(ro: vec3f, rd: vec3f) -> vec3f {
  if (rd.y >= -1e-4) {
    return skyColor(rd, U.sunDir);
  }
  let t = -ro.y / rd.y;
  let p = ro + rd * t;
  let c = i32(floor(p.x * 0.00025) + floor(p.z * 0.00025));
  let checker = select(0.0, 1.0, (c & 1) == 0);
  let base = mix(vec3f(0.22, 0.28, 0.18), vec3f(0.30, 0.34, 0.22), checker);
  let fog = saturate(t / 80000.0);
  return mix(base, skyColor(rd, U.sunDir), fog);
}

fn sampleBackground(ro: vec3f, rd: vec3f) -> vec3f {
  if (rd.y < 0.0) {
    return groundColor(ro, rd);
  }
  return skyColor(rd, U.sunDir);
}
