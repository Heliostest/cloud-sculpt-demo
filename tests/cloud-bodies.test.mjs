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
const { createDefaultParams } = await import(paramsUrl);
const { CloudBodyStore, createCloudMorphologyRecipe } = await import(bodiesUrl);

test('cloud bodies are independent authoring entities', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const primary = store.active()[0];

  assert.equal(store.capacity, 10);
  assert.equal(store.activeCount, 1);
  assert.equal(primary.id, 'cloud-1');
  assert.equal('rendererSlot' in primary, false);
  primary.baseKm = 1.25;
  primary.densityScale = 0.55;
  primary.bounded = true;
  primary.centerX = 12000;
  primary.rotationDeg = 35;
  primary.feather = 0.4;
  assert.equal(primary.baseKm, 1.25);
  assert.equal(primary.densityScale, 0.55);
  assert.equal(primary.centerX, 12000);
  assert.equal(primary.hasSpatialBounds, true);
});

test('add, duplicate, and remove operate directly on the object collection', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const primary = store.active()[0];
  primary.genus = 'stratocumulus';
  primary.baseKm = 0.8;
  primary.bounded = true;
  primary.centerZ = -4500;
  primary.radiusX = 9000;
  primary.rotationDeg = -25;

  const duplicate = store.duplicate(primary.id);
  assert.equal(duplicate.id, 'cloud-2');
  assert.equal(duplicate.path, 'volume');
  assert.equal(duplicate.genus, 'stratocumulus');
  assert.equal(duplicate.baseKm, 0.8);
  assert.equal(duplicate.bounded, true);
  assert.equal(duplicate.centerZ, -4500);
  assert.equal(duplicate.radiusX, 9000);
  assert.equal(duplicate.rotationDeg, -25);

  assert.equal(store.remove(primary.id), true);
  assert.equal(store.activeCount, 1);

  const replacement = store.add();
  assert.equal(replacement.id, 'cloud-3');
  assert.equal(replacement.path, 'volume');
  assert.equal(store.find(primary.id), undefined);
});

test('the tenth object routes to the existing independent high-cloud path', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  while (store.activeCount < store.capacity) store.add();

  const high = store.active().find((body) => body.path === 'high-sheet');
  assert.equal(high.enabled, true);
  assert.equal(high.path, 'high-sheet');
  high.genus = 'altostratus';
  assert.equal(high.genus, 'altostratus');
  high.genus = 'cirrus';
  assert.equal(high.genus, 'altostratus');
  assert.equal(store.add(), undefined);
});

test('preset reset rebuilds the collection directly without a parameter compatibility layer', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const primary = store.active()[0];

  const second = store.add();
  assert.equal(store.activeCount, 2);
  assert.equal(store.active()[0].id, primary.id);
  assert.equal(second.path, 'volume');

  const reset = store.reset('stratocumulus', 0);
  assert.equal(store.activeCount, 1);
  assert.equal(store.find(primary.id), undefined);
  assert.equal(store.find(second.id), undefined);
  assert.equal(reset.genus, 'stratocumulus');
  assert.equal(reset.cumulusDevelopment, 0);
});

test('cloud-body collections survive a JSON snapshot round trip with stable identities', () => {
  const sourceParams = createDefaultParams();
  const source = CloudBodyStore.createDefault(() => sourceParams.sceneTime);
  const primary = source.active()[0];
  primary.genus = 'stratocumulus';
  primary.bounded = true;
  primary.centerX = 12500;
  primary.radiusZ = 7600;
  const duplicate = source.duplicate(primary.id);
  duplicate.centerX = -9000;

  const encoded = JSON.stringify(source.exportSnapshot());
  const targetParams = createDefaultParams();
  const target = CloudBodyStore.createDefault(() => targetParams.sceneTime);
  target.restoreSnapshot(JSON.parse(encoded));

  assert.deepEqual(target.exportSnapshot(), source.exportSnapshot());
  assert.equal(target.active()[0].id, primary.id);
  assert.equal(target.active()[1].id, duplicate.id);
  assert.equal(target.active()[0].genus, 'stratocumulus');
  assert.equal(target.active()[1].centerX, -9000);
});

test('invalid or over-capacity cloud-body snapshots are rejected before mutation', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const before = store.exportSnapshot();
  const invalid = structuredClone(before);
  invalid.bodies[0].baseKm = Number.NaN;

  assert.throws(() => store.restoreSnapshot(invalid), /invalid baseKm/);
  assert.deepEqual(store.exportSnapshot(), before);

  const duplicateId = structuredClone(before);
  duplicateId.bodies.push(structuredClone(duplicateId.bodies[0]));
  assert.throws(() => store.restoreSnapshot(duplicateId), /Duplicate cloud body id/);
  assert.deepEqual(store.exportSnapshot(), before);
});

