'use strict';

const WHEELS = {
  standard: { name: '標準タイヤ', radius: 0.15, width: 0.08, lugHeight: 0.000, shearGain: 1.00, rrGain: 1.00 },
  wide:     { name: '幅広タイヤ', radius: 0.15, width: 0.14, lugHeight: 0.000, shearGain: 1.00, rrGain: 0.92 },
  narrow:   { name: '細幅タイヤ', radius: 0.15, width: 0.045, lugHeight: 0.000, shearGain: 0.94, rrGain: 1.10 },
  lugged:   { name: 'ラグ付きタイヤ', radius: 0.15, width: 0.08, lugHeight: 0.012, shearGain: 1.35, rrGain: 1.08 },
  large:    { name: '大径タイヤ', radius: 0.22, width: 0.08, lugHeight: 0.000, shearGain: 1.03, rrGain: 0.86 },
};

// Parameters are illustrative presets for relative comparison, not site-calibrated soil data.
const SOILS = {
  softSand: { name: '柔らかい砂', kc: 14000, kphi: 820000, n: 1.10, cohesion: 400, phiDeg: 28, K: 0.025, density: 1500 },
  drySand:  { name: '乾いた締まった砂', kc: 28000, kphi: 1350000, n: 1.05, cohesion: 800, phiDeg: 31, K: 0.020, density: 1650 },
  loam:     { name: 'ローム質土', kc: 45000, kphi: 1900000, n: 0.95, cohesion: 3500, phiDeg: 24, K: 0.018, density: 1750 },
  firm:     { name: '硬めの土', kc: 85000, kphi: 3200000, n: 0.90, cohesion: 6500, phiDeg: 27, K: 0.014, density: 1850 },
};

const els = {
  wheel: document.querySelector('#wheelSelect'), soil: document.querySelector('#soilSelect'),
  load: document.querySelector('#loadInput'), slip: document.querySelector('#slipInput'), speed: document.querySelector('#speedInput'),
  loadOut: document.querySelector('#loadOut'), slipOut: document.querySelector('#slipOut'), speedOut: document.querySelector('#speedOut'),
  wheelDetails: document.querySelector('#wheelDetails'), soilDetails: document.querySelector('#soilDetails'),
  metrics: document.querySelector('#metricGrid'), table: document.querySelector('#comparisonTable'),
  sim: document.querySelector('#simCanvas'), chart: document.querySelector('#chartCanvas'),
  play: document.querySelector('#playBtn'), record: document.querySelector('#recordBtn'),
};
const sctx = els.sim.getContext('2d');
const cctx = els.chart.getContext('2d');

for (const [key, w] of Object.entries(WHEELS)) els.wheel.add(new Option(w.name, key));
for (const [key, s] of Object.entries(SOILS)) els.soil.add(new Option(s.name, key));
els.wheel.value = 'standard';
els.soil.value = 'softSand';

const state = { playing: true, phase: 0, lastTs: performance.now(), result: null, recording: false };

function integrateWheel(wheel, soil, loadN, slip) {
  const r = wheel.radius;
  const b = wheel.width;
  const phi = soil.phiDeg * Math.PI / 180;
  const shearGain = wheel.shearGain * (1 + Math.min(wheel.lugHeight / Math.max(r, 1e-6), 0.12) * 1.6);

  function forcesAt(z) {
    const zClamped = Math.min(Math.max(z, 1e-6), r * 0.72);
    const thetaF = Math.acos(Math.max(-1, Math.min(1, 1 - zClamped / r)));
    const thetaR = -0.55 * thetaF;
    const N = 180;
    const dtheta = (thetaF - thetaR) / N;
    let fx = 0, fz = 0, torque = 0, normalSum = 0, shearSum = 0;
    const samples = [];

    for (let i = 0; i <= N; i++) {
      const theta = thetaR + dtheta * i;
      const localZ = Math.max(0, r * (Math.cos(theta) - Math.cos(thetaF)) + wheel.lugHeight * 0.18);
      const p = localZ > 0 ? (soil.kc / Math.max(b, 0.01) + soil.kphi) * Math.pow(localZ, soil.n) : 0;
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
      if (i % 12 === 0) samples.push({ theta, p, tau, localZ });
    }

    const rr = loadN * (zClamped / Math.max(r, 1e-6)) * 0.12 * wheel.rrGain;
    fx -= rr;
    return { fx, fz, torque, z: zClamped, thetaF, thetaR, samples, normalSum, shearSum, rr };
  }

  let lo = 1e-5, hi = Math.min(r * 0.72, 0.18);
  let hiF = forcesAt(hi);
  if (hiF.fz < loadN) hi = Math.min(r * 0.9, 0.28);
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2;
    const f = forcesAt(mid);
    if (f.fz < loadN) lo = mid; else hi = mid;
  }
  const out = forcesAt((lo + hi) / 2);
  const grossTraction = out.fx + out.rr;
  const efficiency = out.torque > 1e-9 ? Math.max(0, Math.min(1.5, (Math.max(0, out.fx) * r * (1 - slip)) / out.torque)) : 0;
  const maxSlopeDeg = Math.atan2(Math.max(0, out.fx), loadN) * 180 / Math.PI;
  return { ...out, grossTraction, efficiency, maxSlopeDeg, contactLength: r * (out.thetaF - out.thetaR) };
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

