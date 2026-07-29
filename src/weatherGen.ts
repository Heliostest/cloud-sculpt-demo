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

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

function fbm(x: number, y: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function worley(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let minD = 1e9;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox;
      const cy = yi + oy;
      const px = cx + hash2(cx, cy);
      const py = cy + hash2(cx + 19, cy + 7);
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
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const macro = fbm(u * 4.0, v * 4.0, 5);
      const meso = 1 - worley(u * 14.0, v * 14.0);
      const typeBase = fbm(u * 2.2 + 17.0, v * 2.2 - 9.0, 3);
      const type = Math.min(1, Math.max(0, typeBase * 0.75 + meso * 0.35));
      const i = (y * size + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, macro)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, meso)) * 255);
      data[i + 2] = Math.round(type * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}
