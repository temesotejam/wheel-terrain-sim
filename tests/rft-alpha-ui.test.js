'use strict';

const assert = require('assert');
const fs = require('fs');

const sync = fs.readFileSync('editor-sync.js', 'utf8');
const editor = fs.readFileSync('rft-alpha-editor.js', 'utf8');
const compare = fs.readFileSync('rft-compare.js', 'utf8');

for (const id of [
  'alphaXHeatmap', 'alphaZHeatmap', 'alphaXValueInput', 'alphaZValueInput',
  'alphaRegenerateProxyBtn', 'alphaExportCsvBtn', 'alphaImportCsvInput',
  'alphaProfileName', 'alphaSaveProfileBtn', 'savedAlphaProfileSelect',
  'alphaLoadProfileBtn', 'alphaDeleteProfileBtn',
]) {
  assert(sync.includes(`id=\"${id}\"`), `missing dynamically injected alpha UI element: ${id}`);
}
assert(sync.includes("rft-alpha-editor.css"), 'alpha editor stylesheet must be loaded');
assert(sync.includes("rft-alpha-map.js"), 'alpha map model must be loaded');
assert(sync.includes("rft-alpha-editor.js"), 'alpha editor script must be loaded');
assert(editor.includes('getActiveRFTAlphaMap'), 'alpha editor must expose active map getter');
assert(editor.includes('rft-alpha-map-change'), 'alpha editor must notify RFT comparison on edits');
assert(editor.includes('toCSV') && editor.includes('fromCSV'), 'alpha editor must support CSV export/import');
assert(compare.includes('getActiveRFTAlphaMap'), 'RFT comparison must consume the active alpha map');
assert(compare.includes('rft-alpha-map-change'), 'RFT comparison must refresh after alpha edits');

console.log('rft-alpha-ui tests passed');
