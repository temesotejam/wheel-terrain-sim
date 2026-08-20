'use strict';

(function initRFTAlphaEditor() {
  const model = globalThis.RFTAlphaMapModel;
  if (!model || typeof SOILS === 'undefined') return;

  const ui = {
    heatX: document.querySelector('#alphaXHeatmap'),
    heatZ: document.querySelector('#alphaZHeatmap'),
    beta: document.querySelector('#alphaSelectedBeta'),
    gamma: document.querySelector('#alphaSelectedGamma'),
    ax: document.querySelector('#alphaXValueInput'),
    az: document.querySelector('#alphaZValueInput'),
    summary: document.querySelector('#alphaMapSummary'),
    regenerate: document.querySelector('#alphaRegenerateProxyBtn'),
    exportCsv: document.querySelector('#alphaExportCsvBtn'),
    importCsv: document.querySelector('#alphaImportCsvInput'),
    profileName: document.querySelector('#alphaProfileName'),
    saveProfile: document.querySelector('#alphaSaveProfileBtn'),
    profileSelect: document.querySelector('#savedAlphaProfileSelect'),
    loadProfile: document.querySelector('#alphaLoadProfileBtn'),
    deleteProfile: document.querySelector('#alphaDeleteProfileBtn'),
  };
  if (!ui.heatX || !ui.heatZ || !ui.ax || !ui.az) return;

  const STORAGE_KEY = 'wheelTerrainRftAlphaMapsV1';
  const layout = { left: 58, right: 18, top: 28, bottom: 46 };
  let activeMap = null;
  let selected = { bi: 6, gi: 3 };

  function currentSoil() {
    const key = document.querySelector('#soilSelect')?.value || 'softSand';
    return SOILS[key] || SOILS.softSand || Object.values(SOILS)[0];
  }

  function loadProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && model.validateMap(item.map)).slice(0, 20) : [];
    } catch { return []; }
  }

  function saveProfiles(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
  }

  function refreshProfileSelect() {
    if (!ui.profileSelect) return;
    const items = loadProfiles();
    ui.profileSelect.innerHTML = items.length
      ? items.map((item, idx) => `<option value="${idx}">${item.name}</option>`).join('')
      : '<option value="">保存済みマップなし</option>';
  }

  function notify() {
    window.dispatchEvent(new CustomEvent('rft-alpha-map-change', { detail: { map: activeMap } }));
  }

  function setActiveMap(map, doNotify = true) {
    if (!model.validateMap(map)) throw new Error('Invalid alpha map');
    activeMap = model.cloneMap(map);
    globalThis.__activeRFTAlphaMap = activeMap;
    drawAll();
    updateSelectedInputs();
    updateSummary();
    if (doNotify) notify();
  }

  globalThis.getActiveRFTAlphaMap = () => activeMap;

  function colorFor(value, maxAbs) {
    const t = Math.min(1, Math.abs(value) / Math.max(maxAbs, 1));
    if (value >= 0) return `rgba(110,231,255,${0.14 + 0.78 * t})`;
    return `rgba(248,193,92,${0.14 + 0.78 * t})`;
  }

  function drawHeatmap(canvas, field, label) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#09101f'; ctx.fillRect(0, 0, W, H);
    if (!activeMap) return;
    const rows = model.BETA_VALUES.length, cols = model.GAMMA_VALUES.length;
    const cw = (W - layout.left - layout.right) / cols;
    const ch = (H - layout.top - layout.bottom) / rows;
    const maxAbs = Math.max(1, ...activeMap[field].flat().map(Math.abs));

    ctx.font = '11px system-ui';
    for (let bi = 0; bi < rows; bi++) {
      for (let gi = 0; gi < cols; gi++) {
        const x = layout.left + gi * cw;
        const y = layout.top + (rows - 1 - bi) * ch;
        const value = activeMap[field][bi][gi];
        ctx.fillStyle = colorFor(value, maxAbs);
        ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        if (bi === selected.bi && gi === selected.gi) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
          ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
        }
      }
    }

    ctx.fillStyle = '#eef3ff'; ctx.font = '700 14px system-ui';
    ctx.fillText(`${label} [kN/m³]`, layout.left, 18);
    ctx.fillStyle = '#94a3bd'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    model.GAMMA_VALUES.forEach((g, gi) => {
      if (gi % 2 === 0) ctx.fillText(`${g}°`, layout.left + (gi + .5) * cw, H - 25);
    });
    ctx.textAlign = 'right';
    model.BETA_VALUES.forEach((b, bi) => {
      if (bi % 2 === 0) ctx.fillText(`${b}°`, layout.left - 7, layout.top + (rows - bi - .5) * ch + 3);
    });
    ctx.textAlign = 'center';
    ctx.fillText('γ 速度角', layout.left + (cols * cw) / 2, H - 7);
    ctx.save(); ctx.translate(13, layout.top + rows * ch / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('β 要素姿勢角', 0, 0); ctx.restore();
  }

  function drawAll() {
    drawHeatmap(ui.heatX, 'alphaX', 'αx');
    drawHeatmap(ui.heatZ, 'alphaZ', 'αz');
  }

  function pickCell(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * sx;
    const y = (event.clientY - rect.top) * sy;
    const rows = model.BETA_VALUES.length, cols = model.GAMMA_VALUES.length;
    const cw = (canvas.width - layout.left - layout.right) / cols;
    const ch = (canvas.height - layout.top - layout.bottom) / rows;
    const gi = Math.floor((x - layout.left) / cw);
    const displayRow = Math.floor((y - layout.top) / ch);
    const bi = rows - 1 - displayRow;
    if (bi < 0 || bi >= rows || gi < 0 || gi >= cols) return;
    selected = { bi, gi };
    updateSelectedInputs();
    drawAll();
  }

  function updateSelectedInputs() {
    if (!activeMap) return;
    const beta = model.BETA_VALUES[selected.bi], gamma = model.GAMMA_VALUES[selected.gi];
    if (ui.beta) ui.beta.textContent = `${beta}°`;
    if (ui.gamma) ui.gamma.textContent = `${gamma}°`;
    ui.ax.value = (activeMap.alphaX[selected.bi][selected.gi] / 1000).toFixed(2);
    ui.az.value = (activeMap.alphaZ[selected.bi][selected.gi] / 1000).toFixed(2);
  }

  function updateSelectedCell() {
    if (!activeMap) return;
    const beta = model.BETA_VALUES[selected.bi], gamma = model.GAMMA_VALUES[selected.gi];
    const ax = Number(ui.ax.value) * 1000, az = Number(ui.az.value) * 1000;
    if (!Number.isFinite(ax) || !Number.isFinite(az)) return;
    model.setCell(activeMap, beta, gamma, ax, az);
    globalThis.__activeRFTAlphaMap = activeMap;
    drawAll(); updateSummary(); notify();
  }

  function updateSummary() {
    if (!activeMap || !ui.summary) return;
    const s = model.stats(activeMap);
    ui.summary.innerHTML = `
      <div><span>マップ名</span><strong>${activeMap.name || 'RFT alpha map'}</strong></div>
      <div><span>由来</span><strong>${activeMap.source || 'unknown'}</strong></div>
      <div><span>元地盤</span><strong>${activeMap.sourceSoil || '—'}</strong></div>
      <div><span>|αx|max</span><strong>${(s.maxAbsX / 1000).toFixed(0)} kN/m³</strong></div>
      <div><span>|αz|max</span><strong>${(s.maxAbsZ / 1000).toFixed(0)} kN/m³</strong></div>
      <p>正値は +x / +z 方向、負値は −x / −z 方向の抵抗応力/深さです。β,γ の角度規約はこの画面の軸定義に固定しています。</p>`;
  }

  function regenerate() {
    setActiveMap(model.makeProxyMap(currentSoil(), { name: `Proxy: ${currentSoil()?.name || 'soil'}` }));
  }

  function downloadCsv() {
    const csv = model.toCSV(activeMap);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rft-alpha-map.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importCsv(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const map = model.fromCSV(text, file.name.replace(/\.csv$/i, '') || 'Imported alpha map');
      setActiveMap(map);
    } catch (err) {
      alert(`RFT α CSVの読込に失敗しました: ${err.message}`);
    } finally {
      ui.importCsv.value = '';
    }
  }

  ui.heatX.addEventListener('click', e => pickCell(ui.heatX, e));
  ui.heatZ.addEventListener('click', e => pickCell(ui.heatZ, e));
  ui.ax.addEventListener('change', updateSelectedCell);
  ui.az.addEventListener('change', updateSelectedCell);
  ui.regenerate?.addEventListener('click', regenerate);
  ui.exportCsv?.addEventListener('click', downloadCsv);
  ui.importCsv?.addEventListener('change', () => importCsv(ui.importCsv.files?.[0]));

  ui.saveProfile?.addEventListener('click', () => {
    const name = (ui.profileName?.value || '').trim() || activeMap.name || `alpha map ${new Date().toLocaleString()}`;
    const items = loadProfiles();
    const record = { name, map: model.cloneMap({ ...activeMap, name }), savedAt: new Date().toISOString() };
    const existing = items.findIndex(item => item.name === name);
    if (existing >= 0) items.splice(existing, 1);
    items.unshift(record); saveProfiles(items); refreshProfileSelect();
    if (ui.profileName) ui.profileName.value = '';
  });

  ui.loadProfile?.addEventListener('click', () => {
    const items = loadProfiles();
    const idx = Number(ui.profileSelect?.value);
    if (Number.isInteger(idx) && items[idx]) setActiveMap(items[idx].map);
  });

  ui.deleteProfile?.addEventListener('click', () => {
    const items = loadProfiles();
    const idx = Number(ui.profileSelect?.value);
    if (Number.isInteger(idx) && items[idx]) { items.splice(idx, 1); saveProfiles(items); refreshProfileSelect(); }
  });

  refreshProfileSelect();
  setActiveMap(model.makeProxyMap(currentSoil(), { name: `Proxy: ${currentSoil()?.name || 'soil'}` }), false);
  notify();
})();
