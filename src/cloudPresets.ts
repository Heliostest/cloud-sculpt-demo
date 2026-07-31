import { createDefaultParams, type CameraPreset, type DebugMode, type DemoParams } from './params';

type HpLightingFixture = Pick<
  DemoParams,
  | 'hpLightingEnabled'
  | 'forwardEccentricity'
  | 'backwardEccentricity'
  | 'msAttenuation'
  | 'msContribution'
  | 'msEccentricity'
  | 'ambientTopMultiplier'
  | 'ambientBottomMultiplier'
  | 'aoUpwardScale'
  | 'scatterSourceODScale'
  | 'scatterSourceCurvePow'
>;

type HpDensityFixture = Pick<
  DemoParams,
  'loCovCoverIntensity' | 'loCovCoverContrast' | 'densityMultiplier'
>;

type HpMorphologyFixture = Pick<
  DemoParams,
  | 'weatherMapCenterX'
  | 'weatherMapCenterZ'
  | 'weatherMapWorldSizeKm'
  | 'hpShapeScaleX'
  | 'hpShapeScaleY'
  | 'hpShapeScaleZ'
  | 'hpShapeRotationDeg'
  | 'hpShapeWarpScaleKm'
  | 'hpShapeWarpStrengthM'
  | 'hpShapeSecondaryScaleRatio'
  | 'hpShapeSecondaryRotationDeg'
  | 'hpShapeSecondaryWeight'
  | 'hpDetailScaleX'
  | 'hpDetailScaleY'
  | 'hpDetailScaleZ'
  | 'detailStrength'
  | 'billowyLowWeight'
  | 'billowyHighWeight'
  | 'wispyLowWeight'
  | 'wispyHighWeight'
  | 'wispyEdgeWidth'
  | 'wispyReach'
  | 'loCoverTopStrength'
  | 'loCoverTopMax'
  | 'loCoverTopCurvePow'
>;

export type CloudPresetName =
  | 'default'
  | 'side-cu'
  | 'oblique-tcu'
  | 'oblique-cb'
  | 'top-density'
  | 'detail-off'
  | 'hp-ocean-day';

export interface CloudPreset {
  label: string;
  version: number;
  camera: CameraPreset;
  debugMode: DebugMode;
  detailOff: boolean;
  cloudTypeOverride: number;
  frozenTime: number;
  sunAzimuthDeg?: number;
  sunElevationDeg?: number;
  exposure?: number;
  highCloudEnabled?: boolean;
  scStrength?: number;
  hpLighting?: HpLightingFixture;
  hpDensity?: HpDensityFixture;
  hpMorphology?: HpMorphologyFixture;
}

