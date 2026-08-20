'use strict';

(function attachSoilModel(root) {
  const LIMITS = {
    kc: [0, 300000],
    kphi: [100000, 8000000],
    n: [0.50, 1.60],
    cohesion: [0, 30000],
    phiDeg: [5, 45],
    K: [0.005, 0.080],
    density: [800, 2500],
    rutFactor: [0.05, 1.10],
    flow: [0, 1.50],
  };

  const DEFAULT_SOIL = Object.freeze({
    name: 'カスタム地盤',
    kc: 14000,
    kphi: 820000,
    n: 1.10,
    cohesion: 400,
    phiDeg: 28,
    K: 0.025,
    density: 1500,
    rutFactor: 0.72,
    flow: 1.00,
  });

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function finite(value, fallback) {
    const x = Number(value);
    return Number.isFinite(x) ? x : fallback;
  }

  function bounded(key, value, fallback) {
    const [lo, hi] = LIMITS[key];
    return clamp(finite(value, fallback), lo, hi);
  }

  function deriveSoil(raw = {}) {
    const base = DEFAULT_SOIL;
    return {
      name: String(raw.name || base.name).slice(0, 80),
      kc: bounded('kc', raw.kc, base.kc),
      kphi: bounded('kphi', raw.kphi, base.kphi),
      n: bounded('n', raw.n, base.n),
      cohesion: bounded('cohesion', raw.cohesion, base.cohesion),
      phiDeg: bounded('phiDeg', raw.phiDeg, base.phiDeg),
      K: bounded('K', raw.K, base.K),
      density: bounded('density', raw.density, base.density),
      rutFactor: bounded('rutFactor', raw.rutFactor, base.rutFactor),
      flow: bounded('flow', raw.flow, base.flow),
    };
  }

  function pressureAtDepth(soilInput, depthM, wheelWidthM = 0.08) {
    const soil = deriveSoil(soilInput);
    const z = Math.max(0, finite(depthM, 0));
    const b = Math.max(0.01, finite(wheelWidthM, 0.08));
    return (soil.kc / b + soil.kphi) * Math.pow(z, soil.n);
  }

  function shearStrengthAtPressure(soilInput, pressurePa) {
    const soil = deriveSoil(soilInput);
    const p = Math.max(0, finite(pressurePa, 0));
    return soil.cohesion + p * Math.tan(soil.phiDeg * Math.PI / 180);
  }

  function summarizeSoil(soilInput, wheelWidthM = 0.08) {
    const soil = deriveSoil(soilInput);
    const p10 = pressureAtDepth(soil, 0.010, wheelWidthM);
    const p30 = pressureAtDepth(soil, 0.030, wheelWidthM);
    const shear50 = shearStrengthAtPressure(soil, 50000);
    const deformationIndex = soil.rutFactor * (0.55 + 0.45 * Math.min(1.5, soil.flow));
    return {
      pressure10mmPa: p10,
      pressure30mmPa: p30,
      shearAt50kPaPa: shear50,
      deformationIndex,
    };
  }

  function toProfile(soilInput, name) {
    const soil = deriveSoil({ ...soilInput, name: name || soilInput?.name || DEFAULT_SOIL.name });
    return {
      name: soil.name,
      kc: soil.kc,
      kphi: soil.kphi,
      n: soil.n,
      cohesion: soil.cohesion,
      phiDeg: soil.phiDeg,
      K: soil.K,
      density: soil.density,
      rutFactor: soil.rutFactor,
      flow: soil.flow,
    };
  }

  const api = { LIMITS, DEFAULT_SOIL, deriveSoil, pressureAtDepth, shearStrengthAtPressure, summarizeSoil, toProfile };
  root.SoilParameterModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
