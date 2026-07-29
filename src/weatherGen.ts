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
  const macroP = 3;
  const mesoP = 6;
  const typeP = 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const macro = Math.pow(fbmTile(u * macroP, v * macroP, macroP, 5), 0.9);
      const meso = 1 - worleyTile(u * mesoP, v * mesoP, mesoP);
      const typeBase = fbmTile(u * typeP + 0.37, v * typeP + 0.11, typeP, 3);
      const type = Math.min(1, Math.max(0, typeBase * 0.85 + meso * 0.15));
      const i = (y * size + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, macro * 1.12)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, meso * 0.92 + 0.08)) * 255);
      data[i + 2] = Math.round(type * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}
