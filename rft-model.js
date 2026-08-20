'use strict';

(function exposeRFTModel(root) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function referenceStressGradient(soil, width = 0.08, depth = 0.025) {
    if (root.RFTAlphaMapModel?.referenceStressGradient) {
      return root.RFTAlphaMapModel.referenceStressGradient(soil, width, depth);
    }
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
    const alphaMapModel = root.RFTAlphaMapModel;
    const alphaMap = alphaMapModel?.validateMap?.(options.alphaMap) ? options.alphaMap : null;
    const leadingEdgeOnly = options.leadingEdgeOnly !== false;

    const alphaRef = alphaMap
      ? Math.max(1, alphaMapModel.stats(alphaMap).rms)
      : referenceStressGradient(soil, 0.08, 0.025) * calibrationGain;
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

        // For the lower wheel arc, beta is the tangent/plate angle and the
        // outward normal is n=(sin(beta),-cos(beta)). This matches the editor's
        // documented 2D convention. gamma is the velocity-vector angle.
        const nx = Math.sin(a);
        const nz = -Math.cos(a);
        const normalVelocity = (vx * nx + vz * nz) / vm;
        const intrusion = clamp(normalVelocity, 0, 1);
        const betaDeg = a * 180 / Math.PI;
        const gammaDeg = Math.atan2(vz, vx) * 180 / Math.PI;
        if (alphaMap && leadingEdgeOnly && normalVelocity <= 0) continue;

        let localFx;
        let localFz;
        let sigma;

        if (alphaMap) {
          // Classical granular RFT form: traction/depth alpha(beta,gamma)
          // multiplied by local depth. The editable map directly supplies the
          // signed x/z components, so no synthetic reaction direction is needed.
          const alpha = alphaMapModel.sample(alphaMap, betaDeg, gammaDeg);
          localFx = alpha.alphaX * depth * calibrationGain;
          localFz = alpha.alphaZ * depth * calibrationGain;
          if (vx < 0) localFx *= lugTractionGain;
          sigma = Math.hypot(localFx, localFz);
        } else {
          // Fallback uncalibrated proxy retained for compatibility when no map
          // is supplied. It synthesizes an angular alpha-like response from the
          // selected soil's pressure-sinkage scale.
          const alignment = Math.abs(evx * nx + evz * nz);
          const angularGain = 0.72 + 0.50 * alignment + 0.12 * Math.sin(phi);
          const engagement = withdrawalFactor + (1 - withdrawalFactor) * intrusion;
          sigma = (alphaRef * depth + cohesion * 0.25) * angularGain * engagement;
          const normalMix = 0.20 + 0.12 * intrusion;
          let dx = -(1 - normalMix) * evx - normalMix * nx;
          let dz = -(1 - normalMix) * evz - normalMix * nz;
          const dm = Math.hypot(dx, dz) || 1;
          dx /= dm;
          dz /= dm;
          const tractionShapeGain = vx < 0 ? lugTractionGain : 1;
          localFx = sigma * dx * horizontalRatio * tractionShapeGain;
          localFz = sigma * dz;
        }

        maxStress = Math.max(maxStress, sigma);
        const dA = b * r * dtheta;
        fx += localFx * dA;
        fz += localFz * dA;

        const x = r * Math.sin(a);
        const z = -r * Math.cos(a);
        moment += (x * localFz - z * localFx) * dA;

        if (idx % Math.max(1, Math.round(segments / 18)) === 0) {
          samples.push({ theta: a, betaDeg, gammaDeg, depth, sigma, fx: localFx, fz: localFz, vx, vz, leading: normalVelocity > 0 });
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
      alphaMapActive: Boolean(alphaMap),
      alphaMapName: alphaMap?.name || null,
      leadingEdgeOnly,
      modelLabel: alphaMap ? 'RFT alpha map' : 'RFT proxy (uncalibrated alpha map)',
    };
  }

  root.RFTModel = { referenceStressGradient, simulateWheel };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RFTModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
