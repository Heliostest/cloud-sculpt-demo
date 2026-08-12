import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compileTypeScriptUrl(relativePath, replacements = {}) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  let source = await readFile(sourceUrl, 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const paramsUrl = await compileTypeScriptUrl('../src/params.ts');
const bodiesUrl = await compileTypeScriptUrl('../src/cloudBodies.ts', {
  "from './params'": `from '${paramsUrl}'`,
});
const packingUrl = await compileTypeScriptUrl('../src/cloudBodyPacking.ts', {
  "from './params'": `from '${paramsUrl}'`,
  "from './cloudBodies'": `from '${bodiesUrl}'`,
});
const { CLOUD_GENUS_INDEX, MAX_VOLUME_CLOUD_BODIES, createDefaultParams } = await import(paramsUrl);
const { CloudBodyStore } = await import(bodiesUrl);
const {
  CLOUD_BODY_FLOAT_COUNT,
  CLOUD_BODY_FLOATS_PER_RECORD_SET,
  packVolumeCloudBodies,
  selectVolumeCloudBodies,
} = await import(packingUrl);

test('GPU records are packed from active object order', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const first = store.active()[0];
  const second = store.duplicate(first.id);
  second.genus = 'stratocumulus';
  second.baseKm = 1.7;
  second.topKm = 3.9;
  second.centerX = 24000;
  second.windDeg = 90;
  second.windSpeedMps = 12;
  second.morphology.verticalDevelopment = 0.25;
  second.morphology.cellScale = 1.4;
  second.morphology.fiberStrength = 0.65;
  second.morphology.fiberAngleDeg = 90;

  store.remove(first.id);
  assert.equal('rendererSlot' in second, false);
  assert.deepEqual(selectVolumeCloudBodies(store.bodies).map((body) => body.id), [second.id]);

  const packed = packVolumeCloudBodies(store.bodies);
  assert.equal(packed.length, CLOUD_BODY_FLOAT_COUNT);
  assert.equal(packed[0], 1700);
  assert.equal(packed[1], 3900);
  assert.equal(packed[3], 1);
  assert.equal(packed[4 + 3], 0);

  const shapeOffset = MAX_VOLUME_CLOUD_BODIES * 4;
  assert.equal(packed[shapeOffset], CLOUD_GENUS_INDEX.stratocumulus);
  const boundsOffset = MAX_VOLUME_CLOUD_BODIES * 2 * 4;
  assert.equal(packed[boundsOffset], 24000);
  const motionOffset = MAX_VOLUME_CLOUD_BODIES * 4 * 4;
  assert.ok(Math.abs(packed[motionOffset]) < 1e-5);
  assert.equal(packed[motionOffset + 1], 12);
  const morphology0Offset = MAX_VOLUME_CLOUD_BODIES * 6 * 4;
  assert.equal(packed[morphology0Offset], 0.25);
  assert.ok(Math.abs(packed[morphology0Offset + 1] - 1.4) < 1e-5);
  const morphology1Offset = MAX_VOLUME_CLOUD_BODIES * 7 * 4;
  assert.ok(Math.abs(packed[morphology1Offset] - 0.65) < 1e-5);
  assert.ok(Math.abs(packed[morphology1Offset + 1] - Math.PI / 2) < 1e-5);
  assert.equal(CLOUD_BODY_FLOATS_PER_RECORD_SET, 8 * 4);
});

test('non-volume special paths are excluded from the shared volume record array', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  while (store.canAdd()) store.add();

  const selected = selectVolumeCloudBodies(store.bodies);
  assert.equal(selected.length, MAX_VOLUME_CLOUD_BODIES);
  assert.equal(selected.every((body) => body.path === 'volume'), true);
  assert.equal(store.bodies.some((body) => body.path === 'local-volume'), true);
  assert.equal(store.bodies.some((body) => body.path === 'high-sheet'), true);
});

test('packing rejects undersized GPU targets', () => {
  const store = CloudBodyStore.createDefault();
  assert.throws(
    () => packVolumeCloudBodies(store.bodies, new Float32Array(CLOUD_BODY_FLOAT_COUNT - 1)),
    /requires at least/,
  );
});
