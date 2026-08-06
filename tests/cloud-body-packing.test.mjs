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
const { CLOUD_BODY_FLOAT_COUNT, packVolumeCloudBodies, selectVolumeCloudBodies } = await import(packingUrl);

test('GPU records are packed from active object order rather than legacy slot index', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  const first = store.active()[0];
  const second = store.duplicate(first.id);
  second.genus = 'stratocumulus';
  second.baseKm = 1.7;
  second.topKm = 3.9;
  second.centerX = 24000;
  second.windDeg = 90;
  second.windSpeedMps = 12;

  store.remove(first.id);
  assert.equal(second.rendererSlot, 'layer-1');
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
});

test('non-volume special paths are excluded from the shared volume record array', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  while (store.canAdd()) store.add();

  const selected = selectVolumeCloudBodies(store.bodies);
  assert.equal(selected.length, MAX_VOLUME_CLOUD_BODIES);
  assert.equal(selected.every((body) => body.path === 'volume'), true);
  assert.equal(store.bodies.some((body) => body.path === 'local-volume'), true);
  assert.equal(store.bodies.some((body) => body.path === 'high-sheet'), true);
});

test('packing rejects undersized GPU targets', () => {
  const store = new CloudBodyStore(createDefaultParams());
  assert.throws(
    () => packVolumeCloudBodies(store.bodies, new Float32Array(CLOUD_BODY_FLOAT_COUNT - 1)),
    /requires at least/,
  );
});
