'use strict';

const WHEELS = {
  standard: { name: '標準タイヤ', radius: 0.15, width: 0.08, lugHeight: 0.000, shearGain: 1.00, rrGain: 1.00 },
  wide:     { name: '幅広タイヤ', radius: 0.15, width: 0.14, lugHeight: 0.000, shearGain: 1.00, rrGain: 0.92 },
  narrow:   { name: '細幅タイヤ', radius: 0.15, width: 0.045, lugHeight: 0.000, shearGain: 0.94, rrGain: 1.10 },
  lugged:   { name: 'ラグ付きタイヤ', radius: 0.15, width: 0.08, lugHeight: 0.012, shearGain: 1.35, rrGain: 1.08 },
  large:    { name: '大径タイヤ', radius: 0.22, width: 0.08, lugHeight: 0.000, shearGain: 1.03, rrGain: 0.86 },
};

// Illustrative presets for relative comparison. Calibrate these from real soil tests for absolute predictions.
const SOILS = {
  softSand: { name: '柔らかい砂', kc: 14000, kphi: 820000, n: 1.10, cohesion: 400, phiDeg: 28, K: 0.025, density: 1500, rutFactor: 0.72, flow: 1.00 },
  drySand:  { name: '乾いた締まった砂', kc: 28000, kphi: 1350000, n: 1.05, cohesion: 800, phiDeg: 31, K: 0.020, density: 1650, rutFactor: 0.58, flow: 0.78 },
  loam:     { name: 'ローム質土', kc: 45000, kphi: 1900000, n: 0.95, cohesion: 3500, phiDeg: 24, K: 0.018, density: 1750, rutFactor: 0.46, flow: 0.46 },
  firm:     { name: '硬めの土', kc: 85000, kphi: 3200000, n: 0.90, cohesion: 6500, phiDeg: 27, K: 0.014, density: 1850, rutFactor: 0.25, flow: 0.22 },
};

const els = {
  wheel: document.querySelector('#wheelSelect'),
  soil: document.querySelector('#soilSelect'),
  load: document.querySelector('#loadInput'),
  slip: document.querySelector('#slipInput'),
  speed: document.querySelector('#speedInput'),
  loadOut: document.querySelector('#loadOut'),
  slipOut: document.querySelector('#slipOut'),
  speedOut: document.querySelector('#speedOut'),
  wheelDetails: document.querySelector('#wheelDetails'),
  soilDetails: document.querySelector('#soilDetails'),
  metrics: document.querySelector('#metricGrid'),
  table: document.querySelector('#comparisonTable'),
  sim: document.querySelector('#simCanvas'),
  chart: document.querySelector('#chartCanvas'),
  play: document.querySelector('#playBtn'),
  record: document.querySelector('#recordBtn'),
  resetTerrain: document.querySelector('#resetTerrainBtn'),
};

const sctx = els.sim.getContext('2d');
const cctx = els.chart.getContext('2d');

for (const [key, wheel] of Object.entries(WHEELS)) els.wheel.add(new Option(wheel.name, key));
for (const [key, soil] of Object.entries(SOILS)) els.soil.add(new Option(soil.name, key));
els.wheel.value = 'standard';
els.soil.value = 'softSand';

const TERRAIN_N = 321;
const state = {
  playing: true,
  phase: 0,
  lastTs: performance.now(),
  result: null,
  recording: false,
  terrain: new Float32Array(TERRAIN_N),
  terrainCarryPx: 0,
  particles: [],
};

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function fmt(x, digits = 2) { return Number.isFinite(x) ? x.toFixed(digits) : '—'; }

