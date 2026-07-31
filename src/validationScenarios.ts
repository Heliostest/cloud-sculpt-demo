import type { CameraPreset, DebugMode, DemoParams, DensityModel } from './params';

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

export type ValidationScenarioName =
  | 'side-cu'
  | 'oblique-tcu'
  | 'oblique-cb'
  | 'top-density'
  | 'detail-off'
  | 'hp-ocean-day';

export interface ValidationScenario {
  camera: CameraPreset;
  debugMode: DebugMode;
  detailOff: boolean;
  cloudTypeOverride: number;
  frozenTime: number;
  densityModel: DensityModel;
  sunAzimuthDeg?: number;
  sunElevationDeg?: number;
  exposure?: number;
  highCloudEnabled?: boolean;
  scStrength?: number;
  hpLighting?: HpLightingFixture;
  hpDensity?: HpDensityFixture;
  hpMorphology?: HpMorphologyFixture;
}

export const VALIDATION_SCENARIOS: Record<ValidationScenarioName, ValidationScenario> = {
  'side-cu': {
    camera: 'side',
    densityModel: 'hpLowCloud',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 0,
    frozenTime: 6,
  },
  'oblique-cb': {
    camera: 'oblique45',
    densityModel: 'hpLowCloud',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 1,
    frozenTime: 6,
  },
  'oblique-tcu': {
    camera: 'oblique45',
    densityModel: 'hpLowCloud',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 0.5,
    frozenTime: 6,
  },
  'top-density': {
    camera: 'top',
    densityModel: 'hpLowCloud',
    debugMode: 'FinalDensity',
    detailOff: false,
    cloudTypeOverride: -1,
    frozenTime: 6,
  },
  'detail-off': {
    camera: 'oblique45',
    densityModel: 'hpLowCloud',
    debugMode: 'Final',
    detailOff: true,
    cloudTypeOverride: -1,
    frozenTime: 6,
  },
  'hp-ocean-day': {
    camera: 'hpOcean',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: -1,
    frozenTime: 6,
    densityModel: 'hpLowCloud',
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

export function isValidationScenarioName(value: string | null): value is ValidationScenarioName {
  return value !== null && value in VALIDATION_SCENARIOS;
}

export function applyValidationScenario(params: DemoParams, scenario: ValidationScenario): void {
  params.debugMode = scenario.debugMode;
  params.detailOff = scenario.detailOff;
  params.cloudTypeOverride = scenario.cloudTypeOverride;
  params.windSpeed = 0;
  params.densityModel = scenario.densityModel;
  if (scenario.sunAzimuthDeg !== undefined) params.sunAzimuthDeg = scenario.sunAzimuthDeg;
  if (scenario.sunElevationDeg !== undefined) params.sunElevationDeg = scenario.sunElevationDeg;
  if (scenario.exposure !== undefined) params.exposure = scenario.exposure;
  if (scenario.highCloudEnabled !== undefined) params.highCloudEnabled = scenario.highCloudEnabled;
  if (scenario.scStrength !== undefined) params.scStrength = scenario.scStrength;
  if (scenario.hpLighting !== undefined) Object.assign(params, scenario.hpLighting);
  if (scenario.hpDensity !== undefined) Object.assign(params, scenario.hpDensity);
  if (scenario.hpMorphology !== undefined) Object.assign(params, scenario.hpMorphology);
}
