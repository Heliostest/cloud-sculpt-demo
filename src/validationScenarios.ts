import type { CameraPreset, DebugMode, DemoParams } from './params';

export type ValidationScenarioName = 'side-cu' | 'oblique-tcu' | 'oblique-cb' | 'top-density' | 'detail-off';

export interface ValidationScenario {
  camera: CameraPreset;
  debugMode: DebugMode;
  detailOff: boolean;
  cloudTypeOverride: number;
  frozenTime: number;
}

export const VALIDATION_SCENARIOS: Record<ValidationScenarioName, ValidationScenario> = {
  'side-cu': {
    camera: 'side',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 0,
    frozenTime: 6,
  },
  'oblique-cb': {
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 1,
    frozenTime: 6,
  },
  'oblique-tcu': {
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: false,
    cloudTypeOverride: 0.5,
    frozenTime: 6,
  },
  'top-density': {
    camera: 'top',
    debugMode: 'FinalDensity',
    detailOff: false,
    cloudTypeOverride: -1,
    frozenTime: 6,
  },
  'detail-off': {
    camera: 'oblique45',
    debugMode: 'Final',
    detailOff: true,
    cloudTypeOverride: -1,
    frozenTime: 6,
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
}
