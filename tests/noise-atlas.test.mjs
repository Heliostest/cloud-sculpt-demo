import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const sourceUrl = new URL('../src/noiseAtlasGen.ts', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const noiseModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function channelCorrelation(data, a, b) {
  const count = data.length / 4;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    sumA += data[i + a];
    sumB += data[i + b];
  }
  const meanA = sumA / count;
  const meanB = sumB / count;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < data.length; i += 4) {
    const da = data[i + a] - meanA;
    const db = data[i + b] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  return covariance / Math.sqrt(varianceA * varianceB);
}

test('HP detail volume defaults to 64 cubed', () => {
  assert.equal(noiseModule.DETAIL_VOLUME_SIZE, 64);
  assert.equal(noiseModule.generateHpDetailRGBA().length, 64 ** 3 * 4);
});

test('HP detail channels are deterministic and statistically independent', () => {
  const size = 24;
  const first = noiseModule.generateHpDetailRGBA(size);
  const second = noiseModule.generateHpDetailRGBA(size);
  assert.deepEqual(first, second);

  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const correlation = channelCorrelation(first, a, b);
      assert.ok(Math.abs(correlation) < 0.9, `channels ${a}/${b} correlation=${correlation}`);
    }
  }
});