function fmt(x, digits = 2) { return Number.isFinite(x) ? x.toFixed(digits) : '—'; }

function recalc() {
  const i = getInputs();
  const wheel = WHEELS[i.wheelKey], soil = SOILS[i.soilKey];
  state.result = integrateWheel(wheel, soil, i.loadN, i.slip);
  els.loadOut.value = `${i.loadN.toFixed(0)} N`;
  els.slipOut.value = `${(i.slip * 100).toFixed(0)} %`;
  els.speedOut.value = `${i.speed.toFixed(2)} m/s`;
  els.wheelDetails.innerHTML = `
    <span>半径</span><strong>${(wheel.radius*1000).toFixed(0)} mm</strong>
    <span>幅</span><strong>${(wheel.width*1000).toFixed(0)} mm</strong>
    <span>ラグ高さ</span><strong>${(wheel.lugHeight*1000).toFixed(0)} mm</strong>
    <span>せん断係数</span><strong>${wheel.shearGain.toFixed(2)} ×</strong>`;
  els.soilDetails.innerHTML = `
    <span>kc</span><strong>${soil.kc.toLocaleString()}</strong>
    <span>kφ</span><strong>${soil.kphi.toLocaleString()}</strong>
    <span>n</span><strong>${soil.n.toFixed(2)}</strong>
    <span>粘着力 c</span><strong>${soil.cohesion.toLocaleString()} Pa</strong>
    <span>内部摩擦角 φ</span><strong>${soil.phiDeg.toFixed(0)}°</strong>
    <span>せん断変位 K</span><strong>${soil.K.toFixed(3)} m</strong>`;
  updateMetrics(i, state.result);
  updateComparison(i);
  drawChart(i);
}

function updateMetrics(i, r) {
  const items = [
    ['沈下量', `${fmt(r.z*1000,1)} mm`, '小さいほど沈みにくい'],
    ['正味推進力', `${fmt(r.fx,1)} N`, '前進方向の地盤反力'],
    ['必要トルク', `${fmt(r.torque,2)} N·m`, '接触面せん断から推定'],
    ['走行効率指標', `${fmt(r.efficiency*100,0)} %`, '出力/接地仕事の簡易比'],
    ['登坂相当', `${fmt(r.maxSlopeDeg,1)}°`, 'Fx/Wから見た目安'],
  ];
  els.metrics.innerHTML = items.map(([label,value,sub]) => `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`).join('');
}

function updateComparison(i) {
  const rows = Object.entries(WHEELS).map(([key, wheel]) => ({ key, wheel, r: integrateWheel(wheel, SOILS[i.soilKey], i.loadN, i.slip) }));
  const ranked = [...rows].sort((a,b) => b.r.fx - a.r.fx);
  const rankMap = new Map(ranked.map((x, idx) => [x.key, idx+1]));
  els.table.innerHTML = `<table><thead><tr><th>タイヤ</th><th>順位</th><th>沈下</th><th>推進力</th><th>トルク</th><th>効率</th></tr></thead><tbody>${rows.map(x => `
    <tr class="${x.key===i.wheelKey?'selected':''}">
      <td>${x.wheel.name}</td><td><span class="rank">${rankMap.get(x.key)}</span></td>
      <td>${fmt(x.r.z*1000,1)} mm</td><td>${fmt(x.r.fx,1)} N</td><td>${fmt(x.r.torque,2)} N·m</td><td>${fmt(x.r.efficiency*100,0)} %</td>
    </tr>`).join('')}</tbody></table>`;
}

