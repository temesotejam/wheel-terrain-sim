'use strict';

const assert = require('assert');
const model = require('../soil-model.js');

const base = model.deriveSoil({});
assert.strictEqual(base.name, 'カスタム地盤');
assert.ok(base.kphi > 0);
assert.ok(base.n >= 0.5 && base.n <= 1.6);

const clamped = model.deriveSoil({
  kc: -10,
  kphi: 1e10,
  n: 99,
  cohesion: -1,
  phiDeg: 90,
  K: 0,
  density: 99999,
  rutFactor: 9,
  flow: -2,
});
assert.strictEqual(clamped.kc, model.LIMITS.kc[0]);
assert.strictEqual(clamped.kphi, model.LIMITS.kphi[1]);
assert.strictEqual(clamped.n, model.LIMITS.n[1]);
assert.strictEqual(clamped.cohesion, model.LIMITS.cohesion[0]);
assert.strictEqual(clamped.phiDeg, model.LIMITS.phiDeg[1]);
assert.strictEqual(clamped.K, model.LIMITS.K[0]);
assert.strictEqual(clamped.density, model.LIMITS.density[1]);
assert.strictEqual(clamped.rutFactor, model.LIMITS.rutFactor[1]);
assert.strictEqual(clamped.flow, model.LIMITS.flow[0]);

const soft = model.deriveSoil({ kc: 14000, kphi: 820000, n: 1.10, cohesion: 400, phiDeg: 28, K: 0.025 });
const firm = model.deriveSoil({ kc: 85000, kphi: 3200000, n: 0.90, cohesion: 6500, phiDeg: 27, K: 0.014 });
const pSoft = model.pressureAtDepth(soft, 0.03, 0.08);
const pFirm = model.pressureAtDepth(firm, 0.03, 0.08);
assert.ok(Number.isFinite(pSoft) && Number.isFinite(pFirm));
assert.ok(pFirm > pSoft, 'firm soil should resist more strongly at 30 mm sinkage');

const shear = model.shearStrengthAtPressure(soft, 50000);
assert.ok(Number.isFinite(shear) && shear > soft.cohesion);

const summary = model.summarizeSoil(soft, 0.08);
for (const value of Object.values(summary)) assert.ok(Number.isFinite(value));
assert.ok(summary.pressure30mmPa > summary.pressure10mmPa);

const profile = model.toProfile(soft, 'test soil');
assert.strictEqual(profile.name, 'test soil');
assert.deepStrictEqual(Object.keys(profile).sort(), ['K','cohesion','density','flow','kc','kphi','n','name','phiDeg','rutFactor'].sort());

console.log('soil-model tests passed');
