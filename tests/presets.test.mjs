import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compileTypeScriptUrl(relativePath, replacements = {}) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  let source = await readFile(sourceUrl, 'utf8');
  for (const [from, to] of Object.entries(replacements)) {
    source = source.replace(from, to);
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const paramsUrl = await compileTypeScriptUrl('../src/params.ts');
const paramsModule = await import(paramsUrl);
const bodiesUrl = await compileTypeScriptUrl('../src/cloudBodies.ts', {
  "from './params'": `from '${paramsUrl}'`,
});
const bodiesModule = await import(bodiesUrl);
const presetsUrl = await compileTypeScriptUrl('../src/cloudPresets.ts', {
  "from './params'": `from '${paramsUrl}'`,
  "from './cloudBodies'": `from '${bodiesUrl}'`,
});
const presetsModule = await import(presetsUrl);

test('density model selector is removed from the public parameter surface', () => {
  assert.equal('densityModel' in paramsModule.createDefaultParams(), false);
  assert.equal('DENSITY_MODEL_INDEX' in paramsModule, false);
  assert.equal('isDensityModel' in paramsModule, false);
});

test('the cloud model exposes the canonical ten genera through object defaults', () => {
  const expectedGenera = [
    'cumulus',
    'stratus',
    'stratocumulus',
    'cumulonimbus',
    'altocumulus',
    'altostratus',
    'nimbostratus',
    'cirrus',
    'cirrostratus',
    'cirrocumulus',
  ];
  assert.deepEqual(paramsModule.CLOUD_GENERA, expectedGenera);
  assert.deepEqual(
    expectedGenera.map((genus) => paramsModule.CLOUD_GENUS_INDEX[genus]),
    expectedGenera.map((_, index) => index),
  );

  const params = paramsModule.createDefaultParams();
  assert.equal('cloudTypeOverride' in params, false);
  assert.equal('layers' in params, false);
  assert.equal('hero' in params, false);
  const primary = bodiesModule.CloudBodyStore.createDefault().bodies[0];
  assert.ok(expectedGenera.includes(primary.genus));
  assert.ok(primary.cumulusDevelopment >= 0 && primary.cumulusDevelopment <= 1);
});

test('TCu is represented as cumulus development rather than an eleventh genus', () => {
  assert.equal(paramsModule.CLOUD_GENERA.includes('tcu'), false);
  assert.equal(paramsModule.CLOUD_GENERA.includes('towering-cumulus'), false);

  const side = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(side, presetsModule.CLOUD_PRESETS['side-cu']);
  assert.equal(side.bodies[0].genus, 'cumulus');
  assert.equal(side.bodies[0].cumulusDevelopment, 0);

  const towering = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(towering, presetsModule.CLOUD_PRESETS['oblique-tcu']);
  assert.equal(towering.bodies[0].genus, 'cumulus');
  assert.equal(towering.bodies[0].cumulusDevelopment, 1);

  const storm = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(storm, presetsModule.CLOUD_PRESETS['oblique-cb']);
  assert.equal(storm.bodies[0].genus, 'cumulonimbus');
});

test('the independent high-cloud path selects Ac or As by genus, not a type slider', () => {
  assert.deepEqual(paramsModule.HIGH_CLOUD_GENERA, ['altocumulus', 'altostratus']);
  const params = paramsModule.createDefaultParams();
  assert.equal('highCloudGenus' in params, false);
  assert.equal('highCloudTypeOverride' in params, false);
  const store = bodiesModule.CloudBodyStore.createDefault();
  const high = store.add('high-sheet', true);
  assert.equal(high.genus, 'altocumulus');
  assert.equal(paramsModule.isHighCloudGenus('altocumulus'), true);
  assert.equal(paramsModule.isHighCloudGenus('altostratus'), true);
  assert.equal(paramsModule.isHighCloudGenus('cirrus'), false);
});

test('the interactive entry exposes default plus seven cloud presets', () => {
  const presets = Object.values(presetsModule.CLOUD_PRESETS);
  assert.equal(presets.length, 8);
  for (const preset of presets) {
    assert.equal('densityModel' in preset, false);
    assert.equal(preset.version, 1);
  }
});

test('stratocumulus preset is a shallow connected deck with softened erosion', () => {
  const params = paramsModule.createDefaultParams();
  const store = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);
  presetsModule.applyCloudBodyPreset(store, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);

  assert.equal(params.scStrength, 1);
  assert.equal(params.scMaskOverride, 1);
  assert.equal(store.bodies[0].genus, 'stratocumulus');
  assert.ok(params.scHeightScale <= 0.25);
  assert.ok(params.scCoverageIntensity > 1);
  assert.ok(params.scDetailStrength < paramsModule.createDefaultParams().scDetailStrength);
  assert.ok(params.edgeSoftness > paramsModule.createDefaultParams().edgeSoftness);
  assert.ok(params.wispyReach < 0.1);
  assert.equal(store.bodies.some((body) => body.path === 'high-sheet'), false);
});

test('preset URLs stay interactive unless validation is explicitly requested', () => {
  assert.deepEqual(
    presetsModule.resolvePresetRequest(new URLSearchParams('preset=hp-ocean-day')),
    { name: 'hp-ocean-day', validation: false, legacyScenario: false },
  );
  assert.deepEqual(
    presetsModule.resolvePresetRequest(new URLSearchParams('preset=hp-ocean-day&validation=1')),
    { name: 'hp-ocean-day', validation: true, legacyScenario: false },
  );
});

test('legacy scenario URLs resolve to the same preset in validation mode', () => {
  assert.deepEqual(
    presetsModule.resolvePresetRequest(new URLSearchParams('scenario=side-cu')),
    { name: 'side-cu', validation: true, legacyScenario: true },
  );
});

test('switching presets resets scalar params and rebuilds cloud objects directly', () => {
  const params = paramsModule.createDefaultParams();
  const store = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['hp-ocean-day']);
  presetsModule.applyCloudBodyPreset(store, presetsModule.CLOUD_PRESETS['hp-ocean-day']);
  assert.equal(params.scStrength, 0.35);
  assert.equal(params.hpLightingEnabled, true);
  store.bodies[0].densityScale = 0.1;
  store.bodies[0].bounded = true;
  store.bodies[0].centerX = 42000;
  store.add();
  store.add('local-volume');

  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);
  presetsModule.applyCloudBodyPreset(store, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);
  assert.equal(params.scStrength, 1);
  assert.equal(params.edgeSoftness, 0.4);

  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['side-cu']);
  presetsModule.applyCloudBodyPreset(store, presetsModule.CLOUD_PRESETS['side-cu']);
  assert.equal(store.bodies.length, 1);
  assert.equal(store.bodies[0].densityScale, 0.85);
  assert.equal(store.bodies[0].bounded, false);
  assert.equal(store.bodies[0].centerX, 0);
  assert.equal(params.scStrength, 0);
  assert.equal(params.scMaskOverride, -1);
  assert.equal(params.hpLightingEnabled, false);
  assert.equal(store.bodies[0].genus, 'cumulus');
  assert.equal(store.bodies[0].cumulusDevelopment, 0);
  assert.equal(params.windSpeed, 15);
  assert.equal(params.densityThreshold, 0.03);
});
