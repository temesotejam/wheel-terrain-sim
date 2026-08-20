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

  // The custom wheel and custom soil are injected after repass.js performs its first render.
  // Refresh once after every editor has initialized so comparison tables see both entries.
  queueMicrotask(() => {
    wheelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    soilSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
