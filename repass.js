'use strict';

(() => {
  const REPASS_CONFIG = {
    softSand: { compactionGain: 1.20, phiGain: 3.0, rutCapRatio: 0.58, decay: 0.43 },
    drySand:  { compactionGain: 0.85, phiGain: 2.4, rutCapRatio: 0.48, decay: 0.48 },
    loam:     { compactionGain: 0.62, phiGain: 1.8, rutCapRatio: 0.42, decay: 0.52 },
    firm:     { compactionGain: 0.30, phiGain: 1.0, rutCapRatio: 0.30, decay: 0.60 },
  };

  const FALLBACK_CONFIG = { compactionGain: 0.70, phiGain: 2.0, rutCapRatio: 0.45, decay: 0.50 };

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function configFor(soilKey) {
    return REPASS_CONFIG[soilKey] || FALLBACK_CONFIG;
  }

  function effectiveSoilForPass(soil, soilKey, wheel, slip, passIndex) {
    const cfg = configFor(soilKey);
    const pass = Math.max(1, Math.round(passIndex));
    const lugRatio = clamp((wheel.lugHeight || 0) / Math.max(wheel.radius || 0.1, 1e-6), 0, 0.15);
    const disturbance = clamp(slip * 0.55 + lugRatio * 1.8, 0, 0.72);
    const saturation = pass <= 1 ? 0 : 1 - Math.exp(-(pass - 1) / 1.6);
    const compact = cfg.compactionGain * saturation * (1 - disturbance);
    const stiffnessGain = 1 + compact;

    return {
      ...soil,
      kc: soil.kc * (1 + 0.45 * compact),
      kphi: soil.kphi * stiffnessGain,
      cohesion: soil.cohesion * (1 + 0.28 * compact),
      phiDeg: clamp(soil.phiDeg + cfg.phiGain * compact, 0, 45),
      K: soil.K * (1 + 0.12 * compact),
      rutFactor: soil.rutFactor / (1 + 0.85 * compact),
      flow: soil.flow / (1 + 0.55 * compact),
      _stiffnessGain: stiffnessGain,
      _compactionLevel: compact,
      _disturbance: disturbance,
    };
  }

  function buildPassSeries(wheel, soil, soilKey, loadN, slip, passCount, solver) {
    const cfg = configFor(soilKey);
    const count = clamp(Math.round(passCount), 1, 12);
    const lugRatio = clamp((wheel.lugHeight || 0) / Math.max(wheel.radius || 0.1, 1e-6), 0, 0.15);
    const maxRut = Math.max(0.002, (wheel.radius || 0.15) * cfg.rutCapRatio);
    let cumulativeRut = 0;
    const series = [];

    for (let pass = 1; pass <= count; pass++) {
      const effectiveSoil = effectiveSoilForPass(soil, soilKey, wheel, slip, pass);
      const result = solver(wheel, effectiveSoil, loadN, slip);
      const basePlastic = Number.isFinite(result.rutDepth)
        ? Math.max(0, result.rutDepth)
        : Math.max(0, result.z || 0) * (effectiveSoil.rutFactor || 0.5);
      const repeatScale = pass === 1
        ? 1
        : Math.exp(-cfg.decay * (pass - 1)) * (1 + 0.35 * slip + 1.2 * lugRatio);
      const remaining = clamp(1 - cumulativeRut / maxRut, 0, 1);
      const incrementalRut = Math.min(maxRut - cumulativeRut, basePlastic * repeatScale * remaining);
      cumulativeRut = clamp(cumulativeRut + Math.max(0, incrementalRut), 0, maxRut);

      series.push({
        pass,
        effectiveSoil,
        result,
        incrementalRut: Math.max(0, incrementalRut),
        cumulativeRut,
        stiffnessGain: effectiveSoil._stiffnessGain,
        compactionLevel: effectiveSoil._compactionLevel,
      });
    }

    return series;
  }

  const api = { REPASS_CONFIG, effectiveSoilForPass, buildPassSeries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  if (typeof WHEELS === 'undefined' || typeof SOILS === 'undefined' || typeof integrateWheel === 'undefined') return;

  const els = {
    canvas: document.querySelector('#repassCanvas'),
    count: document.querySelector('#passCountInput'),
    countOut: document.querySelector('#passCountOut'),
    next: document.querySelector('#advancePassBtn'),
    reset: document.querySelector('#resetPassBtn'),
    summary: document.querySelector('#repassSummary'),
    table: document.querySelector('#repassTable'),
    allTable: document.querySelector('#allWheelRepassTable'),
  };
  if (!els.canvas || !els.count || !els.summary || !els.table || !els.allTable) return;

  const ctx = els.canvas.getContext('2d');

  function fmt(value, digits = 1) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
  }

  function currentInputs() {
    if (typeof getInputs === 'function') return getInputs();
    return {
      wheelKey: document.querySelector('#wheelSelect')?.value || 'standard',
      soilKey: document.querySelector('#soilSelect')?.value || 'softSand',
      loadN: Number(document.querySelector('#loadInput')?.value || 200),
      slip: Number(document.querySelector('#slipInput')?.value || 0.2),
      speed: Number(document.querySelector('#speedInput')?.value || 0.6),
    };
  }

  function calculate(wheel, input, passCount) {
    return buildPassSeries(wheel, SOILS[input.soilKey], input.soilKey, input.loadN, input.slip, passCount, integrateWheel);
  }

  function profileY(baseY, x, centerX, widthPx, depthPx, bermPx, slip, soilFlow) {
    const half = Math.max(18, widthPx * 0.5);
    const dx = x - centerX;
    const core = depthPx * Math.exp(-Math.pow(Math.abs(dx) / Math.max(half * 0.76, 1), 4));
    const shoulder = half * 1.05;
    const sigma = Math.max(10, half * 0.33);
    const berm = bermPx * (0.55 + 0.45 * slip) * soilFlow * (
      Math.exp(-0.5 * Math.pow((dx - shoulder) / sigma, 2)) +
      Math.exp(-0.5 * Math.pow((dx + shoulder) / sigma, 2))
    );
    return baseY + core - berm;
  }

  function drawRepass(series, wheel, soil, input) {
    const W = els.canvas.width;
    const H = els.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#09111f');
    bg.addColorStop(1, '#11182b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const left = 65;
    const right = W - 35;
    const topBase = 155;
    const centerX = (left + right) * 0.5;
    const widthPx = clamp(wheel.width * 1900, 90, 310);
    const maxDepth = Math.max(...series.map(item => item.cumulativeRut), 0.001);
    const depthScale = Math.min(150 / maxDepth, 5200);

    ctx.strokeStyle = 'rgba(238,243,255,.24)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 7]);
    ctx.beginPath();
    ctx.moveTo(left, topBase);
    ctx.lineTo(right, topBase);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#94a3bd';
    ctx.font = '14px system-ui';
    ctx.fillText('未変形地盤', left, topBase - 12);

    for (let idx = 0; idx < series.length; idx++) {
      const item = series[idx];
      const depthPx = item.cumulativeRut * depthScale;
      const bermPx = depthPx * (0.12 + 0.22 * input.slip);
      const alpha = 0.20 + 0.62 * ((idx + 1) / series.length);
      ctx.strokeStyle = `rgba(110,231,255,${alpha.toFixed(3)})`;
      ctx.lineWidth = idx === series.length - 1 ? 4 : 1.8;
      ctx.beginPath();
      for (let x = left; x <= right; x += 4) {
        const y = profileY(topBase, x, centerX, widthPx, depthPx, bermPx, input.slip, soil.flow || 0.4);
        if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const last = series[series.length - 1];
    const finalDepthPx = last.cumulativeRut * depthScale;
    const wheelR = clamp(wheel.radius * 760, 75, 145);
    const wheelY = topBase - wheelR + Math.min(finalDepthPx, wheelR * 0.42);
    ctx.fillStyle = 'rgba(28,38,57,.85)';
    ctx.strokeStyle = '#a8b6cf';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, wheelY, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if ((wheel.lugHeight || 0) > 0) {
      ctx.strokeStyle = '#d2dded';
      ctx.lineWidth = 7;
      for (let k = 0; k < 16; k++) {
        const angle = k / 16 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(centerX + Math.cos(angle) * (wheelR - 2), wheelY + Math.sin(angle) * (wheelR - 2));
        ctx.lineTo(centerX + Math.cos(angle) * (wheelR + 8), wheelY + Math.sin(angle) * (wheelR + 8));
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#eef3ff';
    ctx.font = '700 16px system-ui';
    ctx.fillText(`${series.length}回目`, right - 95, 38);
    ctx.fillStyle = '#94a3bd';
    ctx.font = '14px system-ui';
    ctx.fillText(`累積轍 ${fmt(last.cumulativeRut * 1000, 1)} mm`, right - 190, 62);
    ctx.fillText(`地盤剛性 ${fmt(last.stiffnessGain * 100, 0)} %`, right - 190, 83);

    const chartTop = 335;
    const chartBottom = H - 45;
    const chartLeft = 70;
    const chartRight = W - 50;
    const chartW = chartRight - chartLeft;
    const chartH = chartBottom - chartTop;
    const sinkValues = series.map(item => item.result.z * 1000);
    const tractionValues = series.map(item => item.result.fx);
    const maxSink = Math.max(1, ...sinkValues);
    const minTraction = Math.min(...tractionValues, 0);
    const maxTraction = Math.max(...tractionValues, 1);

    ctx.strokeStyle = 'rgba(148,163,189,.22)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = chartTop + chartH * g / 4;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
    }

    const xAt = idx => series.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + chartW * idx / (series.length - 1);
    const sinkY = value => chartBottom - (value / maxSink) * chartH;
    const tractionY = value => chartBottom - ((value - minTraction) / Math.max(maxTraction - minTraction, 1e-6)) * chartH;

    ctx.strokeStyle = '#f8c15c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    sinkValues.forEach((value, idx) => {
      const x = xAt(idx), y = sinkY(value);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#7ce6a2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    tractionValues.forEach((value, idx) => {
      const x = xAt(idx), y = tractionY(value);
      if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    for (let idx = 0; idx < series.length; idx++) {
      const x = xAt(idx);
      ctx.fillStyle = '#94a3bd';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${idx + 1}`, x, chartBottom + 20);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8c15c';
    ctx.font = '13px system-ui';
    ctx.fillText('沈下量', chartLeft, chartTop - 12);
    ctx.fillStyle = '#7ce6a2';
    ctx.fillText('推進力', chartLeft + 72, chartTop - 12);
    ctx.fillStyle = '#94a3bd';
    ctx.fillText('← 踏破回数 →', chartRight - 105, chartBottom + 20);
  }

  function updateSummary(series) {
    const first = series[0];
    const last = series[series.length - 1];
    const tractionDelta = Math.abs(first.result.fx) > 1e-9
      ? (last.result.fx - first.result.fx) / Math.abs(first.result.fx) * 100
      : 0;
    const sinkDelta = first.result.z > 1e-9
      ? (last.result.z - first.result.z) / first.result.z * 100
      : 0;
    const cards = [
      ['累積轍', `${fmt(last.cumulativeRut * 1000, 1)} mm`, `${fmt(last.incrementalRut * 1000, 1)} mm / 最終踏破`],
      ['瞬間沈下', `${fmt(last.result.z * 1000, 1)} mm`, `${sinkDelta >= 0 ? '+' : ''}${fmt(sinkDelta, 0)} % vs 1回目`],
      ['推進力', `${fmt(last.result.fx, 1)} N`, `${tractionDelta >= 0 ? '+' : ''}${fmt(tractionDelta, 0)} % vs 1回目`],
      ['地盤剛性', `${fmt(last.stiffnessGain * 100, 0)} %`, 'kφ基準の簡易締固め指標'],
    ];
    els.summary.innerHTML = cards.map(([label, value, sub]) => `
      <div class="repass-card"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`).join('');
  }

  function updatePassTable(series) {
    els.table.innerHTML = `<table><thead><tr>
      <th>回</th><th>剛性</th><th>沈下</th><th>追加轍</th><th>累積轍</th><th>推進力</th><th>トルク</th>
    </tr></thead><tbody>${series.map(item => `
      <tr>
        <td>${item.pass}</td>
        <td>${fmt(item.stiffnessGain * 100, 0)} %</td>
        <td>${fmt(item.result.z * 1000, 1)} mm</td>
        <td>${fmt(item.incrementalRut * 1000, 1)} mm</td>
        <td>${fmt(item.cumulativeRut * 1000, 1)} mm</td>
        <td>${fmt(item.result.fx, 1)} N</td>
        <td>${fmt(item.result.torque, 2)} N·m</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function updateAllWheelTable(input, passCount) {
    const rows = Object.entries(WHEELS).map(([key, wheel]) => {
      const series = calculate(wheel, input, passCount);
      const first = series[0];
      const last = series[series.length - 1];
      const tractionDelta = Math.abs(first.result.fx) > 1e-9
        ? (last.result.fx - first.result.fx) / Math.abs(first.result.fx) * 100
        : 0;
      return { key, wheel, last, tractionDelta };
    }).sort((a, b) => b.last.result.fx - a.last.result.fx);

    els.allTable.innerHTML = `<table><thead><tr>
      <th>タイヤ</th><th>累積轍</th><th>最終沈下</th><th>最終推進力</th><th>推進力変化</th>
    </tr></thead><tbody>${rows.map(row => `
      <tr class="${row.key === input.wheelKey ? 'selected' : ''}">
        <td>${row.wheel.name}</td>
        <td>${fmt(row.last.cumulativeRut * 1000, 1)} mm</td>
        <td>${fmt(row.last.result.z * 1000, 1)} mm</td>
        <td>${fmt(row.last.result.fx, 1)} N</td>
        <td>${row.tractionDelta >= 0 ? '+' : ''}${fmt(row.tractionDelta, 0)} %</td>
      </tr>`).join('')}</tbody></table>`;
  }

  function refresh() {
    const input = currentInputs();
    const wheel = WHEELS[input.wheelKey];
    const soil = SOILS[input.soilKey];
    const passCount = Number(els.count.value);
    const series = calculate(wheel, input, passCount);
    els.countOut.value = `${passCount} 回`;
    updateSummary(series);
    updatePassTable(series);
    updateAllWheelTable(input, passCount);
    drawRepass(series, wheel, soil, input);
  }

  els.count.addEventListener('input', refresh);
  els.next?.addEventListener('click', () => {
    els.count.value = String(Math.min(Number(els.count.max), Number(els.count.value) + 1));
    refresh();
  });
  els.reset?.addEventListener('click', () => {
    els.count.value = '1';
    refresh();
  });

  ['wheelSelect', 'soilSelect', 'loadInput', 'slipInput', 'speedInput'].forEach(id => {
    document.querySelector(`#${id}`)?.addEventListener('input', refresh);
    document.querySelector(`#${id}`)?.addEventListener('change', refresh);
  });

  refresh();
})();