function drawArrow(ctx, x1, y1, x2, y2, stroke, width=2) {
  const a = Math.atan2(y2-y1, x2-x1), head = 7 + width;
  ctx.strokeStyle = stroke; ctx.fillStyle = stroke; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-head*Math.cos(a-.45), y2-head*Math.sin(a-.45)); ctx.lineTo(x2-head*Math.cos(a+.45), y2-head*Math.sin(a+.45)); ctx.closePath(); ctx.fill();
}

function drawSim(ts) {
  const i = getInputs(), wheel = WHEELS[i.wheelKey], r = state.result || integrateWheel(wheel, SOILS[i.soilKey], i.loadN, i.slip);
  const ctx = sctx, W = els.sim.width, H = els.sim.height;
  ctx.clearRect(0,0,W,H);
  const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0a1224'); g.addColorStop(1,'#0c1527'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  const groundY = 370;
  ctx.fillStyle = '#6d5139'; ctx.fillRect(0,groundY,W,H-groundY);
  ctx.strokeStyle = '#9a7652'; ctx.lineWidth = 2; ctx.beginPath();
  for (let x=0; x<=W; x+=8) {
    const y = groundY + 2*Math.sin((x + state.phase*55)*0.045) + 1.3*Math.sin((x-state.phase*23)*0.11);
    if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  } ctx.stroke();

  ctx.fillStyle = 'rgba(214,175,126,.45)';
  for (let k=0;k<90;k++) {
    const px = (k*89 + state.phase*90*(0.3+i.slip)) % (W+60)-30;
    const py = groundY + 10 + ((k*47)%130);
    const sz = 1 + (k%3)*0.7;
    ctx.beginPath(); ctx.arc(px,py,sz,0,Math.PI*2); ctx.fill();
  }

  const pxPerM = 950;
  const wheelR = Math.max(55, Math.min(135, wheel.radius*pxPerM));
  const sinkPx = Math.min(wheelR*0.58, r.z*pxPerM);
  const cx = W*0.48;
  const cy = groundY - wheelR + sinkPx;

  ctx.save(); ctx.translate(cx,cy); ctx.rotate(state.phase*(1+i.slip)*1.9);
  ctx.fillStyle='#1c2639'; ctx.strokeStyle='#a8b6cf'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.arc(0,0,wheelR,0,Math.PI*2); ctx.fill(); ctx.stroke();
  const lugCount = wheel.lugHeight>0 ? 16 : 0;
  if (lugCount) {
    ctx.strokeStyle='#d2dded'; ctx.lineWidth=9;
    for (let k=0;k<lugCount;k++) { const a=k/lugCount*Math.PI*2; ctx.beginPath(); ctx.moveTo(Math.cos(a)*(wheelR-3),Math.sin(a)*(wheelR-3)); ctx.lineTo(Math.cos(a)*(wheelR+10),Math.sin(a)*(wheelR+10)); ctx.stroke(); }
  }
  ctx.strokeStyle='#53647f'; ctx.lineWidth=4;
  for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wheelR*.75,Math.sin(a)*wheelR*.75);ctx.stroke();}
  ctx.fillStyle='#91a4c3'; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.setLineDash([7,7]); ctx.strokeStyle='rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(cx-wheelR-55, groundY); ctx.lineTo(cx+wheelR+55, groundY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#dce8ff'; ctx.font='16px system-ui'; ctx.fillText(`沈下 ${fmt(r.z*1000,1)} mm`, cx+wheelR+20, groundY-16);

  const maxP = Math.max(1, ...r.samples.map(q=>q.p));
  for (const q of r.samples) {
    const x = cx + wheelR*Math.sin(q.theta);
    const y = cy + wheelR*Math.cos(q.theta);
    if (y < groundY-6) continue;
    const pn = 12 + 42*q.p/maxP;
    const tx = Math.cos(q.theta), ty = -Math.sin(q.theta);
    const nx = -Math.sin(q.theta), ny = -Math.cos(q.theta);
    drawArrow(ctx,x,y,x+nx*pn,y+ny*pn,'#6ee7ff',2);
    const tm = 8 + 26*Math.min(1, q.tau/Math.max(1,q.p));
    drawArrow(ctx,x,y,x+tx*tm,y+ty*tm,'#f8c15c',1.7);
  }

  const forceScale = 1.0;
  drawArrow(ctx,cx,cy,cx+Math.max(-150,Math.min(180,r.fx*forceScale)),cy,'#7ce6a2',5);
  ctx.fillStyle='#7ce6a2'; ctx.font='bold 17px system-ui'; ctx.fillText(`推進力 ${fmt(r.fx,1)} N`, cx+20, cy-15);
  drawArrow(ctx,cx,cy,cx,cy+Math.min(145,i.loadN*.42),'#ff8d8d',4);
  ctx.fillStyle='#ffb2b2'; ctx.fillText(`荷重 ${i.loadN.toFixed(0)} N`, cx+15, cy+Math.min(145,i.loadN*.42)-8);

  ctx.fillStyle='rgba(8,13,25,.78)'; ctx.fillRect(22,22,260,95);
  ctx.fillStyle='#eef3ff'; ctx.font='bold 17px system-ui'; ctx.fillText(wheel.name,38,50);
  ctx.font='14px system-ui'; ctx.fillStyle='#a9b8d1';
  ctx.fillText(`${SOILS[i.soilKey].name} / slip ${(i.slip*100).toFixed(0)}%`,38,76);
  ctx.fillText(`接触長 ${fmt(r.contactLength*1000,0)} mm`,38,100);
}

