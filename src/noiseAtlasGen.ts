function hash3(x: number, y: number, z: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n >>> 0) / 4294967295;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise3(x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const fz = fade(z - z0);
  const n000 = hash3(x0, y0, z0);
  const n100 = hash3(x0 + 1, y0, z0);
  const n010 = hash3(x0, y0 + 1, z0);
  const n110 = hash3(x0 + 1, y0 + 1, z0);
  const n001 = hash3(x0, y0, z0 + 1);
  const n101 = hash3(x0 + 1, y0, z0 + 1);
  const n011 = hash3(x0, y0 + 1, z0 + 1);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1);
  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);
  return lerp(lerp(nx00, nx10, fy), lerp(nx01, nx11, fy), fz);
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.01;
  }
  return sum / norm;
}

function worley3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let minD = 1e9;
  for (let oz = -1; oz <= 1; oz++) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox;
        const cy = yi + oy;
        const cz = zi + oz;
        const px = cx + hash3(cx, cy, cz);
        const py = cy + hash3(cx + 3, cy + 7, cz + 11);
        const pz = cz + hash3(cx + 13, cy + 17, cz + 19);
        const dx = px - x;
        const dy = py - y;
        const dz = pz - z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < minD) minD = d;
      }
    }
  }
  return Math.min(1, Math.sqrt(minD));
}

function remap(v: number, low: number, high: number): number {
  return Math.min(1, Math.max(0, (v - low) / Math.max(1e-5, high - low)));
}

export function generateShapeRGBA(size = 128): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const w = z / size;
        const perlin = fbm3(u * 4, v * 4, w * 4, 4);
        const worleyLow = 1 - worley3(u * 4, v * 4, w * 4);
        const worleyMid = 1 - worley3(u * 8, v * 8, w * 8);
        const worleyHigh = 1 - worley3(u * 16, v * 16, w * 16);
        const shape = remap(perlin, 1 - worleyLow, 1);
        const i = (z * size * size + y * size + x) * 4;
        data[i] = Math.round(shape * 255);
        data[i + 1] = Math.round(worleyLow * 255);
        data[i + 2] = Math.round(worleyMid * 255);
        data[i + 3] = Math.round(worleyHigh * 255);
      }
    }
  }
  return data;
}

export function generateDetailRGBA(size = 32): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const w = z / size;
        const billowy = 1 - worley3(u * 3, v * 3, w * 3);
        const wispy = 1 - worley3(u * 6 + 2.7, v * 6 - 1.3, w * 6 + 0.9);
        const fine = 1 - worley3(u * 12, v * 12, w * 12);
        const i = (z * size * size + y * size + x) * 4;
        data[i] = Math.round(billowy * 255);
        data[i + 1] = Math.round(wispy * 255);
        data[i + 2] = Math.round(fine * 255);
        data[i + 3] = 255;
      }
    }
  }
  return data;
}