function integrateWheel(wheel, soil, loadN, slip) {
  const r = wheel.radius;
  const b = wheel.width;
  const phi = soil.phiDeg * Math.PI / 180;
  const shearGain = wheel.shearGain * (1 + Math.min(wheel.lugHeight / Math.max(r, 1e-6), 0.12) * 1.6);

  function forcesAt(z) {
    const zClamped = clamp(z, 1e-6, r * 0.82);
    const thetaF = Math.acos(clamp(1 - zClamped / r, -1, 1));
    const thetaR = -0.55 * thetaF;
    const segments = 180;
    const dtheta = (thetaF - thetaR) / segments;
    let fx = 0;
    let fz = 0;
    let torque = 0;
    let normalSum = 0;
    let shearSum = 0;
    const samples = [];

    for (let idx = 0; idx <= segments; idx++) {
      const theta = thetaR + dtheta * idx;
      const localZ = Math.max(0, r * (Math.cos(theta) - Math.cos(thetaF)) + wheel.lugHeight * 0.18);
      const p = localZ > 0
        ? (soil.kc / Math.max(b, 0.01) + soil.kphi) * Math.pow(localZ, soil.n)
        : 0;
      const j = Math.max(0, r * ((thetaF - theta) - (1 - slip) * (Math.sin(thetaF) - Math.sin(theta))));
      const tauMax = soil.cohesion + p * Math.tan(phi);
      const tau = slip <= 1e-5 ? 0 : shearGain * tauMax * (1 - Math.exp(-j / soil.K));
      const dA = b * r * dtheta;
      const dFx = (tau * Math.cos(theta) - p * Math.sin(theta)) * dA;
      const dFz = (p * Math.cos(theta) + tau * Math.sin(theta)) * dA;
      fx += dFx;
      fz += dFz;
      torque += tau * dA * r;
      normalSum += p * dA;
      shearSum += tau * dA;
      if (idx % 12 === 0) samples.push({ theta, p, tau, localZ });
    }

    const rr = loadN * (zClamped / Math.max(r, 1e-6)) * 0.12 * wheel.rrGain;
    fx -= rr;
    return { fx, fz, torque, z: zClamped, thetaF, thetaR, samples, normalSum, shearSum, rr };
  }

  let lo = 1e-5;
  let hi = Math.min(r * 0.72, 0.18);
  if (forcesAt(hi).fz < loadN) hi = Math.min(r * 0.82, 0.28);
  for (let iter = 0; iter < 48; iter++) {
    const mid = (lo + hi) / 2;
    if (forcesAt(mid).fz < loadN) lo = mid;
    else hi = mid;
  }

  const out = forcesAt((lo + hi) / 2);
  const grossTraction = out.fx + out.rr;
  const efficiency = out.torque > 1e-9
    ? clamp((Math.max(0, out.fx) * r * (1 - slip)) / out.torque, 0, 1.5)
    : 0;
  const maxSlopeDeg = Math.atan2(Math.max(0, out.fx), loadN) * 180 / Math.PI;
  const rutDepth = out.z * soil.rutFactor * (0.82 + 0.36 * slip);
  const displacedArea = rutDepth * (2 * Math.sqrt(Math.max(0, 2 * r * out.z - out.z * out.z))) * 0.58;
  const displacedMassPerM = displacedArea * soil.density;

  return {
    ...out,
    grossTraction,
    efficiency,
    maxSlopeDeg,
    rutDepth,
    displacedMassPerM,
    contactLength: r * (out.thetaF - out.thetaR),
  };
}

function getInputs() {
  return {
    wheelKey: els.wheel.value,
    soilKey: els.soil.value,
    loadN: Number(els.load.value),
    slip: Number(els.slip.value),
    speed: Number(els.speed.value),
  };
}

function resetTerrain() {
  state.terrain.fill(0);
  state.terrainCarryPx = 0;
  state.particles.length = 0;
}

