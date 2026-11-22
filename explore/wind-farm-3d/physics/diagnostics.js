// Read-only diagnostics of a solved simulation, for teaching and inspection.
// Nothing here changes the physics state; everything is derived from the solved farm.

import { evaluateRotor } from './bem.js';
import { dot } from './geometry.js';

const KEY_DISTANCES_D = [3, 7, 12];
const INFLUENCE_THRESHOLD = 0.005; // report wake interactions above 0.5 % of the inflow speed

// Everything the panel shows about one turbine.
export function turbineReport(sim, t) {
  const m = sim.model, R = m.rotor.R, D = m.D, A = Math.PI * R * R, rho = sim.rho;
  const U = t.inflow, U0 = t.freeInflow, op = t.op;
  const pWind = 0.5 * rho * A * U ** 3;                // kinetic-energy flux through the rotor disk
  const cp = pWind > 0 ? op.P / pWind : 0;             // aerodynamic power / available power
  const thrust = op.Ct * 0.5 * rho * A * U * U;
  const ctW = t.wake ? t.wake.Ct : 0;
  // actuator-disk induction that gives this thrust: Ct = 4a(1 − a), momentum branch a ≤ 0.5
  const a = ctW > 0 ? (1 - Math.sqrt(1 - Math.min(ctW, 1))) / 2 : 0;

  // shear: axial speed at the top and bottom blade tips (wakes included)
  const v = [0, 0, 0];
  sim.velocity(t.hub[0], t.hub[1] + R, t.hub[2], v); const uTop = dot(v, t.basis.n);
  sim.velocity(t.hub[0], t.hub[1] - R, t.hub[2], v); const uBottom = dot(v, t.basis.n);

  const others = sim.farm.turbines.filter((o) => o !== t);
  const deficitFrom = (src, p) => sim.farm.wakeOf(src, p[0], p[1], p[2]);
  // xD: how far downstream of the source (along its axis), in rotor diameters
  const downstreamD = (src, p) => ((p[0] - src.hub[0]) * src.basis.n[0] + (p[2] - src.hub[2]) * src.basis.n[2]) / D;
  const shadowedBy = others.map((o) => ({ id: o.id, dU: deficitFrom(o, t.hub), dist: Math.hypot(t.x - o.x, t.z - o.z) / D, xD: downstreamD(o, t.hub) }))
    .filter((s) => s.dU > INFLUENCE_THRESHOLD * U0).sort((p, q) => q.dU - p.dU);
  // the Gaussian wake model is a placeholder closer than 3 D (see parameters.js, nearWakeEnd)
  const inNearWakeOf = shadowedBy.filter((s) => s.xD < 3).map((s) => s.id);
  const shadows = others.map((o) => ({ id: o.id, dU: deficitFrom(t, o.hub), dist: Math.hypot(t.x - o.x, t.z - o.z) / D }))
    .filter((s) => s.dU > INFLUENCE_THRESHOLD * freeInflowOf(others, s.id))
    .sort((p, q) => q.dU - p.dU);

  const stations = KEY_DISTANCES_D.map((xD) => {
    if (!t.wake) return { xD, centre: U, deficit: 0, width: 0 };
    const c = t.wake.centreDeficit(xD * D);
    return { xD, centre: U * (1 - c), deficit: c, width: 4 * t.wake.sigmaOverD(xD * D) * D, nearWake: xD < t.wake.xNear / D };
  });

  return {
    id: t.id, U, U0, wakeReduction: U0 > 0 ? 1 - U / U0 : 0, uTop, uBottom,
    TI: sim.atmosphere.turbulenceIntensity, kStar: sim.farm.kStar,
    rpm: (op.omega * 60) / (2 * Math.PI), tipSpeed: op.omega * R, tsr: op.tsr ?? 0,
    pitchDeg: (op.pitch * 180) / Math.PI, region: op.region,
    yawFromDeg: compassFrom(t.basis.n),
    pWind, cp, pAero: op.P, pElec: op.Pel, efficiency: m.def.efficiency,
    ct: op.Ct, ctWake: ctW, ctClamped: !!(t.wake && t.wake.clamped), thrust, a,
    uRotor: U * (1 - a), uFarIdeal: U * (1 - 2 * a),
    stations, shadowedBy, shadows, inNearWakeOf, D, R, hubHeight: m.def.hubHeight,
  };
}
function freeInflowOf(list, id) { return list.find((o) => o.id === id).freeInflow; }

// compass direction the wind comes FROM, for axis n (x = east, z = south)
export function compassFrom(n) {
  const b = (Math.atan2(-n[0], n[2]) * 180) / Math.PI;
  return (b + 360) % 360;
}

// Blade-element state along the span at the turbine's current operating point.
export function spanwise(sim, t) {
  const op = t.op;
  if (!op || op.region === 'parked') return null;
  const res = evaluateRotor(sim.model.rotor, t.inflow, op.omega, op.pitch);
  return res.sections.map((s, i) => ({
    r: s.r, alphaDeg: (s.alpha * 180) / Math.PI, a: s.a, ap: s.ap, cl: s.cl, cd: s.cd,
    loadN: s.Np, airfoil: sim.model.rotor.sections[i].airfoil,
  }));
}

