'use strict';

(function initWheelEditor() {
  const model = globalThis.WheelGeometryModel;
  if (!model || typeof WHEELS === 'undefined' || typeof recalc !== 'function') return;

  const ui = {
    radius: document.querySelector('#customRadiusInput'),
    width: document.querySelector('#customWidthInput'),
    lugHeight: document.querySelector('#customLugHeightInput'),
    lugCount: document.querySelector('#customLugCountInput'),
    lugAngle: document.querySelector('#customLugAngleInput'),
    radiusOut: document.querySelector('#customRadiusOut'),
    widthOut: document.querySelector('#customWidthOut'),
    lugHeightOut: document.querySelector('#customLugHeightOut'),
    lugCountOut: document.querySelector('#customLugCountOut'),
    lugAngleOut: document.querySelector('#customLugAngleOut'),
    summary: document.querySelector('#customWheelSummary'),
    preview: document.querySelector('#wheelPreviewCanvas'),
    reset: document.querySelector('#resetCustomWheelBtn'),
    loadSelected: document.querySelector('#loadSelectedWheelBtn'),
  };

  if (!ui.preview || !ui.radius) return;

  const ctx = ui.preview.getContext('2d');
  const DEFAULTS = { radius: 0.15, width: 0.08, lugHeight: 0.012, lugCount: 16, lugAngleDeg: 90 };

  function readForm() {
    return {
      radius: Number(ui.radius.value) / 1000,
      width: Number(ui.width.value) / 1000,
      lugHeight: Number(ui.lugHeight.value) / 1000,
      lugCount: Number(ui.lugCount.value),
      lugAngleDeg: Number(ui.lugAngle.value),
      name: 'カスタムタイヤ',
    };
  }

  function writeForm(wheel) {
    ui.radius.value = Math.round((wheel.radius ?? DEFAULTS.radius) * 1000);
    ui.width.value = Math.round((wheel.width ?? DEFAULTS.width) * 1000);
    ui.lugHeight.value = Math.round((wheel.lugHeight ?? 0) * 1000);
    ui.lugCount.value = wheel.lugCount ?? ((wheel.lugHeight ?? 0) > 0 ? 16 : 0);
    ui.lugAngle.value = wheel.lugAngleDeg ?? 90;
  }

  function ensureCustomOption() {
    let option = Array.from(els.wheel.options).find(item => item.value === 'custom');
    if (!option) {
      option = new Option('カスタムタイヤ', 'custom');
      els.wheel.add(option);
    }
  }

  function updateOutputs(wheel) {
    ui.radiusOut.value = `${Math.round(wheel.radius * 1000)} mm`;
    ui.widthOut.value = `${Math.round(wheel.width * 1000)} mm`;
    ui.lugHeightOut.value = `${Math.round(wheel.lugHeight * 1000)} mm`;
    ui.lugCountOut.value = `${wheel.lugCount} 本`;
    ui.lugAngleOut.value = `${wheel.lugAngleDeg.toFixed(0)}°`;

    const patternLabel = wheel.lugCount === 0 || wheel.lugHeight <= 1e-6
      ? 'スリック'
      : wheel.lugAngleDeg >= 70 ? '横ラグ寄り' : wheel.lugAngleDeg <= 25 ? '縦ラグ寄り' : '斜めラグ';

    ui.summary.innerHTML = `
      <div><span>パターン</span><strong>${patternLabel}</strong></div>
      <div><span>有効せん断指数</span><strong>${wheel.effectiveShearIndex.toFixed(3)} ×</strong></div>
      <div><span>転がり抵抗補正</span><strong>${wheel.rrGain.toFixed(3)} ×</strong></div>
      <div><span>ラグ円周ピッチ</span><strong>${wheel.lugCount ? wheel.treadPitchDeg.toFixed(1) + '°' : '—'}</strong></div>
      <p>ラグ本数・角度は現段階では経験的な係数へ変換しており、実測同定前の相対比較用です。</p>`;
  }

  function drawDimension(x1, y1, x2, y2, label) {
    ctx.strokeStyle = 'rgba(220,232,255,.65)';
    ctx.fillStyle = '#dce8ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    for (const [x, y, s] of [[x1, y1, 1], [x2, y2, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s * 8 * Math.cos(angle - .55), y + s * 8 * Math.sin(angle - .55));
      ctx.lineTo(x + s * 8 * Math.cos(angle + .55), y + s * 8 * Math.sin(angle + .55));
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = '13px system-ui';
    ctx.fillText(label, (x1 + x2) / 2 + 7, (y1 + y2) / 2 - 7);
  }

  function drawPreview(wheel) {
    const W = ui.preview.width;
    const H = ui.preview.height;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#09101f');
    bg.addColorStop(1, '#111b30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#eef3ff';
    ctx.font = '700 15px system-ui';
    ctx.fillText('側面形状', 38, 34);
    ctx.fillText('接地面パターン（上面）', W * 0.54, 34);

    const sideCx = W * 0.25;
    const sideCy = H * 0.53;
    const maxOuterM = wheel.radius + wheel.lugHeight;
    const scale = Math.min(155 / Math.max(maxOuterM, 0.04), 1150);
    const R = wheel.radius * scale;
    const lugPx = wheel.lugHeight * scale;

    ctx.fillStyle = '#1d293d';
    ctx.strokeStyle = '#a8b6cf';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sideCx, sideCy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (wheel.lugCount > 0 && lugPx > .5) {
      ctx.strokeStyle = '#f8c15c';
      ctx.lineWidth = Math.max(3, Math.min(10, 4 + wheel.width * 24));
      for (let k = 0; k < wheel.lugCount; k++) {
        const a = k / wheel.lugCount * Math.PI * 2;
        const r0 = R - 1;
        const r1 = R + lugPx;
        ctx.beginPath();
        ctx.moveTo(sideCx + Math.cos(a) * r0, sideCy + Math.sin(a) * r0);
        ctx.lineTo(sideCx + Math.cos(a) * r1, sideCy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#53647f';
    ctx.lineWidth = 3;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sideCx, sideCy);
      ctx.lineTo(sideCx + Math.cos(a) * R * .72, sideCy + Math.sin(a) * R * .72);
      ctx.stroke();
    }
    ctx.fillStyle = '#91a4c3';
    ctx.beginPath();
    ctx.arc(sideCx, sideCy, 10, 0, Math.PI * 2);
    ctx.fill();

    drawDimension(sideCx - R, sideCy + R + lugPx + 35, sideCx + R, sideCy + R + lugPx + 35, `直径 ${(wheel.radius * 2000).toFixed(0)} mm`);
    if (lugPx > .5) drawDimension(sideCx + R + 24, sideCy, sideCx + R + lugPx + 24, sideCy, `ラグ ${Math.round(wheel.lugHeight * 1000)} mm`);

    const left = W * 0.55;
    const top = 95;
    const fw = W * 0.37;
    const fh = Math.min(230, Math.max(70, wheel.width / 0.22 * 230));
    const centerY = top + 125;
    const y0 = centerY - fh / 2;

    ctx.fillStyle = '#1d293d';
    ctx.strokeStyle = '#a8b6cf';
    ctx.lineWidth = 3;
    ctx.fillRect(left, y0, fw, fh);
    ctx.strokeRect(left, y0, fw, fh);

    if (wheel.lugCount > 0 && wheel.lugHeight > 1e-6) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y0, fw, fh);
      ctx.clip();
      ctx.strokeStyle = '#f8c15c';
      ctx.lineWidth = Math.max(3, Math.min(11, 3 + wheel.lugHeight * 330));
      const visibleBars = Math.max(3, Math.min(18, Math.round(wheel.lugCount * .55)));
      const spacing = fw / visibleBars;
      const a = wheel.lugAngleDeg * Math.PI / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const lineLen = Math.hypot(fw, fh) * 1.2;
      for (let k = -1; k <= visibleBars + 1; k++) {
        const cx = left + k * spacing;
        const cy = centerY;
        ctx.beginPath();
        ctx.moveTo(cx - dx * lineLen / 2, cy - dy * lineLen / 2);
        ctx.lineTo(cx + dx * lineLen / 2, cy + dy * lineLen / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.fillStyle = '#6ee7ff';
    ctx.font = '700 13px system-ui';
    ctx.fillText('進行方向 →', left + fw * .36, y0 + fh + 38);
    drawDimension(left - 25, y0, left - 25, y0 + fh, `幅 ${(wheel.width * 1000).toFixed(0)} mm`);

    ctx.fillStyle = '#94a3bd';
    ctx.font = '13px system-ui';
    ctx.fillText(`ラグ ${wheel.lugCount} 本 / ${wheel.lugAngleDeg.toFixed(0)}°`, left, H - 34);
  }

  function notifyViews() {
    // Programmatic select changes do not emit DOM events. Dispatching this event
    // lets both app.js and repass.js refresh their own derived tables/plots.
    els.wheel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyCustom({ select = true, resetTerrain = true } = {}) {
    const wheel = model.deriveWheelGeometry(readForm());
    WHEELS.custom = wheel;
    ensureCustomOption();
    if (select) els.wheel.value = 'custom';
    updateOutputs(wheel);
    drawPreview(wheel);
    recalc(resetTerrain);
    notifyViews();
    return wheel;
  }

  const controls = [ui.radius, ui.width, ui.lugHeight, ui.lugCount, ui.lugAngle];
  controls.forEach(control => control.addEventListener('input', () => applyCustom({ select: true, resetTerrain: true })));

  ui.reset?.addEventListener('click', () => {
    writeForm(DEFAULTS);
    applyCustom({ select: true, resetTerrain: true });
  });

  ui.loadSelected?.addEventListener('click', () => {
    const selected = WHEELS[els.wheel.value] || WHEELS.standard;
    writeForm({
      ...selected,
      lugCount: selected.lugCount ?? (selected.lugHeight > 0 ? 16 : 0),
      lugAngleDeg: selected.lugAngleDeg ?? 90,
    });
    applyCustom({ select: true, resetTerrain: true });
  });

  writeForm(DEFAULTS);
  const initial = model.deriveWheelGeometry({ ...DEFAULTS, name: 'カスタムタイヤ' });
  WHEELS.custom = initial;
  ensureCustomOption();
  updateOutputs(initial);
  drawPreview(initial);
  recalc(false);
  notifyViews();
})();
