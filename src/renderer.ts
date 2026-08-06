import commonWgsl from '../shaders/common.wgsl?raw';
import densityWgsl from '../shaders/density.wgsl?raw';
import skyWgsl from '../shaders/sky.wgsl?raw';
import raymarchWgsl from '../shaders/raymarch.fg.wgsl?raw';
import {
  generateHighCellRGBA,
  generateHighWarpRGBA,
  generateHighWeatherRGBA,
  generateHighWispRGBA,
  generateScCellRGBA,
  generateWeatherRGBA,
} from './weatherGen';
import { generateCloudLutRGBA } from './cloudLutGen';
import {
  DETAIL_VOLUME_SIZE,
  generateHpDetailRGBA,
  generateShapeRGBA,
  generateVolumeMipChainRGBA,
} from './noiseAtlasGen';
import {
  CLOUD_GENUS_INDEX,
  DEBUG_MODE_INDEX,
  TONE_MAPPER_INDEX,
  cloudGenusTypeMix,
  type DemoParams,
} from './params';

const UNIFORM_SIZE = 880;

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fovY: number;
}

export interface GpuTimingInfo {
  supported: boolean;
  lastGpuMs: number | null;
  averageGpuMs: number | null;
  sampleCount: number;
}

function mulMat4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function lookAt(eye: number[], target: number[], up: number[]): Float32Array {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  const z0 = zx / zl;
  const z1 = zy / zl;
  const z2 = zz / zl;
  let xx = up[1] * z2 - up[2] * z1;
  let xy = up[2] * z0 - up[0] * z2;
  let xz = up[0] * z1 - up[1] * z0;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const y0 = z1 * xz - z2 * xy;
  const y1 = z2 * xx - z0 * xz;
  const y2 = z0 * xy - z1 * xx;
  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = y0;
  m[2] = z0;
  m[3] = 0;
  m[4] = xy;
  m[5] = y1;
  m[6] = z1;
  m[7] = 0;
  m[8] = xz;
  m[9] = y2;
  m[10] = z2;
  m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  m[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  m[15] = 1;
  return m;
}

function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY * 0.5);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
}