// Horizontal slice at a fixed height above the local ground (terrain-following).
export function sliceTop(sim, { nx = 160, nz = 120, heightAboveGround } = {}) {
  const b = sim.terrain.bounds, h = heightAboveGround ?? sim.model.def.hubHeight;
  const speed = new Float32Array(nx * nz), free = new Float32Array(nx * nz), v = [0, 0, 0];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = b.xMin + ((i + 0.5) / nx) * (b.xMax - b.xMin), z = b.zMin + ((j + 0.5) / nz) * (b.zMax - b.zMin);
    const y = sim.terrain.height(x, z) + h;
    sim.velocity(x, y, z, v); speed[j * nx + i] = Math.hypot(v[0], v[1], v[2]);
    sim.ambient(x, y, z, v); free[j * nx + i] = Math.hypot(v[0], v[1], v[2]);
  }
  return { nx, nz, bounds: b, height: h, speed, free };
}

// Vertical slice through a turbine's hub, along its rotor axis (the mean flow direction).
// s: distance along the axis from the hub [m]; y: absolute height [m].
export function sliceSide(sim, t, { ns = 220, ny = 90, upD = 4, downD = 18, above = 320 } = {}) {
  const D = sim.model.D, n = t.basis.n, sMin = -upD * D, sMax = downD * D;
  const ground = new Float32Array(ns);
  for (let i = 0; i < ns; i++) {
    const s = sMin + ((i + 0.5) / ns) * (sMax - sMin);
    ground[i] = sim.terrain.height(t.hub[0] + s * n[0], t.hub[2] + s * n[2]);
  }
  let gMin = Infinity, gMax = -Infinity;
  for (const g of ground) { gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
  const yMin = gMin - 5, yMax = Math.max(gMax, t.hub[1]) + above - 90;
  const us = new Float32Array(ns * ny), uy = new Float32Array(ns * ny), speed = new Float32Array(ns * ny), free = new Float32Array(ns * ny);
  const v = [0, 0, 0];
  for (let j = 0; j < ny; j++) for (let i = 0; i < ns; i++) {
    const s = sMin + ((i + 0.5) / ns) * (sMax - sMin), y = yMin + ((j + 0.5) / ny) * (yMax - yMin), k = j * ns + i;
    if (y <= ground[i]) { us[k] = uy[k] = speed[k] = free[k] = NaN; continue; }
    const x = t.hub[0] + s * n[0], z = t.hub[2] + s * n[2];
    sim.velocity(x, y, z, v);
    us[k] = v[0] * n[0] + v[2] * n[2]; uy[k] = v[1]; speed[k] = Math.hypot(v[0], v[1], v[2]);
    sim.ambient(x, y, z, v); free[k] = Math.hypot(v[0], v[1], v[2]);
  }
  // other turbines whose rotor crosses (or nearly crosses) this plane
  const R = sim.model.rotor.R, right = t.basis.right;
  const nearby = sim.farm.turbines.map((o) => {
    const dx = o.hub[0] - t.hub[0], dz = o.hub[2] - t.hub[2];
    return { id: o.id, s: dx * n[0] + dz * n[2], offset: dx * right[0] + dz * right[2], hubY: o.hub[1], baseY: o.base, self: o === t };
  }).filter((o) => o.self || (Math.abs(o.offset) < 1.5 * R && o.s > sMin && o.s < sMax));
  return { ns, ny, sMin, sMax, yMin, yMax, ground, us, uy, speed, free, nearby, D, R };
}

// Velocity profiles u(y) along the axis at chosen stations (with wakes and turbine-free).
export function profilesAt(sim, t, stationsD = [-2, 3, 7, 12], { above = 260, n = 60 } = {}) {
  const D = sim.model.D, nAx = t.basis.n, v = [0, 0, 0];
  return stationsD.map((sd) => {
    const s = sd * D, x = t.hub[0] + s * nAx[0], z = t.hub[2] + s * nAx[2], g = sim.terrain.height(x, z);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const y = g + 1 + (k / n) * above;
      sim.velocity(x, y, z, v); const u = v[0] * nAx[0] + v[2] * nAx[2];
      sim.ambient(x, y, z, v); const u0 = v[0] * nAx[0] + v[2] * nAx[2];
      pts.push({ y, u, u0 });
    }
    return { sD: sd, ground: g, pts };
  });
}

// Default turbine to show: the one whose wake reaches the most other turbines (ties: most upstream).
export function interestingTurbine(sim) {
  let best = null, bestScore = -1;
  const c = sim.atmosphere.state.cos, s = sim.atmosphere.state.sin;
  for (const t of sim.farm.turbines) {
    const r = turbineReport(sim, t);
    const score = r.shadows.length * 1000 - (t.x * c + t.z * s) / 1000;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}
