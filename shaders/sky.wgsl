fn skyColor(rd: vec3f, sunDir: vec3f) -> vec3f {
  let up = saturate(rd.y * 0.5 + 0.5);
  let zenith = vec3f(0.18, 0.38, 0.72);
  let horizon = vec3f(0.62, 0.74, 0.88);
  var col = mix(horizon, zenith, pow(up, 1.25));
  let sun = pow(saturate(dot(rd, sunDir)), 1800.0);
  let glow = pow(saturate(dot(rd, sunDir)), 24.0);
  col += vec3f(1.0, 0.92, 0.75) * sun * 4.0;
  col += vec3f(1.0, 0.7, 0.35) * glow * 0.35;
  return col;
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
