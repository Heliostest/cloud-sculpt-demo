import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/weatherGen.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const weatherModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function channelRange(data, channel) {
  let min = 255;
  let max = 0;
  for (let i = channel; i < data.length; i += 4) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
  }
  return max - min;
}

test('low weather exposes the HP RGB layout and keeps meso in alpha', () => {
  assert.deepEqual(weatherModule.LOW_WEATHER_CHANNELS, {
    coverage: 0,
    cloudType: 1,
    scMask: 2,
    meso: 3,
  });
});

test('coverage, cloud type, Sc mask, and meso all vary across the finite map', () => {
  const data = weatherModule.generateWeatherRGBA(64);
  for (const [name, channel] of Object.entries(weatherModule.LOW_WEATHER_CHANNELS)) {
    assert.ok(channelRange(data, channel) > 32, `${name} does not have useful spatial range`);
  }
});

test('finite weather coverage fades to zero at the texture boundary', () => {
  const size = 64;
  const data = weatherModule.generateWeatherRGBA(size);
  const coverage = weatherModule.LOW_WEATHER_CHANNELS.coverage;
  for (let x = 0; x < size; x++) {
    assert.equal(data[(x * 4) + coverage], 0);
    assert.equal(data[(((size - 1) * size + x) * 4) + coverage], 0);
  }
});
