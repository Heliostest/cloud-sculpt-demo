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
const { CloudBodyStore } = await import(bodiesUrl);

test('cloud bodies have stable editor identities over legacy renderer slots', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  const primary = store.active()[0];

  assert.equal(params.layers.length, 8);
  assert.equal(store.capacity, 10);
  assert.equal(store.activeCount, 1);
  assert.equal(primary.id, 'cloud-1');
  assert.equal(primary.rendererSlot, 'layer-0');
  primary.baseKm = 1.25;
  primary.densityScale = 0.55;
  primary.bounded = true;
  primary.centerX = 12000;
  primary.rotationDeg = 35;
  primary.feather = 0.4;
  assert.equal(params.layers[0].baseKm, 1.25);
  assert.equal(params.layers[0].densityScale, 0.55);
  assert.equal(params.layers[0].bounded, true);
  assert.equal(params.layers[0].centerX, 12000);
  assert.equal(params.layers[0].rotationDeg, 35);
  assert.equal(params.layers[0].feather, 0.4);
  assert.equal(primary.hasSpatialBounds, true);
});

test('add, duplicate, and remove keep the fixed renderer slots valid', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  const primary = store.active()[0];
  primary.genus = 'stratocumulus';
  primary.baseKm = 0.8;
  primary.bounded = true;
  primary.centerZ = -4500;
  primary.radiusX = 9000;
  primary.rotationDeg = -25;

  const duplicate = store.duplicate(primary.id);
  assert.equal(duplicate.id, 'cloud-2');
  assert.equal(duplicate.rendererSlot, 'layer-1');
  assert.equal(duplicate.genus, 'stratocumulus');
  assert.equal(params.layers[1].enabled, true);
  assert.equal(params.layers[1].baseKm, 0.8);
  assert.equal(params.layers[1].bounded, true);
  assert.equal(params.layers[1].centerZ, -4500);
  assert.equal(params.layers[1].radiusX, 9000);
  assert.equal(params.layers[1].rotationDeg, -25);

  assert.equal(store.remove(primary.id), true);
  assert.equal(params.layers[0].enabled, false);
  assert.equal(store.activeCount, 1);

  const replacement = store.add();
  assert.equal(replacement.id, 'cloud-3');
  assert.equal(replacement.rendererSlot, 'layer-0');
  assert.equal(store.find(primary.id), undefined);
});

test('the tenth object routes to the existing independent high-cloud path', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  while (store.activeCount < store.capacity) store.add();

  const high = store.active().find((body) => body.path === 'high-sheet');
  assert.equal(high.enabled, true);
  assert.equal(high.path, 'high-sheet');
  high.genus = 'altostratus';
  assert.equal(params.highCloudGenus, 'altostratus');
  high.genus = 'cirrus';
  assert.equal(params.highCloudGenus, 'altostratus');
  assert.equal(store.add(), undefined);
});

test('preset-style parameter reload preserves surviving identities and reconciles membership', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  const primary = store.active()[0];

  params.layers[1].enabled = true;
  store.reloadFromParams();
  assert.equal(store.activeCount, 2);
  assert.equal(store.active()[0].id, primary.id);
  const second = store.active()[1];
  assert.equal(second.rendererSlot, 'layer-1');

  params.layers[0].enabled = false;
  params.hero.enabled = true;
  store.reloadFromParams();
  assert.equal(store.find(primary.id), undefined);
  assert.equal(store.active().some((body) => body.id === second.id), true);
  assert.equal(store.active().some((body) => body.path === 'local-volume'), true);
});

test('cloud-body collections survive a JSON snapshot round trip with stable identities', () => {
  const sourceParams = createDefaultParams();
  const source = new CloudBodyStore(sourceParams);
  const primary = source.active()[0];
  primary.genus = 'stratocumulus';
  primary.bounded = true;
  primary.centerX = 12500;
  primary.radiusZ = 7600;
  const duplicate = source.duplicate(primary.id);
  duplicate.centerX = -9000;

  const encoded = JSON.stringify(source.exportSnapshot());
  const targetParams = createDefaultParams();
  const target = new CloudBodyStore(targetParams);
  target.restoreSnapshot(JSON.parse(encoded));

  assert.deepEqual(target.exportSnapshot(), source.exportSnapshot());
  assert.equal(target.active()[0].id, primary.id);
  assert.equal(target.active()[1].id, duplicate.id);
  assert.equal(targetParams.layers[0].genus, 'stratocumulus');
  assert.equal(targetParams.layers[1].centerX, -9000);
});

test('invalid or over-capacity cloud-body snapshots are rejected before mutation', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
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

test('genus defaults respect manual placement until explicitly applied', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
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
