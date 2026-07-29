function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

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

function valueNoise3Tile(x: number, y: number, z: number, period: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const fz = fade(z - z0);
  const xa = wrap(x0, period);
  const xb = wrap(x0 + 1, period);
  const ya = wrap(y0, period);
  const yb = wrap(y0 + 1, period);
  const za = wrap(z0, period);
  const zb = wrap(z0 + 1, period);
  const n000 = hash3(xa, ya, za);
  const n100 = hash3(xb, ya, za);
  const n010 = hash3(xa, yb, za);
  const n110 = hash3(xb, yb, za);
  const n001 = hash3(xa, ya, zb);
  const n101 = hash3(xb, ya, zb);
  const n011 = hash3(xa, yb, zb);
  const n111 = hash3(xb, yb, zb);
  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);
  return lerp(lerp(nx00, nx10, fy), lerp(nx01, nx11, fy), fz);
}

function fbm3Tile(x: number, y: number, z: number, period: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3Tile(x * freq, y * freq, z * freq, p) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
    p *= 2;
  }
  return sum / norm;
}

function worley3Tile(x: number, y: number, z: number, period: number): number {
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
        const hx = wrap(cx, period);
        const hy = wrap(cy, period);
        const hz = wrap(cz, period);
        const px = cx + hash3(hx, hy, hz);
        const py = cy + hash3(hx + 3, hy + 7, hz + 11);
        const pz = cz + hash3(hx + 13, hy + 17, hz + 19);
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
  const p4 = 4;
  const p8 = 8;
  const p16 = 16;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * p4;
        const v = (y / size) * p4;
        const w = (z / size) * p4;
        const perlin = fbm3Tile(u, v, w, p4, 4);
        const worleyLow = 1 - worley3Tile(u, v, w, p4);
        const worleyMid = 1 - worley3Tile((x / size) * p8, (y / size) * p8, (z / size) * p8, p8);
        const worleyHigh = 1 - worley3Tile((x / size) * p16, (y / size) * p16, (z / size) * p16, p16);
        const shape = remap(perlin * 0.82 + worleyLow * 0.18, 0.08, 0.9);
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
  const p3 = 3;
  const p6 = 6;
  const p12 = 12;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const billowy = 1 - worley3Tile((x / size) * p3, (y / size) * p3, (z / size) * p3, p3);
        const wispy = 1 - worley3Tile((x / size) * p6 + 0.37, (y / size) * p6 + 0.11, (z / size) * p6 + 0.29, p6);
        const fine = 1 - worley3Tile((x / size) * p12, (y / size) * p12, (z / size) * p12, p12);
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

// HP-compatible channel roles. The generated Worley fields approximate the
// required frequency bands; they are not claimed to reproduce HP source assets.
export function generateHpDetailRGBA(size = 32): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const lowP = 3;
  const highP = 12;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const nz = z / size;
        const wispyLow = 1 - worley3Tile(nx * lowP + 0.37, ny * lowP + 0.11, nz * lowP + 0.29, lowP);
        const wispyHigh = 1 - worley3Tile(nx * highP + 0.17, ny * highP + 0.43, nz * highP + 0.31, highP);
        const billowyLow = 1 - worley3Tile(nx * lowP, ny * lowP, nz * lowP, lowP);
        const billowyHigh = 1 - worley3Tile(nx * highP + 0.53, ny * highP + 0.23, nz * highP + 0.07, highP);
        const i = (z * size * size + y * size + x) * 4;
        data[i] = Math.round(wispyLow * 255);
        data[i + 1] = Math.round(wispyHigh * 255);
        data[i + 2] = Math.round(billowyLow * 255);
        data[i + 3] = Math.round(billowyHigh * 255);
      }
    }
  }
  return data;
}

export interface VolumeMipLevel {
  size: number;
  data: Uint8Array;
}

export function generateVolumeMipChainRGBA(base: Uint8Array, baseSize: number): VolumeMipLevel[] {
  const levels: VolumeMipLevel[] = [{ size: baseSize, data: base }];
  let previous = base;
  let previousSize = baseSize;
  while (previousSize > 1) {
    const size = Math.max(1, previousSize >> 1);
    const data = new Uint8Array(size * size * size * 4);
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dst = (z * size * size + y * size + x) * 4;
          for (let channel = 0; channel < 4; channel++) {
            let sum = 0;
            for (let oz = 0; oz < 2; oz++) {
              for (let oy = 0; oy < 2; oy++) {
                for (let ox = 0; ox < 2; ox++) {
                  const sx = Math.min(previousSize - 1, x * 2 + ox);
                  const sy = Math.min(previousSize - 1, y * 2 + oy);
                  const sz = Math.min(previousSize - 1, z * 2 + oz);
                  sum += previous[(sz * previousSize * previousSize + sy * previousSize + sx) * 4 + channel];
                }
              }
            }
            data[dst + channel] = Math.round(sum / 8);
          }
        }
      }
    }
    levels.push({ size, data });
    previous = data;
    previousSize = size;
  }
  return levels;
}
