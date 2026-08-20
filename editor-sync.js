'use strict';

(function wireEditorAnalysisSync() {
  const wheelSelect = document.querySelector('#wheelSelect');
  const soilSelect = document.querySelector('#soilSelect');
  if (!wheelSelect || !soilSelect) return;

  const wheelEditorIds = [
    'customRadiusInput', 'customWidthInput', 'customLugHeightInput',
    'customLugCountInput', 'customLugAngleInput',
  ];

  function dispatchChange(select) {
    queueMicrotask(() => select.dispatchEvent(new Event('change', { bubbles: true })));
  }

  function announceWheelChange() { dispatchChange(wheelSelect); }

  wheelEditorIds.forEach(id => document.querySelector(`#${id}`)?.addEventListener('input', announceWheelChange));
  document.querySelector('#resetCustomWheelBtn')?.addEventListener('click', announceWheelChange);
  document.querySelector('#loadSelectedWheelBtn')?.addEventListener('click', announceWheelChange);

  function ensureAlphaEditorMarkup() {
    if (document.querySelector('#alphaXHeatmap')) return;
    const anchor = document.querySelector('.rft-grid');
    if (!anchor) return;
    const section = document.createElement('section');
    section.className = 'panel alpha-map-panel';
    section.innerHTML = `
      <div class="panel-head">
        <div>
          <h2>RFT αマップ校正</h2>
          <p>αx(β,γ) / αz(β,γ) をヒートマップで編集し、実測CSVへ置き換え</p>
        </div>
        <span class="badge">calibratable α(β,γ)</span>
      </div>
      <div class="alpha-heat-grid">
        <div class="alpha-heat-card"><h3>水平抵抗 αx</h3><canvas id="alphaXHeatmap" width="820" height="420"></canvas></div>
        <div class="alpha-heat-card"><h3>鉛直抵抗 αz</h3><canvas id="alphaZHeatmap" width="820" height="420"></canvas></div>
      </div>
      <div class="alpha-map-controls">
        <div class="alpha-cell-editor">
          <h3>選択セル</h3>
          <div class="alpha-cell-angle"><span>β <strong id="alphaSelectedBeta">0°</strong></span><span>γ <strong id="alphaSelectedGamma">-90°</strong></span></div>
          <div class="alpha-value-row">
            <label>αx [kN/m³]<input id="alphaXValueInput" type="number" step="1" /></label>
            <label>αz [kN/m³]<input id="alphaZValueInput" type="number" step="1" /></label>
          </div>
          <div class="alpha-map-actions">
            <button id="alphaRegenerateProxyBtn" class="primary">現在地盤からproxy生成</button>
            <button id="alphaExportCsvBtn">CSV保存</button>
            <label>CSV読込<input id="alphaImportCsvInput" type="file" accept=".csv,text/csv" /></label>
          </div>
          <div id="alphaMapSummary" class="alpha-map-summary"></div>
        </div>
        <div class="alpha-profile-box">
          <h3>αマップをブラウザ保存</h3>
          <div class="alpha-profile-row"><input id="alphaProfileName" type="text" maxlength="80" placeholder="例: dry sand plate test A" /><button id="alphaSaveProfileBtn">保存</button></div>
          <div class="alpha-profile-row"><select id="savedAlphaProfileSelect"></select><button id="alphaLoadProfileBtn">読込</button><button id="alphaDeleteProfileBtn">削除</button></div>
          <p class="alpha-map-note">CSV形式: <code>beta_deg,gamma_deg,alpha_x_N_m3,alpha_z_N_m3</code>。βは要素姿勢角、γは局所速度ベクトル角です。正値は +x/+z 方向の抵抗成分です。</p>
        </div>
      </div>`;
    anchor.before(section);
  }

  function ensureStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href; document.head.appendChild(link);
  }

  function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.onload = resolve; script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  ensureAlphaEditorMarkup();
  ensureStylesheet('rft-alpha-editor.css');
  loadScript('rft-alpha-map.js')
    .then(() => loadScript('rft-alpha-editor.js'))
    .catch(err => console.error('Failed to load RFT alpha editor', err));

  // The custom wheel and custom soil are injected after repass.js performs its first render.
  // Refresh once after every editor has initialized so comparison tables see both entries.
  queueMicrotask(() => {
    wheelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    soilSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
