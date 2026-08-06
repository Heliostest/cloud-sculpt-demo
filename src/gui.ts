import GUI, { Controller } from 'lil-gui';
import { CLOUD_GENERA, HIGH_CLOUD_GENERA, type CameraPreset, type DemoParams } from './params';
import { CLOUD_PRESET_OPTIONS, type CloudPresetName } from './cloudPresets';
import {
  cloudGenusOptions,
  cloudPresetOptions,
  debugModeOptions,
  folderLabel,
  folderTip,
  getLang,
  parameterLabel,
  parameterTip,
  setLang,
  uiText,
  type Lang,
} from './i18n';

interface LocalizedFolder {
  gui: GUI;
  key: string;
}

function helpMark(tip: string): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = 'gui-help';
  mark.textContent = 'ⓘ';
  mark.title = tip;
  mark.setAttribute('aria-label', tip);
  return mark;
}

export function createGui(
  params: DemoParams,
  hooks: {
    initialCloudPreset: CloudPresetName;
    onCloudPreset: (preset: CloudPresetName) => void;
    onCameraPreset: (preset: CameraPreset) => void;
  },
): GUI {
  const gui = new GUI({ title: uiText('title'), closeFolders: true });
  const localizedFolders: LocalizedFolder[] = [];
  const genusControllers: Controller[] = [];
  const debugModes = ['Final', 'Support', 'AfterShape', 'FinalDensity', 'Weather', 'DensityCoverage', 'HighWeather', 'HighBand', 'HighDensity'] as const;
  const presetNames = Object.values(CLOUD_PRESET_OPTIONS);
  const addFolder = (parent: GUI, key: string): GUI => {
    const folder = parent.addFolder(folderLabel(key));
    localizedFolders.push({ gui: folder, key });
    return folder;
  };
  const presetSelection = { preset: hooks.initialCloudPreset };
  const presetController = gui.add(presetSelection, 'preset', cloudPresetOptions(presetNames))
    .onChange((value: string) => hooks.onCloudPreset(value as CloudPresetName));

  const alignment = addFolder(gui, 'alignment');
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
  const hpNoise = addFolder(alignment, 'hpNoise');
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
  const hpTypes = addFolder(alignment, 'hpTypes');
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
  const hpSc = addFolder(alignment, 'hpSc');
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
  const hpPost = addFolder(alignment, 'hpDensityPost');
  hpPost.add(params, 'hiAConstant', 0, 1, 0.01);
  hpPost.add(params, 'hiASoftContrast', 0.01, 4, 0.01);
  hpPost.add(params, 'densityModIntensity', 0, 1, 0.01);
  hpPost.add(params, 'densityModContrast', 0.01, 4, 0.01);
  const hpLod = addFolder(alignment, 'hpLod');
  hpLod.add(params, 'noiseMipOffset', 0, 7, 0.1);
  hpLod.add(params, 'erosionMipOffset', 0, 6, 0.1);
  hpLod.add(params, 'forceSimpleMode');
  hpLod.add(params, 'detailFadeEnabled');

  const high = addFolder(gui, 'highCloud');
  high.add(params, 'highCloudEnabled');
  const highCloudGenusController = high.add(params, 'highCloudGenus', cloudGenusOptions(HIGH_CLOUD_GENERA));
  genusControllers.push(highCloudGenusController);
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
  const highCell = addFolder(high, 'highCell');
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

  const weather = addFolder(gui, 'weather');
  weather.add(params, 'weatherMapCenterX', -500000, 500000, 1000);
  weather.add(params, 'weatherMapCenterZ', -500000, 500000, 1000);
  weather.add(params, 'weatherMapWorldSizeKm', 20, 1000, 10);
  weather.add(params, 'windSpeed', 0, 40, 0.1);
  weather.add(params, 'windAngleDeg', 0, 360, 1);

  const sculpt = addFolder(gui, 'sculpt');
  sculpt.add(params, 'detailStrength', 0, 1.5, 0.01);
  sculpt.add(params, 'detailRepeat', 0.0005, 0.01, 0.0001);
  sculpt.add(params, 'wispyEdgeWidth', 0.01, 0.4, 0.01);
  sculpt.add(params, 'detailOff');

  const sun = addFolder(gui, 'sun');
  sun.add(params, 'sunAzimuthDeg', 0, 360, 1);
  sun.add(params, 'sunElevationDeg', 5, 80, 1);

  const post = addFolder(gui, 'post');
  post.add(params, 'toneMapper', ['aces', 'reinhard']);
  post.add(params, 'exposure', 0.05, 4, 0.01);
  post.add(params, 'skyIntensity', 0, 3, 0.01);
  post.add(params, 'skyHorizonExponent', 0.05, 3, 0.01);
  post.add(params, 'colorSaturation', 0, 2, 0.01);
  post.add(params, 'colorContrast', 0.5, 2, 0.01);
  const skyZenith = addFolder(post, 'zenith');
  skyZenith.add(params, 'skyZenithR', 0, 2, 0.001);
  skyZenith.add(params, 'skyZenithG', 0, 2, 0.001);
  skyZenith.add(params, 'skyZenithB', 0, 2, 0.001);
  const skyHorizon = addFolder(post, 'horizon');
  skyHorizon.add(params, 'skyHorizonR', 0, 2, 0.001);
  skyHorizon.add(params, 'skyHorizonG', 0, 2, 0.001);
  skyHorizon.add(params, 'skyHorizonB', 0, 2, 0.001);

  const hpLighting = addFolder(gui, 'hpLighting');
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

  const layers = addFolder(gui, 'layers');
  for (let i = 0; i < params.layers.length; i++) {
    const L = params.layers[i];
    const f = layers.addFolder(`L${i}`);
    f.add(L, 'enabled');
    genusControllers.push(f.add(L, 'genus', cloudGenusOptions(CLOUD_GENERA)));
    f.add(L, 'cumulusDevelopment', 0, 1, 0.01);
    f.add(L, 'baseKm', 0.2, 10, 0.05);
    f.add(L, 'topKm', 0.5, 12, 0.05);
    f.add(L, 'densityScale', 0, 2, 0.01);
    f.add(L, 'detailAmount', 0, 1.5, 0.01);
  }

  const hero = addFolder(gui, 'hero');
  hero.add(params.hero, 'enabled');
  genusControllers.push(hero.add(params.hero, 'genus', cloudGenusOptions(CLOUD_GENERA)));
  hero.add(params.hero, 'cumulusDevelopment', 0, 1, 0.01);
  hero.add(params.hero, 'coverage', 0, 1, 0.01);
  hero.add(params.hero, 'densityMul', 0.2, 2.5, 0.01);

  const quality = addFolder(gui, 'quality');
  quality.add(params, 'minPrimaryStep', 20, 200, 1);
  quality.add(params, 'maxPrimaryStep', 200, 1200, 1);
  quality.add(params, 'maxIterations', 64, 512, 1);
  quality.add(params, 'lightSteps', 4, 8, 1);
  quality.add(params, 'exposure', 0.2, 3, 0.01);

  const debugController = gui.add(params, 'debugMode', debugModeOptions(debugModes));

  const cam = {
    side: () => hooks.onCameraPreset('side'),
    oblique45: () => hooks.onCameraPreset('oblique45'),
    top: () => hooks.onCameraPreset('top'),
    hpOcean: () => hooks.onCameraPreset('hpOcean'),
  };
  const camFolder = addFolder(gui, 'camera');
  camFolder.add(cam, 'side');
  camFolder.add(cam, 'oblique45');
  camFolder.add(cam, 'top');
  camFolder.add(cam, 'hpOcean');

  const titleText = document.createElement('span');
  titleText.className = 'gui-title-text';
  const titleHelp = helpMark(uiText('helpHint'));
  const langSelect = document.createElement('select');
  langSelect.className = 'gui-language';
  for (const [label, value] of [['English', 'en'], ['中文', 'zh']] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    langSelect.appendChild(option);
  }
  langSelect.addEventListener('click', (event) => event.stopPropagation());
  gui.$title.textContent = '';
  gui.$title.append(titleText, titleHelp, langSelect);

  const applyLanguage = (): void => {
    document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
    titleText.textContent = uiText('title');
    titleHelp.title = uiText('helpHint');
    titleHelp.setAttribute('aria-label', uiText('helpHint'));
    langSelect.value = getLang();
    langSelect.title = uiText('language');
    langSelect.setAttribute('aria-label', uiText('language'));

    presetController.options(cloudPresetOptions(presetNames));
    for (const controller of genusControllers) {
      const values = controller === highCloudGenusController ? HIGH_CLOUD_GENERA : CLOUD_GENERA;
      controller.options(cloudGenusOptions(values));
    }
    debugController.options(debugModeOptions(debugModes));

    for (const controller of gui.controllersRecursive()) {
      const tip = parameterTip(controller.property);
      controller.name(parameterLabel(controller.property));
      controller.domElement.title = tip;
      controller.$name.appendChild(helpMark(tip));
    }
    for (const item of localizedFolders) {
      const tip = folderTip(item.key);
      item.gui.title(folderLabel(item.key));
      item.gui.$title.title = tip;
      item.gui.$title.appendChild(helpMark(tip));
    }
  };

  langSelect.addEventListener('change', () => {
    setLang(langSelect.value as Lang);
    applyLanguage();
  });
  applyLanguage();

  return gui;
}
