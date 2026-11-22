// Turbine model: NREL 5-MW reference geometry + BEM aerodynamics + a simplified controller.
//
// Geometry (chord, twist, airfoil per station) is the reference design
// (Jonkman et al. 2009, Table 2-1). The airfoil polars are NOT the reference
// tables (see airfoil.js), so Cp, Ct and the power curve are approximations.
//
// Controller (simplified version of the reference baseline controller):
//   region 1   U < cut-in or U > cut-out → parked, P = 0, thrust neglected
//   region 1.5/2/2.5  pitch 0, rotor speed Ω = λ_opt·U/R clamped to [Ω_min, Ω_rated]
//   region 3   Ω = Ω_rated, pitch increased until aerodynamic power = rated / efficiency
// Real controllers have transition regions and generator-torque dynamics; not modelled.

import { polar } from './airfoil.js';
import { evaluateRotor } from './bem.js';

const RPM = (2 * Math.PI) / 60;
const DEG = Math.PI / 180;

// [r from rotor centre (m), twist (deg), chord (m), airfoil]   — reference design table
const NREL_STATIONS = [
  [2.8667, 13.308, 3.542, 'Cylinder1'], [5.6000, 13.308, 3.854, 'Cylinder1'], [8.3333, 13.308, 4.167, 'Cylinder2'],
  [11.7500, 13.308, 4.557, 'DU40'], [15.8500, 11.480, 4.652, 'DU35'], [19.9500, 10.162, 4.458, 'DU35'],
  [24.0500, 9.011, 4.249, 'DU30'], [28.1500, 7.795, 4.007, 'DU25'], [32.2500, 6.544, 3.748, 'DU25'],
  [36.3500, 5.361, 3.502, 'DU21'], [40.4500, 4.188, 3.256, 'DU21'], [44.5500, 3.125, 3.010, 'NACA64'],
  [48.6500, 2.319, 2.764, 'NACA64'], [52.7500, 1.526, 2.518, 'NACA64'], [56.1667, 0.863, 2.313, 'NACA64'],
  [58.9000, 0.370, 2.086, 'NACA64'], [61.6333, 0.106, 1.419, 'NACA64'],
];

export function nrel5mw() {
  const polars = {};
  const sections = NREL_STATIONS.map(([r, tw, c, af]) => ({
    r, twist: tw * DEG, chord: c, airfoil: af, polar: (polars[af] ??= polar(af)),
  }));
  return {
    name: 'NREL 5-MW reference (approximate polars)',
    rotor: { B: 3, R: 63, Rhub: 1.5, sections },
    hubHeight: 90, // m above ground
    towerHeight: 87.6, towerBaseDiameter: 6, towerTopDiameter: 3.87,
    overhang: 5, // m, rotor centre upwind of the tower axis
    // Precone (2.5°) and shaft tilt (5°) of the reference design are not modelled yet.
    ratedPower: 5e6, efficiency: 0.944,
    omegaMin: 6.9 * RPM, omegaRated: 12.1 * RPM,
    cutIn: 3, cutOut: 25,
  };
}

function goldenMax(f, a, b, iters = 60) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

export function createTurbineModel(def = nrel5mw(), { dU = 0.1, uMax = 30 } = {}) {
  const { rotor } = def;
  const Uprobe = 8;
  const cpAt = (tsr) => evaluateRotor(rotor, Uprobe, (tsr * Uprobe) / rotor.R, 0).Cp;
  const tsrOpt = goldenMax(cpAt, 3, 12);
  const cpMax = cpAt(tsrOpt);
  const pAeroRated = def.ratedPower / def.efficiency;

  // prevPitch: pitch of the previous (lower) wind speed. Above rated the controller follows the
  // feather branch: the smallest pitch ≥ prevPitch at which power has fallen back to rated.
  // (At high wind a stalled blade at pitch 0 can also produce less than rated; that branch is
  // not what pitch-to-feather control does.)
  function operate(U, prevPitch = 0, above = false) {
    if (U < def.cutIn || U > def.cutOut) return { U, region: 'parked', P: 0, Pel: 0, Cp: 0, Ct: 0, omega: 0, pitch: 0 };
    const omega = Math.min(def.omegaRated, Math.max(def.omegaMin, (tsrOpt * U) / rotor.R));
    const power = (pitch) => evaluateRotor(rotor, U, omega, pitch).P;
    let pitch = 0, region = omega >= def.omegaRated ? '2.5' : '2';
    if (above || power(0) > pAeroRated) {
      region = '3';
      const step = 0.5 * DEG;
      let lo = prevPitch, hi = prevPitch, seenAbove = power(lo) > pAeroRated;
      while (hi < 45 * DEG) {
        hi += step;
        const p = power(hi);
        if (p > pAeroRated) { seenAbove = true; lo = hi; } else if (seenAbove) break;
      }
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (power(mid) > pAeroRated) lo = mid; else hi = mid;
      }
      pitch = 0.5 * (lo + hi);
    }
    const res = evaluateRotor(rotor, U, omega, pitch);
    const P = Math.max(0, res.P);
    return { U, region, P, Pel: P * def.efficiency, Cp: res.Cp, Ct: res.Ct, omega, pitch, tsr: res.tsr, converged: res.converged };
  }

  const table = [];
  let prevPitch = 0, above = false;
  for (let i = 0; i * dU <= uMax + 1e-9; i++) {
    const op = operate(+(i * dU).toFixed(6), prevPitch, above);
    if (op.region === '3') { above = true; prevPitch = op.pitch; }
    table.push(op);
  }

  function operatingPoint(U) {
    if (!(U > 0)) return table[0];
    const f = U / dU, i = Math.floor(f);
    if (i >= table.length - 1) return table[table.length - 1];
    const A = table[i], B = table[i + 1], w = f - i;
    // Do not interpolate across cut-in / cut-out (discontinuous)
    if (A.region === 'parked' || B.region === 'parked') return w < 0.5 ? { ...A, U } : { ...B, U };
    const o = { U, region: w < 0.5 ? A.region : B.region };
    for (const key of ['P', 'Pel', 'Cp', 'Ct', 'omega', 'pitch', 'tsr']) o[key] = A[key] + w * (B[key] - A[key]);
    return o;
  }

  const ratedWind = (() => {
    const first = table.find((t) => t.region === '3');
    return first ? first.U : NaN;
  })();

  return { def, rotor, tsrOpt, cpMax, pAeroRated, table, operate, operatingPoint, ratedWind, D: 2 * rotor.R };
}
