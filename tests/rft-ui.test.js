'use strict';

const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('rft-compare.js', 'utf8');

for (const id of [
  'rftVizCanvas', 'rftCompareCanvas', 'rftCalibrationInput', 'rftCalibrationOut',
  'rftCalibrateBtn', 'rftResetCalibrationBtn', 'rftSummary', 'rftCurrentTable', 'rftWarning',
]) {
  assert(html.includes(`id="${id}"`), `missing RFT UI element: ${id}`);
}
assert(html.includes('rft-compare.css'), 'RFT stylesheet must be linked');
assert(html.includes('<script src="rft-model.js"></script>'), 'RFT model script must be loaded');
assert(html.includes('<script src="rft-compare.js"></script>'), 'RFT comparison script must be loaded');
assert(html.indexOf('rft-model.js') < html.indexOf('rft-compare.js'), 'RFT model must load before comparison UI');
assert(js.includes('integrateWheel'), 'comparison UI must call the Bekker–Wong model');
assert(js.includes('RFTModel'), 'comparison UI must call the RFT model');
assert(js.includes('calibrateToSinkage'), 'temporary sinkage calibration must be wired');

console.log('rft-ui tests passed');
