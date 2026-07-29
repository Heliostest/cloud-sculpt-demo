import { createGui } from './gui';
import { createDefaultParams, type CameraPreset } from './params';
import { createRenderer, type CameraState } from './renderer';

function applyPreset(preset: CameraPreset, cam: { yaw: number; pitch: number; dist: number; targetY: number }): void {
  cam.targetY = 1800;
  if (preset === 'side') {
    cam.yaw = 0.35;
    cam.pitch = 0.12;
    cam.dist = 9000;
  } else if (preset === 'oblique45') {
    cam.yaw = 0.7;
    cam.pitch = Math.PI / 4;
    cam.dist = 14000;
  } else {
    cam.yaw = 0.2;
    cam.pitch = 1.45;
    cam.dist = 18000;
  }
}

function orbitToCamera(yaw: number, pitch: number, dist: number, target: [number, number, number]): CameraState {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return {
    position: [target[0] + dist * cp * sy, target[1] + dist * sp, target[2] + dist * cp * cy],
    target,
    fovY: (55 * Math.PI) / 180,
  };
}

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const params = createDefaultParams();
  const renderer = await createRenderer(canvas);

  const orbit = { yaw: 0.7, pitch: Math.PI / 4, dist: 14000, targetY: 1800 };
  applyPreset('oblique45', orbit);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    orbit.yaw += dx * 0.005;
    orbit.pitch = Math.max(0.02, Math.min(1.52, orbit.pitch + dy * 0.005));
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      orbit.dist = Math.max(800, Math.min(60000, orbit.dist * (1 + e.deltaY * 0.001)));
    },
    { passive: false },
  );

  createGui(params, {
    onPreset(p) {
      applyPreset(p, orbit);
    },
  });

  let weatherOffset: [number, number] = [0, 0];
  let windOffset: [number, number] = [0, 0];
  let shapeOffset: [number, number, number] = [0, 0, 0];
  let detailOffset: [number, number, number] = [0, 0, 0];
  let detailMorph = 0;
  let last = performance.now();
  let time = 0;

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    const ang = (params.windAngleDeg * Math.PI) / 180;
    const wx = Math.cos(ang) * params.windSpeed;
    const wz = Math.sin(ang) * params.windSpeed;
    windOffset[0] += wx * dt * params.weatherRepeat;
    windOffset[1] += wz * dt * params.weatherRepeat;
    shapeOffset[0] += wx * dt * params.shapeRepeat * 0.35;
    shapeOffset[2] += wz * dt * params.shapeRepeat * 0.35;
    detailOffset[0] += wx * dt * params.detailRepeat * 0.8;
    detailOffset[2] += wz * dt * params.detailRepeat * 0.8;
    detailMorph += dt * 0.35;

    const cam = orbitToCamera(orbit.yaw, orbit.pitch, orbit.dist, [0, orbit.targetY, 0]);
    renderer.render(params, cam, time, weatherOffset, windOffset, shapeOffset, detailOffset, detailMorph);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => renderer.resizeCanvas());
  renderer.resizeCanvas();
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = String(err);
});
