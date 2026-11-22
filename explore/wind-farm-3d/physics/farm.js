// Wind farm: layout, turbine–wake coupling and the combined velocity field.
//
// Coupling (engineering wake model, quasi-steady):
//   1. each turbine yaws to the ambient hub-height wind (perfect yaw control)
//   2. its inflow U_i = disk average of the axial velocity: ambient minus the wakes of all
//      turbines upstream of the sample point
//   3. U_i → operating point (BEM table) → Ct_i → Gaussian wake with U_in = U_i
//   4. repeat (Gauss–Seidel) until the inflows stop changing
// Wake superposition: 'quadratic' (default, Katić et al. 1986: ΔU = √Σ ΔU_i²) or 'linear'
// (ΔU = Σ ΔU_i). Both are empirical rules, neither follows from first principles.
// Power from the disk-averaged speed: P_i = P(U_i). Shear across the disk enters only
// through that average.

import { createGaussianWake, wakeGrowthRate } from './wake.js';
import { rotorBasis, hubCenter, bladeDirection, dot } from './geometry.js';
import { ROTOR_SAMPLES } from './parameters.js';

// accept(x, z) is an optional site rule (e.g. tip clearance), see index.js.
export function placeTurbines({ terrain, rng, count, minSpacing, margin, accept = () => true }) {
  const b = terrain.bounds, out = [];
  let guard = 0;
  while (out.length < count && guard++ < 20000) {
    const x = rng.range(b.xMin + margin, b.xMax - margin), z = rng.range(b.zMin + margin, b.zMax - margin);
    if (out.some((p) => Math.hypot(x - p.x, z - p.z) < minSpacing) || !accept(x, z)) continue;
    out.push({ id: out.length + 1, x, z, base: terrain.height(x, z) });
  }
  return out;
}

// Equal-area points on the unit disk (ρ, β), centre ring excluded at ρ = 0.
function diskSamples() {
  const pts = [];
  const { rings, perRing } = ROTOR_SAMPLES;
  for (let j = 0; j < rings; j++) {
    const rho = Math.sqrt((j + 0.5) / rings);
    for (let k = 0; k < perRing; k++) pts.push([rho, ((k + 0.5 * (j % 2)) / perRing) * 2 * Math.PI]);
  }
  return pts;
}
const DISK = diskSamples();

export function createFarm({ terrain, atmosphere, model, layout, superposition = 'quadratic' }) {
  const D = model.D, R = model.rotor.R, def = model.def;
  const kStar = wakeGrowthRate(atmosphere.turbulenceIntensity);
  const v = [0, 0, 0];
  const turbines = layout.map((p) => ({
    ...p, basis: null, hub: null, inflow: 0, freeInflow: 0, op: null, freeOp: null, wake: null,
  }));

  function wakeDeficitAt(x, y, z, skip) {
    let lin = 0, sq = 0;
    for (const t of turbines) {
      if (t === skip || !t.wake) continue;
      const dx = x - t.hub[0], dy = y - t.hub[1], dz = z - t.hub[2];
      const xd = dx * t.basis.n[0] + dz * t.basis.n[2];
      if (xd <= 0) continue;
      const r2 = dx * dx + dy * dy + dz * dz - xd * xd;
      const d = t.wake.deficit(xd, r2) * t.inflow;
      lin += d; sq += d * d;
    }
    return superposition === 'linear' ? lin : Math.sqrt(sq);
  }

  function diskAverage(t, withWakes) {
    let s = 0;
    for (const [rho, beta] of DISK) {
      const dir = bladeDirection(t.basis, beta);
      const px = t.hub[0] + rho * R * dir[0], py = t.hub[1] + rho * R * dir[1], pz = t.hub[2] + rho * R * dir[2];
      atmosphere.velocity(px, py, pz, v);
      let ax = dot(v, t.basis.n);
      if (withWakes) ax -= wakeDeficitAt(px, py, pz, t);
      s += Math.max(0, ax);
    }
    return s / DISK.length;
  }

  function solve(time = 0) {
    atmosphere.setTime(time);
    for (const t of turbines) {
      atmosphere.velocity(t.x, t.base + def.hubHeight, t.z, v);
      t.basis = rotorBasis(v[0], v[2]);
      t.hub = hubCenter([t.x, t.base, t.z], def.hubHeight, def.overhang, t.basis);
      t.wake = null;
      t.freeInflow = diskAverage(t, false);
      t.freeOp = model.operatingPoint(t.freeInflow);
      t.inflow = t.freeInflow;
    }
    // upstream first along the mean wind direction
    const c = atmosphere.state.cos, s = atmosphere.state.sin;
    const order = [...turbines].sort((a, b) => (a.x * c + a.z * s) - (b.x * c + b.z * s));
    let iterations = 0, change = Infinity;
    while (change > 1e-6 && iterations < 20) {
      change = 0;
      for (const t of order) {
        const U = diskAverage(t, true);
        change = Math.max(change, Math.abs(U - t.inflow));
        t.inflow = U;
        t.op = model.operatingPoint(U);
        t.wake = createGaussianWake({ D, Ct: t.op.Ct, kStar });
      }
      iterations++;
    }
    const P = turbines.reduce((a, t) => a + t.op.Pel, 0);
    const Pfree = turbines.reduce((a, t) => a + t.freeOp.Pel, 0);
    return { power: P, freePower: Pfree, wakeLoss: Pfree > 0 ? 1 - P / Pfree : 0, iterations, converged: change <= 1e-6 };
  }

  // Combined field: ambient velocity with the wake deficit removed along the local flow direction.
  // If `out` has a 4th slot it receives speed / turbine-free speed at that point (1 = no wake).
  function velocity(x, y, z, out) {
    atmosphere.velocity(x, y, z, out);
    let f = 1;
    const sp = Math.hypot(out[0], out[1], out[2]);
    if (sp > 0) {
      const d = wakeDeficitAt(x, y, z, null);
      if (d > 0) { f = Math.max(0, sp - d) / sp; out[0] *= f; out[1] *= f; out[2] *= f; }
    }
    if (out.length > 3) out[3] = f;
    return out;
  }

  return { turbines, kStar, superposition, solve, velocity, wakeDeficitAt, ambient: atmosphere.velocity };
}
