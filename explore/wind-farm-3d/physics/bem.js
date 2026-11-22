// Blade-element momentum (BEM) solver for a horizontal-axis rotor in uniform axial inflow.
//
// Method: the single-residual formulation of Ning (2014, Wind Energy 17:1327,
// "A simple solution method for the blade element momentum equations with
// guaranteed convergence"), as used in CCBlade. For each blade section the
// unknown is the inflow angle φ; the residual is bracketed and solved with
// Brent's method, so the solve cannot diverge.
//
// Included: Prandtl tip and hub losses, Buhl (2005) high-thrust correction,
//           propeller-brake branch, drag in both induction factors.
// Not included: yaw/tilt/cone, unsteady or dynamic-stall effects, 3-D rotational
//           augmentation, tower shadow, sheared inflow (the farm averages the
//           inflow over the disk and treats it as uniform).
//
// Rotor: { B, R, Rhub, sections: [{ r, chord, twist /*rad*/, polar }] }
// Sign convention: φ and twist measured from the rotor plane, α = φ − (twist + pitch).

import { AIR_DENSITY, BEM_TOLERANCE, BUHL_TRANSITION_K } from './parameters.js';

const EPS = 1e-6;

// Ideal actuator disk (1-D momentum theory) with axial induction a: reference for the BEM tests.
export function actuatorDisk(a) {
  return { Cp: 4 * a * (1 - a) ** 2, Ct: 4 * a * (1 - a) };
}

export function brent(f, a, b, tol = BEM_TOLERANCE, maxIter = 200) {
  let fa = f(a), fb = f(b);
  if (fa * fb > 0) return null;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = e = b - a; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol, m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p, q, r, s = fb / fa;
      if (a === c) { p = 2 * m * s; q = 1 - s; }
      else { q = fa / fc; r = fb / fc; p = s * (2 * m * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = m; e = m; }
    } else { d = m; e = m; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (m > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

const cl2 = [0, 0];

// Evaluate induction and residual of one section at inflow angle phi.
function sectionState(rotor, sec, Vx, Vy, theta, phi, opts, out) {
  const { B, R, Rhub } = rotor;
  const r = sec.r;
  const sigmaP = (B * sec.chord) / (2 * Math.PI * r);
  const sphi = Math.sin(phi), cphi = Math.cos(phi);
  const alpha = phi - theta;
  sec.polar.coeffs(alpha, cl2);
  const cl = cl2[0], cd = cl2[1];
  const cn = cl * cphi + cd * sphi;
  const ct = cl * sphi - cd * cphi;

  let F = 1;
  if (opts.tipLoss) {
    const f = (B / 2) * (R - r) / (r * Math.abs(sphi));
    F *= (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(-f)));
  }
  if (opts.hubLoss) {
    const f = (B / 2) * (r - Rhub) / (Rhub * Math.abs(sphi));
    F *= (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(-f)));
  }
  F = Math.max(F, 1e-12);

  const k = (sigmaP * cn) / (4 * F * sphi * sphi);
  const kp = (sigmaP * ct) / (4 * F * sphi * cphi);
  let a, fres;
  const lambdaR = Vy / Vx;
  if (phi > 0) {
    if (k <= BUHL_TRANSITION_K) a = k / (1 + k);
    else {
      const g1 = 2 * F * k - (10 / 9 - F);
      const g2 = Math.max(0, 2 * F * k - F * (4 / 3 - F));
      const g3 = 2 * F * k - (25 / 9 - 2 * F);
      a = Math.abs(g3) < 1e-6 ? 1 - 1 / (2 * Math.sqrt(g2)) : (g1 - Math.sqrt(g2)) / g3;
    }
    fres = sphi / (1 - a) - (cphi / lambdaR) * (1 - kp);
  } else {
    a = k > 1 ? k / (k - 1) : 0;
    fres = sphi * (1 - k) - (cphi / lambdaR) * (1 - kp);
  }
  const ap = kp / (1 - kp);
  if (out) Object.assign(out, { phi, alpha, cl, cd, cn, ct, F, k, kp, a, ap, sigmaP });
  return fres;
}

export function solveSection(rotor, sec, Vx, Vy, pitch, opts = {}) {
  const o = { tipLoss: true, hubLoss: true, ...opts };
  const theta = sec.twist + pitch;
  const f = (phi) => sectionState(rotor, sec, Vx, Vy, theta, phi, o, null);
  let phi = brent(f, EPS, Math.PI / 2 - EPS);
  let region = 'momentum';
  if (phi === null) { phi = brent(f, -Math.PI / 4, -EPS); region = 'propeller-brake'; }
  if (phi === null) { phi = brent(f, Math.PI / 2 + EPS, Math.PI - EPS); region = 'beyond-90'; }
  if (phi === null) return { converged: false, Np: 0, Tp: 0, r: sec.r };
  const s = { r: sec.r, chord: sec.chord, region, converged: true };
  const residual = sectionState(rotor, sec, Vx, Vy, theta, phi, o, s);
  const W2 = (Vx * (1 - s.a)) ** 2 + (Vy * (1 + s.ap)) ** 2;
  const q = 0.5 * (o.rho ?? AIR_DENSITY) * W2 * sec.chord;
  s.W = Math.sqrt(W2);
  s.Np = s.cn * q; // force per unit span normal to rotor plane (thrust direction) [N/m]
  s.Tp = s.ct * q; // force per unit span tangential, in the direction of rotation [N/m]
  s.residual = residual;
  return s;
}

// Integrate the loads of the rotor. U: axial wind speed [m/s], omega [rad/s], pitch [rad].
export function evaluateRotor(rotor, U, omega, pitch, opts = {}) {
  const rho = opts.rho ?? AIR_DENSITY;
  const secs = rotor.sections.map((sec) => solveSection(rotor, sec, U, omega * sec.r, pitch, opts));
  // Trapezoidal integration with zero load at hub and tip (loads vanish there with tip/hub loss;
  // without loss models the end segments are a small truncation error).
  const rs = [rotor.Rhub, ...secs.map((s) => s.r), rotor.R];
  const np = [0, ...secs.map((s) => s.Np), 0];
  const tp = [0, ...secs.map((s) => s.Tp), 0];
  if (opts.endLoads === 'extrapolate') { np[0] = np[1]; tp[0] = tp[1]; np[np.length - 1] = np[np.length - 2]; tp[tp.length - 1] = tp[tp.length - 2]; }
  let T = 0, Q = 0;
  for (let i = 0; i < rs.length - 1; i++) {
    const dr = rs[i + 1] - rs[i];
    T += 0.5 * (np[i] + np[i + 1]) * dr;
    Q += 0.5 * (tp[i] * rs[i] + tp[i + 1] * rs[i + 1]) * dr;
  }
  T *= rotor.B; Q *= rotor.B;
  const A = Math.PI * rotor.R * rotor.R;
  const P = Q * omega;
  const qA = 0.5 * rho * A * U * U;
  return {
    T, Q, P,
    Cp: P / (qA * U), Ct: T / qA,
    tsr: (omega * rotor.R) / U,
    sections: secs,
    converged: secs.every((s) => s.converged),
  };
}
