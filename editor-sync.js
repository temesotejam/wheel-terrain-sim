'use strict';

(function wireEditorAnalysisSync() {
  const wheelSelect = document.querySelector('#wheelSelect');
  if (!wheelSelect) return;

  const wheelEditorIds = [
    'customRadiusInput', 'customWidthInput', 'customLugHeightInput',
    'customLugCountInput', 'customLugAngleInput',
  ];

  function announceWheelChange() {
    queueMicrotask(() => wheelSelect.dispatchEvent(new Event('change', { bubbles: true })));
  }

  wheelEditorIds.forEach(id => document.querySelector(`#${id}`)?.addEventListener('input', announceWheelChange));
  document.querySelector('#resetCustomWheelBtn')?.addEventListener('click', announceWheelChange);
  document.querySelector('#loadSelectedWheelBtn')?.addEventListener('click', announceWheelChange);
})();