function drawChart(i) {
  const ctx=cctx, W=els.chart.width, H=els.chart.height;
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#09101f'; ctx.fillRect(0,0,W,H);
  const margin={l:70,r:24,t:32,b:52}, pw=W-margin.l-margin.r, ph=H-margin.t-margin.b;
  const wheel=WHEELS[i.wheelKey], soil=SOILS[i.soilKey];
  const pts=[]; for(let k=0;k<=40;k++){const s=k/50;const r=integrateWheel(wheel,soil,i.loadN,s);pts.push({s,fx:r.fx,eff:r.efficiency*100});}
  const maxFx=Math.max(10,...pts.map(p=>p.fx))*1.12;
  ctx.strokeStyle='#2c3853'; ctx.lineWidth=1;
  for(let k=0;k<=5;k++){const y=margin.t+ph*k/5;ctx.beginPath();ctx.moveTo(margin.l,y);ctx.lineTo(W-margin.r,y);ctx.stroke();}
  ctx.fillStyle='#91a4c3';ctx.font='13px system-ui';
  for(let k=0;k<=4;k++){const x=margin.l+pw*k/4;ctx.fillText(`${k*20}%`,x-12,H-20);}
  ctx.save();ctx.translate(18,H/2+40);ctx.rotate(-Math.PI/2);ctx.fillText('推進力 [N]',0,0);ctx.restore();
  const plot=(field,max,color)=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,idx)=>{const x=margin.l+pw*p.s/.8;const y=margin.t+ph*(1-Math.max(0,p[field])/max);if(idx===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();};
  plot('fx',maxFx,'#6ee7ff');
  ctx.setLineDash([7,5]); plot('eff',120,'#f8c15c'); ctx.setLineDash([]);
  const sx=margin.l+pw*i.slip/.8; ctx.strokeStyle='#7ce6a2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,margin.t);ctx.lineTo(sx,margin.t+ph);ctx.stroke();
  ctx.fillStyle='#6ee7ff';ctx.fillText('— 推進力',margin.l+8,22);ctx.fillStyle='#f8c15c';ctx.fillText('--- 効率指標',margin.l+100,22);
}

function tick(ts) {
  const dt=Math.min(.05,(ts-state.lastTs)/1000); state.lastTs=ts;
  if(state.playing){const i=getInputs();state.phase=(state.phase+dt*i.speed*1.5)%1000;}
  drawSim(ts); requestAnimationFrame(tick);
}

for (const el of [els.wheel,els.soil,els.load,els.slip,els.speed]) el.addEventListener('input',recalc);
els.play.addEventListener('click',()=>{state.playing=!state.playing;els.play.textContent=state.playing?'❚❚ 一時停止':'▶ 再生';});

els.record.addEventListener('click', async () => {
  if (state.recording) return;
  if (!els.sim.captureStream || !window.MediaRecorder) { alert('このブラウザではCanvas動画保存に対応していません。Chrome/Edgeの最新版をお試しください。'); return; }
  state.recording=true; els.record.disabled=true; els.record.textContent='● 録画中…';
  const stream=els.sim.captureStream(30);
  const mimeTypes=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mimeType=mimeTypes.find(x=>MediaRecorder.isTypeSupported(x))||'';
  const rec=new MediaRecorder(stream,mimeType?{mimeType}:undefined); const chunks=[];
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onstop=()=>{const blob=new Blob(chunks,{type:mimeType||'video/webm'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wheel-terrain-${els.wheel.value}-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);state.recording=false;els.record.disabled=false;els.record.textContent='● 8秒動画を保存';};
  rec.start(); setTimeout(()=>rec.stop(),8000);
});

recalc();
els.play.textContent='❚❚ 一時停止';
requestAnimationFrame(tick);
