'use strict';

const assert = require('node:assert/strict');
const { deriveWheelGeometry } = require('../wheel-geometry.js');

function approx(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

const slick = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0, lugCount: 0 });
approx(slick.shearGain, 1);
approx(slick.rrGain, 1);
assert.equal(slick.treadPitchDeg, 0);

const lowAngle = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0.012, lugCount: 16, lugAngleDeg: 10 });
const crossBar = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0.012, lugCount: 16, lugAngleDeg: 90 });
assert.ok(crossBar.shearGain > lowAngle.shearGain, 'cross-bar lugs should have higher longitudinal shear gain in this simplified model');
assert.ok(crossBar.effectiveShearIndex > lowAngle.effectiveShearIndex);

const shallow = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0.004, lugCount: 16, lugAngleDeg: 90 });
const deep = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0.020, lugCount: 16, lugAngleDeg: 90 });
assert.ok(deep.shearGain > shallow.shearGain);
assert.ok(deep.rrGain > shallow.rrGain);

const sparse = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0.012, lugCount: 6, lugAngleDeg: 90 });
const dense = deriveWheelGeometry({ radius: 0.15, width: 0.08, lugHeight: 0.012, lugCount: 28, lugAngleDeg: 90 });
assert.ok(dense.contactPatternIndex > sparse.contactPatternIndex);

const clamped = deriveWheelGeometry({ radius: 99, width: -4, lugHeight: 99, lugCount: 999, lugAngleDeg: 999 });
assert.equal(clamped.radius, 0.50);
assert.equal(clamped.width, 0.015);
assert.equal(clamped.lugCount, 48);
assert.equal(clamped.lugAngleDeg, 90);
assert.ok(clamped.lugHeight <= clamped.radius * 0.24 + 1e-12);

for (const wheel of [slick, lowAngle, crossBar, shallow, deep, sparse, dense, clamped]) {
  for (const key of ['radius', 'width', 'lugHeight', 'shearGain', 'rrGain', 'effectiveShearIndex', 'contactPatternIndex']) {
    assert.ok(Number.isFinite(wheel[key]), `${key} must be finite`);
  }
}

console.log('wheel geometry model tests passed');