function recalc(reset = false) {
  const input = getInputs();
  const wheel = WHEELS[input.wheelKey];
  const soil = SOILS[input.soilKey];
  state.result = integrateWheel(wheel, soil, input.loadN, input.slip);
  if (reset) resetTerrain();

  els.loadOut.value = `${input.loadN.toFixed(0)} N`;
  els.slipOut.value = `${(input.slip * 100).toFixed(0)} %`;
  els.speedOut.value = `${input.speed.toFixed(2)} m/s`;
  els.wheelDetails.innerHTML = `
    <span>半径</span><strong>${(wheel.radius * 1000).toFixed(0)} mm</strong>
    <span>幅</span><strong>${(wheel.width * 1000).toFixed(0)} mm</strong>
    <span>ラグ高さ</span><strong>${(wheel.lugHeight * 1000).toFixed(0)} mm</strong>
    <span>せん断係数</span><strong>${wheel.shearGain.toFixed(2)} ×</strong>`;
  els.soilDetails.innerHTML = `
    <span>kc</span><strong>${soil.kc.toLocaleString()}</strong>
    <span>kφ</span><strong>${soil.kphi.toLocaleString()}</strong>
    <span>n</span><strong>${soil.n.toFixed(2)}</strong>
    <span>粘着力 c</span><strong>${soil.cohesion.toLocaleString()} Pa</strong>
    <span>内部摩擦角 φ</span><strong>${soil.phiDeg.toFixed(0)}°</strong>
    <span>せん断変位 K</span><strong>${soil.K.toFixed(3)} m</strong>
    <span>残留轍係数</span><strong>${soil.rutFactor.toFixed(2)}</strong>`;

  updateMetrics(state.result);
  updateComparison(input);
  drawChart(input);
}

function updateMetrics(result) {
  const items = [
    ['沈下量', `${fmt(result.z * 1000, 1)} mm`, '瞬間的な車輪沈下'],
    ['残留轍の目安', `${fmt(result.rutDepth * 1000, 1)} mm`, '走行後に残る深さの簡易推定'],
    ['正味推進力', `${fmt(result.fx, 1)} N`, '前進方向の地盤反力'],
    ['必要トルク', `${fmt(result.torque, 2)} N·m`, '接触面せん断から推定'],
    ['走行効率指標', `${fmt(result.efficiency * 100, 0)} %`, '出力/接地仕事の簡易比'],
    ['排土量の目安', `${fmt(result.displacedMassPerM, 1)} kg/m`, '1 m走行あたりの変形土量指標'],
  ];
  els.metrics.innerHTML = items.map(([label, value, sub]) => `
    <div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`).join('');
}

function updateComparison(input) {
  const rows = Object.entries(WHEELS).map(([key, wheel]) => ({
    key,
    wheel,
    result: integrateWheel(wheel, SOILS[input.soilKey], input.loadN, input.slip),
  }));
  const ranked = [...rows].sort((a, b) => b.result.fx - a.result.fx);
  const rankMap = new Map(ranked.map((item, index) => [item.key, index + 1]));
  els.table.innerHTML = `<table><thead><tr><th>タイヤ</th><th>順位</th><th>沈下</th><th>残留轍</th><th>推進力</th><th>トルク</th><th>効率</th></tr></thead><tbody>${rows.map(item => `
    <tr class="${item.key === input.wheelKey ? 'selected' : ''}">
      <td>${item.wheel.name}</td>
      <td><span class="rank">${rankMap.get(item.key)}</span></td>
      <td>${fmt(item.result.z * 1000, 1)} mm</td>
      <td>${fmt(item.result.rutDepth * 1000, 1)} mm</td>
      <td>${fmt(item.result.fx, 1)} N</td>
      <td>${fmt(item.result.torque, 2)} N·m</td>
      <td>${fmt(item.result.efficiency * 100, 0)} %</td>
    </tr>`).join('')}</tbody></table>`;
}

function drawArrow(ctx, x1, y1, x2, y2, stroke, width = 2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 7 + width;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
  ctx.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}

