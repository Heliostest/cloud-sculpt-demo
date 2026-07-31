import GUI from 'lil-gui';
import type { CameraPreset, DemoParams } from './params';

export function createGui(
  params: DemoParams,
  hooks: {
    onPreset: (p: CameraPreset) => void;
  },
): GUI {
  const gui = new GUI({ title: 'Cloud Sculpt' });

  const alignment = gui.addFolder('HP Alignment');
  alignment.add(params, 'densityThreshold', 0, 0.5, 0.005);
  alignment.add(params, 'wispyReach', 0, 0.5, 0.005);
  alignment.add(params, 'edgeSoftness', 0.001, 0.5, 0.005);
  alignment.add(params, 'wispyTopHeight', 0, 0.99, 0.01);
  alignment.add(params, 'wispyTopHardness', 0.001, 1, 0.005);
  alignment.add(params, 'bottomSmoothHeight', 0, 0.5, 0.005);
  alignment.add(params, 'bottomSmoothPow', 0.01, 4, 0.01);
  alignment.add(params, 'loCovCoverIntensity', 0, 3, 0.01);
  alignment.add(params, 'loCovCoverContrast', 0.01, 4, 0.01);
  alignment.add(params, 'loCovHeightIntensity', 0, 3, 0.01);
  alignment.add(params, 'loCovHeightContrast', 0.01, 4, 0.01);
  const hpNoise = alignment.addFolder('HP Noise');
  hpNoise.add(params, 'hpShapeScaleX', 0.00001, 0.003, 0.00001);
  hpNoise.add(params, 'hpShapeScaleY', 0.00001, 0.003, 0.00001);
  hpNoise.add(params, 'hpShapeScaleZ', 0.00001, 0.003, 0.00001);
  hpNoise.add(params, 'hpShapeRotationDeg', -90, 90, 1);
  hpNoise.add(params, 'hpShapeWarpScaleKm', 8, 200, 1);
  hpNoise.add(params, 'hpShapeWarpStrengthM', 0, 5000, 50);
  hpNoise.add(params, 'hpShapeSecondaryScaleRatio', 0.25, 3, 0.001).name('shape second ratio');
  hpNoise.add(params, 'hpShapeSecondaryRotationDeg', -180, 180, 1).name('shape second rotation');
  hpNoise.add(params, 'hpShapeSecondaryWeight', 0, 0.6, 0.01).name('shape second weight');
  hpNoise.add(params, 'hpDetailScaleX', 0.0001, 0.02, 0.0001);
  hpNoise.add(params, 'hpDetailScaleY', 0.0001, 0.02, 0.0001);
  hpNoise.add(params, 'hpDetailScaleZ', 0.0001, 0.02, 0.0001);
  hpNoise.add(params, 'hpBaseWindSpeed', 0, 4, 0.01);
  hpNoise.add(params, 'hpDetailWindSpeed', 0, 4, 0.01);
  hpNoise.add(params, 'hpDetailVerticalWindSpeed', -5, 5, 0.01);
  hpNoise.add(params, 'billowyLowWeight', 0, 2, 0.01);
  hpNoise.add(params, 'billowyHighWeight', 0, 2, 0.01);
  hpNoise.add(params, 'wispyLowWeight', 0, 2, 0.01);
  hpNoise.add(params, 'wispyHighWeight', 0, 2, 0.01);
  const hpTypes = alignment.addFolder('HP Types/Profile');
  hpTypes.add(params, 'detailStrengthCu', 0, 3, 0.01);
  hpTypes.add(params, 'detailStrengthTcu', 0, 3, 0.01);
  hpTypes.add(params, 'detailStrengthCb', 0, 3, 0.01);
  hpTypes.add(params, 'densityMultiplierCu', 0, 3, 0.01);
  hpTypes.add(params, 'densityMultiplierTcu', 0, 3, 0.01);
  hpTypes.add(params, 'densityMultiplierCb', 0, 3, 0.01);
  hpTypes.add(params, 'densityMultiplier', 0, 4, 0.01);
  hpTypes.add(params, 'loCoverTopStrength', 0, 1, 0.01);
  hpTypes.add(params, 'loCoverTopMax', 1, 4, 0.01);
  hpTypes.add(params, 'loCoverTopCurvePow', 0.01, 4, 0.01);
  const hpSc = alignment.addFolder('HP Sc');
  hpSc.add(params, 'scStrength', 0, 1, 0.01);
  hpSc.add(params, 'scHeightScale', 0.01, 1, 0.01);
  hpSc.add(params, 'scDetailStrength', 0, 3, 0.01);
  hpSc.add(params, 'scCellThickPow', 0.01, 4, 0.01);
  hpSc.add(params, 'scCellThickStrength', 0, 1, 0.01);
  hpSc.add(params, 'scCellNoiseStrength', 0, 3, 0.01);
  hpSc.add(params, 'scCoverageIntensity', 0, 3, 0.01);
  hpSc.add(params, 'scCoverageContrast', 0.01, 4, 0.01);
  hpSc.add(params, 'scCellScaleX', 0.1, 16, 0.1);
  hpSc.add(params, 'scCellScaleZ', 0.1, 16, 0.1);
  const hpPost = alignment.addFolder('HP Density Post');
  hpPost.add(params, 'hiAConstant', 0, 1, 0.01);
  hpPost.add(params, 'hiASoftContrast', 0.01, 4, 0.01);
  hpPost.add(params, 'densityModIntensity', 0, 1, 0.01);
  hpPost.add(params, 'densityModContrast', 0.01, 4, 0.01);
  const hpLod = alignment.addFolder('HP LOD');
  hpLod.add(params, 'noiseMipOffset', 0, 7, 0.1);
  hpLod.add(params, 'erosionMipOffset', 0, 6, 0.1);
  hpLod.add(params, 'forceSimpleMode');
  hpLod.add(params, 'detailFadeEnabled');

  const high = gui.addFolder('HP High Cloud (Ac / As)');
  high.add(params, 'highCloudEnabled');
  high.add(params, 'highCloudTypeOverride', -1, 1, 0.01).name('type override');
  high.add(params, 'highWeatherRepeat', 0.000005, 0.00008, 0.000001);
  high.add(params, 'highBaseKm', 3, 14, 0.1);
  high.add(params, 'highTopKm', 4, 18, 0.1);
  high.add(params, 'highSteps', 8, 192, 1);
  high.add(params, 'highBandBottom', 0, 1, 0.01);
  high.add(params, 'highBandTop', 0, 1, 0.01);
  high.add(params, 'highBottomCoverageScale', 0, 1, 0.01);
  high.add(params, 'highHeightCurvePow', 0.05, 4, 0.01);
  high.add(params, 'highDensityThreshold', 0, 1, 0.01);
  high.add(params, 'highDensitySoftness', 0.001, 1, 0.01);
  high.add(params, 'highCloudSoftness', 0.001, 0.3, 0.001);
  high.add(params, 'highDensityMultiplier', 0, 3, 0.01);
  high.add(params, 'highViewAbsorption', 0, 0.1, 0.001).name('view absorption');
  high.add(params, 'highLightAbsorption', 0, 0.1, 0.001).name('light absorption');
  high.add(params, 'highCoverAbsorptionStrength', 0, 2, 0.01).name('cover shadow');
  const highCell = high.addFolder('Cell / Warp / Wisp');
  highCell.add(params, 'highCellScaleX', 0.1, 16, 0.1);
  highCell.add(params, 'highCellScaleZ', 0.1, 16, 0.1);
  highCell.add(params, 'highCellWindSpeed', 0, 4, 0.01);
  highCell.add(params, 'highWarpScaleX', 0.1, 8, 0.1);
  highCell.add(params, 'highWarpScaleZ', 0.1, 8, 0.1);
  highCell.add(params, 'highWarpStrength', 0, 0.5, 0.005);
  highCell.add(params, 'highAcCellStrength', 0, 1, 0.01);
  highCell.add(params, 'highAsCellStrength', 0, 1, 0.01);
  highCell.add(params, 'highCellPow', 0.05, 4, 0.01);
  highCell.add(params, 'highWispScaleX', 0.1, 16, 0.1);
  highCell.add(params, 'highWispScaleZ', 0.1, 16, 0.1);
  highCell.add(params, 'highWispStrength', 0, 1, 0.01);
  highCell.add(params, 'highHorizonStartKm', 0, 250, 1);
  highCell.add(params, 'highHorizonEndKm', 1, 400, 1);

  const weather = gui.addFolder('Weather');
  weather.add(params, 'weatherMapCenterX', -500000, 500000, 1000).name('map center X (m)');
  weather.add(params, 'weatherMapCenterZ', -500000, 500000, 1000).name('map center Z (m)');
  weather.add(params, 'weatherMapWorldSizeKm', 20, 1000, 10).name('map world size (km)');
  weather.add(params, 'windSpeed', 0, 40, 0.1);
  weather.add(params, 'windAngleDeg', 0, 360, 1);
  weather.add(params, 'cloudTypeOverride', -1, 1, 0.01).name('type override');

  const sculpt = gui.addFolder('Sculpt');
  sculpt.add(params, 'detailStrength', 0, 1.5, 0.01);
  sculpt.add(params, 'detailRepeat', 0.0005, 0.01, 0.0001);
  sculpt.add(params, 'wispyEdgeWidth', 0.01, 0.4, 0.01);
  sculpt.add(params, 'detailOff');

  const sun = gui.addFolder('Sun');
  sun.add(params, 'sunAzimuthDeg', 0, 360, 1);
  sun.add(params, 'sunElevationDeg', 5, 80, 1);

  const post = gui.addFolder('HP Sky / HDR Post');
  post.add(params, 'toneMapper', ['aces', 'reinhard']);
  post.add(params, 'exposure', 0.05, 4, 0.01);
  post.add(params, 'skyIntensity', 0, 3, 0.01);
  post.add(params, 'skyHorizonExponent', 0.05, 3, 0.01);
  post.add(params, 'colorSaturation', 0, 2, 0.01);
  post.add(params, 'colorContrast', 0.5, 2, 0.01);
  const skyZenith = post.addFolder('Zenith RGB (linear)');
  skyZenith.add(params, 'skyZenithR', 0, 2, 0.001);
  skyZenith.add(params, 'skyZenithG', 0, 2, 0.001);
  skyZenith.add(params, 'skyZenithB', 0, 2, 0.001);
  const skyHorizon = post.addFolder('Horizon RGB (linear)');
  skyHorizon.add(params, 'skyHorizonR', 0, 2, 0.001);
  skyHorizon.add(params, 'skyHorizonG', 0, 2, 0.001);
  skyHorizon.add(params, 'skyHorizonB', 0, 2, 0.001);

  const hpLighting = gui.addFolder('HP Low-Cloud Lighting');
  hpLighting.add(params, 'hpLightingEnabled');
  hpLighting.add(params, 'forwardEccentricity', 0, 0.95, 0.01);
  hpLighting.add(params, 'backwardEccentricity', 0, 0.7, 0.01);
  hpLighting.add(params, 'msAttenuation', 0.05, 1, 0.01);
  hpLighting.add(params, 'msContribution', 0, 1, 0.01);
  hpLighting.add(params, 'msEccentricity', 0.05, 1, 0.01);
  hpLighting.add(params, 'ambientTopMultiplier', 0, 4, 0.05);
  hpLighting.add(params, 'ambientBottomMultiplier', 0, 2, 0.05);
  hpLighting.add(params, 'aoUpwardScale', 0, 3, 0.05);
  hpLighting.add(params, 'scatterSourceODScale', 0.005, 0.3, 0.005);
  hpLighting.add(params, 'scatterSourceCurvePow', 0.1, 4, 0.05);

  const layers = gui.addFolder('Generic 3D Layers (not HP High)');
  for (let i = 0; i < params.layers.length; i++) {
    const L = params.layers[i];
    const f = layers.addFolder(`L${i}`);
    f.add(L, 'enabled');
    f.add(L, 'baseKm', 0.2, 10, 0.05);
    f.add(L, 'topKm', 0.5, 12, 0.05);
    f.add(L, 'densityScale', 0, 2, 0.01);
    f.add(L, 'detailAmount', 0, 1.5, 0.01);
  }

  const hero = gui.addFolder('Hero');
  hero.add(params.hero, 'enabled');
  hero.add(params.hero, 'typeCb', 0, 1, 0.01).name('Cu→Cb');
  hero.add(params.hero, 'coverage', 0, 1, 0.01);
  hero.add(params.hero, 'densityMul', 0.2, 2.5, 0.01);

  const quality = gui.addFolder('Quality');
  quality.add(params, 'minPrimaryStep', 20, 200, 1);
  quality.add(params, 'maxPrimaryStep', 200, 1200, 1);
  quality.add(params, 'maxIterations', 64, 512, 1);
  quality.add(params, 'lightSteps', 4, 8, 1);
  quality.add(params, 'exposure', 0.2, 3, 0.01);

  gui.add(params, 'debugMode', ['Final', 'Support', 'AfterShape', 'FinalDensity', 'Weather', 'DensityCoverage', 'HighWeather', 'HighBand', 'HighDensity']);

  const cam = {
    side: () => hooks.onPreset('side'),
    oblique45: () => hooks.onPreset('oblique45'),
    top: () => hooks.onPreset('top'),
    hpOcean: () => hooks.onPreset('hpOcean'),
  };
  const camFolder = gui.addFolder('Camera');
  camFolder.add(cam, 'side').name('侧视');
  camFolder.add(cam, 'oblique45').name('斜俯45');
  camFolder.add(cam, 'top').name('正俯');
  camFolder.add(cam, 'hpOcean').name('HP 海面基线');

  return gui;
}
