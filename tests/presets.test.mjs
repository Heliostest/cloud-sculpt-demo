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
const presetsUrl = await compileTypeScriptUrl('../src/cloudPresets.ts', {
  "from './params'": `from '${paramsUrl}'`,
});
const presetsModule = await import(presetsUrl);

test('density model selector is removed from the public parameter surface', () => {
  assert.equal('densityModel' in paramsModule.createDefaultParams(), false);
  assert.equal('DENSITY_MODEL_INDEX' in paramsModule, false);
  assert.equal('isDensityModel' in paramsModule, false);
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
  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);

  assert.equal(params.scStrength, 1);
  assert.equal(params.scMaskOverride, 1);
  assert.equal(params.cloudTypeOverride, 0);
  assert.ok(params.scHeightScale <= 0.25);
  assert.ok(params.scCoverageIntensity > 1);
  assert.ok(params.scDetailStrength < paramsModule.createDefaultParams().scDetailStrength);
  assert.ok(params.edgeSoftness > paramsModule.createDefaultParams().edgeSoftness);
  assert.ok(params.wispyReach < 0.1);
  assert.equal(params.highCloudEnabled, false);
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

test('switching presets restores defaults without replacing nested GUI targets', () => {
  const params = paramsModule.createDefaultParams();
  const layers = params.layers;
  const hero = params.hero;
  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['hp-ocean-day']);
  assert.equal(params.scStrength, 0.35);
  assert.equal(params.hpLightingEnabled, true);
  params.layers[0].densityScale = 0.1;
  params.hero.enabled = true;

  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['stratocumulus-sheet']);
  assert.equal(params.scStrength, 1);
  assert.equal(params.edgeSoftness, 0.4);

  presetsModule.applyCloudPreset(params, presetsModule.CLOUD_PRESETS['side-cu']);
  assert.equal(params.layers, layers);
  assert.equal(params.hero, hero);
  assert.equal(params.layers[0].densityScale, 0.85);
  assert.equal(params.hero.enabled, false);
  assert.equal(params.scStrength, 0);
  assert.equal(params.scMaskOverride, -1);
  assert.equal(params.hpLightingEnabled, false);
  assert.equal(params.cloudTypeOverride, 0);
  assert.equal(params.windSpeed, 8);
});
