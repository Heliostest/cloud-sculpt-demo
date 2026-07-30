function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

function hash3(x: number, y: number, z: number, seed = 0): number {
  let n = Math.imul(x, 374761393)
    + Math.imul(y, 668265263)
    + Math.imul(z, 2147483647)
    + Math.imul(seed, 1597334677);
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

function valueNoise3Tile(x: number, y: number, z: number, period: number, seed = 0): number {
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
  const n000 = hash3(xa, ya, za, seed);
  const n100 = hash3(xb, ya, za, seed);
  const n010 = hash3(xa, yb, za, seed);
  const n110 = hash3(xb, yb, za, seed);
  const n001 = hash3(xa, ya, zb, seed);
  const n101 = hash3(xb, ya, zb, seed);
  const n011 = hash3(xa, yb, zb, seed);
  const n111 = hash3(xb, yb, zb, seed);
  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);
  return lerp(lerp(nx00, nx10, fy), lerp(nx01, nx11, fy), fz);
}

function fbm3Tile(x: number, y: number, z: number, period: number, octaves: number, seed = 0): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3Tile(x * freq, y * freq, z * freq, p, seed) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
    p *= 2;
  }
  return sum / norm;
}

function worley3Tile(x: number, y: number, z: number, period: number, seed = 0): number {
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
        const px = cx + hash3(hx, hy, hz, seed);
        const py = cy + hash3(hx + 3, hy + 7, hz + 11, seed);
        const pz = cz + hash3(hx + 13, hy + 17, hz + 19, seed);
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

export const DETAIL_VOLUME_SIZE = 64;

function domainWarp3Tile(
  nx: number,
  ny: number,
  nz: number,
  basePeriod: number,
  warpPeriod: number,
  strengthInCells: number,
  seed: number,
): [number, number, number] {
  const wx = valueNoise3Tile(nx * warpPeriod, ny * warpPeriod, nz * warpPeriod, warpPeriod, seed + 11) - 0.5;
  const wy = valueNoise3Tile(nz * warpPeriod, nx * warpPeriod, ny * warpPeriod, warpPeriod, seed + 29) - 0.5;
  const wz = valueNoise3Tile(ny * warpPeriod, nz * warpPeriod, nx * warpPeriod, warpPeriod, seed + 47) - 0.5;
  const scale = strengthInCells / basePeriod;
  return [nx + wx * scale, ny + wy * scale, nz + wz * scale];
}

function inverseWorleyAt(p: [number, number, number], period: number, seed: number): number {
  return 1 - worley3Tile(p[0] * period, p[1] * period, p[2] * period, period, seed);
}

function valueAt(p: [number, number, number], period: number, seed: number): number {
  return valueNoise3Tile(p[0] * period, p[1] * period, p[2] * period, period, seed);
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

export function generateDetailRGBA(size = DETAIL_VOLUME_SIZE): Uint8Array {
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

// HP-compatible channel roles. Each channel owns a separate seed, frequency
// recipe and tile-safe domain warp so channels do not expose the same repeated
// cell field with only a phase offset. These procedural fields approximate the
// HP frequency roles; they are not claimed to reproduce HP source assets.
export function generateHpDetailRGBA(size = DETAIL_VOLUME_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const nz = z / size;

        const wispyLowP = 4;
        const wispyLowDomain = domainWarp3Tile(nx, ny, nz, wispyLowP, 2, 1.1, 1013);
        const wispyLowCell = inverseWorleyAt(wispyLowDomain, wispyLowP, 1103);
        const wispyLowRidge = 1 - Math.abs(2 * valueAt(wispyLowDomain, wispyLowP, 1217) - 1);
        const wispyLow = remap(wispyLowCell * 0.56 + wispyLowRidge * 0.44, 0.1, 0.91);

        const wispyHighP = 15;
        const wispyHighDomain = domainWarp3Tile(nx, ny, nz, wispyHighP, 5, 0.85, 2027);
        const wispyHighCell = inverseWorleyAt(wispyHighDomain, wispyHighP, 2111);
        const wispyHighGrain = valueAt(wispyHighDomain, wispyHighP, 2237);
        const wispyHigh = remap(wispyHighCell * (0.68 + 0.32 * wispyHighGrain), 0.08, 0.84);

        const billowyLowP = 3;
        const billowyLowDomain = domainWarp3Tile(nx, ny, nz, billowyLowP, 3, 0.42, 3061);
        const billowyLowCell = inverseWorleyAt(billowyLowDomain, billowyLowP, 3163);
        const billowyLowSmooth = fbm3Tile(
          billowyLowDomain[0] * billowyLowP,
          billowyLowDomain[1] * billowyLowP,
          billowyLowDomain[2] * billowyLowP,
          billowyLowP,
          3,
          3259,
        );
        const billowyLow = remap(billowyLowCell * 0.8 + billowyLowSmooth * 0.2, 0.07, 0.94);

        const billowyHighP = 12;
        const billowyHighDomain = domainWarp3Tile(nx, ny, nz, billowyHighP, 4, 0.68, 4099);
        const billowyHighCell = inverseWorleyAt(billowyHighDomain, billowyHighP, 4201);
        const billowyHighGrain = valueAt(billowyHighDomain, 6, 4327);
        const billowyHigh = Math.pow(remap(Math.max(billowyHighCell * 0.94, billowyHighGrain * 0.7), 0.06, 0.92), 1.12);
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
