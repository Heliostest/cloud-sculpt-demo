import { createGui } from './gui';
import { createDefaultParams, isDebugMode, isDensityModel, type CameraPreset } from './params';
import { createRenderer, type CameraState } from './renderer';
import { applyValidationScenario, isValidationScenarioName, VALIDATION_SCENARIOS } from './validationScenarios';

type Orbit = {
  yaw: number;
  pitch: number;
  dist: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

function applyPreset(preset: CameraPreset, cam: Orbit): void {
  if (preset === 'side') {
    // 看向云环上一点，沿层内切向平视，避免对着中心空洞
    cam.targetX = 10000;
    cam.targetY = 1400;
    cam.targetZ = 0;
    cam.yaw = Math.PI * 0.5;
    cam.pitch = 0.06;
    cam.dist = 9000;
  } else if (preset === 'oblique45') {
    cam.targetX = 0;
    cam.targetY = 1800;
    cam.targetZ = 0;
    cam.yaw = 0.7;
    cam.pitch = Math.PI / 4;
    cam.dist = 14000;
  } else {
    cam.targetX = 0;
    cam.targetY = 1800;
    cam.targetZ = 0;
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
  const query = new URLSearchParams(window.location.search);
  const scenarioName = query.get('scenario');
  const scenario = isValidationScenarioName(scenarioName) ? VALIDATION_SCENARIOS[scenarioName] : null;
  if (scenario) applyValidationScenario(params, scenario);
  const densityModel = query.get('model');
  if (isDensityModel(densityModel)) params.densityModel = densityModel;
  const scStrength = Number(query.get('sc'));
  if (Number.isFinite(scStrength)) params.scStrength = Math.max(0, Math.min(1, scStrength));
  const debugMode = query.get('debug');
  if (isDebugMode(debugMode)) params.debugMode = debugMode;
  const densityModIntensity = Number(query.get('mod'));
  if (Number.isFinite(densityModIntensity)) params.densityModIntensity = Math.max(0, Math.min(1, densityModIntensity));
  const noiseMipOffset = Number(query.get('noiseMip'));
  if (Number.isFinite(noiseMipOffset)) params.noiseMipOffset = Math.max(0, Math.min(7, noiseMipOffset));
  const erosionMipOffset = Number(query.get('erosionMip'));
  if (Number.isFinite(erosionMipOffset)) params.erosionMipOffset = Math.max(0, Math.min(5, erosionMipOffset));
  const forceSimpleMode = query.get('simple');
  if (forceSimpleMode !== null) params.forceSimpleMode = forceSimpleMode === '1' || forceSimpleMode === 'true';
  const detailChannel = query.get('detailChannel');
  if (detailChannel) {
    params.billowyLowWeight = detailChannel === 'billowyLow' ? 1 : 0;
    params.billowyHighWeight = detailChannel === 'billowyHigh' ? 1 : 0;
    params.wispyLowWeight = detailChannel === 'wispyLow' ? 1 : 0;
    params.wispyHighWeight = detailChannel === 'wispyHigh' ? 1 : 0;
  }
  const renderer = await createRenderer(canvas);

  const orbit: Orbit = {
    yaw: 0.55,
    pitch: 0.32,
    dist: 12000,
    targetX: 0,
    targetY: 1400,
    targetZ: 0,
  };
  applyPreset(scenario?.camera ?? 'oblique45', orbit);
  document.body.dataset.validationScenario = scenarioName ?? 'interactive';
  document.body.dataset.noiseMipOffset = String(params.noiseMipOffset);
  document.body.dataset.erosionMipOffset = String(params.erosionMipOffset);
  document.body.dataset.forceSimpleMode = String(params.forceSimpleMode);
  document.body.dataset.densityModel = params.densityModel;
  document.body.dataset.scStrength = String(params.scStrength);

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
    orbit.pitch = Math.max(-0.08, Math.min(1.52, orbit.pitch + dy * 0.005));
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      orbit.dist = Math.max(800, Math.min(60000, orbit.dist * (1 + e.deltaY * 0.001)));
    },
    { passive: false },
  );

  const gui = createGui(params, {
    onPreset(p) {
      applyPreset(p, orbit);
    },
  });
  if (scenario) gui.hide();

  let weatherOffset: [number, number] = [0, 0];
  let windOffset: [number, number] = [0, 0];
  let shapeOffset: [number, number, number] = [0, 0, 0];
  let detailOffset: [number, number, number] = [0, 0, 0];
  let detailMorph = 0;
  let last = performance.now();
  let time = 0;
  let validationReady = false;

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    const animationDt = scenario ? 0 : dt;
    last = now;
    time = scenario?.frozenTime ?? time + dt;

    const ang = (params.windAngleDeg * Math.PI) / 180;
    const wx = Math.cos(ang) * params.windSpeed;
    const wz = Math.sin(ang) * params.windSpeed;
    windOffset[0] += wx * animationDt * params.weatherRepeat;
    windOffset[1] += wz * animationDt * params.weatherRepeat;
    shapeOffset[0] += wx * animationDt * params.shapeRepeat * 0.35;
    shapeOffset[2] += wz * animationDt * params.shapeRepeat * 0.35;
    detailOffset[0] += wx * animationDt * params.detailRepeat * 0.8;
    detailOffset[2] += wz * animationDt * params.detailRepeat * 0.8;
    detailMorph += animationDt * 0.35;

    const cam = orbitToCamera(orbit.yaw, orbit.pitch, orbit.dist, [orbit.targetX, orbit.targetY, orbit.targetZ]);
    renderer.render(params, cam, time, weatherOffset, windOffset, shapeOffset, detailOffset, detailMorph);
    if (!validationReady) {
      validationReady = true;
      void renderer.device.queue.onSubmittedWorkDone().then(() => {
        document.body.dataset.renderReady = 'true';
      });
    }
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
