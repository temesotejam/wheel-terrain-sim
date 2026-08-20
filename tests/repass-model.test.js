'use strict';

const assert = require('node:assert/strict');
const { buildPassSeries, effectiveSoilForPass } = require('../repass.js');

const wheel = { radius: 0.15, width: 0.08, lugHeight: 0, shearGain: 1, rrGain: 1 };
const soil = {
  kc: 14000, kphi: 820000, n: 1.10, cohesion: 400, phiDeg: 28, K: 0.025,
  density: 1500, rutFactor: 0.72, flow: 1.0,
};

function fakeSolver(_wheel, effectiveSoil, _loadN, slip) {
  const stiff = effectiveSoil.kphi / soil.kphi;
  const z = 0.032 / Math.pow(stiff, 0.55);
  return {
    z,
    rutDepth: z * effectiveSoil.rutFactor * (0.82 + 0.36 * slip),
    fx: 46 * Math.pow(stiff, 0.16),
    torque: 6.1 / Math.pow(stiff, 0.05),
    efficiency: 0.55,
  };
}

const series = buildPassSeries(wheel, soil, 'softSand', 200, 0.2, 8, fakeSolver);
assert.equal(series.length, 8);
assert.ok(series[0].cumulativeRut > 0);
assert.ok(Math.abs(series[0].cumulativeRut - series[0].result.rutDepth) < 1e-12);

for (let idx = 0; idx < series.length; idx++) {
  const item = series[idx];
  for (const value of [item.result.z, item.result.rutDepth, item.result.fx, item.result.torque, item.incrementalRut, item.cumulativeRut, item.stiffnessGain]) {
    assert.ok(Number.isFinite(value));
  }
  if (idx > 0) {
    assert.ok(item.cumulativeRut >= series[idx - 1].cumulativeRut - 1e-12);
    assert.ok(item.stiffnessGain >= series[idx - 1].stiffnessGain - 1e-12);
  }
}

const pass1 = effectiveSoilForPass(soil, 'softSand', wheel, 0.2, 1);
assert.equal(pass1.kphi, soil.kphi);
assert.equal(pass1.kc, soil.kc);

const highSlip = buildPassSeries({ ...wheel, lugHeight: 0.012 }, soil, 'softSand', 200, 0.8, 8, fakeSolver);
assert.equal(highSlip.length, 8);
assert.ok(highSlip.every(item => Number.isFinite(item.cumulativeRut) && item.cumulativeRut >= 0));

console.log('repass model tests: ok');
