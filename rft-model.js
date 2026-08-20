'use strict';

(function exposeRFTModel(root) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function referenceStressGradient(soil, width = 0.08, depth = 0.025) {
    const b = clamp(Number(width) || 0.08, 0.02, 0.30);
    const z = clamp(Number(depth) || 0.025, 0.005, 0.08);
    const kc = Math.max(0, Number(soil.kc) || 0);
    const kphi = Math.max(1, Number(soil.kphi) || 1);
    const n = clamp(Number(soil.n) || 1, 0.4, 2.0);
    const p = (kc / b + kphi) * Math.pow(z, n);
    return p / z;
  }

  function simulateWheel(wheel, soil, loadN, slip, speed = 0.6, options = {}) {
    const r = clamp(Number(wheel.radius) || 0.15, 0.03, 0.60);
    const b = clamp(Number(wheel.width) || 0.08, 0.01, 0.40);
    const lugHeight = clamp(Number(wheel.lugHeight) || 0, 0, r * 0.25);
    const load = clamp(Number(loadN) || 1, 1, 5000);
    const s = clamp(Number(slip) || 0, 0, 0.92);
    const v = clamp(Number(speed) || 0.01, 0.01, 5.0);
    const phi = clamp(Number(soil.phiDeg) || 28, 0, 60) * Math.PI / 180;
    const cohesion = Math.max(0, Number(soil.cohesion) || 0);
    const calibrationGain = clamp(Number(options.calibrationGain) || 1, 0.25, 4.0);
    const withdrawalFactor = clamp(Number(options.withdrawalFactor) || 0.35, 0.05, 0.90);
    const segments = clamp(Math.round(Number(options.segments) || 240), 60, 720);

    // Classical granular RFT uses an experimentally measured stress-per-depth
    // alpha(beta,gamma) map. Here we preserve that structure but synthesize the
    // magnitude from the selected soil's pressure-sinkage curve so the browser
    // tool remains usable before plate-test calibration.
    const alphaRef = referenceStressGradient(soil, 0.08, 0.025) * calibrationGain;
    const horizontalRatio = 0.38 + 0.28 * Math.sin(phi);
    const lugRatio = clamp(lugHeight / Math.max(r, 1e-9), 0, 0.20);
    const lugTractionGain = 1 + 0.35 * (lugRatio / 0.08);
    const omegaR = v / Math.max(1 - s, 0.08);

    function forcesAt(sinkage) {
      const zSink = clamp(sinkage, 1e-6, r * 0.82);
      const theta = Math.acos(clamp(1 - zSink / r, -1, 1));
      const dtheta = (2 * theta) / segments;
      let fx = 0;
      let fz = 0;
      let moment = 0;
      let maxStress = 0;
      const samples = [];

      for (let idx = 0; idx <= segments; idx++) {
        const a = -theta + dtheta * idx;
        const depth = Math.max(0, r * (Math.cos(a) - Math.cos(theta)) + lugHeight * 0.12);
        if (depth <= 0) continue;

        // Wheel surface velocity relative to the ground (x forward, z upward).
        const vx = v - omegaR * Math.cos(a);
        const vz = -omegaR * Math.sin(a);
        const vm = Math.hypot(vx, vz);
        if (vm < 1e-7) continue;
        const evx = vx / vm;
        const evz = vz / vm;

        // Outward surface normal of the lower wheel arc.
        const nx = Math.sin(a);
        const nz = -Math.cos(a);
        const normalVelocity = (vx * nx + vz * nz) / vm;
        const intrusion = clamp(normalVelocity, 0, 1);
        const alignment = Math.abs(evx * nx + evz * nz);

        // Synthetic alpha(beta,gamma) angular map. It is deliberately simple:
        // measured alpha_x/alpha_z tables can later replace this function without
        // changing the integration and visualization layers.
        const angularGain = 0.72 + 0.50 * alignment + 0.12 * Math.sin(phi);
        const engagement = withdrawalFactor + (1 - withdrawalFactor) * intrusion;
        const sigma = (alphaRef * depth + cohesion * 0.25) * angularGain * engagement;
        maxStress = Math.max(maxStress, sigma);

        // Reaction direction: mostly opposite local motion, with a smaller
        // component opposite the outward normal during intrusion.
        const normalMix = 0.20 + 0.12 * intrusion;
        let dx = -(1 - normalMix) * evx - normalMix * nx;
        let dz = -(1 - normalMix) * evz - normalMix * nz;
        const dm = Math.hypot(dx, dz) || 1;
        dx /= dm;
        dz /= dm;

        const tractionShapeGain = vx < 0 ? lugTractionGain : 1;
        const localFx = sigma * dx * horizontalRatio * tractionShapeGain;
        const localFz = sigma * dz;
        const dA = b * r * dtheta;
        fx += localFx * dA;
        fz += localFz * dA;

        const x = r * Math.sin(a);
        const z = -r * Math.cos(a);
        moment += (x * localFz - z * localFx) * dA;

        if (idx % Math.max(1, Math.round(segments / 18)) === 0) {
          samples.push({ theta: a, depth, sigma, fx: localFx, fz: localFz, vx, vz });
        }
      }

      return {
        fx,
        fz,
        torque: Math.abs(moment),
        z: zSink,
        thetaF: theta,
        thetaR: -theta,
        maxStress,
        samples,
      };
    }

    let lo = 1e-5;
    let hi = r * 0.82;
    const hiResult = forcesAt(hi);
    const saturated = hiResult.fz < load;
    if (!saturated) {
      for (let iter = 0; iter < 52; iter++) {
        const mid = (lo + hi) / 2;
        if (forcesAt(mid).fz < load) lo = mid;
        else hi = mid;
      }
    }

    const result = saturated ? hiResult : forcesAt((lo + hi) / 2);
    return {
      ...result,
      alphaRef,
      calibrationGain,
      horizontalRatio,
      lugTractionGain,
      tractionRatio: result.fx / load,
      loadError: result.fz - load,
      saturated,
      modelLabel: 'RFT proxy (uncalibrated alpha map)',
    };
  }

  root.RFTModel = { referenceStressGradient, simulateWheel };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RFTModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
