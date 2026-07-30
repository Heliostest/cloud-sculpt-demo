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

function highViewTransmittance(density, viewAbsorption, msWeight, distance) {
  return Math.exp(-density * viewAbsorption * msWeight * distance);
}

function highLightTransmittance(extinctionSum, lightAbsorption, coverage, coverAbsorptionStrength) {
  return Math.exp(-Math.min(extinctionSum * lightAbsorption * (1 + coverage * coverAbsorptionStrength), 12));
}

function acesFitted(x) {
  return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
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

test('dedicated HP high-cloud view absorption prevents low-cloud extinction from making a thin slab opaque', () => {
  const density = 0.02;
  const msWeight = 0.6;
  const distance = 4000;
  const legacy = highViewTransmittance(density, 0.095, 1, distance);
  const aligned = highViewTransmittance(density, 0.012, msWeight, distance);
  assert.ok(legacy < 0.001, `legacy=${legacy}`);
  assert.ok(aligned > 0.5, `aligned=${aligned}`);
  assert.ok(aligned <= 1);
});

test('HP high-cloud light absorption and cover modulation are independent and monotonic', () => {
  const clear = highLightTransmittance(80, 0.012, 0, 0.35);
  const covered = highLightTransmittance(80, 0.012, 1, 0.35);
  const stronger = highLightTransmittance(80, 0.024, 1, 0.35);
  assert.ok(clear > covered);
  assert.ok(covered > stronger);
  assert.ok(stronger >= 0 && clear <= 1);
});

test('ACES fitted tone mapping is finite, monotonic and bounded for HDR radiance', () => {
  const samples = [0, 0.01, 0.18, 1, 4, 16, 100];
  let previous = -1;
  for (const sample of samples) {
    const mapped = acesFitted(sample);
    assert.ok(Number.isFinite(mapped));
    assert.ok(mapped >= previous);
    assert.ok(mapped >= 0 && mapped <= 1);
    previous = mapped;
  }
  assert.equal(acesFitted(0), 0);
  assert.ok(acesFitted(4) < 1);
});

test('HP sky gradient keeps exact horizon and zenith anchors', () => {
  const gradient = (up, horizon, zenith, exponent) => horizon + (zenith - horizon) * Math.pow(Math.min(1, Math.max(0, up)), exponent);
  assert.equal(gradient(0, 0.12, 0.62, 0.65), 0.12);
  assert.equal(gradient(1, 0.12, 0.62, 0.65), 0.62);
});
