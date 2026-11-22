// Gaussian far-wake model of Bastankhah & Porté-Agel (2014).
//
//   ΔU/U_in = C(x) · exp(−r² / (2σ²)),   σ/D = k*·x/D + ε,   ε = 0.2·√β,
//   β = ½ (1 + √(1−Ct)) / √(1−Ct),       C(x) = 1 − √(1 − Ct / (8 (σ/D)²))
//
// C(x) follows from requiring that the momentum deficit flux equals the rotor
// thrust, ρ∫U(U_in − U) dA = ½ρ Ct A U_in², with a Gaussian profile — the tests
// check this integral numerically. k* comes from the Niayifar & Porté-Agel
// (2016) fit to hub-height turbulence intensity.
//
// Scope and approximations
//   • far wake only: for x < 3D the deficit is frozen at its 3D value (placeholder)
//   • axisymmetric about a straight centreline along the rotor axis from the hub
//     (no ground image, no terrain following, no wake deflection or meandering)
//   • ambient turbulence only (no added wake turbulence)
//   • the deficit is a streamwise speed reduction; there is no radial velocity,
//     so a wake-modified field is NOT divergence-free

import { WAKE_K_FIT, WAKE_EPSILON_FACTOR, NEAR_WAKE_END, MOMENTUM_LIMIT_CT } from './parameters.js';

export function wakeGrowthRate(TI) {
  return WAKE_K_FIT.slope * TI + WAKE_K_FIT.intercept;
}

export function createGaussianWake({ D, Ct, kStar }) {
  const ct = Math.min(Math.max(Ct, 0), MOMENTUM_LIMIT_CT);
  const sq = Math.sqrt(1 - ct);
  const beta = (0.5 * (1 + sq)) / sq;
  const eps = WAKE_EPSILON_FACTOR * Math.sqrt(beta);
  const xNear = NEAR_WAKE_END * D;

  function sigmaOverD(x) { return kStar * (Math.max(x, xNear) / D) + eps; }
  function centreDeficit(x) {
    if (x <= 0 || ct === 0) return 0;
    const s = sigmaOverD(x);
    const arg = 1 - ct / (8 * s * s);
    return arg > 0 ? 1 - Math.sqrt(arg) : 1; // arg ≤ 0 only if parameters leave the model's domain
  }
  // relative deficit ΔU/U_in at downstream distance x and radial distance r (both m)
  function deficit(x, r2) {
    if (x <= 0 || ct === 0) return 0;
    const s = sigmaOverD(x) * D;
    return centreDeficit(x) * Math.exp(-r2 / (2 * s * s));
  }
  return { D, Ct: ct, CtInput: Ct, kStar, beta, eps, xNear, sigmaOverD, centreDeficit, deficit, clamped: Ct > MOMENTUM_LIMIT_CT };
}
