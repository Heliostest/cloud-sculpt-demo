function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

function hash2(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
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

function valueNoiseTile(x: number, y: number, period: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const x1 = wrap(x0, period);
  const y1 = wrap(y0, period);
  const x2 = wrap(x0 + 1, period);
  const y2 = wrap(y0 + 1, period);
  const a = hash2(x1, y1);
  const b = hash2(x2, y1);
  const c = hash2(x1, y2);
  const d = hash2(x2, y2);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

function fbmTile(x: number, y: number, period: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoiseTile(x * freq, y * freq, p) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
    p *= 2;
  }
  return sum / norm;
}

function worleyTile(x: number, y: number, period: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let minD = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox;
      const cy = yi + oy;
      const hx = wrap(cx, period);
      const hy = wrap(cy, period);
      const px = cx + hash2(hx, hy);
      const py = cy + hash2(hx + 19, hy + 7);
      const dx = px - x;
      const dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < minD) minD = d;
    }
  }
  return Math.min(1, Math.sqrt(minD));
}

export function generateWeatherRGBA(size = 512): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  // The old repeating map covered 31.25 km with 3/6/2 feature cells. The
  // finite 500 km HP-style field keeps approximately the same world-space
  // feature sizes while providing many unique cells inside one map.
  const macroP = 48;
  const mesoP = 96;
  const typeP = 32;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const edgeDistance = Math.min(u, 1 - u, v, 1 - v);
      const edgeFade = fade(Math.min(1, Math.max(0, edgeDistance / 0.04)));
      const macro = Math.pow(fbmTile(u * macroP, v * macroP, macroP, 5), 0.9);
      const meso = 1 - worleyTile(u * mesoP, v * mesoP, mesoP);
      const typeBase = fbmTile(u * typeP + 0.37, v * typeP + 0.11, typeP, 3);
      const type = Math.min(1, Math.max(0, typeBase * 0.85 + meso * 0.15));
      const scMask = Math.min(1, Math.max(0, (typeBase - 0.38) / 0.42));
      const i = (y * size + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, macro * 1.12 * edgeFade)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, meso * 0.92 + 0.08)) * 255);
      data[i + 2] = Math.round(type * 255);
      data[i + 3] = Math.round(scMask * 255);
    }
  }
  return data;
}

export function generateScCellRGBA(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const period = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = 1 - worleyTile((x / size) * period, (y / size) * period, period);
      const i = (y * size + x) * 4;
      const value = Math.round(Math.min(1, Math.max(0, cell)) * 255);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

export function generateHighWeatherRGBA(size = 512): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const broad = fbmTile(u * 4 + 0.21, v * 4 + 0.63, 4, 5);
      const broken = 1 - worleyTile(u * 7 + 0.4, v * 7 + 0.2, 7);
      const coverage = Math.min(1, Math.max(0, (broad * 0.82 + broken * 0.18 - 0.28) / 0.72));
      const type = Math.min(1, Math.max(0, fbmTile(u * 2 + 0.73, v * 2 + 0.19, 2, 4)));
      const msWeight = Math.min(1, Math.max(0, coverage * (0.7 + broken * 0.3)));
      const i = (y * size + x) * 4;
      data[i] = Math.round(coverage * 255);
      data[i + 1] = Math.round(type * 255);
      data[i + 2] = 0;
      data[i + 3] = Math.round(msWeight * 255);
    }
  }
  return data;
}

export function generateHighCellRGBA(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const period = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const cell = 1 - worleyTile(u * period, v * period, period);
      const shaped = Math.min(1, Math.max(0, cell * 1.08));
      const i = (y * size + x) * 4;
      const value = Math.round(shaped * 255);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

export function generateHighWarpRGBA(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const wx = fbmTile(u * 3 + 0.17, v * 3 + 0.71, 3, 4);
      const wz = fbmTile(u * 3 + 1.11, v * 3 + 0.29, 3, 4);
      const i = (y * size + x) * 4;
      data[i] = Math.round(wx * 255);
      data[i + 1] = Math.round(wz * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return data;
}

export function generateHighWispRGBA(size = 256): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const wisp = Math.pow(fbmTile(u * 9 + 0.43, v * 9 + 0.87, 9, 4), 1.6);
      const i = (y * size + x) * 4;
      const value = Math.round(Math.min(1, Math.max(0, wisp)) * 255);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}