function shiftTerrain(distancePx) {
  state.terrainCarryPx += Math.max(0, distancePx);
  const samplePx = els.sim.width / (TERRAIN_N - 1);
  while (state.terrainCarryPx >= samplePx) {
    for (let idx = 0; idx < TERRAIN_N - 1; idx++) state.terrain[idx] = state.terrain[idx + 1];
    state.terrain[TERRAIN_N - 1] = 0;
    state.terrainCarryPx -= samplePx;
  }
}

function deformTerrain(input, wheel, soil, result, dt) {
  const W = els.sim.width;
  const groundY = 370;
  const pxPerM = 950;
  const wheelR = clamp(wheel.radius * pxPerM, 55, 135);
  const cx = W * 0.48;
  const contactHalf = Math.max(28, Math.sin(result.thetaF) * wheelR * 1.08);
  const targetRutPx = Math.min(wheelR * 0.52, result.rutDepth * pxPerM);
  const samplePx = W / (TERRAIN_N - 1);
  const relax = 1 - Math.exp(-dt * (5.5 + 5 * input.slip));

  for (let idx = 0; idx < TERRAIN_N; idx++) {
    const x = idx * samplePx;
    const dx = (x - cx) / contactHalf;
    if (Math.abs(dx) <= 1) {
      const shape = Math.pow(Math.cos(dx * Math.PI * 0.5), 1.6);
      const target = targetRutPx * shape;
      state.terrain[idx] += Math.max(0, target - state.terrain[idx]) * relax;
    }

    const bermCenter = cx - contactHalf * (1.15 + 0.35 * input.slip);
    const bermSigma = contactHalf * 0.42;
    const berm = -targetRutPx * soil.flow * (0.08 + 0.24 * input.slip + wheel.lugHeight / Math.max(0.001, wheel.radius) * 0.4)
      * Math.exp(-0.5 * Math.pow((x - bermCenter) / Math.max(bermSigma, 1), 2));
    if (berm < state.terrain[idx]) state.terrain[idx] += (berm - state.terrain[idx]) * relax * 0.28;
  }

  const spawnRate = 6 + 44 * input.slip * soil.flow + (wheel.lugHeight > 0 ? 15 : 0);
  const spawnCount = Math.min(8, Math.floor(spawnRate * dt + Math.random() * 1.2));
  for (let k = 0; k < spawnCount; k++) {
    state.particles.push({
      x: cx - contactHalf * 0.55 + (Math.random() - 0.5) * contactHalf * 0.6,
      y: groundY - 2 - Math.random() * 8,
      vx: -(20 + 85 * input.slip + Math.random() * 55) * soil.flow,
      vy: -(10 + Math.random() * 42) * soil.flow,
      life: 0.7 + Math.random() * 0.8,
      age: 0,
      size: 1.2 + Math.random() * 2.4,
    });
  }
}

