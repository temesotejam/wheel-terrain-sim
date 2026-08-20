'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'editor-sync.js'), 'utf8');

function localRefs(text, re) {
  return [...text.matchAll(re)]
    .map(m => m[1])
    .filter(ref => ref && !/^(?:https?:|data:|#)/i.test(ref));
}

const refs = new Set([
  ...localRefs(html, /<script[^>]+src=["']([^"']+)["']/gi),
  ...localRefs(html, /<link[^>]+href=["']([^"']+)["']/gi),
  ...localRefs(sync, /loadScript\(["']([^"']+)["']\)/g),
  ...localRefs(sync, /ensureStylesheet\(["']([^"']+)["']\)/g),
]);

assert(refs.size >= 10, 'expected the application to reference its local assets');
for (const ref of refs) {
  const clean = ref.split(/[?#]/)[0];
  const filePath = path.join(root, clean);
  assert(fs.existsSync(filePath), `missing referenced local asset: ${ref}`);
  assert(fs.statSync(filePath).isFile(), `referenced asset is not a file: ${ref}`);
  assert(fs.statSync(filePath).size > 0, `referenced asset is empty: ${ref}`);
}

const scriptOrder = [
  'app.js',
  'repass.js',
  'wheel-geometry.js',
  'wheel-editor.js',
  'soil-model.js',
  'soil-editor.js',
  'editor-sync.js',
  'rft-model.js',
  'rft-compare.js',
];
let previous = -1;
for (const script of scriptOrder) {
  const idx = html.indexOf(`src="${script}"`);
  assert(idx >= 0, `missing script in index.html: ${script}`);
  assert(idx > previous, `unexpected script order around ${script}`);
  previous = idx;
}

for (const file of [
  'docs/RFT_ALPHA_MAP.md',
  'README.md',
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
  'package.json',
]) {
  assert(fs.existsSync(path.join(root, file)), `missing v1 project file: ${file}`);
}

console.log(`site-integrity tests passed (${refs.size} local assets checked)`);
