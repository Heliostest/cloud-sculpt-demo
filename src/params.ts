export type DebugMode = 'Final' | 'Support' | 'AfterShape' | 'FinalDensity' | 'Weather' | 'DensityCoverage' | 'HighWeather' | 'HighBand' | 'HighDensity';

export type ToneMapper = 'reinhard' | 'aces';

export type CameraPreset = 'side' | 'oblique45' | 'top' | 'hpOcean';

export interface LayerParams {
  enabled: boolean;
  baseKm: number;
  topKm: number;
  densityScale: number;
  detailAmount: number;
}

export interface HeroParams {
  enabled: boolean;
  typeCb: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  baseKm: number;
  thicknessKm: number;
  coverage: number;
  densityMul: number;
}

export interface DemoParams {
  weatherMapCenterX: number;
  weatherMapCenterZ: number;
  weatherMapWorldSizeKm: number;
  windSpeed: number;
  windAngleDeg: number;
  detailStrength: number;
  detailRepeat: number;
  wispyEdgeWidth: number;
  densityThreshold: number;
  wispyReach: number;
  edgeSoftness: number;
  wispyTopHeight: number;
  wispyTopHardness: number;
  bottomSmoothHeight: number;
  bottomSmoothPow: number;
  loCovCoverIntensity: number;
  loCovCoverContrast: number;
  loCovHeightIntensity: number;
  loCovHeightContrast: number;
  cloudTypeOverride: number;
  hpShapeScaleX: number;
  hpShapeScaleY: number;
  hpShapeScaleZ: number;
  hpShapeRotationDeg: number;
  hpShapeWarpScaleKm: number;
  hpShapeWarpStrengthM: number;
  hpShapeSecondaryScaleRatio: number;
  hpShapeSecondaryRotationDeg: number;
  hpShapeSecondaryWeight: number;
  hpDetailScaleX: number;
  hpDetailScaleY: number;
  hpDetailScaleZ: number;
  hpBaseWindSpeed: number;
  hpDetailWindSpeed: number;
  hpDetailVerticalWindSpeed: number;
  billowyLowWeight: number;
  billowyHighWeight: number;
  wispyLowWeight: number;
  wispyHighWeight: number;
  detailStrengthCu: number;
  detailStrengthTcu: number;
  detailStrengthCb: number;
  densityMultiplierCu: number;
  densityMultiplierTcu: number;
  densityMultiplierCb: number;
  densityMultiplier: number;
  loCoverTopStrength: number;
  loCoverTopMax: number;
  loCoverTopCurvePow: number;
  scStrength: number;
  scHeightScale: number;
  scDetailStrength: number;
  scCellThickPow: number;
  scCellThickStrength: number;
  scCellNoiseStrength: number;
  scCoverageIntensity: number;
  scCoverageContrast: number;
  scCellScaleX: number;
  scCellScaleZ: number;
  hiASoftContrast: number;
  hiAConstant: number;
  densityModIntensity: number;
  densityModContrast: number;
  noiseMipOffset: number;
  erosionMipOffset: number;
  forceSimpleMode: boolean;
  detailFadeEnabled: boolean;
  highCloudEnabled: boolean;
  highWeatherRepeat: number;
  highBaseKm: number;
  highTopKm: number;
  highSteps: number;
  highCloudTypeOverride: number;
  highCellScaleX: number;
  highCellScaleZ: number;
  highCellWindSpeed: number;
  highWarpScaleX: number;
  highWarpScaleZ: number;
  highWarpStrength: number;
  highAcCellStrength: number;
  highAsCellStrength: number;
  highCellPow: number;
  highBandBottom: number;
  highBandTop: number;
  highBottomCoverageScale: number;
  highHeightCurvePow: number;
  highDensityThreshold: number;
  highDensitySoftness: number;
  highCloudSoftness: number;
  highWispScaleX: number;
  highWispScaleZ: number;
  highWispStrength: number;
  highDensityMultiplier: number;
  highViewAbsorption: number;
  highLightAbsorption: number;
  highCoverAbsorptionStrength: number;
  highHorizonStartKm: number;
  highHorizonEndKm: number;
  detailOff: boolean;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  hpLightingEnabled: boolean;
  forwardEccentricity: number;
  backwardEccentricity: number;
  msAttenuation: number;
  msContribution: number;
  msEccentricity: number;
  ambientTopMultiplier: number;
  ambientBottomMultiplier: number;
  aoUpwardScale: number;
  scatterSourceODScale: number;
  scatterSourceCurvePow: number;
  layers: [LayerParams, LayerParams, LayerParams];
  hero: HeroParams;
  minPrimaryStep: number;
  maxPrimaryStep: number;
  maxIterations: number;
  lightSteps: number;
  maxRayDistanceKm: number;
  boxHalfKm: number;
  scattering: number;
  extinction: number;
  debugMode: DebugMode;
  exposure: number;
  toneMapper: ToneMapper;
  skyZenithR: number;
  skyZenithG: number;
  skyZenithB: number;
  skyHorizonR: number;
  skyHorizonG: number;
  skyHorizonB: number;
  skyHorizonExponent: number;
  skyIntensity: number;
  colorSaturation: number;
  colorContrast: number;
}

