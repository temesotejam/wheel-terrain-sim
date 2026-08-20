'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

for (const id of [
  'wheelPreviewCanvas',
  'customRadiusInput',
  'customWidthInput',
  'customLugHeightInput',
  'customLugCountInput',
  'customLugAngleInput',
  'customWheelSummary',
  'resetCustomWheelBtn',
  'loadSelectedWheelBtn',
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
}

for (const asset of ['wheel-editor.css', 'wheel-geometry.js', 'wheel-editor.js']) {
  assert.ok(html.includes(asset), `index.html must load ${asset}`);
}

const geometryPos = html.indexOf('wheel-geometry.js');
const editorPos = html.indexOf('wheel-editor.js');
assert.ok(geometryPos >= 0 && editorPos > geometryPos, 'geometry model must load before editor');

console.log('wheel editor UI wiring tests passed');
