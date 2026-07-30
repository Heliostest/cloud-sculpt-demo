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
  fovYDeg: number;
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
    cam.fovYDeg = 55;
  } else if (preset === 'oblique45') {
    cam.targetX = 0;
    cam.targetY = 1800;
    cam.targetZ = 0;
    cam.yaw = 0.7;
    cam.pitch = Math.PI / 4;
    cam.dist = 14000;
    cam.fovYDeg = 55;
  } else if (preset === 'hpOcean') {
    // Below the low-cloud base, looking slightly upward at the weather-ring band.
    // Framing is matched to compare/Snipaste_2026-07-05_10-31-41.png.
    cam.targetX = 10000;
    cam.targetY = 2000;
    cam.targetZ = 0;
    cam.yaw = -Math.PI * 0.5;
    cam.pitch = -0.17;
    cam.dist = 10150;
    cam.fovYDeg = 55;
  } else {
    cam.targetX = 0;
    cam.targetY = 1800;
    cam.targetZ = 0;
    cam.yaw = 0.2;
    cam.pitch = 1.45;
    cam.dist = 18000;
    cam.fovYDeg = 55;
  }
}

function orbitToCamera(yaw: number, pitch: number, dist: number, target: [number, number, number], fovYDeg: number): CameraState {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return {
    position: [target[0] + dist * cp * sy, target[1] + dist * sp, target[2] + dist * cp * cy],
    target,
    fovY: (fovYDeg * Math.PI) / 180,
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
  const loCovIntensity = Number(query.get('loCovIntensity'));
  if (query.has('loCovIntensity') && Number.isFinite(loCovIntensity)) params.loCovCoverIntensity = Math.max(0, Math.min(3, loCovIntensity));
  const loCovContrast = Number(query.get('loCovContrast'));
  if (query.has('loCovContrast') && Number.isFinite(loCovContrast)) params.loCovCoverContrast = Math.max(0.01, Math.min(4, loCovContrast));
  const densityMultiplier = Number(query.get('densityMultiplier'));
  if (query.has('densityMultiplier') && Number.isFinite(densityMultiplier)) params.densityMultiplier = Math.max(0, Math.min(4, densityMultiplier));
  const cloudType = Number(query.get('cloudType'));
  if (query.has('cloudType') && Number.isFinite(cloudType)) params.cloudTypeOverride = Math.max(-1, Math.min(1, cloudType));
  const weatherRepeat = Number(query.get('weatherRepeat'));
  if (query.has('weatherRepeat') && Number.isFinite(weatherRepeat)) params.weatherRepeat = Math.max(0.000001, Math.min(0.001, weatherRepeat));
  const shapeScaleX = Number(query.get('shapeScaleX'));
  if (query.has('shapeScaleX') && Number.isFinite(shapeScaleX)) params.hpShapeScaleX = Math.max(0.000001, Math.min(0.01, shapeScaleX));
  const shapeScaleY = Number(query.get('shapeScaleY'));
  if (query.has('shapeScaleY') && Number.isFinite(shapeScaleY)) params.hpShapeScaleY = Math.max(0.000001, Math.min(0.01, shapeScaleY));
  const shapeScaleZ = Number(query.get('shapeScaleZ'));
  if (query.has('shapeScaleZ') && Number.isFinite(shapeScaleZ)) params.hpShapeScaleZ = Math.max(0.000001, Math.min(0.01, shapeScaleZ));
  const detailScaleX = Number(query.get('detailScaleX'));
  if (query.has('detailScaleX') && Number.isFinite(detailScaleX)) params.hpDetailScaleX = Math.max(0.000001, Math.min(0.02, detailScaleX));
  const detailScaleY = Number(query.get('detailScaleY'));
  if (query.has('detailScaleY') && Number.isFinite(detailScaleY)) params.hpDetailScaleY = Math.max(0.000001, Math.min(0.02, detailScaleY));
  const detailScaleZ = Number(query.get('detailScaleZ'));
  if (query.has('detailScaleZ') && Number.isFinite(detailScaleZ)) params.hpDetailScaleZ = Math.max(0.000001, Math.min(0.02, detailScaleZ));
  const detailStrength = Number(query.get('detailStrength'));
  if (query.has('detailStrength') && Number.isFinite(detailStrength)) params.detailStrength = Math.max(0, Math.min(3, detailStrength));
  const billowyLow = Number(query.get('billowyLow'));
  if (query.has('billowyLow') && Number.isFinite(billowyLow)) params.billowyLowWeight = Math.max(0, Math.min(2, billowyLow));
  const billowyHigh = Number(query.get('billowyHigh'));
  if (query.has('billowyHigh') && Number.isFinite(billowyHigh)) params.billowyHighWeight = Math.max(0, Math.min(2, billowyHigh));
  const wispyLow = Number(query.get('wispyLow'));
  if (query.has('wispyLow') && Number.isFinite(wispyLow)) params.wispyLowWeight = Math.max(0, Math.min(2, wispyLow));
  const wispyHigh = Number(query.get('wispyHigh'));
  if (query.has('wispyHigh') && Number.isFinite(wispyHigh)) params.wispyHighWeight = Math.max(0, Math.min(2, wispyHigh));
  const wispyEdgeWidth = Number(query.get('wispyEdgeWidth'));
  if (query.has('wispyEdgeWidth') && Number.isFinite(wispyEdgeWidth)) params.wispyEdgeWidth = Math.max(0.001, Math.min(1, wispyEdgeWidth));
  const wispyReach = Number(query.get('wispyReach'));
  if (query.has('wispyReach') && Number.isFinite(wispyReach)) params.wispyReach = Math.max(0, Math.min(1, wispyReach));
  const topStrength = Number(query.get('topStrength'));
  if (query.has('topStrength') && Number.isFinite(topStrength)) params.loCoverTopStrength = Math.max(0, Math.min(1, topStrength));
  const topMax = Number(query.get('topMax'));
  if (query.has('topMax') && Number.isFinite(topMax)) params.loCoverTopMax = Math.max(1, Math.min(4, topMax));
  const topCurve = Number(query.get('topCurve'));
  if (query.has('topCurve') && Number.isFinite(topCurve)) params.loCoverTopCurvePow = Math.max(0.01, Math.min(4, topCurve));
  const noiseMipOffset = Number(query.get('noiseMip'));
  if (Number.isFinite(noiseMipOffset)) params.noiseMipOffset = Math.max(0, Math.min(7, noiseMipOffset));
  const erosionMipOffset = Number(query.get('erosionMip'));
  if (Number.isFinite(erosionMipOffset)) params.erosionMipOffset = Math.max(0, Math.min(5, erosionMipOffset));
  const forceSimpleMode = query.get('simple');
  if (forceSimpleMode !== null) params.forceSimpleMode = forceSimpleMode === '1' || forceSimpleMode === 'true';
  const detailFade = query.get('detailFade');
  if (detailFade !== null) params.detailFadeEnabled = detailFade !== '0' && detailFade !== 'false';
  const highCloud = query.get('high');
  if (highCloud !== null) params.highCloudEnabled = highCloud === '1' || highCloud === 'true';
  const highType = Number(query.get('highType'));
  if (query.has('highType') && Number.isFinite(highType)) params.highCloudTypeOverride = Math.max(-1, Math.min(1, highType));
  const highDensity = Number(query.get('highDensity'));
  if (query.has('highDensity') && Number.isFinite(highDensity)) params.highDensityMultiplier = Math.max(0, Math.min(3, highDensity));
  const highThreshold = Number(query.get('highThreshold'));
  if (query.has('highThreshold') && Number.isFinite(highThreshold)) params.highDensityThreshold = Math.max(0, Math.min(1, highThreshold));
  const highSoftness = Number(query.get('highSoftness'));
  if (query.has('highSoftness') && Number.isFinite(highSoftness)) params.highDensitySoftness = Math.max(0.001, Math.min(1, highSoftness));
  const highViewAbsorption = Number(query.get('highViewAbsorption'));
  if (query.has('highViewAbsorption') && Number.isFinite(highViewAbsorption)) params.highViewAbsorption = Math.max(0, Math.min(0.1, highViewAbsorption));
  const highLightAbsorption = Number(query.get('highLightAbsorption'));
  if (query.has('highLightAbsorption') && Number.isFinite(highLightAbsorption)) params.highLightAbsorption = Math.max(0, Math.min(0.1, highLightAbsorption));
  const highCoverAbsorption = Number(query.get('highCoverAbsorption'));
  if (query.has('highCoverAbsorption') && Number.isFinite(highCoverAbsorption)) params.highCoverAbsorptionStrength = Math.max(0, Math.min(2, highCoverAbsorption));
  const highSteps = Number(query.get('highSteps'));
  if (query.has('highSteps') && Number.isFinite(highSteps)) params.highSteps = Math.max(4, Math.min(256, Math.round(highSteps)));
  const hpLighting = query.get('hpLighting');
  if (hpLighting !== null) params.hpLightingEnabled = hpLighting === '1' || hpLighting === 'true';
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
    fovYDeg: 55,
  };
  applyPreset(scenario?.camera ?? 'oblique45', orbit);
  document.body.dataset.validationScenario = scenarioName ?? 'interactive';
  document.body.dataset.noiseMipOffset = String(params.noiseMipOffset);
  document.body.dataset.erosionMipOffset = String(params.erosionMipOffset);
  document.body.dataset.forceSimpleMode = String(params.forceSimpleMode);
  document.body.dataset.detailFadeEnabled = String(params.detailFadeEnabled);
  document.body.dataset.highCloudEnabled = String(params.highCloudEnabled);
  document.body.dataset.highCloudType = String(params.highCloudTypeOverride);
  document.body.dataset.highDensityThreshold = String(params.highDensityThreshold);
  document.body.dataset.highDensitySoftness = String(params.highDensitySoftness);
  document.body.dataset.highViewAbsorption = String(params.highViewAbsorption);
  document.body.dataset.highLightAbsorption = String(params.highLightAbsorption);
  document.body.dataset.highCoverAbsorption = String(params.highCoverAbsorptionStrength);
  document.body.dataset.densityModel = params.densityModel;
  document.body.dataset.scStrength = String(params.scStrength);
  document.body.dataset.cloudTypeOverride = String(params.cloudTypeOverride);
  document.body.dataset.loCovCoverIntensity = String(params.loCovCoverIntensity);
  document.body.dataset.loCovCoverContrast = String(params.loCovCoverContrast);
  document.body.dataset.densityMultiplier = String(params.densityMultiplier);
  document.body.dataset.weatherRepeat = String(params.weatherRepeat);
  document.body.dataset.hpShapeScale = [params.hpShapeScaleX, params.hpShapeScaleY, params.hpShapeScaleZ].join(',');
  document.body.dataset.hpDetailScale = [params.hpDetailScaleX, params.hpDetailScaleY, params.hpDetailScaleZ].join(',');
  document.body.dataset.detailStrength = String(params.detailStrength);
  document.body.dataset.hpDetailWeights = [params.billowyLowWeight, params.billowyHighWeight, params.wispyLowWeight, params.wispyHighWeight].join(',');
  document.body.dataset.hpWispyBlend = [params.wispyEdgeWidth, params.wispyReach].join(',');
  document.body.dataset.hpCoverTop = [params.loCoverTopStrength, params.loCoverTopMax, params.loCoverTopCurvePow].join(',');
  document.body.dataset.hpLightingEnabled = String(params.hpLightingEnabled);
  document.body.dataset.hpForwardEccentricity = String(params.forwardEccentricity);
  document.body.dataset.hpBackwardEccentricity = String(params.backwardEccentricity);
  document.body.dataset.hpMsAttenuation = String(params.msAttenuation);
  document.body.dataset.hpMsContribution = String(params.msContribution);
  document.body.dataset.hpMsEccentricity = String(params.msEccentricity);
  document.body.dataset.hpAmbientTopMultiplier = String(params.ambientTopMultiplier);
  document.body.dataset.hpAmbientBottomMultiplier = String(params.ambientBottomMultiplier);
  document.body.dataset.hpAoUpwardScale = String(params.aoUpwardScale);
  document.body.dataset.hpScatterSourceOdScale = String(params.scatterSourceODScale);
  document.body.dataset.hpScatterSourceCurvePow = String(params.scatterSourceCurvePow);

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
    orbit.pitch = Math.max(-0.5, Math.min(1.52, orbit.pitch + dy * 0.005));
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

    const cam = orbitToCamera(
      orbit.yaw,
      orbit.pitch,
      orbit.dist,
      [orbit.targetX, orbit.targetY, orbit.targetZ],
      orbit.fovYDeg,
    );
    document.body.dataset.cameraPosition = cam.position.map((value) => value.toFixed(2)).join(',');
    document.body.dataset.cameraTarget = cam.target.map((value) => value.toFixed(2)).join(',');
    document.body.dataset.cameraFovYDeg = orbit.fovYDeg.toFixed(2);
    document.body.dataset.sunAzimuthDeg = params.sunAzimuthDeg.toFixed(2);
    document.body.dataset.sunElevationDeg = params.sunElevationDeg.toFixed(2);
    document.body.dataset.exposure = params.exposure.toFixed(3);
    renderer.render(params, cam, time, weatherOffset, windOffset, shapeOffset, detailOffset, detailMorph);
    const gpuTiming = renderer.getGpuTimingInfo();
    document.body.dataset.gpuTimingSupported = String(gpuTiming.supported);
    document.body.dataset.gpuSampleCount = String(gpuTiming.sampleCount);
    if (gpuTiming.averageGpuMs !== null) {
      document.body.dataset.gpuMs = gpuTiming.averageGpuMs.toFixed(3);
    }
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
