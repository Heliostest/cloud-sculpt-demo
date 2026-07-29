// MIT-inspired helpers (cloud sculpt demo). Concepts from three-geospatial / HPVolumeCloud.
struct Uniforms {
  invViewProj: mat4x4<f32>,
  cameraPos: vec3f,
  time: f32,
  sunDir: vec3f,
  coverage: f32,
  weatherOffset: vec2f,
  weatherRepeat: f32,
  weatherExponent: f32,
  mesoStrength: f32,
  mesoContrast: f32,
  windOffset: vec2f,
  shapeOffset: vec3f,
  shapeAmount: f32,
  shapeRepeat: f32,
  detailStrength: f32,
  detailRepeat: f32,
  wispyEdgeWidth: f32,
  detailOffset: vec3f,
  detailMorph: f32,
  layer0: vec4f,
  layer1: vec4f,
  layer2: vec4f,
  layerShapeDetail0: vec4f,
  layerShapeDetail1: vec4f,
  layerShapeDetail2: vec4f,
  hero0: vec4f,
  hero1: vec4f,
  hero2: vec4f,
  quality: vec4f,
  optical: vec4f,
  debugFlags: vec4u,
};

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var weatherTex: texture_2d<f32>;
@group(0) @binding(2) var weatherSamp: sampler;
@group(0) @binding(3) var shapeTex: texture_3d<f32>;
@group(0) @binding(4) var shapeSamp: sampler;
@group(0) @binding(5) var detailTex: texture_3d<f32>;
@group(0) @binding(6) var detailSamp: sampler;

fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn saturate3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.0), vec3f(1.0)); }
fn remapClamped(v: f32, low: f32, high: f32) -> f32 {
  return saturate((v - low) / max(1e-5, high - low));
}
fn densityRemap(d: f32, low: f32) -> f32 {
  return remapClamped(d, low, 1.0);
}
fn henyeyGreenstein(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / max(1e-4, 4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}
fn dualLobeHG(cosTheta: f32) -> f32 {
  return mix(henyeyGreenstein(cosTheta, 0.65), henyeyGreenstein(cosTheta, -0.2), 0.35);
}
fn rayAxis(o: f32, d: f32, mn: f32, mx: f32) -> vec2f {
  if (abs(d) < 1e-8) {
    if (o < mn || o > mx) {
      return vec2f(1.0, -1.0);
    }
    return vec2f(-1e20, 1e20);
  }
  let t0 = (mn - o) / d;
  let t1 = (mx - o) / d;
  return vec2f(min(t0, t1), max(t0, t1));
}

fn rayBox(ro: vec3f, rd: vec3f, bmin: vec3f, bmax: vec3f) -> vec2f {
  let tx = rayAxis(ro.x, rd.x, bmin.x, bmax.x);
  let ty = rayAxis(ro.y, rd.y, bmin.y, bmax.y);
  let tz = rayAxis(ro.z, rd.z, bmin.z, bmax.z);
  if (tx.x > tx.y || ty.x > ty.y || tz.x > tz.y) {
    return vec2f(1.0, -1.0);
  }
  let tNear = max(tx.x, max(ty.x, tz.x));
  let tFar = min(tx.y, min(ty.y, tz.y));
  return vec2f(tNear, tFar);
}

fn raySlabY(ro: vec3f, rd: vec3f, y0: f32, y1: f32) -> vec2f {
  return rayAxis(ro.y, rd.y, y0, y1);
}
fn shapeAlteringSemiCircle(h: f32, bias: f32) -> f32 {
  let x = saturate(h);
  return saturate(1.0 - pow(abs(2.0 * x - 1.0 - bias), 1.35));
}
fn softstep(edge0: f32, edge1: f32, x: f32) -> f32 {
  return smoothstep(edge0, edge1, x);
}