test('version one snapshots migrate to the runtime-control schema', () => {
  const params = createDefaultParams();
  const source = CloudBodyStore.createDefault(() => params.sceneTime).exportSnapshot();
  const legacy = structuredClone(source);
  legacy.version = 1;
  for (const body of legacy.bodies) {
    for (const key of [
      'windDeg', 'windSpeedMps', 'morphRate', 'lifeEnabled', 'lifeBirth',
      'lifeGrow', 'lifeDecay', 'lifeDeath', 'lifePeak', 'lifeStart',
    ]) delete body[key];
  }

  const target = CloudBodyStore.createDefault();
  target.restoreSnapshot(legacy);
  const migrated = target.exportSnapshot();
  assert.equal(migrated.version, 3);
  assert.equal(migrated.bodies[0].windSpeedMps, 0);
  assert.equal(migrated.bodies[0].lifeEnabled, false);
  assert.equal(migrated.bodies[0].lifeDeath, 90);
  assert.deepEqual(migrated.bodies[0].morphology, createCloudMorphologyRecipe(migrated.bodies[0].genus));
});

test('cloud bodies own independent genus morphology recipes that survive snapshots', () => {
  const store = CloudBodyStore.createDefault();
  const primary = store.active()[0];
  primary.genus = 'cirrus';
  assert.deepEqual(primary.morphology, createCloudMorphologyRecipe('cirrus'));

  primary.morphology.fiberStrength = 0.73;
  primary.morphology.fiberAngleDeg = 42;
  const duplicate = store.duplicate(primary.id);
  assert.deepEqual(duplicate.morphology, primary.morphology);
  assert.notEqual(duplicate.morphology, primary.morphology);

  duplicate.morphology.fiberStrength = 0.2;
  assert.equal(primary.morphology.fiberStrength, 0.73);
  const snapshot = store.exportSnapshot();
  assert.equal(snapshot.version, 3);
  assert.equal(snapshot.bodies[0].morphology.fiberAngleDeg, 42);
});

test('version two snapshots receive morphology defaults from their genus', () => {
  const source = CloudBodyStore.createDefault().exportSnapshot();
  const legacy = structuredClone(source);
  legacy.version = 2;
  legacy.bodies[0].genus = 'nimbostratus';
  delete legacy.bodies[0].morphology;

  const target = CloudBodyStore.createDefault();
  target.restoreSnapshot(legacy);
  assert.deepEqual(target.active()[0].morphology, createCloudMorphologyRecipe('nimbostratus'));
});

test('genus defaults respect manual placement until explicitly applied', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const added = store.add();

  assert.equal(added.placementLocked, false);
  added.genus = 'cirrus';
  assert.equal(added.baseKm, 7);
  assert.equal(added.topKm, 12);
  assert.equal(added.radiusX, 4000);

  added.baseKm = 8.5;
  added.radiusX = 6200;
  assert.equal(added.placementLocked, true);
  added.genus = 'stratus';
  assert.equal(added.baseKm, 8.5);
  assert.equal(added.radiusX, 6200);

  added.applyGenusDefaults();
  assert.equal(added.baseKm, 0.3);
  assert.equal(added.topKm, 1.5);
  assert.equal(added.radiusX, 5000);
  assert.equal(added.radiusZ, 5000);
  assert.equal(added.placementLocked, false);
});

test('resetting to a genus applies its canonical placement before locking it', () => {
  const store = CloudBodyStore.createDefault();
  const cirrus = store.reset('cirrus', 0);
  assert.equal(cirrus.baseKm, 7);
  assert.equal(cirrus.topKm, 12);
  assert.equal(cirrus.radiusX, 4000);
  assert.equal(cirrus.radiusZ, 4000);
  assert.equal(cirrus.placementLocked, true);
});

test('volume bodies own independent motion and lifecycle authoring data', () => {
  const params = createDefaultParams();
  const store = CloudBodyStore.createDefault(() => params.sceneTime);
  const primary = store.active()[0];
  const second = store.duplicate(primary.id);

  primary.windDeg = 120;
  primary.windSpeedMps = 18;
  primary.morphRate = 0.08;
  params.sceneTime = 17;
  primary.lifeEnabled = true;
  primary.lifeBirth = 4;
  primary.lifeGrow = 12;
  primary.lifeDecay = 40;
  primary.lifeDeath = 55;
  primary.lifePeak = 1.4;

  assert.equal(primary.lifeStart, 17);
  assert.equal(primary.lifePeak, 1.4);
  assert.notEqual(second.windDeg, primary.windDeg);
  assert.equal(second.supportsRuntimeControls, true);

  const snapshot = store.exportSnapshot();
  const saved = snapshot.bodies.find((body) => body.id === primary.id);
  assert.equal(saved.windSpeedMps, 18);
  assert.equal(saved.morphRate, 0.08);
  assert.equal(saved.lifeDeath, 55);
  assert.equal(saved.lifeStart, 17);
});
