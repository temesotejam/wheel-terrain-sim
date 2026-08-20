'use strict';

const assert = require('assert');
const Alpha = require('../rft-alpha-map.js');

const soil = { name: 'test sand', kc: 14000, kphi: 820000, n: 1.10, cohesion: 400, phiDeg: 28 };
const map = Alpha.makeProxyMap(soil);
assert(Alpha.validateMap(map), 'proxy alpha map must validate');
assert.strictEqual(map.betaValues.length, 13);
assert.strictEqual(map.gammaValues.length, 12);

const nodeBeta = 0, nodeGamma = -90;
const bi = map.betaValues.indexOf(nodeBeta), gi = map.gammaValues.indexOf(nodeGamma);
const node = Alpha.sample(map, nodeBeta, nodeGamma);
assert(Math.abs(node.alphaX - map.alphaX[bi][gi]) < 1e-9, 'sampling a grid node must reproduce alphaX');
assert(Math.abs(node.alphaZ - map.alphaZ[bi][gi]) < 1e-9, 'sampling a grid node must reproduce alphaZ');

const before = Alpha.sample(map, 0, -90);
Alpha.setCell(map, 0, -90, before.alphaX + 12345, before.alphaZ - 6789);
const after = Alpha.sample(map, 0, -90);
assert(Math.abs(after.alphaX - (before.alphaX + 12345)) < 1e-9, 'cell editor should update alphaX');
assert(Math.abs(after.alphaZ - (before.alphaZ - 6789)) < 1e-9, 'cell editor should update alphaZ');

const mid = Alpha.sample(map, 7.5, -75);
assert(Number.isFinite(mid.alphaX) && Number.isFinite(mid.alphaZ), 'bilinear interpolation must remain finite');

const csv = Alpha.toCSV(map);
assert(csv.startsWith('beta_deg,gamma_deg,alpha_x_N_m3,alpha_z_N_m3'));
const roundTrip = Alpha.fromCSV(csv, 'round trip');
assert(Alpha.validateMap(roundTrip), 'CSV round trip must validate');
const rt = Alpha.sample(roundTrip, 0, -90);
assert(Math.abs(rt.alphaX - after.alphaX) < 1e-6, 'CSV round trip must preserve alphaX');
assert(Math.abs(rt.alphaZ - after.alphaZ) < 1e-6, 'CSV round trip must preserve alphaZ');

const stats = Alpha.stats(roundTrip);
assert(stats.maxAbsX > 0 && stats.maxAbsZ > 0 && stats.rms > 0, 'map stats must be positive for proxy map');

console.log('rft-alpha-map tests passed');
