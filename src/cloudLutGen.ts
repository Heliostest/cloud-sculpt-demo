function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
}

function semiCircle(h: number, bias: number): number {
  return clamp01(1 - Math.pow(Math.abs(2 * clamp01(h) - 1 - bias), 1.35));
}

function cuProfile(h: number): number {
  const base = smoothstep(0, 0.1, h);
  const top = 1 - smoothstep(0.72, 1, h);
  return base * top * (0.8 + 0.2 * semiCircle(h, -0.2));
}

function tcuProfile(h: number): number {
  const base = smoothstep(0, 0.08, h);
  const top = 1 - smoothstep(0.84, 1, h);
  return base * top * (0.72 + 0.28 * semiCircle(h, -0.12));
}

function cbProfile(h: number): number {
  const base = smoothstep(0, 0.07, h);
  const anvil = h > 0.58 ? 1 + (0.62 - 1) * smoothstep(0.58, 0.92, h) : 1;
  const top = 1 - smoothstep(0.9, 1, h);
  return base * semiCircle(h, -0.08) * anvil * top;
}

export function generateCloudLutRGBA(width = 256, height = 32): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const radial = y / Math.max(1, height - 1);
    const radialFade = 1 - 0.12 * radial * radial;
    for (let x = 0; x < width; x++) {
      const h = x / Math.max(1, width - 1);
      const i = (y * width + x) * 4;
      data[i] = Math.round(clamp01(cuProfile(h) * radialFade) * 255);
      data[i + 1] = Math.round(clamp01(tcuProfile(h) * radialFade) * 255);
      data[i + 2] = Math.round(clamp01(cbProfile(h) * radialFade) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}
