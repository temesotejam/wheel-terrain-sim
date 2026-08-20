'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const editor = fs.readFileSync(path.join(__dirname, '..', 'soil-editor.js'), 'utf8');

const ids = [
  'soilPreviewCanvas', 'customSoilKcInput', 'customSoilKphiInput', 'customSoilNInput',
  'customSoilCohesionInput', 'customSoilPhiInput', 'customSoilKInput',
  'customSoilDensityInput', 'customSoilRutInput', 'customSoilFlowInput',
  'customSoilSummary', 'resetCustomSoilBtn', 'loadSelectedSoilBtn',
  'soilProfileName', 'saveSoilProfileBtn', 'savedSoilProfileSelect',
  'loadSoilProfileBtn', 'deleteSoilProfileBtn',
];

for (const id of ids) {
  assert.ok(html.includes(`id="${id}"`), `index.html missing #${id}`);
  assert.ok(editor.includes(`#${id}`), `soil-editor.js missing selector for #${id}`);
}

for (const asset of ['soil-editor.css', 'soil-model.js', 'soil-editor.js', 'editor-sync.js']) {
  assert.ok(html.includes(asset), `index.html missing ${asset}`);
}

assert.ok(editor.includes('SOILS.custom'), 'custom soil is not injected into SOILS');
assert.ok(editor.includes('localStorage'), 'saved soil profile storage is not wired');
assert.ok(editor.includes("dispatchEvent(new Event('change'"), 'custom soil changes do not notify existing analyses');

console.log('soil editor UI wiring tests passed');
