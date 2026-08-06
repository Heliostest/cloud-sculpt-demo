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

test('cloud bodies are live object views over the legacy renderer parameters', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  const primary = store.find('body-layer-0');

  assert.equal(params.layers.length, 8);
  assert.equal(store.capacity, 10);
  assert.equal(store.activeCount, 1);
  primary.baseKm = 1.25;
  primary.densityScale = 0.55;
  assert.equal(params.layers[0].baseKm, 1.25);
  assert.equal(params.layers[0].densityScale, 0.55);
});

test('add, duplicate, and remove keep the fixed renderer slots valid', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  const primary = store.find('body-layer-0');
  primary.genus = 'stratocumulus';
  primary.baseKm = 0.8;

  const duplicate = store.duplicate(primary.id);
  assert.equal(duplicate.id, 'body-layer-1');
  assert.equal(duplicate.genus, 'stratocumulus');
  assert.equal(params.layers[1].enabled, true);
  assert.equal(params.layers[1].baseKm, 0.8);

  assert.equal(store.remove(primary.id), true);
  assert.equal(params.layers[0].enabled, false);
  assert.equal(store.activeCount, 1);
});

test('the tenth object routes to the existing independent high-cloud path', () => {
  const params = createDefaultParams();
  const store = new CloudBodyStore(params);
  while (store.activeCount < store.capacity) store.add();

  const high = store.find('body-high');
  assert.equal(high.enabled, true);
  assert.equal(high.path, 'high-sheet');
  high.genus = 'altostratus';
  assert.equal(params.highCloudGenus, 'altostratus');
  high.genus = 'cirrus';
  assert.equal(params.highCloudGenus, 'altostratus');
  assert.equal(store.add(), undefined);
});
