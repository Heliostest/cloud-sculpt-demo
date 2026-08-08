import { createGui } from './gui';
import { CloudGizmo } from './cloudGizmo';
import { CloudBodyStore, type CloudBody } from './cloudBodies';
import { createDefaultParams, isCloudGenus, isDebugMode, isHighCloudGenus, isToneMapper, type CameraPreset, type DemoParams } from './params';
import { createRenderer, type CameraState } from './renderer';
import {
  applyCloudBodyPreset,
  applyCloudPreset,
  CLOUD_PRESETS,
  resolvePresetRequest,
  type CloudPresetName,
} from './cloudPresets';

type Orbit = {
  yaw: number;
  pitch: number;
  dist: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fovYDeg: number;
};

function applyCameraPreset(preset: CameraPreset, cam: Orbit): void {
  if (preset === 'cirrusSide') {
    cam.targetX = 0;
    cam.targetY = 9500;
    cam.targetZ = 0;
    cam.yaw = Math.PI * 0.5;
    cam.pitch = 0.03;
    cam.dist = 9000;
    cam.fovYDeg = 55;
  } else if (preset === 'cirrusOblique') {
    cam.targetX = 0;
    cam.targetY = 9500;
    cam.targetZ = 0;
    cam.yaw = 0.7;
    cam.pitch = -0.28;
    cam.dist = 10500;
    cam.fovYDeg = 55;
  } else if (preset === 'cirrusTop') {
    cam.targetX = 0;
    cam.targetY = 9500;
    cam.targetZ = 0;
    cam.yaw = 0.2;
    cam.pitch = 1.45;
    cam.dist = 13500;
    cam.fovYDeg = 55;
  } else if (preset === 'side') {
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

function syncParameterDataset(params: DemoParams, cloudBodies: readonly CloudBody[]): void {
  const data = document.body.dataset;
  const volumeBodies = cloudBodies.filter((body) => body.enabled && body.path === 'volume');
  const highBody = cloudBodies.find((body) => body.enabled && body.path === 'high-sheet');
  data.noiseMipOffset = String(params.noiseMipOffset);
  data.erosionMipOffset = String(params.erosionMipOffset);
  data.forceSimpleMode = String(params.forceSimpleMode);
  data.detailFadeEnabled = String(params.detailFadeEnabled);
  data.highSheetEnabled = String(highBody !== undefined);
  data.highSheetGenus = highBody?.genus ?? '';
  data.highDensityThreshold = String(params.highDensityThreshold);
  data.highDensitySoftness = String(params.highDensitySoftness);
  data.highViewAbsorption = String(params.highViewAbsorption);
  data.highLightAbsorption = String(params.highLightAbsorption);
  data.highCoverAbsorption = String(params.highCoverAbsorptionStrength);
  data.toneMapper = params.toneMapper;
  data.skyIntensity = String(params.skyIntensity);
  data.skyZenith = [params.skyZenithR, params.skyZenithG, params.skyZenithB].join(',');
  data.skyHorizon = [params.skyHorizonR, params.skyHorizonG, params.skyHorizonB].join(',');
  data.skyHorizonExponent = String(params.skyHorizonExponent);
  data.colorSaturation = String(params.colorSaturation);
  data.colorContrast = String(params.colorContrast);
  data.scStrength = String(params.scStrength);
  data.layerGenera = volumeBodies.map((body) => body.genus).join(',');
  data.cumulusDevelopment = volumeBodies.map((body) => body.cumulusDevelopment).join(',');
  data.loCovCoverIntensity = String(params.loCovCoverIntensity);
  data.loCovCoverContrast = String(params.loCovCoverContrast);
  data.densityMultiplier = String(params.densityMultiplier);
  data.weatherMapCenter = [params.weatherMapCenterX, params.weatherMapCenterZ].join(',');
  data.weatherMapWorldSizeKm = String(params.weatherMapWorldSizeKm);
  data.hpShapeScale = [params.hpShapeScaleX, params.hpShapeScaleY, params.hpShapeScaleZ].join(',');
  data.hpShapeTransform = [params.hpShapeRotationDeg, params.hpShapeWarpScaleKm, params.hpShapeWarpStrengthM].join(',');
  data.hpShapeSecondary = [params.hpShapeSecondaryScaleRatio, params.hpShapeSecondaryRotationDeg, params.hpShapeSecondaryWeight].join(',');
  data.hpDetailScale = [params.hpDetailScaleX, params.hpDetailScaleY, params.hpDetailScaleZ].join(',');
  data.detailStrength = String(params.detailStrength);
  data.hpDetailWeights = [params.billowyLowWeight, params.billowyHighWeight, params.wispyLowWeight, params.wispyHighWeight].join(',');
  data.hpWispyBlend = [params.wispyEdgeWidth, params.wispyReach].join(',');
  data.hpCoverTop = [params.loCoverTopStrength, params.loCoverTopMax, params.loCoverTopCurvePow].join(',');
  data.hpLightingEnabled = String(params.hpLightingEnabled);
  data.hpForwardEccentricity = String(params.forwardEccentricity);
  data.hpBackwardEccentricity = String(params.backwardEccentricity);
  data.hpMsAttenuation = String(params.msAttenuation);
  data.hpMsContribution = String(params.msContribution);
  data.hpMsEccentricity = String(params.msEccentricity);
  data.hpAmbientTopMultiplier = String(params.ambientTopMultiplier);
  data.hpAmbientBottomMultiplier = String(params.ambientBottomMultiplier);
  data.hpAoUpwardScale = String(params.aoUpwardScale);
  data.hpScatterSourceOdScale = String(params.scatterSourceODScale);
  data.hpScatterSourceCurvePow = String(params.scatterSourceCurvePow);
}

async function main(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const params = createDefaultParams();
  const query = new URLSearchParams(window.location.search);
  const presetRequest = resolvePresetRequest(query);
  let currentPresetName = presetRequest.name;
  let currentPreset = CLOUD_PRESETS[currentPresetName];
  const validationMode = presetRequest.validation;
  applyCloudPreset(params, currentPreset);
  const bodyStore = CloudBodyStore.createDefault(() => params.sceneTime);
  applyCloudBodyPreset(bodyStore, currentPreset);
  const scStrength = Number(query.get('sc'));
  if (query.has('sc') && Number.isFinite(scStrength)) params.scStrength = Math.max(0, Math.min(1, scStrength));
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
  if (query.has('cloudType') && Number.isFinite(cloudType) && cloudType >= 0) {
    // Legacy global Cu/TCu/Cb URL adapter. New URLs should use genusN and
    // cuDevelopmentN so each layer keeps independent semantics.
    for (const layer of bodyStore.bodies.filter((body) => body.path === 'volume')) {
      if (cloudType >= 0.75) {
        layer.genus = 'cumulonimbus';
        layer.cumulusDevelopment = 0;
      } else {
        layer.genus = 'cumulus';
        layer.cumulusDevelopment = Math.max(0, Math.min(1, cloudType * 2));
      }
    }
  }
  const volumeBodies = bodyStore.bodies.filter((body) => body.path === 'volume');
  for (let i = 0; i < volumeBodies.length; i++) {
    const genus = query.get(`genus${i}`);
    if (isCloudGenus(genus)) volumeBodies[i].genus = genus;
    const applyGenusDefaults = query.get(`genusDefaults${i}`);
    if (applyGenusDefaults === '1' || applyGenusDefaults === 'true') {
      volumeBodies[i].applyGenusDefaults();
    }
    const development = Number(query.get(`cuDevelopment${i}`));
    if (query.has(`cuDevelopment${i}`) && Number.isFinite(development)) {
      volumeBodies[i].cumulusDevelopment = Math.max(0, Math.min(1, development));
    }
  }
  const weatherMapCenterX = Number(query.get('weatherCenterX'));
  if (query.has('weatherCenterX') && Number.isFinite(weatherMapCenterX)) params.weatherMapCenterX = Math.max(-1000000, Math.min(1000000, weatherMapCenterX));
  const weatherMapCenterZ = Number(query.get('weatherCenterZ'));
  if (query.has('weatherCenterZ') && Number.isFinite(weatherMapCenterZ)) params.weatherMapCenterZ = Math.max(-1000000, Math.min(1000000, weatherMapCenterZ));
  const weatherMapWorldSizeKm = Number(query.get('weatherSizeKm'));
  if (query.has('weatherSizeKm') && Number.isFinite(weatherMapWorldSizeKm)) params.weatherMapWorldSizeKm = Math.max(1, Math.min(2000, weatherMapWorldSizeKm));
  const shapeScaleX = Number(query.get('shapeScaleX'));
  if (query.has('shapeScaleX') && Number.isFinite(shapeScaleX)) params.hpShapeScaleX = Math.max(0.000001, Math.min(0.01, shapeScaleX));
  const shapeScaleY = Number(query.get('shapeScaleY'));
  if (query.has('shapeScaleY') && Number.isFinite(shapeScaleY)) params.hpShapeScaleY = Math.max(0.000001, Math.min(0.01, shapeScaleY));
  const shapeScaleZ = Number(query.get('shapeScaleZ'));
  if (query.has('shapeScaleZ') && Number.isFinite(shapeScaleZ)) params.hpShapeScaleZ = Math.max(0.000001, Math.min(0.01, shapeScaleZ));
  const shapeRotationDeg = Number(query.get('shapeRotationDeg'));
  if (query.has('shapeRotationDeg') && Number.isFinite(shapeRotationDeg)) params.hpShapeRotationDeg = Math.max(-180, Math.min(180, shapeRotationDeg));
  const shapeWarpScaleKm = Number(query.get('shapeWarpScaleKm'));
  if (query.has('shapeWarpScaleKm') && Number.isFinite(shapeWarpScaleKm)) params.hpShapeWarpScaleKm = Math.max(1, Math.min(500, shapeWarpScaleKm));
  const shapeWarpStrengthM = Number(query.get('shapeWarpStrengthM'));
  if (query.has('shapeWarpStrengthM') && Number.isFinite(shapeWarpStrengthM)) params.hpShapeWarpStrengthM = Math.max(0, Math.min(10000, shapeWarpStrengthM));
  const shapeSecondRatio = Number(query.get('shapeSecondRatio'));
  if (query.has('shapeSecondRatio') && Number.isFinite(shapeSecondRatio)) params.hpShapeSecondaryScaleRatio = Math.max(0.1, Math.min(4, shapeSecondRatio));
  const shapeSecondRotationDeg = Number(query.get('shapeSecondRotationDeg'));
  if (query.has('shapeSecondRotationDeg') && Number.isFinite(shapeSecondRotationDeg)) params.hpShapeSecondaryRotationDeg = Math.max(-180, Math.min(180, shapeSecondRotationDeg));
  const shapeSecondWeight = Number(query.get('shapeSecondWeight'));
  if (query.has('shapeSecondWeight') && Number.isFinite(shapeSecondWeight)) params.hpShapeSecondaryWeight = Math.max(0, Math.min(1, shapeSecondWeight));
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
  if (Number.isFinite(erosionMipOffset)) params.erosionMipOffset = Math.max(0, Math.min(6, erosionMipOffset));
  const forceSimpleMode = query.get('simple');
  if (forceSimpleMode !== null) params.forceSimpleMode = forceSimpleMode === '1' || forceSimpleMode === 'true';
  const detailFade = query.get('detailFade');
  if (detailFade !== null) params.detailFadeEnabled = detailFade !== '0' && detailFade !== 'false';
  const highCloud = query.get('high');
  if (highCloud !== null) {
    const highBody = bodyStore.bodies.find((body) => body.path === 'high-sheet');
    const shouldEnable = highCloud === '1' || highCloud === 'true';
    if (shouldEnable && !highBody) bodyStore.add('high-sheet', true);
    if (!shouldEnable && highBody) bodyStore.remove(highBody.id);
  }
  const activeHighBody = bodyStore.bodies.find((body) => body.path === 'high-sheet');
  const highGenus = query.get('highGenus');
  if (activeHighBody && isHighCloudGenus(highGenus)) activeHighBody.genus = highGenus;
  const highType = Number(query.get('highType'));
  if (!isHighCloudGenus(highGenus) && query.has('highType') && Number.isFinite(highType) && highType >= 0) {
    // Legacy Ac/As URL adapter: the old endpoints were 0 = As and 1 = Ac.
    if (activeHighBody) activeHighBody.genus = highType >= 0.5 ? 'altocumulus' : 'altostratus';
  }
  const highDensity = Number(query.get('highDensity'));
  if (activeHighBody && query.has('highDensity') && Number.isFinite(highDensity)) {
    activeHighBody.densityScale = Math.max(0, Math.min(3, highDensity));
  }
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
  const exposure = Number(query.get('exposure'));
  if (query.has('exposure') && Number.isFinite(exposure)) params.exposure = Math.max(0.05, Math.min(8, exposure));
  const toneMapper = query.get('toneMap');
  if (isToneMapper(toneMapper)) params.toneMapper = toneMapper;
  const skyIntensity = Number(query.get('skyIntensity'));
  if (query.has('skyIntensity') && Number.isFinite(skyIntensity)) params.skyIntensity = Math.max(0, Math.min(4, skyIntensity));
  const saturation = Number(query.get('saturation'));
  if (query.has('saturation') && Number.isFinite(saturation)) params.colorSaturation = Math.max(0, Math.min(2, saturation));
  const contrast = Number(query.get('contrast'));
  if (query.has('contrast') && Number.isFinite(contrast)) params.colorContrast = Math.max(0.5, Math.min(2, contrast));
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
  applyCameraPreset(currentPreset.camera, orbit);
  document.body.dataset.cloudPreset = currentPresetName;
  document.body.dataset.presetVersion = String(currentPreset.version);
  document.body.dataset.validationMode = String(validationMode);
  document.body.dataset.validationScenario = validationMode ? currentPresetName : 'interactive';
  syncParameterDataset(params, bodyStore.bodies);

  let selectedCloudBody: CloudBody | null = null;
  let gui: ReturnType<typeof createGui> | null = null;
  const gizmo = new CloudGizmo(canvas, () => {
    if (!selectedCloudBody || !gui) return;
    for (const controller of gui.controllersRecursive()) {
      if (controller.object === selectedCloudBody) controller.updateDisplay();
    }
  });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (gizmo.pointerDown(e)) {
      dragging = false;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  const endPointerInteraction = (e: PointerEvent): void => {
    gizmo.pointerUp();
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', endPointerInteraction);
  canvas.addEventListener('pointercancel', endPointerInteraction);
  canvas.addEventListener('pointermove', (e) => {
    if (gizmo.pointerMove(e)) {
      e.preventDefault();
      return;
    }
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

  let windOffset: [number, number] = [0, 0];
  let last = performance.now();
  let time = currentPreset.frozenTime;
  let validationReady = false;
  gui = createGui(params, bodyStore, {
    initialCloudPreset: currentPresetName,
    onCloudPreset(presetName: CloudPresetName) {
      currentPresetName = presetName;
      currentPreset = CLOUD_PRESETS[presetName];
      applyCloudPreset(params, currentPreset);
      applyCloudBodyPreset(bodyStore, currentPreset);
      applyCameraPreset(currentPreset.camera, orbit);
      windOffset = [0, 0];
      time = currentPreset.frozenTime;
      last = performance.now();
      document.body.dataset.cloudPreset = currentPresetName;
      document.body.dataset.presetVersion = String(currentPreset.version);
      document.body.dataset.validationScenario = 'interactive';
      syncParameterDataset(params, bodyStore.bodies);
      const url = new URL(window.location.href);
      url.search = '';
      if (presetName !== 'default') url.searchParams.set('preset', presetName);
      window.history.replaceState(null, '', url);
      for (const controller of gui?.controllersRecursive() ?? []) controller.updateDisplay();
    },
    onCameraPreset(preset) {
      applyCameraPreset(preset, orbit);
    },
    onCloudSelection(body) {
      selectedCloudBody = body;
    },
  });
  if (validationMode) gui.hide();

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    const animationDt = validationMode ? 0 : dt;
    last = now;
    time = validationMode ? currentPreset.frozenTime : time + dt;
    params.sceneTime = time;

    const ang = (params.windAngleDeg * Math.PI) / 180;
    const wx = Math.cos(ang) * params.windSpeed;
    const wz = Math.sin(ang) * params.windSpeed;
    // High clouds keep their independent repeating weather motion. The low
    // cloud weather map is a fixed, finite world field like HP's cloud map.
    windOffset[0] += wx * animationDt * params.highWeatherRepeat;
    windOffset[1] += wz * animationDt * params.highWeatherRepeat;

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
    gizmo.update(cam, validationMode ? null : selectedCloudBody);
    renderer.render(params, bodyStore.bodies, cam, time, windOffset);
    const gpuTiming = renderer.getGpuTimingInfo();
    document.body.dataset.gpuTimingSupported = String(gpuTiming.supported);
    document.body.dataset.gpuSampleCount = String(gpuTiming.sampleCount);
    if (gpuTiming.averageGpuMs !== null) {
      document.body.dataset.gpuMs = gpuTiming.averageGpuMs.toFixed(3);
    }
    if (validationMode && !validationReady) {
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
