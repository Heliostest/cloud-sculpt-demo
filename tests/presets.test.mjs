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

test('the interactive entry exposes general and multi-angle cirrus validation presets', () => {
  const presets = Object.values(presetsModule.CLOUD_PRESETS);
  assert.equal(presets.length, 18);
  for (const preset of presets) {
    assert.equal('densityModel' in preset, false);
    assert.equal(preset.version, 1);
  }

  const cirrus = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(cirrus, presetsModule.CLOUD_PRESETS['cirrus-oblique']);
  assert.equal(cirrus.bodies[0].genus, 'cirrus');
  assert.equal(cirrus.bodies[0].baseKm, 7);
  assert.equal(cirrus.bodies[0].topKm, 12);
  assert.equal(cirrus.bodies[0].densityScale, 0.08);
  assert.equal(cirrus.bodies[0].detailAmount, 0.75);
  assert.equal(cirrus.bodies[0].bounded, true);
});

test('each canonical genus owns a named validation preset with canonical recipe semantics', () => {
  const validationPresets = Object.values(presetsModule.CLOUD_PRESETS)
    .filter((preset) => preset.validationGenus !== undefined);
  assert.deepEqual(
    [...new Set(validationPresets.map((preset) => preset.validationGenus))].sort(),
    [...paramsModule.CLOUD_GENERA].sort(),
  );

  for (const preset of validationPresets) {
    assert.equal(preset.genus, preset.validationGenus);
    if (preset.morphologyOverride !== undefined) {
      assert.ok(preset.morphologyOverride.note.trim().length > 0);
    }
    const store = bodiesModule.CloudBodyStore.createDefault();
    presetsModule.applyCloudBodyPreset(store, preset);
    const expected = {
      ...bodiesModule.createCloudMorphologyRecipe(preset.genus),
      ...preset.morphologyOverride?.values,
    };
    assert.deepEqual(store.bodies[0].morphology, expected);
  }
});

test('preset morphology overrides are applied through CloudBody and carry an explicit note', () => {
  const preset = {
    ...presetsModule.CLOUD_PRESETS['side-cu'],
    morphologyOverride: {
      values: { cellScale: 1.45, cellStrength: 0.62 },
      note: 'Stage 8 authoring contract test.',
    },
  };
  const store = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(store, preset);
  assert.equal(store.bodies[0].morphology.cellScale, 1.45);
  assert.equal(store.bodies[0].morphology.cellStrength, 0.62);
  assert.equal(store.bodies[0].morphologyIsDefault, false);

  assert.throws(
    () => presetsModule.applyCloudBodyPreset(bodiesModule.CloudBodyStore.createDefault(), {
      ...preset,
      morphologyOverride: { values: { cellScale: 1.2 }, note: '   ' },
    }),
    /must explain its morphology override/,
  );
});

test('stage-nine validation presets carry reproducible framing and placement', () => {
  const validationPresets = Object.values(presetsModule.CLOUD_PRESETS)
    .filter((preset) => preset.validationGenus !== undefined && preset.validationGenus !== 'cirrus');
  assert.equal(validationPresets.every((preset) => ['side', 'oblique', 'top'].includes(preset.validationView)), true);

  const towering = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(towering, presetsModule.CLOUD_PRESETS['oblique-tcu']);
  assert.equal(towering.bodies[0].baseKm, 0.8);
  assert.equal(towering.bodies[0].topKm, 5.5);
  assert.equal(towering.bodies[0].radiusX, 1800);

  const cirrocumulus = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(cirrocumulus, presetsModule.CLOUD_PRESETS['genus-cirrocumulus']);
  assert.equal(cirrocumulus.bodies[0].topKm, 8);
  assert.equal(cirrocumulus.bodies[0].morphology.cellScale, 0.55);
  assert.equal(presetsModule.CLOUD_PRESETS['genus-cirrocumulus'].sunElevationDeg, 75);

  const stratocumulus = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(stratocumulus, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);
  assert.equal(stratocumulus.bodies[0].bounded, false);
  assert.equal(presetsModule.CLOUD_PRESETS['stratocumulus-sheet'].validationView, 'oblique');
});

test('the eight-body stress preset fills only canonical volume paths', () => {
  const store = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(store, presetsModule.CLOUD_PRESETS['eight-body-stress']);
  assert.equal(store.bodies.length, 8);
  assert.equal(store.bodies.every((body) => body.path === 'volume'), true);
  assert.equal(store.bodies.some((body) => body.path === 'local-volume'), false);
  assert.equal(store.bodies.some((body) => body.path === 'high-sheet'), false);
});

test('the performance harness enables a deterministic prefix of volume bodies', () => {
  const store = bodiesModule.CloudBodyStore.createDefault();
  presetsModule.applyCloudBodyPreset(store, presetsModule.CLOUD_PRESETS['eight-body-stress']);
  assert.equal(presetsModule.applyVolumeBodyCount(store, 4), 4);
  assert.equal(store.bodies.filter((body) => body.path === 'volume' && body.enabled).length, 4);
  assert.equal(store.bodies.length, 8);
  assert.equal(presetsModule.applyVolumeBodyCount(store, 99), 8);
  assert.equal(store.bodies.filter((body) => body.path === 'volume' && body.enabled).length, 8);
  assert.equal(presetsModule.applyVolumeBodyCount(store, -2), 1);
  assert.equal(store.bodies.filter((body) => body.path === 'volume' && body.enabled).length, 1);
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
  assert.equal(store.bodies[0].bounded, true);
  assert.equal(store.bodies[0].centerX, 0);
  assert.equal(params.scStrength, 0);
  assert.equal(params.scMaskOverride, -1);
  assert.equal(params.hpLightingEnabled, false);
  assert.equal(store.bodies[0].genus, 'cumulus');
  assert.equal(store.bodies[0].cumulusDevelopment, 0);
  assert.equal(params.windSpeed, 15);
  assert.equal(params.densityThreshold, 0.03);
});