export function createDefaultParams(): DemoParams {
  return {
    // Keep the tuned southwest weather phase while allowing the long view
    // rays to enter the active (non-saturated) HP radial-LUT range.
    weatherMapCenterX: 205000,
    weatherMapCenterZ: 205000,
    weatherMapWorldSizeKm: 500,
    windSpeed: 8,
    windAngleDeg: 35,
    detailStrength: 0.42,
    detailRepeat: 0.0009,
    wispyEdgeWidth: 0.28,
    densityThreshold: 0.0,
    wispyReach: 0.252,
    edgeSoftness: 0.25,
    wispyTopHeight: 0.55,
    wispyTopHardness: 0.22,
    bottomSmoothHeight: 0.14,
    bottomSmoothPow: 1.4,
    loCovCoverIntensity: 1.0,
    loCovCoverContrast: 1.0,
    loCovHeightIntensity: 1.0,
    loCovHeightContrast: 1.0,
    cloudTypeOverride: -1,
    hpShapeScaleX: 0.00011,
    hpShapeScaleY: 0.00011,
    hpShapeScaleZ: 0.00011,
    hpShapeRotationDeg: 0,
    hpShapeWarpScaleKm: 52,
    hpShapeWarpStrengthM: 1000,
    hpShapeSecondaryScaleRatio: 1.618034,
    hpShapeSecondaryRotationDeg: 37,
    hpShapeSecondaryWeight: 0.24,
    hpDetailScaleX: 0.0009,
    hpDetailScaleY: 0.0009,
    hpDetailScaleZ: 0.0009,
    hpBaseWindSpeed: 1.0,
    hpDetailWindSpeed: 1.5,
    hpDetailVerticalWindSpeed: 0.25,
    billowyLowWeight: 0.65,
    billowyHighWeight: 0.35,
    wispyLowWeight: 0.65,
    wispyHighWeight: 0.35,
    detailStrengthCu: 0.85,
    detailStrengthTcu: 1.0,
    detailStrengthCb: 1.2,
    densityMultiplierCu: 1.0,
    densityMultiplierTcu: 1.0,
    densityMultiplierCb: 1.0,
    densityMultiplier: 1.0,
    loCoverTopStrength: 0.0,
    loCoverTopMax: 1.8,
    loCoverTopCurvePow: 1.0,
    scStrength: 0.0,
    scHeightScale: 0.22,
    scDetailStrength: 0.45,
    scCellThickPow: 1.8,
    scCellThickStrength: 0.8,
    scCellNoiseStrength: 1.15,
    scCoverageIntensity: 1.0,
    scCoverageContrast: 1.0,
    scCellScaleX: 4.0,
    scCellScaleZ: 4.0,
    hiASoftContrast: 1.0,
    hiAConstant: 0.0,
    densityModIntensity: 0.0,
    densityModContrast: 1.0,
    noiseMipOffset: 0.0,
    erosionMipOffset: 0.0,
    forceSimpleMode: false,
    detailFadeEnabled: true,
    highCloudEnabled: false,
    highWeatherRepeat: 0.000018,
    highBaseKm: 6.5,
    highTopKm: 10.5,
    highSteps: 96,
    highCloudTypeOverride: -1,
    highCellScaleX: 4.0,
    highCellScaleZ: 4.0,
    highCellWindSpeed: 1.5,
    highWarpScaleX: 1.4,
    highWarpScaleZ: 1.4,
    highWarpStrength: 0.12,
    highAcCellStrength: 0.88,
    highAsCellStrength: 0.32,
    highCellPow: 1.8,
    highBandBottom: 0.2,
    highBandTop: 0.82,
    highBottomCoverageScale: 0.25,
    highHeightCurvePow: 0.8,
    highDensityThreshold: 0.5,
    highDensitySoftness: 0.2,
    highCloudSoftness: 0.055,
    highWispScaleX: 7.0,
    highWispScaleZ: 7.0,
    highWispStrength: 0.28,
    highDensityMultiplier: 0.06,
    highViewAbsorption: 0.012,
    highLightAbsorption: 0.012,
    highCoverAbsorptionStrength: 0.35,
    highHorizonStartKm: 35,
    highHorizonEndKm: 140,
    detailOff: false,
    sunAzimuthDeg: 210,
    sunElevationDeg: 32,
    hpLightingEnabled: false,
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
    layers: [
      {
        enabled: true,
        baseKm: 0.4,
        topKm: 2.8,
        densityScale: 0.85,
        detailAmount: 1.0,
      },
      {
        enabled: false,
        baseKm: 3.0,
        topKm: 5.5,
        densityScale: 0.28,
        detailAmount: 0.4,
      },
      {
        enabled: false,
        baseKm: 7.0,
        topKm: 9.0,
        densityScale: 0.25,
        detailAmount: 0.0,
      },
    ],
    hero: {
      enabled: false,
      typeCb: 1.0,
      cx: 0,
      cz: -2000,
      rx: 1800,
      rz: 1600,
      baseKm: 0.7,
      thicknessKm: 8.5,
      coverage: 0.9,
      densityMul: 1.35,
    },
    minPrimaryStep: 16,
    maxPrimaryStep: 220,
    maxIterations: 512,
    lightSteps: 6,
    maxRayDistanceKm: 250,
    boxHalfKm: 120,
    scattering: 0.09,
    extinction: 0.095,
    debugMode: 'Final',
    exposure: 0.5,
    toneMapper: 'aces',
    skyZenithR: 0.008,
    skyZenithG: 0.10,
    skyZenithB: 0.70,
    skyHorizonR: 0.06,
    skyHorizonG: 0.24,
    skyHorizonB: 0.72,
    skyHorizonExponent: 0.65,
    skyIntensity: 1.6,
    colorSaturation: 1.08,
    colorContrast: 1.0,
  };
}

export const DEBUG_MODE_INDEX: Record<DebugMode, number> = {
  Final: 0,
  Support: 1,
  AfterShape: 2,
  FinalDensity: 3,
  Weather: 4,
  DensityCoverage: 5,
  HighWeather: 6,
  HighBand: 7,
  HighDensity: 8,
};

export function isDebugMode(value: string | null): value is DebugMode {
  return value !== null && value in DEBUG_MODE_INDEX;
}

export const TONE_MAPPER_INDEX: Record<ToneMapper, number> = {
  reinhard: 0,
  aces: 1,
};

export function isToneMapper(value: string | null): value is ToneMapper {
  return value !== null && value in TONE_MAPPER_INDEX;
}
