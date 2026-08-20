'use strict';

(function initRFTComparison() {
  const model = globalThis.RFTModel;
  if (!model || typeof WHEELS === 'undefined' || typeof SOILS === 'undefined' || typeof integrateWheel !== 'function') return;

  const ui = {
    gain: document.querySelector('#rftCalibrationInput'),
    gainOut: document.querySelector('#rftCalibrationOut'),
    calibrate: document.querySelector('#rftCalibrateBtn'),
    reset: document.querySelector('#rftResetCalibrationBtn'),
    viz: document.querySelector('#rftVizCanvas'),
    chart: document.querySelector('#rftCompareCanvas'),
    summary: document.querySelector('#rftSummary'),
    table: document.querySelector('#rftCurrentTable'),
    warning: document.querySelector('#rftWarning'),
  };
  if (!ui.gain || !ui.viz || !ui.chart) return;

  const vctx = ui.viz.getContext('2d');
  const cctx = ui.chart.getContext('2d');
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const fmt = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';

  function inputs() {
    const wheelKey = document.querySelector('#wheelSelect')?.value || 'standard';
    const soilKey = document.querySelector('#soilSelect')?.value || 'softSand';
    return {
      wheelKey,
      soilKey,
      wheel: WHEELS[wheelKey] || WHEELS.standard,
      soil: SOILS[soilKey] || SOILS.softSand,
      load: Number(document.querySelector('#loadInput')?.value || 200),
      slip: Number(document.querySelector('#slipInput')?.value || 0.2),
      speed: Number(document.querySelector('#speedInput')?.value || 0.6),
      gain: Number(ui.gain.value || 1),
    };
  }

  function results(input, slip = input.slip, gain = input.gain) {
    const bw = integrateWheel(input.wheel, input.soil, input.load, slip);
    const rft = model.simulateWheel(input.wheel, input.soil, input.load, slip, input.speed, { calibrationGain: gain });
    return { bw, rft };
  }

  function drawArrow(ctx, x1, y1, x2, y2, color, width = 2) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const h = 7 + width;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - h * Math.cos(a - .5), y2 - h * Math.sin(a - .5));
    ctx.lineTo(x2 - h * Math.cos(a + .5), y2 - h * Math.sin(a + .5));
    ctx.closePath(); ctx.fill();
  }

  function drawRFTViz(input, rft) {
    const ctx = vctx, W = ui.viz.width, H = ui.viz.height;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#09101f'); bg.addColorStop(1, '#121a2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const groundY = 335;
    ctx.fillStyle = '#6d5139'; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = '#a9835d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

    const scale = Math.min(980, 130 / Math.max(input.wheel.radius, 0.05));
    const R = input.wheel.radius * scale;
    const sink = rft.z * scale;
    const cx = W * .39;
    const cy = groundY - R + sink;

    ctx.fillStyle = '#1c2639'; ctx.strokeStyle = '#a8b6cf'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if ((input.wheel.lugHeight || 0) > 0) {
      const count = input.wheel.lugCount || 16;
      ctx.strokeStyle = '#f8c15c'; ctx.lineWidth = 7;
      for (let k = 0; k < count; k++) {
        const a = k / count * Math.PI * 2;
        const extra = Math.min(14, input.wheel.lugHeight * scale);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
        ctx.lineTo(cx + Math.cos(a) * (R + extra), cy + Math.sin(a) * (R + extra));
        ctx.stroke();
      }
    }

    const maxStress = Math.max(1, rft.maxStress);
    for (const q of rft.samples) {
      const x = cx + Math.sin(q.theta) * R;
      const y = cy + Math.cos(q.theta) * R;
      const fm = Math.hypot(q.fx, q.fz) || 1;
      const stressScale = 18 + 46 * clamp(q.sigma / maxStress, 0, 1);
      drawArrow(ctx, x, y, x + q.fx / fm * stressScale, y - q.fz / fm * stressScale, '#6ee7ff', 2.2);

      const vm = Math.hypot(q.vx, q.vz) || 1;
      drawArrow(ctx, x, y, x + q.vx / vm * 20, y - q.vz / vm * 20, 'rgba(248,193,92,.72)', 1.2);
    }

    const originX = W * .70, originY = 230;
    drawArrow(ctx, originX, originY, originX + clamp(rft.fx, -250, 250) * .55, originY, '#7ce6a2', 5);
    drawArrow(ctx, originX, originY, originX, originY - clamp(rft.fz, 0, 500) * .28, '#a78bfa', 5);

    ctx.fillStyle = '#eef3ff'; ctx.font = '700 16px system-ui';
    ctx.fillText('RFT局所要素', 28, 32);
    ctx.font = '13px system-ui'; ctx.fillStyle = '#94a3bd';
    ctx.fillText('水色: 局所抵抗力 / 黄: 表面の地盤に対する運動', 28, 55);
    ctx.fillStyle = '#7ce6a2'; ctx.fillText(`Fx ${fmt(rft.fx, 1)} N`, originX, 290);
    ctx.fillStyle = '#a78bfa'; ctx.fillText(`Fz ${fmt(rft.fz, 1)} N`, originX, 312);
    ctx.fillStyle = '#eef3ff';
    ctx.fillText(`沈下 ${fmt(rft.z * 1000, 1)} mm`, originX, 334);
    ctx.fillText(`α基準 ${fmt(rft.alphaRef / 1e6, 2)} MPa/m`, originX, 356);
    ctx.fillStyle = '#94a3bd';
    ctx.fillText('各要素の深さ・向き・運動方向から局所応力を計算して積分', 28, H - 24);
  }

  function drawCompare(input) {
    const ctx = cctx, W = ui.chart.width, H = ui.chart.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#09101f'; ctx.fillRect(0, 0, W, H);

    const slips = Array.from({ length: 17 }, (_, i) => i * 0.05);
    const rows = slips.map(s => ({ s, ...results(input, s) }));
    const padL = 62, padR = 24;
    const plotW = W - padL - padR;
    const topA = 48, bottomA = 225;
    const topB = 292, bottomB = H - 48;

    function plot(panelTop, panelBottom, getA, getB, label, unit, includeZero = false) {
      const vals = rows.flatMap(row => [getA(row), getB(row)]).filter(Number.isFinite);
      let min = Math.min(...vals), max = Math.max(...vals);
      if (includeZero) { min = Math.min(0, min); max = Math.max(0, max); }
      if (Math.abs(max - min) < 1e-9) { min -= 1; max += 1; }
      const margin = (max - min) * .12;
      min -= margin; max += margin;
      const x = s => padL + s / .8 * plotW;
      const y = v => panelBottom - (v - min) / (max - min) * (panelBottom - panelTop);

      ctx.strokeStyle = '#2b3653'; ctx.lineWidth = 1;
      for (let k = 0; k <= 4; k++) {
        const yy = panelTop + (panelBottom - panelTop) * k / 4;
        ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
        const val = max - (max - min) * k / 4;
        ctx.fillStyle = '#94a3bd'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
        ctx.fillText(`${fmt(val, unit === 'mm' ? 0 : 1)}`, padL - 8, yy + 4);
      }
      if (includeZero && min < 0 && max > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(padL, y(0)); ctx.lineTo(W - padR, y(0)); ctx.stroke(); ctx.setLineDash([]);
      }

      function line(getter, color) {
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
        rows.forEach((row, idx) => {
          const xx = x(row.s), yy = y(getter(row));
          if (idx === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }); ctx.stroke();
      }
      line(getA, '#6ee7ff');
      line(getB, '#f8c15c');

      ctx.textAlign = 'left'; ctx.fillStyle = '#eef3ff'; ctx.font = '700 14px system-ui';
      ctx.fillText(`${label} (${unit})`, padL, panelTop - 14);
      ctx.fillStyle = '#6ee7ff'; ctx.fillText('Bekker–Wong', padL + 130, panelTop - 14);
      ctx.fillStyle = '#f8c15c'; ctx.fillText('RFT proxy', padL + 245, panelTop - 14);
    }

    plot(topA, bottomA, row => row.bw.fx, row => row.rft.fx, '正味推進力', 'N', true);
    plot(topB, bottomB, row => row.bw.z * 1000, row => row.rft.z * 1000, '沈下量', 'mm', false);

    ctx.fillStyle = '#94a3bd'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    for (let s = 0; s <= .8001; s += .1) {
      const xx = padL + s / .8 * plotW;
      ctx.fillText(`${Math.round(s * 100)}%`, xx, H - 20);
    }
    ctx.textAlign = 'left';
  }

  function updateText(input, bw, rft) {
    const tractionDelta = rft.fx - bw.fx;
    const sinkDelta = (rft.z - bw.z) * 1000;
    const torqueDelta = rft.torque - bw.torque;
    ui.summary.innerHTML = [
      ['推進力差', `${tractionDelta >= 0 ? '+' : ''}${fmt(tractionDelta, 1)} N`, 'RFT − Bekker'],
      ['沈下差', `${sinkDelta >= 0 ? '+' : ''}${fmt(sinkDelta, 1)} mm`, 'RFT − Bekker'],
      ['トルク差', `${torqueDelta >= 0 ? '+' : ''}${fmt(torqueDelta, 1)} N·m`, 'RFT − Bekker'],
      ['RFT α基準', `${fmt(rft.alphaRef / 1e6, 2)} MPa/m`, '25 mm深さから暫定換算'],
    ].map(([label, value, sub]) => `<div class="rft-card"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`).join('');

    ui.table.innerHTML = `<table><thead><tr><th>モデル</th><th>推進力</th><th>鉛直力</th><th>沈下</th><th>トルク</th></tr></thead><tbody>
      <tr><td>Bekker–Wong</td><td>${fmt(bw.fx, 1)} N</td><td>${fmt(bw.fz, 1)} N</td><td>${fmt(bw.z * 1000, 1)} mm</td><td>${fmt(bw.torque, 2)} N·m</td></tr>
      <tr class="rft-row"><td>RFT proxy</td><td>${fmt(rft.fx, 1)} N</td><td>${fmt(rft.fz, 1)} N</td><td>${fmt(rft.z * 1000, 1)} mm</td><td>${fmt(rft.torque, 2)} N·m</td></tr>
    </tbody></table>`;

    const warnings = [];
    if ((input.soil.cohesion || 0) > 2500) warnings.push('粘着力が大きい地盤では、乾燥粒状体向けRFTから外れるため参考値です。');
    if (rft.saturated) warnings.push('RFT側が最大沈下でも荷重を支え切れていません。α校正またはモデル範囲の見直しが必要です。');
    warnings.push('RFTの角度依存 αx/αz マップは未実測です。現在は選択地盤のpressure–sinkage特性から応力勾配を作った比較用proxyです。');
    ui.warning.textContent = warnings.join(' ');
    ui.gainOut.value = `${input.gain.toFixed(2)} ×`;
  }

  function refresh() {
    const input = inputs();
    const { bw, rft } = results(input);
    drawRFTViz(input, rft);
    drawCompare(input);
    updateText(input, bw, rft);
  }

  function calibrateToSinkage() {
    const input = inputs();
    const target = integrateWheel(input.wheel, input.soil, input.load, input.slip).z;
    let lo = Number(ui.gain.min || .25), hi = Number(ui.gain.max || 4);
    let best = 1, bestErr = Infinity;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      const z = model.simulateWheel(input.wheel, input.soil, input.load, input.slip, input.speed, { calibrationGain: mid }).z;
      const err = Math.abs(z - target);
      if (err < bestErr) { bestErr = err; best = mid; }
      if (z > target) lo = mid; else hi = mid;
    }
    ui.gain.value = clamp(best, Number(ui.gain.min), Number(ui.gain.max)).toFixed(2);
    refresh();
  }

  ui.gain.addEventListener('input', refresh);
  ui.calibrate?.addEventListener('click', calibrateToSinkage);
  ui.reset?.addEventListener('click', () => { ui.gain.value = '1'; refresh(); });
  ['wheelSelect', 'soilSelect', 'loadInput', 'slipInput', 'speedInput'].forEach(id => {
    document.querySelector(`#${id}`)?.addEventListener('input', refresh);
    document.querySelector(`#${id}`)?.addEventListener('change', refresh);
  });
  document.addEventListener('wheel-terrain-editor-sync', refresh);

  refresh();
})();