function invertMat4(m: Float32Array): Float32Array {
  const out = new Float32Array(16);
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return out;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export async function createRenderer(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) throw new Error('WebGPU not available');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No GPU adapter');
  const timestampSupported = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({
    requiredFeatures: timestampSupported ? ['timestamp-query'] : [],
  });
  const gpuContext = canvas.getContext('webgpu');
  if (!gpuContext) throw new Error('No webgpu context');
  const context = gpuContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const weatherData = generateWeatherRGBA(512);
  const shapeData = generateShapeRGBA(128);
  const hpDetailData = generateHpDetailRGBA();
  const cloudLutData = generateCloudLutRGBA(256, 32);
  const scCellData = generateScCellRGBA(256);
  const highWeatherData = generateHighWeatherRGBA(512);
  const highCellData = generateHighCellRGBA(256);
  const highWarpData = generateHighWarpRGBA(256);
  const highWispData = generateHighWispRGBA(256);
  const shapeMips = generateVolumeMipChainRGBA(shapeData, 128);
  const hpDetailMips = generateVolumeMipChainRGBA(hpDetailData, DETAIL_VOLUME_SIZE);

  const weatherTex = device.createTexture({
    size: [512, 512],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: weatherTex }, weatherData.buffer as ArrayBuffer, { bytesPerRow: 512 * 4 }, [512, 512]);

  const highWeatherTex = device.createTexture({
    size: [512, 512],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: highWeatherTex }, highWeatherData.buffer as ArrayBuffer, { bytesPerRow: 512 * 4 }, [512, 512]);

  const highCellTex = device.createTexture({
    size: [256, 256],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: highCellTex }, highCellData.buffer as ArrayBuffer, { bytesPerRow: 256 * 4 }, [256, 256]);

  const highWarpTex = device.createTexture({
    size: [256, 256],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: highWarpTex }, highWarpData.buffer as ArrayBuffer, { bytesPerRow: 256 * 4 }, [256, 256]);

  const highWispTex = device.createTexture({
    size: [256, 256],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: highWispTex }, highWispData.buffer as ArrayBuffer, { bytesPerRow: 256 * 4 }, [256, 256]);

  const shapeTex = device.createTexture({
    size: [128, 128, 128],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    mipLevelCount: shapeMips.length,
  });
  for (let mip = 0; mip < shapeMips.length; mip++) {
    const level = shapeMips[mip];
    device.queue.writeTexture(
      { texture: shapeTex, mipLevel: mip },
      level.data.buffer as ArrayBuffer,
      { bytesPerRow: level.size * 4, rowsPerImage: level.size },
      [level.size, level.size, level.size],
    );
  }

  const scCellTex = device.createTexture({
    size: [256, 256],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: scCellTex },
    scCellData.buffer as ArrayBuffer,
    { bytesPerRow: 256 * 4 },
    [256, 256],
  );

  const cloudLutTex = device.createTexture({
    size: [256, 32],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: cloudLutTex },
    cloudLutData.buffer as ArrayBuffer,
    { bytesPerRow: 256 * 4 },
    [256, 32],
  );

  const hpDetailTex = device.createTexture({
    size: [DETAIL_VOLUME_SIZE, DETAIL_VOLUME_SIZE, DETAIL_VOLUME_SIZE],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    mipLevelCount: hpDetailMips.length,
  });
  for (let mip = 0; mip < hpDetailMips.length; mip++) {
    const level = hpDetailMips[mip];
    device.queue.writeTexture(
      { texture: hpDetailTex, mipLevel: mip },
      level.data.buffer as ArrayBuffer,
      { bytesPerRow: level.size * 4, rowsPerImage: level.size },
      [level.size, level.size, level.size],
    );
  }

  const weatherSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
  const weatherClampSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const shapeSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
  const detailSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });

  const uniformBuf = device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const timestampQuerySet = timestampSupported ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
  const timestampResolveBuffer = timestampSupported ? device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  }) : null;
  const timestampReadBuffer = timestampSupported ? device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  }) : null;
  let timingPending = false;
  let timingFrame = 0;
  let lastGpuMs: number | null = null;
  const gpuSamples: number[] = [];

  const code = `${commonWgsl}\n${densityWgsl}\n${skyWgsl}\n${raymarchWgsl}`;
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  for (const m of info.messages) {
    console[m.type === 'error' ? 'error' : 'warn'](`[WGSL ${m.type}] ${m.message}`);
  }
  if (info.messages.some((m) => m.type === 'error')) {
    throw new Error('WGSL compile failed');
  }
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: weatherTex.createView() },
      { binding: 2, resource: weatherSamp },
      { binding: 3, resource: shapeTex.createView() },
      { binding: 4, resource: shapeSamp },
      { binding: 6, resource: detailSamp },
      { binding: 7, resource: hpDetailTex.createView() },
      { binding: 8, resource: cloudLutTex.createView() },
      { binding: 9, resource: scCellTex.createView() },
      { binding: 10, resource: highWeatherTex.createView() },
      { binding: 11, resource: highCellTex.createView() },
      { binding: 12, resource: highWarpTex.createView() },
      { binding: 13, resource: highWispTex.createView() },
      { binding: 14, resource: weatherClampSamp },
    ],
  });

  const uniformCPU = new ArrayBuffer(UNIFORM_SIZE);
  const f32 = new Float32Array(uniformCPU);
  const u32 = new Uint32Array(uniformCPU);

  function writeUniforms(
    params: DemoParams,
    camera: CameraState,
    aspect: number,
    time: number,
    windOffset: [number, number],
  ): void {
    const view = lookAt(camera.position, camera.target, [0, 1, 0]);
    const proj = perspective(camera.fovY, aspect, 10, 200000);
    const inv = invertMat4(mulMat4(proj, view));
    f32.set(inv, 0);

    f32[16] = camera.position[0];
    f32[17] = camera.position[1];
    f32[18] = camera.position[2];
    f32[19] = time;

    const az = (params.sunAzimuthDeg * Math.PI) / 180;
    const el = (params.sunElevationDeg * Math.PI) / 180;
    const sunX = Math.cos(el) * Math.sin(az);
    const sunY = Math.sin(el);
    const sunZ = Math.cos(el) * Math.cos(az);
    const sl = Math.hypot(sunX, sunY, sunZ) || 1;
    f32[20] = sunX / sl;
    f32[21] = sunY / sl;
    f32[22] = sunZ / sl;
    f32[23] = 0;

    f32[24] = params.weatherMapCenterX;
    f32[25] = params.weatherMapCenterZ;
    f32[26] = params.weatherMapWorldSizeKm * 1000;
    f32[27] = 0;

    f32[28] = 0;
    f32[29] = 0;
    f32[30] = windOffset[0];
    f32[31] = windOffset[1];

    f32[32] = 0;
    f32[33] = 0;
    f32[34] = 0;
    f32[35] = 0;

    f32[36] = 0;
    f32[37] = params.detailStrength;
    f32[38] = params.detailRepeat;
    f32[39] = params.wispyEdgeWidth;

    f32[40] = 0;
    f32[41] = 0;
    f32[42] = 0;
    f32[43] = 0;

    const L = params.layers;
    // layer0: base, top, densScale, enabled
    f32[44] = L[0].baseKm * 1000;
    f32[45] = L[0].topKm * 1000;
    f32[46] = L[0].densityScale;
    f32[47] = L[0].enabled ? 1 : 0;

    f32[48] = L[1].baseKm * 1000;
    f32[49] = L[1].topKm * 1000;
    f32[50] = L[1].densityScale;
    f32[51] = L[1].enabled ? 1 : 0;

    f32[52] = L[2].baseKm * 1000;
    f32[53] = L[2].topKm * 1000;
    f32[54] = L[2].densityScale;
    f32[55] = L[2].enabled ? 1 : 0;

    f32[56] = CLOUD_GENUS_INDEX[L[0].genus];
    f32[57] = L[0].detailAmount;
    f32[58] = L[0].cumulusDevelopment;
    f32[59] = 0;

    f32[60] = CLOUD_GENUS_INDEX[L[1].genus];
    f32[61] = L[1].detailAmount;
    f32[62] = L[1].cumulusDevelopment;
    f32[63] = 0;

    f32[64] = CLOUD_GENUS_INDEX[L[2].genus];
    f32[65] = L[2].detailAmount;
    f32[66] = L[2].cumulusDevelopment;
    f32[67] = 0;

    const h = params.hero;
    f32[68] = h.cx;
    f32[69] = h.cz;
    f32[70] = h.rx;
    f32[71] = h.enabled ? 1 : 0;

    f32[72] = h.rz;
    f32[73] = h.baseKm * 1000;
    f32[74] = h.thicknessKm * 1000;
    f32[75] = cloudGenusTypeMix(h.genus, h.cumulusDevelopment);

    f32[76] = h.coverage;
    f32[77] = h.densityMul;
    f32[78] = params.exposure;
    f32[79] = 0;

    f32[80] = params.minPrimaryStep;
    f32[81] = params.maxPrimaryStep;
    f32[82] = params.maxIterations;
    f32[83] = params.maxRayDistanceKm * 1000;

    f32[84] = params.scattering;
    f32[85] = params.extinction;
    f32[86] = params.boxHalfKm * 1000;
    let topKm = 0.5;
    for (const layer of L) {
      if (layer.enabled) topKm = Math.max(topKm, layer.topKm);
    }
    if (h.enabled) topKm = Math.max(topKm, h.baseKm + h.thicknessKm);
    f32[87] = topKm * 1000 + 500;

    u32[88] = DEBUG_MODE_INDEX[params.debugMode];
    u32[89] = params.detailOff ? 1 : 0;
    u32[90] = params.lightSteps;
    u32[91] = 0;

    // hpLow0: densityThreshold, wispyReach, edgeSoftness, wispyTopHeight
    f32[92] = params.densityThreshold;
    f32[93] = params.wispyReach;
    f32[94] = params.edgeSoftness;
    f32[95] = params.wispyTopHeight;

    // hpLow1: wispyTopHardness, bottomSmoothHeight, bottomSmoothPow, reserved
    f32[96] = params.wispyTopHardness;
    f32[97] = params.bottomSmoothHeight;
    f32[98] = params.bottomSmoothPow;
    f32[99] = 0;

    // hpCoverage0: Cover intensity/contrast, Height intensity/contrast
    f32[100] = params.loCovCoverIntensity;
    f32[101] = params.loCovCoverContrast;
    f32[102] = params.loCovHeightIntensity;
    f32[103] = params.loCovHeightContrast;

    // hpShapeScale/detailScale: xyz cycles/metre, w horizontal wind multiplier
    f32[104] = params.hpShapeScaleX;
    f32[105] = params.hpShapeScaleY;
    f32[106] = params.hpShapeScaleZ;
    f32[107] = params.hpBaseWindSpeed;
    f32[108] = params.hpDetailScaleX;
    f32[109] = params.hpDetailScaleY;
    f32[110] = params.hpDetailScaleZ;
    f32[111] = params.hpDetailWindSpeed;

    // HP detail weights: BillowyLow/High, WispyLow/High
    f32[112] = params.billowyLowWeight;
    f32[113] = params.billowyHighWeight;
    f32[114] = params.wispyLowWeight;
    f32[115] = params.wispyHighWeight;

    const windAngle = (params.windAngleDeg * Math.PI) / 180;
    f32[116] = params.hpDetailVerticalWindSpeed;
    f32[117] = Math.cos(windAngle) * params.windSpeed;
    f32[118] = Math.sin(windAngle) * params.windSpeed;
    f32[119] = 0;

    // Per-type HP values: Cu, Tcu, Cb
    f32[120] = params.detailStrengthCu;
    f32[121] = params.detailStrengthTcu;
    f32[122] = params.detailStrengthCb;
    f32[123] = 0;
    f32[124] = params.densityMultiplierCu;
    f32[125] = params.densityMultiplierTcu;
    f32[126] = params.densityMultiplierCb;
    f32[127] = params.densityMultiplier;

    // Coverage-driven, bottom-anchored cloud-top stretch
    f32[128] = params.loCoverTopStrength;
    f32[129] = params.loCoverTopMax;
    f32[130] = params.loCoverTopCurvePow;
    f32[131] = 0;

    // Sc: strength, height scale, detail strength, cell pow
    f32[132] = params.scStrength;
    f32[133] = params.scHeightScale;
    f32[134] = params.scDetailStrength;
    f32[135] = params.scCellThickPow;
    // Sc: thickness strength, sample strength, coverage intensity/contrast
    f32[136] = params.scCellThickStrength;
    f32[137] = params.scCellNoiseStrength;
    f32[138] = params.scCoverageIntensity;
    f32[139] = params.scCoverageContrast;
    f32[140] = params.scCellScaleX;
    f32[141] = params.scCellScaleZ;
    f32[142] = params.scMaskOverride;
    f32[143] = 0;

    // Hi-A edge softness and low-cloud coverage darkness modulation
    f32[144] = params.hiAConstant;
    f32[145] = params.hiASoftContrast;
    f32[146] = params.densityModIntensity;
    f32[147] = params.densityModContrast;

    f32[148] = params.noiseMipOffset;
    f32[149] = params.erosionMipOffset;
    f32[150] = params.forceSimpleMode ? 1 : 0;
    f32[151] = params.detailFadeEnabled ? 1 : 0;

    // Independent HP Ac/As high-cloud path. The general demo layer 2 remains separate.
    f32[152] = params.highCloudEnabled ? 1 : 0;
    f32[153] = params.highBaseKm * 1000;
    f32[154] = params.highTopKm * 1000;
    f32[155] = params.highSteps;
    f32[156] = params.highWeatherRepeat;
    f32[157] = params.highCloudTypeOverride;
    f32[158] = params.highDensityMultiplier;
    f32[159] = params.highCellWindSpeed;
    f32[160] = params.highCellScaleX;
    f32[161] = params.highCellScaleZ;
    f32[162] = params.highWarpScaleX;
    f32[163] = params.highWarpScaleZ;
    f32[164] = params.highWarpStrength;
    f32[165] = params.highAcCellStrength;
    f32[166] = params.highAsCellStrength;
    f32[167] = params.highCellPow;
    f32[168] = params.highBandBottom;
    f32[169] = params.highBandTop;
    f32[170] = params.highBottomCoverageScale;
    f32[171] = params.highHeightCurvePow;
    f32[172] = params.highDensityThreshold;
    f32[173] = params.highDensitySoftness;
    f32[174] = params.highCloudSoftness;
    f32[175] = params.hiASoftContrast;
    f32[176] = params.highWispScaleX;
    f32[177] = params.highWispScaleZ;
    f32[178] = params.highWispStrength;
    f32[179] = params.highHorizonStartKm * 1000;
    f32[180] = params.highHorizonEndKm * 1000;
    f32[181] = 0;
    f32[182] = 0;
    f32[183] = 0;

    // HP low-cloud lighting: enabled, forward/backward eccentricity, MS eccentricity.
    f32[184] = params.hpLightingEnabled ? 1 : 0;
    f32[185] = params.forwardEccentricity;
    f32[186] = params.backwardEccentricity;
    f32[187] = params.msEccentricity;
    // Hillaire MS attenuation/contribution and environment top/bottom multipliers.
    f32[188] = params.msAttenuation;
    f32[189] = params.msContribution;
    f32[190] = params.ambientTopMultiplier;
    f32[191] = params.ambientBottomMultiplier;
    // Upward AO and low-density scattering-source response.
    f32[192] = params.aoUpwardScale;
    f32[193] = params.scatterSourceODScale;
    f32[194] = params.scatterSourceCurvePow;
    f32[195] = 0;

    // HP high-cloud optical controls: independent view/light absorption and
    // coverage-driven light-path absorption. Do not reuse low-cloud extinction.
    f32[196] = params.highViewAbsorption;
    f32[197] = params.highLightAbsorption;
    f32[198] = params.highCoverAbsorptionStrength;
    f32[199] = 0;

    // HP/HDRP-style final color pipeline. Exposure applies to the composed
    // linear HDR radiance before grading and tone mapping.
    f32[200] = params.exposure;
    f32[201] = TONE_MAPPER_INDEX[params.toneMapper];
    f32[202] = params.colorSaturation;
    f32[203] = params.colorContrast;
    f32[204] = params.skyZenithR;
    f32[205] = params.skyZenithG;
    f32[206] = params.skyZenithB;
    f32[207] = params.skyHorizonExponent;
    f32[208] = params.skyHorizonR;
    f32[209] = params.skyHorizonG;
    f32[210] = params.skyHorizonB;
    f32[211] = params.skyIntensity;

    // Base-shape de-tiling: Y rotation, inverse low-frequency warp scale,
    // displacement in metres. Kept separate from the HP sampling scale.
    f32[212] = (params.hpShapeRotationDeg * Math.PI) / 180;
    f32[213] = 1 / Math.max(1000, params.hpShapeWarpScaleKm * 1000);
    f32[214] = params.hpShapeWarpStrengthM;
    f32[215] = 0;

    // Far-field secondary base-shape sample: non-integer scale ratio,
    // independent rotation, and maximum blend weight.
    f32[216] = params.hpShapeSecondaryScaleRatio;
    f32[217] = (params.hpShapeSecondaryRotationDeg * Math.PI) / 180;
    f32[218] = params.hpShapeSecondaryWeight;
    f32[219] = 0;

    device.queue.writeBuffer(uniformBuf, 0, uniformCPU);
  }

  function resizeCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function render(
    params: DemoParams,
    camera: CameraState,
    time: number,
    windOffset: [number, number],
  ): void {
    resizeCanvas();
    const aspect = canvas.width / Math.max(1, canvas.height);
    writeUniforms(params, camera, aspect, time, windOffset);
    const encoder = device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();
    const sampleTimestamp = timestampQuerySet !== null
      && timestampResolveBuffer !== null
      && timestampReadBuffer !== null
      && !timingPending
      && timingFrame % 4 === 0;
    timingFrame++;
    const passDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view,
        clearValue: { r: 0.1, g: 0.15, b: 0.25, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    };
    if (sampleTimestamp && timestampQuerySet) {
      passDescriptor.timestampWrites = {
        querySet: timestampQuerySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      };
    }
    const pass = encoder.beginRenderPass(passDescriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    if (sampleTimestamp && timestampQuerySet && timestampResolveBuffer && timestampReadBuffer) {
      encoder.resolveQuerySet(timestampQuerySet, 0, 2, timestampResolveBuffer, 0);
      encoder.copyBufferToBuffer(timestampResolveBuffer, 0, timestampReadBuffer, 0, 16);
    }
    device.queue.submit([encoder.finish()]);
    if (sampleTimestamp && timestampReadBuffer) {
      timingPending = true;
      void timestampReadBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const values = new BigUint64Array(timestampReadBuffer.getMappedRange());
        const elapsed = Number(values[1] - values[0]) / 1_000_000;
        if (Number.isFinite(elapsed) && elapsed >= 0) {
          lastGpuMs = elapsed;
          gpuSamples.push(elapsed);
          if (gpuSamples.length > 16) gpuSamples.shift();
        }
        timestampReadBuffer.unmap();
        timingPending = false;
      }).catch(() => {
        timingPending = false;
      });
    }
  }

  function getGpuTimingInfo(): GpuTimingInfo {
    const averageGpuMs = gpuSamples.length > 0
      ? gpuSamples.reduce((sum, value) => sum + value, 0) / gpuSamples.length
      : null;
    return {
      supported: timestampSupported,
      lastGpuMs,
      averageGpuMs,
      sampleCount: gpuSamples.length,
    };
  }

  return { render, resizeCanvas, device, getGpuTimingInfo };
}
