'use strict';

const assert = require('assert');
const Alpha = require('../rft-alpha-map.js');
const RFT = require('../rft-model.js');

const soil = { name: 'sand', kc: 14000, kphi: 820000, n: 1.10, cohesion: 400, phiDeg: 28 };
const wheel = { radius: 0.15, width: 0.08, lugHeight: 0 };
const map = Alpha.makeProxyMap(soil);

const base = RFT.simulateWheel(wheel, soil, 200, 0.20, 0.60, { alphaMap: map, leadingEdgeOnly: true });
assert(base.alphaMapActive, 'solver should report active alpha map');
assert.strictEqual(base.alphaMapName, map.name);
for (const key of ['fx', 'fz', 'torque', 'z', 'alphaRef']) assert(Number.isFinite(base[key]), `${key} must be finite`);
assert(Math.abs(base.fz - 200) < 0.5, 'alpha-map RFT should balance requested vertical load');
assert(base.samples.every(s => Number.isFinite(s.betaDeg) && Number.isFinite(s.gammaDeg)), 'samples should expose beta/gamma');

const strongMap = Alpha.cloneMap(map);
for (let bi = 0; bi < strongMap.alphaX.length; bi++) {
  for (let gi = 0; gi < strongMap.alphaX[bi].length; gi++) {
    strongMap.alphaX[bi][gi] *= 1.8;
    strongMap.alphaZ[bi][gi] *= 1.8;
  }
}
const strong = RFT.simulateWheel(wheel, soil, 200, 0.20, 0.60, { alphaMap: strongMap, leadingEdgeOnly: true });
assert(strong.z < base.z, 'larger alpha map magnitude should reduce required sinkage');

const noLeadingFilter = RFT.simulateWheel(wheel, soil, 200, 0.20, 0.60, { alphaMap: map, leadingEdgeOnly: false });
assert(Number.isFinite(noLeadingFilter.fx) && Number.isFinite(noLeadingFilter.fz), 'full-surface map mode must remain finite');

console.log('rft-alpha-integration tests passed');
