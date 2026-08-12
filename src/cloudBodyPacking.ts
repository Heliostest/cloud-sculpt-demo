import type { CloudBody } from './cloudBodies';
import { CLOUD_GENUS_INDEX, MAX_VOLUME_CLOUD_BODIES } from './params';

export const CLOUD_BODY_FLOATS_PER_RECORD_SET = 8 * 4;
export const CLOUD_BODY_FLOAT_COUNT = MAX_VOLUME_CLOUD_BODIES * CLOUD_BODY_FLOATS_PER_RECORD_SET;

export function selectVolumeCloudBodies(bodies: readonly CloudBody[]): CloudBody[] {
  return bodies
    .filter((body) => body.enabled && body.path === 'volume')
    .slice(0, MAX_VOLUME_CLOUD_BODIES);
}

export function packVolumeCloudBodies(
  bodies: readonly CloudBody[],
  target = new Float32Array(CLOUD_BODY_FLOAT_COUNT),
): Float32Array {
  if (target.length < CLOUD_BODY_FLOAT_COUNT) {
    throw new Error(`Cloud-body target requires at least ${CLOUD_BODY_FLOAT_COUNT} floats.`);
  }
  target.fill(0);
  const volumeBodies = selectVolumeCloudBodies(bodies);
  for (let bodyIndex = 0; bodyIndex < volumeBodies.length; bodyIndex++) {
    const body = volumeBodies[bodyIndex];
    const recordOffset = bodyIndex * 4;
    target[recordOffset] = body.baseKm * 1000;
    target[recordOffset + 1] = body.topKm * 1000;
    target[recordOffset + 2] = body.densityScale;
    target[recordOffset + 3] = 1;

    const shapeOffset = (MAX_VOLUME_CLOUD_BODIES + bodyIndex) * 4;
    target[shapeOffset] = CLOUD_GENUS_INDEX[body.genus];
    target[shapeOffset + 1] = body.detailAmount;
    target[shapeOffset + 2] = body.cumulusDevelopment;
    target[shapeOffset + 3] = body.lifePeak;

    const boundsOffset = (MAX_VOLUME_CLOUD_BODIES * 2 + bodyIndex) * 4;
    target[boundsOffset] = body.centerX;
    target[boundsOffset + 1] = body.centerZ;
    target[boundsOffset + 2] = Math.max(1, body.radiusX);
    target[boundsOffset + 3] = Math.max(1, body.radiusZ);

    const transformOffset = (MAX_VOLUME_CLOUD_BODIES * 3 + bodyIndex) * 4;
    target[transformOffset] = (body.rotationDeg * Math.PI) / 180;
    target[transformOffset + 1] = Math.min(0.95, Math.max(0.001, body.feather));
    target[transformOffset + 2] = body.bounded ? 1 : 0;
    target[transformOffset + 3] = body.lifeStart;

    const motionOffset = (MAX_VOLUME_CLOUD_BODIES * 4 + bodyIndex) * 4;
    const windAngle = (body.windDeg * Math.PI) / 180;
    target[motionOffset] = Math.cos(windAngle) * body.windSpeedMps;
    target[motionOffset + 1] = Math.sin(windAngle) * body.windSpeedMps;
    target[motionOffset + 2] = body.morphRate;
    target[motionOffset + 3] = body.lifeEnabled ? 1 : 0;

    const lifeOffset = (MAX_VOLUME_CLOUD_BODIES * 5 + bodyIndex) * 4;
    target[lifeOffset] = body.lifeBirth;
    target[lifeOffset + 1] = body.lifeGrow;
    target[lifeOffset + 2] = body.lifeDecay;
    target[lifeOffset + 3] = body.lifeDeath;

    const morphology0Offset = (MAX_VOLUME_CLOUD_BODIES * 6 + bodyIndex) * 4;
    target[morphology0Offset] = body.morphology.verticalDevelopment;
    target[morphology0Offset + 1] = body.morphology.cellScale;
    target[morphology0Offset + 2] = body.morphology.cellStrength;
    target[morphology0Offset + 3] = body.morphology.sheetUniformity;

    const morphology1Offset = (MAX_VOLUME_CLOUD_BODIES * 7 + bodyIndex) * 4;
    target[morphology1Offset] = body.morphology.fiberStrength;
    target[morphology1Offset + 1] = (body.morphology.fiberAngleDeg * Math.PI) / 180;
    target[morphology1Offset + 2] = body.morphology.anvilStrength;
    target[morphology1Offset + 3] = body.morphology.erosionScale;
  }
  return target;
}
