'use strict';

(function exposeRFTAlphaMapModel(root) {
  const BETA_VALUES = Array.from({ length: 13 }, (_, i) => -90 + i * 15);
  const GAMMA_VALUES = Array.from({ length: 12 }, (_, i) => -180 + i * 30);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrap180 = deg => ((deg + 180) % 360 + 360) % 360 - 180;

  function referenceStressGradient(soil, width = 0.08, depth = 0.025) {
    const b = clamp(Number(width) || 0.08, 0.02, 0.30);
    const z = clamp(Number(depth) || 0.025, 0.005, 0.08);
    const kc = Math.max(0, Number(soil?.kc) || 0);
    const kphi = Math.max(1, Number(soil?.kphi) || 1);
    const n = clamp(Number(soil?.n) || 1, 0.4, 2.0);
    const p = (kc / b + kphi) * Math.pow(z, n);
    return p / z;
  }

  function emptyMap(name = 'RFT alpha map') {
    const rows = BETA_VALUES.length;
    const cols = GAMMA_VALUES.length;
    return {
      version: 1,
      name,
      units: 'N/m^3',
      betaValues: [...BETA_VALUES],
      gammaValues: [...GAMMA_VALUES],
      alphaX: Array.from({ length: rows }, () => Array(cols).fill(0)),
      alphaZ: Array.from({ length: rows }, () => Array(cols).fill(0)),
      source: 'blank',
      sourceSoil: null,
    };
  }

  function makeProxyMap(soil, options = {}) {
    const map = emptyMap(options.name || `Proxy: ${soil?.name || 'soil'}`);
    const phi = clamp(Number(soil?.phiDeg) || 28, 0, 60) * Math.PI / 180;
    const cohesion = Math.max(0, Number(soil?.cohesion) || 0);
    const refDepth = clamp(Number(options.refDepth) || 0.025, 0.005, 0.08);
    const alphaRef = referenceStressGradient(soil || {}, 0.08, refDepth);
    const horizontalRatio = 0.38 + 0.28 * Math.sin(phi);

    for (let bi = 0; bi < map.betaValues.length; bi++) {
      const beta = map.betaValues[bi] * Math.PI / 180;
      const nx = Math.sin(beta);
      const nz = -Math.cos(beta);
      for (let gi = 0; gi < map.gammaValues.length; gi++) {
        const gamma = map.gammaValues[gi] * Math.PI / 180;
        const evx = Math.cos(gamma);
        const evz = Math.sin(gamma);
        const normalVelocity = evx * nx + evz * nz;
        const intrusion = clamp(normalVelocity, 0, 1);
        const alignment = Math.abs(normalVelocity);
        const angularGain = 0.72 + 0.50 * alignment + 0.12 * Math.sin(phi);
        const engagement = 0.35 + 0.65 * intrusion;
        const alphaMagnitude = (alphaRef + cohesion * 0.25 / refDepth) * angularGain * engagement;
        const normalMix = 0.20 + 0.12 * intrusion;
        let dx = -(1 - normalMix) * evx - normalMix * nx;
        let dz = -(1 - normalMix) * evz - normalMix * nz;
        const dm = Math.hypot(dx, dz) || 1;
        dx /= dm;
        dz /= dm;
        map.alphaX[bi][gi] = alphaMagnitude * dx * horizontalRatio;
        map.alphaZ[bi][gi] = alphaMagnitude * dz;
      }
    }

    map.source = 'proxy-from-soil';
    map.sourceSoil = soil?.name || null;
    map.referenceAlpha = alphaRef;
    return map;
  }

  function cloneMap(map) {
    return JSON.parse(JSON.stringify(map));
  }

  function validateMap(map) {
    if (!map || !Array.isArray(map.betaValues) || !Array.isArray(map.gammaValues)) return false;
    if (!Array.isArray(map.alphaX) || !Array.isArray(map.alphaZ)) return false;
    if (map.betaValues.length !== BETA_VALUES.length || map.gammaValues.length !== GAMMA_VALUES.length) return false;
    for (let i = 0; i < BETA_VALUES.length; i++) if (Number(map.betaValues[i]) !== BETA_VALUES[i]) return false;
    for (let i = 0; i < GAMMA_VALUES.length; i++) if (Number(map.gammaValues[i]) !== GAMMA_VALUES[i]) return false;
    return map.alphaX.every(row => Array.isArray(row) && row.length === GAMMA_VALUES.length && row.every(Number.isFinite))
      && map.alphaZ.every(row => Array.isArray(row) && row.length === GAMMA_VALUES.length && row.every(Number.isFinite));
  }

  function sample(map, betaDeg, gammaDeg) {
    if (!validateMap(map)) return { alphaX: 0, alphaZ: 0 };
    const beta = clamp(Number(betaDeg) || 0, -90, 90);
    const bp = (beta + 90) / 15;
    const b0 = clamp(Math.floor(bp), 0, BETA_VALUES.length - 1);
    const b1 = clamp(b0 + 1, 0, BETA_VALUES.length - 1);
    const bt = b1 === b0 ? 0 : bp - b0;

    const gamma = wrap180(Number(gammaDeg) || 0);
    const gp = (gamma + 180) / 30;
    const g0 = ((Math.floor(gp) % GAMMA_VALUES.length) + GAMMA_VALUES.length) % GAMMA_VALUES.length;
    const g1 = (g0 + 1) % GAMMA_VALUES.length;
    const gt = gp - Math.floor(gp);

    const bilerp = field => {
      const q00 = field[b0][g0], q01 = field[b0][g1];
      const q10 = field[b1][g0], q11 = field[b1][g1];
      const a = q00 + (q01 - q00) * gt;
      const b = q10 + (q11 - q10) * gt;
      return a + (b - a) * bt;
    };
    return { alphaX: bilerp(map.alphaX), alphaZ: bilerp(map.alphaZ) };
  }

  function setCell(map, betaDeg, gammaDeg, alphaX, alphaZ) {
    if (!validateMap(map)) throw new Error('Invalid RFT alpha map');
    const bi = BETA_VALUES.indexOf(Number(betaDeg));
    const gi = GAMMA_VALUES.indexOf(Number(gammaDeg));
    if (bi < 0 || gi < 0) throw new Error('Cell angle is not on the standard RFT grid');
    map.alphaX[bi][gi] = Number(alphaX);
    map.alphaZ[bi][gi] = Number(alphaZ);
    if (!Number.isFinite(map.alphaX[bi][gi]) || !Number.isFinite(map.alphaZ[bi][gi])) throw new Error('Alpha values must be finite');
    map.source = map.source === 'csv-import' ? 'csv-import-edited' : 'edited';
    return map;
  }

  function stats(map) {
    if (!validateMap(map)) return { maxAbsX: 0, maxAbsZ: 0, rms: 0 };
    let maxAbsX = 0, maxAbsZ = 0, sumSq = 0, count = 0;
    for (let bi = 0; bi < BETA_VALUES.length; bi++) {
      for (let gi = 0; gi < GAMMA_VALUES.length; gi++) {
        const ax = map.alphaX[bi][gi], az = map.alphaZ[bi][gi];
        maxAbsX = Math.max(maxAbsX, Math.abs(ax));
        maxAbsZ = Math.max(maxAbsZ, Math.abs(az));
        sumSq += ax * ax + az * az;
        count += 2;
      }
    }
    return { maxAbsX, maxAbsZ, rms: Math.sqrt(sumSq / Math.max(1, count)) };
  }

  function toCSV(map) {
    if (!validateMap(map)) throw new Error('Invalid RFT alpha map');
    const lines = ['beta_deg,gamma_deg,alpha_x_N_m3,alpha_z_N_m3'];
    for (let bi = 0; bi < BETA_VALUES.length; bi++) {
      for (let gi = 0; gi < GAMMA_VALUES.length; gi++) {
        lines.push([BETA_VALUES[bi], GAMMA_VALUES[gi], map.alphaX[bi][gi], map.alphaZ[bi][gi]].join(','));
      }
    }
    return lines.join('\n');
  }

  function fromCSV(text, name = 'Imported RFT alpha map') {
    const map = emptyMap(name);
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV has no data rows');
    const header = lines[0].toLowerCase().split(',').map(x => x.trim());
    const required = ['beta_deg', 'gamma_deg', 'alpha_x_n_m3', 'alpha_z_n_m3'];
    const indices = required.map(key => header.indexOf(key));
    if (indices.some(i => i < 0)) throw new Error('CSV header must be beta_deg,gamma_deg,alpha_x_N_m3,alpha_z_N_m3');
    const seen = new Set();
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map(x => x.trim());
      const beta = Number(cols[indices[0]]), gamma = Number(cols[indices[1]]);
      const ax = Number(cols[indices[2]]), az = Number(cols[indices[3]]);
      const bi = BETA_VALUES.indexOf(beta), gi = GAMMA_VALUES.indexOf(gamma);
      if (bi < 0 || gi < 0 || !Number.isFinite(ax) || !Number.isFinite(az)) continue;
      map.alphaX[bi][gi] = ax;
      map.alphaZ[bi][gi] = az;
      seen.add(`${beta},${gamma}`);
    }
    if (seen.size !== BETA_VALUES.length * GAMMA_VALUES.length) {
      throw new Error(`CSV must contain all ${BETA_VALUES.length * GAMMA_VALUES.length} standard-grid cells`);
    }
    map.source = 'csv-import';
    return map;
  }

  root.RFTAlphaMapModel = {
    BETA_VALUES, GAMMA_VALUES, wrap180, referenceStressGradient,
    emptyMap, makeProxyMap, cloneMap, validateMap, sample, setCell, stats, toCSV, fromCSV,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RFTAlphaMapModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
