export type DebugMode = 'Final' | 'Support' | 'AfterShape' | 'FinalDensity' | 'Weather';

export type CameraPreset = 'side' | 'oblique45' | 'top';

export interface LayerParams {
  enabled: boolean;
  baseKm: number;
  topKm: number;
  densityScale: number;
  shapeAmount: number;
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
  coverage: number;
  weatherExponent: number;
  mesoStrength: number;
  mesoContrast: number;
  weatherRepeat: number;
  windSpeed: number;
  windAngleDeg: number;
  shapeAmount: number;
  shapeRepeat: number;
  detailStrength: number;
  detailRepeat: number;
  wispyEdgeWidth: number;
  detailOff: boolean;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
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
}

export function createDefaultParams(): DemoParams {
  return {
    coverage: 0.55,
    weatherExponent: 1.2,
    mesoStrength: 0.65,
    mesoContrast: 1.4,
    weatherRepeat: 0.00008,
    windSpeed: 8,
    windAngleDeg: 35,
    shapeAmount: 0.85,
    shapeRepeat: 0.00035,
    detailStrength: 0.55,
    detailRepeat: 0.0022,
    wispyEdgeWidth: 0.12,
    detailOff: false,
    sunAzimuthDeg: 210,
    sunElevationDeg: 32,
    layers: [
      {
        enabled: true,
        baseKm: 0.6,
        topKm: 2.5,
        densityScale: 1.0,
        shapeAmount: 1.0,
        detailAmount: 1.0,
      },
      {
        enabled: true,
        baseKm: 3.0,
        topKm: 5.5,
        densityScale: 0.55,
        shapeAmount: 0.75,
        detailAmount: 0.6,
      },
      {
        enabled: false,
        baseKm: 7.0,
        topKm: 9.0,
        densityScale: 0.25,
        shapeAmount: 0.35,
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
    minPrimaryStep: 60,
    maxPrimaryStep: 600,
    maxIterations: 384,
    lightSteps: 7,
    maxRayDistanceKm: 60,
    boxHalfKm: 12,
    scattering: 0.9,
    extinction: 1.15,
    debugMode: 'Final',
    exposure: 1.1,
  };
}

export const DEBUG_MODE_INDEX: Record<DebugMode, number> = {
  Final: 0,
  Support: 1,
  AfterShape: 2,
  FinalDensity: 3,
  Weather: 4,
};