export const CLOUD_PRESETS: Record<CloudPresetName, CloudPreset> = {
  default: {
    label: 'Default',
    version: 1,
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: -1,
    frozenTime: 6,
  },
  'side-cu': {
    label: 'Side Cu',
    version: 1,
    camera: 'side',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 0,
    frozenTime: 6,
  },
  'oblique-cb': {
    label: 'Oblique Cb',
    version: 1,
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 1,
    frozenTime: 6,
  },
  'oblique-tcu': {
    label: 'Oblique TCu',
    version: 1,
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 0.5,
    frozenTime: 6,
  },
  'top-density': {
    label: 'Top Density',
    version: 1,
    camera: 'top',
    debugMode: 'FinalDensity',
    detailOff: false,
    cloudTypeOverride: -1,
    frozenTime: 6,
  },
  'detail-off': {
    label: 'Detail Off',
    version: 1,
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: true,
    cloudTypeOverride: -1,
    frozenTime: 6,
  },
  'hp-ocean-day': {
    label: 'HP Ocean Day',
    version: 1,
    camera: 'hpOcean',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: -1,
    frozenTime: 6,
    sunAzimuthDeg: 210,
    sunElevationDeg: 35,
    exposure: 0.45,
    highCloudEnabled: false,
    scStrength: 0.35,
    hpDensity: {
      loCovCoverIntensity: 0.62,
      loCovCoverContrast: 1.5,
      densityMultiplier: 0.6,
    },
    hpMorphology: {
      weatherMapCenterX: 205000,
      weatherMapCenterZ: 205000,
      weatherMapWorldSizeKm: 500,
      hpShapeScaleX: 0.000145,
      hpShapeScaleY: 0.00009,
      hpShapeScaleZ: 0.000145,
      hpShapeRotationDeg: 0,
      hpShapeWarpScaleKm: 52,
      hpShapeWarpStrengthM: 1000,
      hpShapeSecondaryScaleRatio: 1.618034,
      hpShapeSecondaryRotationDeg: 37,
      hpShapeSecondaryWeight: 0.24,
      hpDetailScaleX: 0.0013,
      hpDetailScaleY: 0.00095,
      hpDetailScaleZ: 0.0013,
      detailStrength: 0.5,
      billowyLowWeight: 0.75,
      billowyHighWeight: 0.25,
      wispyLowWeight: 0.55,
      wispyHighWeight: 0.45,
      wispyEdgeWidth: 0.2,
      wispyReach: 0.22,
      loCoverTopStrength: 0,
      loCoverTopMax: 1.8,
      loCoverTopCurvePow: 1,
    },
    hpLighting: {
      hpLightingEnabled: true,
      forwardEccentricity: 0.85,
      backwardEccentricity: 0.3,
      msAttenuation: 0.5,
      msContribution: 0.5,
      msEccentricity: 0.5,
      ambientTopMultiplier: 2.0,
      ambientBottomMultiplier: 1.4,
      aoUpwardScale: 1.0,
      scatterSourceODScale: 0.02,
      scatterSourceCurvePow: 1.0,
    },
  },
};

export const CLOUD_PRESET_OPTIONS = Object.fromEntries(
  Object.entries(CLOUD_PRESETS).map(([name, preset]) => [preset.label, name]),
) as Record<string, CloudPresetName>;

export function isCloudPresetName(value: string | null): value is CloudPresetName {
  return value !== null && value in CLOUD_PRESETS;
}

export interface PresetRequest {
  name: CloudPresetName;
  validation: boolean;
  legacyScenario: boolean;
}

export function resolvePresetRequest(query: URLSearchParams): PresetRequest {
  const legacyScenario = query.get('scenario');
  const requestedPreset = query.get('preset');
  const name = isCloudPresetName(requestedPreset)
    ? requestedPreset
    : isCloudPresetName(legacyScenario)
      ? legacyScenario
      : 'default';
  const validationValue = query.get('validation');
  const validation = isCloudPresetName(legacyScenario)
    || validationValue === '1'
    || validationValue === 'true';
  return {
    name,
    validation,
    legacyScenario: isCloudPresetName(legacyScenario),
  };
}

export function applyCloudPreset(params: DemoParams, preset: CloudPreset): void {
  // Preserve nested object identities because lil-gui controllers bind to them.
  const targetLayers = params.layers;
  const targetHero = params.hero;
  const defaults = createDefaultParams();
  Object.assign(params, defaults, { layers: targetLayers, hero: targetHero });
  for (let i = 0; i < targetLayers.length; i++) {
    Object.assign(targetLayers[i], defaults.layers[i]);
  }
  Object.assign(targetHero, defaults.hero);

  params.debugMode = preset.debugMode;
  params.detailOff = preset.detailOff;
  params.cloudTypeOverride = preset.cloudTypeOverride;
  if (preset.sunAzimuthDeg !== undefined) params.sunAzimuthDeg = preset.sunAzimuthDeg;
  if (preset.sunElevationDeg !== undefined) params.sunElevationDeg = preset.sunElevationDeg;
  if (preset.exposure !== undefined) params.exposure = preset.exposure;
  if (preset.highCloudEnabled !== undefined) params.highCloudEnabled = preset.highCloudEnabled;
  if (preset.scStrength !== undefined) params.scStrength = preset.scStrength;
  if (preset.hpLighting !== undefined) Object.assign(params, preset.hpLighting);
  if (preset.hpDensity !== undefined) Object.assign(params, preset.hpDensity);
  if (preset.hpMorphology !== undefined) Object.assign(params, preset.hpMorphology);
}
