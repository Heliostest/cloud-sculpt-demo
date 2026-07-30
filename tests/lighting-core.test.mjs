import assert from 'node:assert/strict';
import test from 'node:test';

const hg = (cosTheta, g) => {
  const g2 = g * g;
  return (1 - g2) / Math.max(1e-4, 4 * Math.PI * Math.pow(1 + g2 - 2 * g * cosTheta, 1.5));
};

function hpPhase(cosTheta, forward, backward, eccentricityScale) {
  return hg(cosTheta, forward * eccentricityScale) + hg(cosTheta, -backward * eccentricityScale);
}

function hpMultiScatter(input) {
  let luminance = 0;
  let attenuation = 1;
  let contribution = 1;
  let eccentricityScale = 1;
  for (let octave = 0; octave < 3; octave++) {
    const lightT = Math.exp(-Math.min(input.opticalDepth * attenuation, 16));
    luminance += lightT * hpPhase(input.cosTheta, input.forward, input.backward, eccentricityScale) * contribution;
    attenuation *= input.msAttenuation;
    contribution *= input.msContribution;
    eccentricityScale *= input.msEccentricity;
  }
  return luminance;
}

test('HP phase is the sum of forward and backward lobes with per-octave eccentricity decay', () => {
  const cosTheta = 0.35;
  const phase0 = hpPhase(cosTheta, 0.85, 0.3, 1);
  const phase1 = hpPhase(cosTheta, 0.85, 0.3, 0.5);
  assert.equal(phase0, hg(cosTheta, 0.85) + hg(cosTheta, -0.3));
  assert.equal(phase1, hg(cosTheta, 0.425) + hg(cosTheta, -0.15));
  assert.ok(phase0 > 0 && phase1 > 0);
});

test('higher HP scattering octaves retain finite light in optically thick cloud', () => {
  const input = {
    cosTheta: 0.2,
    opticalDepth: 8,
    forward: 0.85,
    backward: 0.3,
    msAttenuation: 0.5,
    msContribution: 0.5,
    msEccentricity: 0.5,
  };
  const firstOctave = Math.exp(-input.opticalDepth) * hpPhase(input.cosTheta, input.forward, input.backward, 1);
  const allOctaves = hpMultiScatter(input);
  assert.ok(Number.isFinite(allOctaves));
  assert.ok(allOctaves > firstOctave);
});

test('upward ambient AO decreases monotonically with optical depth', () => {
  const upwardAO = (opticalDepth) => Math.exp(-opticalDepth * Math.sin(Math.PI / 6));
  assert.ok(upwardAO(0) > upwardAO(2));
  assert.ok(upwardAO(2) > upwardAO(8));
  assert.equal(upwardAO(0), 1);
});

test('scatter-source response is bounded and rejects zero optical depth', () => {
  const source = (scatterOD, scale, curve) => Math.pow(Math.min(1, Math.max(0, 1 - Math.exp(-scatterOD / scale))), curve);
  assert.equal(source(0, 0.08, 1), 0);
  assert.ok(source(0.02, 0.08, 1) > 0);
  assert.ok(source(0.2, 0.08, 1) < 1);
  assert.ok(source(2, 0.08, 1) <= 1);
});
