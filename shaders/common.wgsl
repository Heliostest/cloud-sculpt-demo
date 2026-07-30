// MIT-inspired helpers (cloud sculpt demo). Concepts from three-geospatial / HPVolumeCloud.
struct Uniforms {
  invViewProj: mat4x4<f32>,
  cameraPos: vec3f,
  time: f32,
  sunDir: vec3f,
  coverage: f32,
  weatherMapCenter: vec2f,
  weatherMapWorldSize: f32,
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
  hpCore0: vec4f,
  hpCore1: vec4f,
  hpCoverage0: vec4f,
  hpShapeScale: vec4f,
  hpDetailScale: vec4f,
  hpDetailWeights: vec4f,
  hpDetailMotion: vec4f,
  hpTypeDetail: vec4f,
  hpTypeDensity: vec4f,
  hpCoverTop: vec4f,
  hpSc0: vec4f,
  hpSc1: vec4f,
  hpSc2: vec4f,
  hpDensityPost0: vec4f,
  hpLod0: vec4f,
  hpHigh0: vec4f,
  hpHigh1: vec4f,
  hpHigh2: vec4f,
  hpHigh3: vec4f,
  hpHigh4: vec4f,
  hpHigh5: vec4f,
  hpHigh6: vec4f,
  hpHigh7: vec4f,
  hpLighting0: vec4f,
  hpLighting1: vec4f,
  hpLighting2: vec4f,
  hpHighOptical: vec4f,
  hpPost0: vec4f,
  hpSky0: vec4f,
  hpSky1: vec4f,
  hpShapeWarp0: vec4f,
};

@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var weatherTex: texture_2d<f32>;
@group(0) @binding(2) var weatherSamp: sampler;
@group(0) @binding(3) var shapeTex: texture_3d<f32>;
@group(0) @binding(4) var shapeSamp: sampler;
@group(0) @binding(5) var detailTex: texture_3d<f32>;
@group(0) @binding(6) var detailSamp: sampler;
@group(0) @binding(7) var hpDetailTex: texture_3d<f32>;
@group(0) @binding(8) var cloudLutTex: texture_2d<f32>;
@group(0) @binding(9) var scCellTex: texture_2d<f32>;
@group(0) @binding(10) var highWeatherTex: texture_2d<f32>;
@group(0) @binding(11) var highCellTex: texture_2d<f32>;
@group(0) @binding(12) var highWarpTex: texture_2d<f32>;
@group(0) @binding(13) var highWispTex: texture_2d<f32>;
@group(0) @binding(14) var weatherClampSamp: sampler;

fn saturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn saturate3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.0), vec3f(1.0)); }
fn remapClamped(v: f32, low: f32, high: f32) -> f32 {
  return saturate((v - low) / max(1e-5, high - low));
}
fn densityRemap(d: f32, low: f32) -> f32 {
  return remapClamped(d, low, 1.0);
}
fn hpDensityRemapSafe(d: f32, low: f32) -> f32 {
  if (low >= 1.0) { return 0.0; }
  return saturate((d - low) / (1.0 - low));
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

// 球壳大气：压低视线时远云仍可被命中（平板 slab 会先扎地）
const PLANET_R: f32 = 6360000.0;

fn planetCenter() -> vec3f {
  return vec3f(0.0, -PLANET_R, 0.0);
}

fn altitude(p: vec3f) -> f32 {
  return length(p - planetCenter()) - PLANET_R;
}

fn raySphere(ro: vec3f, rd: vec3f, center: vec3f, radius: f32) -> vec2f {
  let oc = ro - center;
  let b = dot(oc, rd);
  let c = dot(oc, oc) - radius * radius;
  let h = b * b - c;
  if (h < 0.0) {
    return vec2f(1.0, -1.0);
  }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

fn rayCloudShell(ro: vec3f, rd: vec3f, baseAlt: f32, topAlt: f32) -> vec2f {
  let c = planetCenter();
  let bAlt = max(0.0, baseAlt);
  let tAlt = max(bAlt + 50.0, topAlt);
  let r0 = PLANET_R + bAlt;
  let r1 = PLANET_R + tAlt;
  let to = raySphere(ro, rd, c, r1);
  if (to.x > to.y) {
    return vec2f(1.0, -1.0);
  }
  let ti = raySphere(ro, rd, c, r0);
  let h = altitude(ro);
  var t0 = 0.0;
  var t1 = 0.0;
  if (h >= tAlt) {
    if (to.y < 0.0) {
      return vec2f(1.0, -1.0);
    }
    t0 = max(0.0, to.x);
    t1 = to.y;
    if (ti.x <= ti.y && ti.x > t0) {
      t1 = min(t1, ti.x);
    }
  } else if (h <= bAlt) {
    // 在内球内：从内球穿出进入壳层
    if (ti.x > ti.y) {
      return vec2f(1.0, -1.0);
    }
    t0 = max(0.0, ti.y);
    t1 = to.y;
  } else {
    // 壳层内
    t0 = 0.0;
    t1 = to.y;
    if (ti.x <= ti.y && ti.x > 0.0) {
      t1 = min(t1, ti.x);
    }
  }
  if (t1 <= t0) {
    return vec2f(1.0, -1.0);
  }
  return vec2f(t0, t1);
}

fn shapeAlteringSemiCircle(h: f32, bias: f32) -> f32 {
  let x = saturate(h);
  return saturate(1.0 - pow(abs(2.0 * x - 1.0 - bias), 1.35));
}
fn softstep(edge0: f32, edge1: f32, x: f32) -> f32 {
  return smoothstep(edge0, edge1, x);
}
