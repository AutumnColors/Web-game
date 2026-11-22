// Ambient (turbine-free) atmospheric velocity field v(x, y, z, t).
//
// MODEL (approximation, see README "Atmosphere"):
// 1. Neutral logarithmic profile  U(h) = U_ref · ln(h/z0) / ln(z_ref/z0).
// 2. Terrain enters through a stream function in each vertical plane aligned
//    with the wind direction ŝ:
//        ψ(s, n, y) = Ψ0(η),  Ψ0' = U,  η = y − H · exp(−(y − H)/L)
//    so that   u_s = ∂ψ/∂y = U(η) ∂η/∂y,   u_y = −∂ψ/∂s = −U(η) ∂η/∂s,  u_n = 0.
//    • The ground y = H is the streamline η = 0 (no flow through the surface).
//    • ∇·v = 0 exactly (mixed partials of ψ commute) — checked numerically in tests.
//    • Far above the terrain η → y and the log profile is recovered.
//    • For uniform U and small sinusoidal terrain this reduces to linear
//      potential flow; with one decay length L for all features and a log
//      profile it is a kinematic approximation, not a solution of the
//      Navier–Stokes equations. Flow goes over hills, never around them.
// 3. Optional slow, spatially uniform changes of U_ref and direction in time
//    ("Variable winds"). Uniform in space ⇒ divergence-free at every instant.
//    Treated quasi-steadily: wakes respond instantly (no transport delay).

import { SIGMA_U_OVER_USTAR, VON_KARMAN, SIGMA_V_OVER_SIGMA_U } from './parameters.js';

export function turbulenceIntensity(height, z0) {
  // I = σ_u / U = (σ_u/u*) · κ / ln(z/z0)  for the neutral log law.
  return (SIGMA_U_OVER_USTAR * VON_KARMAN) / Math.log(height / z0);
}

export function createAtmosphere({ terrain, z0, uRef, zRef, direction, variable = false, rng = null }) {
  const L = terrain.decayLength;
  const lnRef = Math.log(zRef / z0);
  const TI = turbulenceIntensity(zRef, z0);

  // Variable winds: three slow sinusoids whose combined standard deviation equals
  // σ_u = I·U_ref (speed) and σ_θ = (σ_v/σ_u)·I (direction, rad). Periods 40–150 s.
  const modes = [];
  if (variable && rng) {
    const ampU = TI / Math.sqrt(1.5), ampD = (SIGMA_V_OVER_SIGMA_U * TI) / Math.sqrt(1.5);
    for (let i = 0; i < 3; i++) modes.push({
      w: (2 * Math.PI) / rng.range(40, 150), pu: rng.range(0, 6.283), pd: rng.range(0, 6.283), ampU, ampD,
    });
  }

  const state = { t: 0, uRef, direction, cos: Math.cos(direction), sin: Math.sin(direction) };
  const h3 = [0, 0, 0];

  function setTime(t) {
    let fu = 1, d = direction;
    for (const m of modes) { fu += m.ampU * Math.sin(m.w * t + m.pu); d += m.ampD * Math.sin(m.w * t + m.pd); }
    state.t = t; state.uRef = uRef * fu; state.direction = d;
    state.cos = Math.cos(d); state.sin = Math.sin(d);
  }

  function profile(h) {
    return h > z0 ? (state.uRef * Math.log(h / z0)) / lnRef : 0;
  }

  // velocity at a point; writes [vx, vy, vz] into out and returns it
  function velocity(x, y, z, out) {
    terrain.sample(x, z, h3);
    const H = h3[0];
    const hAbove = y - H;
    if (hAbove <= 0) { out[0] = out[1] = out[2] = 0; return out; }
    const Hs = h3[1] * state.cos + h3[2] * state.sin; // slope along the wind
    const e = Math.exp(-hAbove / L);
    const eta = y - H * e;
    const etaY = 1 + (H / L) * e;
    const etaS = -Hs * e * (1 + H / L);
    const U = profile(eta);
    const us = U * etaY;
    out[0] = us * state.cos;
    out[1] = -U * etaS;
    out[2] = us * state.sin;
    return out;
  }

  setTime(0);
  return {
    z0, zRef, decayLength: L, turbulenceIntensity: TI, state,
    setTime, profile, velocity,
    // the stream coordinate η (constant along every streamline)
    eta(x, y, z) { terrain.sample(x, z, h3); return y - h3[0] * Math.exp(-(y - h3[0]) / L); },
    // height y above (x, z) of the streamline with stream coordinate etaTarget (Newton; η is
    // strictly increasing in y because H > −L, which the tests check for every terrain)
    streamlineHeight(x, z, etaTarget, guess) {
      terrain.sample(x, z, h3);
      const H = h3[0];
      let y = Math.max(guess ?? etaTarget, H + 1e-3);
      for (let i = 0; i < 30; i++) {
        const e = Math.exp(-(y - H) / L), f = y - H * e - etaTarget, df = 1 + (H / L) * e;
        const yn = Math.max(H + 1e-6, y - f / df);
        if (Math.abs(yn - y) < 1e-9) return yn;
        y = yn;
      }
      return y;
    },
    isVariable: modes.length > 0,
  };
}