function drawTerrain(ctx, groundY) {
  const W = els.sim.width;
  const H = els.sim.height;
  const samplePx = W / (TERRAIN_N - 1);

  ctx.fillStyle = '#6d5139';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, groundY + state.terrain[0]);
  for (let idx = 1; idx < TERRAIN_N; idx++) ctx.lineTo(idx * samplePx, groundY + state.terrain[idx]);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#b08961';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  for (let idx = 0; idx < TERRAIN_N; idx++) {
    const x = idx * samplePx;
    const rough = 1.3 * Math.sin((x + state.phase * 38) * 0.07) + 0.8 * Math.sin(x * 0.17);
    const y = groundY + state.terrain[idx] + rough;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(248,193,92,.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let idx = 0; idx < TERRAIN_N; idx++) {
    const x = idx * samplePx;
    const y = groundY + state.terrain[idx];
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function updateAndDrawParticles(ctx, dt) {
  for (let idx = state.particles.length - 1; idx >= 0; idx--) {
    const p = state.particles[idx];
    p.age += dt;
    p.x += p.vx * dt;
    p.vy += 95 * dt;
    p.y += p.vy * dt;
    if (p.age >= p.life || p.x < -30 || p.y > els.sim.height + 20) {
      state.particles.splice(idx, 1);
      continue;
    }
    const alpha = 1 - p.age / p.life;
    ctx.fillStyle = `rgba(214,175,126,${0.75 * alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSim(ts) {
  const input = getInputs();
  const wheel = WHEELS[input.wheelKey];
  const soil = SOILS[input.soilKey];
  const result = state.result || integrateWheel(wheel, soil, input.loadN, input.slip);
  const dt = Math.min(0.05, Math.max(0, (ts - state.lastTs) / 1000));
  state.lastTs = ts;

  if (state.playing) {
    state.phase += dt * (1.6 + input.speed * 1.5);
    const groundSpeedPx = input.speed * 125;
    shiftTerrain(groundSpeedPx * dt);
    deformTerrain(input, wheel, soil, result, dt);
  }

  const ctx = sctx;
  const W = els.sim.width;
  const H = els.sim.height;
  const groundY = 370;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a1224');
  bg.addColorStop(1, '#0c1527');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawTerrain(ctx, groundY);
  updateAndDrawParticles(ctx, state.playing ? dt : 0);

  const pxPerM = 950;
  const wheelR = clamp(wheel.radius * pxPerM, 55, 135);
  const sinkPx = Math.min(wheelR * 0.58, result.z * pxPerM);
  const cx = W * 0.48;
  const cy = groundY - wheelR + sinkPx;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.phase * (1 + input.slip) * 1.9);
  ctx.fillStyle = '#1c2639';
  ctx.strokeStyle = '#a8b6cf';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (wheel.lugHeight > 0) {
    ctx.strokeStyle = '#d2dded';
    ctx.lineWidth = 9;
    for (let k = 0; k < 16; k++) {
      const angle = k / 16 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (wheelR - 3), Math.sin(angle) * (wheelR - 3));
      ctx.lineTo(Math.cos(angle) * (wheelR + 10), Math.sin(angle) * (wheelR + 10));
      ctx.stroke();
    }
  }

  ctx.strokeStyle = '#53647f';
  ctx.lineWidth = 4;
  for (let k = 0; k < 8; k++) {
    const angle = k * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * wheelR * 0.75, Math.sin(angle) * wheelR * 0.75);
    ctx.stroke();
  }
  ctx.fillStyle = '#91a4c3';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const maxP = Math.max(1, ...result.samples.map(sample => sample.p));
  const maxTau = Math.max(1, ...result.samples.map(sample => sample.tau));
  for (const sample of result.samples) {
    const sx = cx + Math.sin(sample.theta) * wheelR;
    const sy = cy + Math.cos(sample.theta) * wheelR;
    const normalLen = 8 + 30 * sample.p / maxP;
    const shearLen = 5 + 22 * sample.tau / maxTau;
    drawArrow(ctx, sx, sy, sx - Math.sin(sample.theta) * normalLen, sy - Math.cos(sample.theta) * normalLen, '#6ee7ff', 1.6);
    drawArrow(ctx, sx, sy, sx + Math.cos(sample.theta) * shearLen, sy - Math.sin(sample.theta) * shearLen, '#f8c15c', 1.5);
  }

  const forceScale = 0.58;
  drawArrow(ctx, cx, cy, cx + result.fx * forceScale, cy, '#7ce6a2', 4);
  ctx.fillStyle = '#c9f6d9';
  ctx.font = '700 15px system-ui';
  ctx.fillText(`Fx ${fmt(result.fx, 1)} N`, cx + 14, cy - 18);

  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.moveTo(cx - wheelR - 55, groundY);
  ctx.lineTo(cx + wheelR + 55, groundY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#dce8ff';
  ctx.font = '16px system-ui';
  ctx.fillText(`沈下 ${fmt(result.z * 1000, 1)} mm`, cx + wheelR + 18, groundY - 44);
  ctx.fillStyle = '#f8d49a';
  ctx.fillText(`残留轍目安 ${fmt(result.rutDepth * 1000, 1)} mm`, cx + wheelR + 18, groundY - 20);

  ctx.fillStyle = 'rgba(5,10,20,.72)';
  ctx.fillRect(20, 18, 255, 76);
  ctx.fillStyle = '#eef3ff';
  ctx.font = '700 16px system-ui';
  ctx.fillText(`${wheel.name} / ${soil.name}`, 34, 44);
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#9fb0cb';
  ctx.fillText(`速度 ${input.speed.toFixed(2)} m/s   slip ${(input.slip * 100).toFixed(0)}%`, 34, 68);
  ctx.fillText('轍は画面左へ流れ、走行跡として残ります', 34, 88);

  requestAnimationFrame(drawSim);
}

function drawChart(input) {
  const ctx = cctx;
  const W = els.chart.width;
  const H = els.chart.height;
  const pad = { l: 72, r: 54, t: 28, b: 54 };
  const wheel = WHEELS[input.wheelKey];
  const soil = SOILS[input.soilKey];
  const data = [];
  for (let s = 0; s <= 0.8001; s += 0.02) data.push({ slip: s, result: integrateWheel(wheel, soil, input.loadN, s) });
  const maxFx = Math.max(10, ...data.map(point => Math.max(0, point.result.fx))) * 1.1;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#09101f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2b3653';
  ctx.fillStyle = '#94a3bd';
  ctx.font = '13px system-ui';
  ctx.lineWidth = 1;

  for (let k = 0; k <= 5; k++) {
    const y = pad.t + (H - pad.t - pad.b) * k / 5;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(W - pad.r, y);
    ctx.stroke();
    const value = maxFx * (1 - k / 5);
    ctx.fillText(`${value.toFixed(0)} N`, 18, y + 4);
  }
  for (let k = 0; k <= 4; k++) {
    const x = pad.l + (W - pad.l - pad.r) * k / 4;
    ctx.fillText(`${k * 20}%`, x - 12, H - 20);
  }

  function plot(valueGetter, maxValue, stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((point, idx) => {
      const x = pad.l + (W - pad.l - pad.r) * point.slip / 0.8;
      const y = H - pad.b - (H - pad.t - pad.b) * clamp(valueGetter(point) / maxValue, 0, 1);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  plot(point => Math.max(0, point.result.fx), maxFx, '#6ee7ff');
  plot(point => point.result.efficiency * maxFx, maxFx, '#7ce6a2');

  const currentX = pad.l + (W - pad.l - pad.r) * input.slip / 0.8;
  ctx.strokeStyle = '#f8c15c';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(currentX, pad.t);
  ctx.lineTo(currentX, H - pad.b);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#6ee7ff';
  ctx.fillText('推進力', W - 162, 24);
  ctx.fillStyle = '#7ce6a2';
  ctx.fillText('効率（相対表示）', W - 98, 24);
}

function startRecording() {
  if (state.recording || !els.sim.captureStream || typeof MediaRecorder === 'undefined') return;
  state.recording = true;
  els.record.disabled = true;
  els.record.textContent = '● 録画中…';
  const stream = els.sim.captureStream(30);
  const preferred = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: preferred });
  const chunks = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wheel-terrain-${Date.now()}.webm`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    state.recording = false;
    els.record.disabled = false;
    els.record.textContent = '● 8秒動画を保存';
  };
  recorder.start();
  setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 8000);
}

els.play.addEventListener('click', () => {
  state.playing = !state.playing;
  els.play.textContent = state.playing ? '⏸ 一時停止' : '▶ 再生';
});
els.record.addEventListener('click', startRecording);
if (els.resetTerrain) els.resetTerrain.addEventListener('click', resetTerrain);

for (const element of [els.load, els.slip, els.speed]) element.addEventListener('input', () => recalc(false));
for (const element of [els.wheel, els.soil]) element.addEventListener('change', () => recalc(true));

recalc(true);
els.play.textContent = '⏸ 一時停止';
requestAnimationFrame(drawSim);
