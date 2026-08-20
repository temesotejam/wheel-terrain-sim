'use strict';

const assert = require('assert');
const RFT = require('../rft-model.js');

const soil = {
  kc: 14000,
  kphi: 820000,
  n: 1.10,
  cohesion: 400,
  phiDeg: 28,
};
const standard = { radius: 0.15, width: 0.08, lugHeight: 0 };
const lugged = { radius: 0.15, width: 0.08, lugHeight: 0.012 };

const alpha = RFT.referenceStressGradient(soil, 0.08, 0.025);
assert(Number.isFinite(alpha) && alpha > 0, 'reference alpha must be finite and positive');

const base = RFT.simulateWheel(standard, soil, 200, 0.20, 0.60);
for (const key of ['fx', 'fz', 'torque', 'z', 'alphaRef']) {
  assert(Number.isFinite(base[key]), `${key} must be finite`);
}
assert(Math.abs(base.fz - 200) < 0.5, 'RFT solution should balance requested vertical load');
assert(base.z > 0 && base.z < standard.radius * 0.82 + 1e-9, 'sinkage must remain inside solver range');
assert(base.samples.length > 5, 'local RFT samples should be available for visualization');

const lowSlip = RFT.simulateWheel(standard, soil, 200, 0.05, 0.60);
const highSlip = RFT.simulateWheel(standard, soil, 200, 0.40, 0.60);
assert(highSlip.fx > lowSlip.fx, 'driven-wheel traction should increase over the tested slip range');

const weak = RFT.simulateWheel(standard, soil, 200, 0.20, 0.60, { calibrationGain: 0.6 });
const strong = RFT.simulateWheel(standard, soil, 200, 0.20, 0.60, { calibrationGain: 1.8 });
assert(strong.z < weak.z, 'larger RFT stress scale should reduce required sinkage');

const withLugs = RFT.simulateWheel(lugged, soil, 200, 0.20, 0.60);
assert(withLugs.lugTractionGain > base.lugTractionGain, 'lugs should raise the proxy traction shape gain');
assert(Number.isFinite(withLugs.fx) && Number.isFinite(withLugs.fz), 'lugged wheel must remain finite');

console.log('rft-model tests passed');
