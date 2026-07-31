import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

const paramsModule = await importTypeScript('../src/params.ts');
const scenariosModule = await importTypeScript('../src/validationScenarios.ts');

test('legacy current density model is no longer accepted', () => {
  assert.equal(paramsModule.isDensityModel('current'), false);
  assert.deepEqual(paramsModule.DENSITY_MODEL_INDEX, { hpCore: 0, hpLowCloud: 1 });
  assert.equal(paramsModule.createDefaultParams().densityModel, 'hpLowCloud');
});

test('all named visual scenarios use the HP low-cloud kernel', () => {
  const scenarios = Object.values(scenariosModule.VALIDATION_SCENARIOS);
  assert.equal(scenarios.length, 6);
  for (const scenario of scenarios) {
    assert.equal(scenario.densityModel, 'hpLowCloud');
  }
});
