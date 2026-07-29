import commonWgsl from '../shaders/common.wgsl?raw';
import densityWgsl from '../shaders/density.wgsl?raw';
import skyWgsl from '../shaders/sky.wgsl?raw';
import raymarchWgsl from '../shaders/raymarch.fg.wgsl?raw';
import { generateWeatherRGBA } from './weatherGen';
import { generateDetailRGBA, generateShapeRGBA } from './noiseAtlasGen';
import { DEBUG_MODE_INDEX, type DemoParams } from './params';

const UNIFORM_SIZE = 368;

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fovY: number;
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
  const device = await adapter.requestDevice();
  const gpuContext = canvas.getContext('webgpu');
  if (!gpuContext) throw new Error('No webgpu context');
  const context = gpuContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const weatherData = generateWeatherRGBA(512);
  const shapeData = generateShapeRGBA(128);
  const detailData = generateDetailRGBA(32);

  const weatherTex = device.createTexture({
    size: [512, 512],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: weatherTex }, weatherData.buffer as ArrayBuffer, { bytesPerRow: 512 * 4 }, [512, 512]);

  const shapeTex = device.createTexture({
    size: [128, 128, 128],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: shapeTex },
    shapeData.buffer as ArrayBuffer,
    { bytesPerRow: 128 * 4, rowsPerImage: 128 },
    [128, 128, 128],
  );

  const detailTex = device.createTexture({
    size: [32, 32, 32],
    dimension: '3d',
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: detailTex },
    detailData.buffer as ArrayBuffer,
    { bytesPerRow: 32 * 4, rowsPerImage: 32 },
    [32, 32, 32],
  );

  const weatherSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
  const shapeSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
  const detailSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });

  const uniformBuf = device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

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
      { binding: 5, resource: detailTex.createView() },
      { binding: 6, resource: detailSamp },
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
    weatherOffset: [number, number],
    windOffset: [number, number],
    shapeOffset: [number, number, number],
    detailOffset: [number, number, number],
    detailMorph: number,
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
    f32[23] = params.coverage;

    f32[24] = weatherOffset[0];
    f32[25] = weatherOffset[1];
    f32[26] = params.weatherRepeat;
    f32[27] = params.weatherExponent;

    f32[28] = params.mesoStrength;
    f32[29] = params.mesoContrast;
    f32[30] = windOffset[0];
    f32[31] = windOffset[1];

    f32[32] = shapeOffset[0];
    f32[33] = shapeOffset[1];
    f32[34] = shapeOffset[2];
    f32[35] = params.shapeAmount;

    f32[36] = params.shapeRepeat;
    f32[37] = params.detailStrength;
    f32[38] = params.detailRepeat;
    f32[39] = params.wispyEdgeWidth;

    f32[40] = detailOffset[0];
    f32[41] = detailOffset[1];
    f32[42] = detailOffset[2];
    f32[43] = detailMorph;

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

    f32[56] = L[0].shapeAmount;
    f32[57] = L[0].detailAmount;
    f32[58] = 0;
    f32[59] = 0;

    f32[60] = L[1].shapeAmount;
    f32[61] = L[1].detailAmount;
    f32[62] = 0;
    f32[63] = 0;

    f32[64] = L[2].shapeAmount;
    f32[65] = L[2].detailAmount;
    f32[66] = 0;
    f32[67] = 0;

    const h = params.hero;
    f32[68] = h.cx;
    f32[69] = h.cz;
    f32[70] = h.rx;
    f32[71] = h.enabled ? 1 : 0;

    f32[72] = h.rz;
    f32[73] = h.baseKm * 1000;
    f32[74] = h.thicknessKm * 1000;
    f32[75] = h.typeCb;

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
    weatherOffset: [number, number],
    windOffset: [number, number],
    shapeOffset: [number, number, number],
    detailOffset: [number, number, number],
    detailMorph: number,
  ): void {
    resizeCanvas();
    const aspect = canvas.width / Math.max(1, canvas.height);
    writeUniforms(params, camera, aspect, time, weatherOffset, windOffset, shapeOffset, detailOffset, detailMorph);
    const encoder = device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: { r: 0.1, g: 0.15, b: 0.25, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { render, resizeCanvas, device };
}
