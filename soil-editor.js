'use strict';

(function initSoilEditor() {
  const model = globalThis.SoilParameterModel;
  if (!model || typeof SOILS === 'undefined' || typeof recalc !== 'function' || typeof els === 'undefined') return;

  const ui = {
    kc: document.querySelector('#customSoilKcInput'),
    kphi: document.querySelector('#customSoilKphiInput'),
    n: document.querySelector('#customSoilNInput'),
    cohesion: document.querySelector('#customSoilCohesionInput'),
    phi: document.querySelector('#customSoilPhiInput'),
    K: document.querySelector('#customSoilKInput'),
    density: document.querySelector('#customSoilDensityInput'),
    rut: document.querySelector('#customSoilRutInput'),
    flow: document.querySelector('#customSoilFlowInput'),
    nOut: document.querySelector('#customSoilNOut'),
    cohesionOut: document.querySelector('#customSoilCohesionOut'),
    phiOut: document.querySelector('#customSoilPhiOut'),
    KOut: document.querySelector('#customSoilKOut'),
    densityOut: document.querySelector('#customSoilDensityOut'),
    rutOut: document.querySelector('#customSoilRutOut'),
    flowOut: document.querySelector('#customSoilFlowOut'),
    summary: document.querySelector('#customSoilSummary'),
    preview: document.querySelector('#soilPreviewCanvas'),
    reset: document.querySelector('#resetCustomSoilBtn'),
    loadSelected: document.querySelector('#loadSelectedSoilBtn'),
    profileName: document.querySelector('#soilProfileName'),
    saveProfile: document.querySelector('#saveSoilProfileBtn'),
    savedProfiles: document.querySelector('#savedSoilProfileSelect'),
    loadProfile: document.querySelector('#loadSoilProfileBtn'),
    deleteProfile: document.querySelector('#deleteSoilProfileBtn'),
  };

  if (!ui.preview || !ui.kc || !ui.kphi) return;
  const ctx = ui.preview.getContext('2d');
  const STORAGE_KEY = 'wheel-terrain-sim.soilProfiles.v1';

  function readForm() {
    return model.deriveSoil({
      name: 'カスタム地盤',
      kc: Number(ui.kc.value),
      kphi: Number(ui.kphi.value),
      n: Number(ui.n.value),
      cohesion: Number(ui.cohesion.value),
      phiDeg: Number(ui.phi.value),
      K: Number(ui.K.value) / 1000,
      density: Number(ui.density.value),
      rutFactor: Number(ui.rut.value),
      flow: Number(ui.flow.value),
    });
  }

  function writeForm(soilInput) {
    const soil = model.deriveSoil(soilInput);
    ui.kc.value = Math.round(soil.kc);
    ui.kphi.value = Math.round(soil.kphi);
    ui.n.value = soil.n.toFixed(2);
    ui.cohesion.value = Math.round(soil.cohesion);
    ui.phi.value = soil.phiDeg.toFixed(0);
    ui.K.value = (soil.K * 1000).toFixed(0);
    ui.density.value = Math.round(soil.density);
    ui.rut.value = soil.rutFactor.toFixed(2);
    ui.flow.value = soil.flow.toFixed(2);
  }

  function ensureCustomOption() {
    let option = Array.from(els.soil.options).find(item => item.value === 'custom');
    if (!option) {
      option = new Option('カスタム地盤', 'custom');
      els.soil.add(option);
    }
  }

  function updateOutputs(soil) {
    ui.nOut.value = soil.n.toFixed(2);
    ui.cohesionOut.value = `${Math.round(soil.cohesion).toLocaleString()} Pa`;
    ui.phiOut.value = `${soil.phiDeg.toFixed(0)}°`;
    ui.KOut.value = `${(soil.K * 1000).toFixed(0)} mm`;
    ui.densityOut.value = `${Math.round(soil.density)} kg/m³`;
    ui.rutOut.value = soil.rutFactor.toFixed(2);
    ui.flowOut.value = soil.flow.toFixed(2);

    const width = (typeof WHEELS !== 'undefined' && WHEELS[els.wheel.value]?.width) || 0.08;
    const summary = model.summarizeSoil(soil, width);
    ui.summary.innerHTML = `
      <div><span>10 mm沈下時の支持圧</span><strong>${(summary.pressure10mmPa / 1000).toFixed(1)} kPa</strong></div>
      <div><span>30 mm沈下時の支持圧</span><strong>${(summary.pressure30mmPa / 1000).toFixed(1)} kPa</strong></div>
      <div><span>50 kPa時のせん断強度</span><strong>${(summary.shearAt50kPaPa / 1000).toFixed(1)} kPa</strong></div>
      <div><span>変形しやすさ指数</span><strong>${summary.deformationIndex.toFixed(2)} ×</strong></div>
      <p>支持圧は現在選択中のタイヤ幅を使ったBekker式の参考値です。実地盤へ使う場合はパラメータ同定が必要です。</p>`;
  }

  function drawAxes(x, y, w, h, xLabel, yLabel) {
    ctx.strokeStyle = '#43516e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    ctx.fillStyle = '#94a3bd';
    ctx.font = '12px system-ui';
    ctx.fillText(xLabel, x + w - 78, y + h + 28);
    ctx.save();
    ctx.translate(x - 38, y + 74);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }

  function drawPreview(soil) {
    const W = ui.preview.width;
    const H = ui.preview.height;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#09101f');
    bg.addColorStop(1, '#111b30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const wheelWidth = (typeof WHEELS !== 'undefined' && WHEELS[els.wheel.value]?.width) || 0.08;
    const left = { x: 72, y: 72, w: 340, h: 285 };
    const right = { x: 548, y: 72, w: 340, h: 285 };

    ctx.fillStyle = '#eef3ff';
    ctx.font = '700 15px system-ui';
    ctx.fillText('Pressure–sinkage', left.x, 34);
    ctx.fillText('Shear strength envelope', right.x, 34);
    drawAxes(left.x, left.y, left.w, left.h, '沈下量 z [mm]', '支持圧 p [kPa]');
    drawAxes(right.x, right.y, right.w, right.h, '法線圧 p [kPa]', 'せん断強度 τ [kPa]');

    const maxDepth = 0.06;
    const pressures = [];
    for (let i = 0; i <= 60; i++) pressures.push(model.pressureAtDepth(soil, i / 1000, wheelWidth));
    const maxP = Math.max(1000, ...pressures) * 1.08;

    ctx.strokeStyle = '#6ee7ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    pressures.forEach((p, i) => {
      const x = left.x + (i / 60) * left.w;
      const y = left.y + left.h - (p / maxP) * left.h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#94a3bd';
    ctx.font = '11px system-ui';
    for (const mm of [0, 20, 40, 60]) {
      const x = left.x + mm / 60 * left.w;
      ctx.fillText(String(mm), x - 6, left.y + left.h + 17);
    }
    for (let i = 0; i <= 4; i++) {
      const p = maxP * i / 4;
      const y = left.y + left.h - i / 4 * left.h;
      ctx.fillText((p / 1000).toFixed(0), left.x - 42, y + 4);
      ctx.strokeStyle = 'rgba(67,81,110,.35)';
      ctx.beginPath(); ctx.moveTo(left.x, y); ctx.lineTo(left.x + left.w, y); ctx.stroke();
    }

    const shearMaxPressure = 200000;
    const shearValues = [];
    for (let i = 0; i <= 80; i++) shearValues.push(model.shearStrengthAtPressure(soil, shearMaxPressure * i / 80));
    const maxTau = Math.max(1000, ...shearValues) * 1.08;
    ctx.strokeStyle = '#f8c15c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    shearValues.forEach((tau, i) => {
      const x = right.x + (i / 80) * right.w;
      const y = right.y + right.h - (tau / maxTau) * right.h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#94a3bd';
    for (const pKpa of [0, 50, 100, 150, 200]) {
      const x = right.x + pKpa / 200 * right.w;
      ctx.fillText(String(pKpa), x - 8, right.y + right.h + 17);
    }
    for (let i = 0; i <= 4; i++) {
      const tau = maxTau * i / 4;
      const y = right.y + right.h - i / 4 * right.h;
      ctx.fillText((tau / 1000).toFixed(0), right.x - 42, y + 4);
      ctx.strokeStyle = 'rgba(67,81,110,.35)';
      ctx.beginPath(); ctx.moveTo(right.x, y); ctx.lineTo(right.x + right.w, y); ctx.stroke();
    }

    ctx.fillStyle = '#dce8ff';
    ctx.font = '13px system-ui';
    ctx.fillText(`kc ${Math.round(soil.kc).toLocaleString()}  /  kφ ${Math.round(soil.kphi).toLocaleString()}  /  n ${soil.n.toFixed(2)}`, left.x, H - 52);
    ctx.fillText(`c ${Math.round(soil.cohesion).toLocaleString()} Pa  /  φ ${soil.phiDeg.toFixed(0)}°  /  K ${(soil.K * 1000).toFixed(0)} mm`, right.x, H - 52);
  }

  function loadProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(item => model.toProfile(item, item?.name)).filter(item => item.name) : [];
    } catch (_) {
      return [];
    }
  }

  function saveProfiles(profiles) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); } catch (_) { /* storage can be disabled */ }
  }

  function refreshProfileSelect() {
    const profiles = loadProfiles();
    const previous = ui.savedProfiles.value;
    ui.savedProfiles.innerHTML = '';
    if (!profiles.length) ui.savedProfiles.add(new Option('保存された地盤はありません', ''));
    profiles.forEach((profile, index) => ui.savedProfiles.add(new Option(profile.name, String(index))));
    if (profiles[Number(previous)]) ui.savedProfiles.value = previous;
  }

  function applyCustom({ select = true, resetTerrain = true, dispatch = true } = {}) {
    const soil = readForm();
    SOILS.custom = soil;
    ensureCustomOption();
    if (select) els.soil.value = 'custom';
    updateOutputs(soil);
    drawPreview(soil);
    recalc(resetTerrain);
    if (dispatch) els.soil.dispatchEvent(new Event('change', { bubbles: true }));
    return soil;
  }

  const liveControls = [ui.kc, ui.kphi, ui.n, ui.cohesion, ui.phi, ui.K, ui.density, ui.rut, ui.flow];
  liveControls.forEach(control => {
    control?.addEventListener('input', () => applyCustom({ select: true, resetTerrain: true, dispatch: true }));
    control?.addEventListener('change', () => applyCustom({ select: true, resetTerrain: true, dispatch: true }));
  });

  ui.reset?.addEventListener('click', () => {
    writeForm(model.DEFAULT_SOIL);
    applyCustom({ select: true, resetTerrain: true, dispatch: true });
  });

  ui.loadSelected?.addEventListener('click', () => {
    const selected = SOILS[els.soil.value] || model.DEFAULT_SOIL;
    writeForm(selected);
    applyCustom({ select: true, resetTerrain: true, dispatch: true });
  });

  ui.saveProfile?.addEventListener('click', () => {
    const soil = readForm();
    const name = (ui.profileName.value || '').trim() || `地盤 ${new Date().toLocaleString('ja-JP')}`;
    const profiles = loadProfiles();
    const profile = model.toProfile(soil, name);
    const existing = profiles.findIndex(item => item.name === name);
    if (existing >= 0) profiles[existing] = profile;
    else profiles.push(profile);
    saveProfiles(profiles.slice(-30));
    ui.profileName.value = name;
    refreshProfileSelect();
    const idx = loadProfiles().findIndex(item => item.name === name);
    if (idx >= 0) ui.savedProfiles.value = String(idx);
  });

  ui.loadProfile?.addEventListener('click', () => {
    const profiles = loadProfiles();
    const profile = profiles[Number(ui.savedProfiles.value)];
    if (!profile) return;
    writeForm(profile);
    ui.profileName.value = profile.name;
    applyCustom({ select: true, resetTerrain: true, dispatch: true });
  });

  ui.deleteProfile?.addEventListener('click', () => {
    const profiles = loadProfiles();
    const index = Number(ui.savedProfiles.value);
    if (!Number.isInteger(index) || !profiles[index]) return;
    profiles.splice(index, 1);
    saveProfiles(profiles);
    refreshProfileSelect();
  });

  writeForm(model.DEFAULT_SOIL);
  const initial = model.deriveSoil(model.DEFAULT_SOIL);
  SOILS.custom = initial;
  ensureCustomOption();
  updateOutputs(initial);
  drawPreview(initial);
  refreshProfileSelect();
  recalc(false);
})();
