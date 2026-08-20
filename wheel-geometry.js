'use strict';

(function initWheelGeometryModel(root) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function deriveWheelGeometry(input = {}) {
    const radius = clamp(finite(input.radius, 0.15), 0.04, 0.50);
    const width = clamp(finite(input.width, 0.08), 0.015, 0.40);
    const lugHeight = clamp(finite(input.lugHeight, 0), 0, radius * 0.24);
    const lugCount = Math.round(clamp(finite(input.lugCount, lugHeight > 0 ? 16 : 0), 0, 48));
    const lugAngleDeg = clamp(finite(input.lugAngleDeg, 90), 0, 90);

    // 0 deg = lug runs along travel direction, 90 deg = cross-bar lug.
    // These factors are deliberately lightweight geometry-to-terramechanics mappings,
    // intended for relative comparison before soil/tire calibration.
    const relativeHeight = lugHeight / Math.max(radius, 1e-9);
    const heightFactor = clamp(relativeHeight / 0.08, 0, 2.0);
    const countFactor = lugCount > 0 ? clamp(Math.sqrt(lugCount / 16), 0.42, 1.55) : 0;
    const angleRad = lugAngleDeg * Math.PI / 180;
    const angleFactor = lugCount > 0 ? 0.34 + 0.66 * Math.pow(Math.sin(angleRad), 0.72) : 0;
    const lugEngagement = heightFactor * countFactor * angleFactor;

    // Existing simulator applies a small additional penetration term from lugHeight.
    // shearGain therefore represents only the tread-pattern contribution here.
    const shearGain = 1 + 0.34 * lugEngagement;
    const rrGain = 1 + 0.10 * lugEngagement;
    const effectiveShearIndex = shearGain * (1 + Math.min(relativeHeight, 0.12) * 1.6);
    const contactPatternIndex = lugCount > 0 ? clamp(countFactor * angleFactor, 0, 2) : 0;

    return {
      name: input.name || 'カスタムタイヤ',
      radius,
      width,
      lugHeight,
      lugCount,
      lugAngleDeg,
      shearGain,
      rrGain,
      effectiveShearIndex,
      contactPatternIndex,
      treadPitchDeg: lugCount > 0 ? 360 / lugCount : 0,
    };
  }

  const api = { clamp, deriveWheelGeometry };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WheelGeometryModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
