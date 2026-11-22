// Diagnostics are read-only views of the solved state: check them against the solver.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../physics/index.js';
import { turbineReport, sliceTop, sliceSide, profilesAt, spanwise, interestingTurbine, compassFrom } from '../physics/diagnostics.js';

const sim = createSimulation({ scenario: 'plain', seed: 11 });

test('turbine report is consistent with momentum theory and the operating point', () => {
  for (const t of sim.farm.turbines) {
    const r = turbineReport(sim, t);
    assert.ok(Math.abs(r.cp * r.pWind - t.op.P) < 1e-6 * Math.max(1, t.op.P));
    assert.ok(r.cp < 16 / 27);
    if (r.ctWake > 0) assert.ok(Math.abs(4 * r.a * (1 - r.a) - r.ctWake) < 1e-12);
    assert.ok(Math.abs(r.thrust - t.op.Ct * 0.5 * sim.rho * Math.PI * r.R ** 2 * r.U ** 2) < 1e-6 * r.thrust + 1e-9);
    assert.ok(r.uRotor <= r.U && r.uFarIdeal <= r.uRotor);
    for (const s of r.shadowedBy) assert.ok(s.id !== t.id && s.dU > 0);
  }
});

test('wake interactions are mutual: A shadows B ⇔ B is shadowed by A', () => {
  const reps = new Map(sim.farm.turbines.map((t) => [t.id, turbineReport(sim, t)]));
  for (const [id, r] of reps) for (const s of r.shadows) assert.ok(reps.get(s.id).shadowedBy.some((q) => q.id === id) || s.dU < 0.005 * reps.get(s.id).U0);
});

test('slices sample the same field the particles use', () => {
  const top = sliceTop(sim, { nx: 20, nz: 15 }), b = top.bounds, v = [0, 0, 0];
  const i = 7, j = 4, x = b.xMin + ((i + 0.5) / 20) * (b.xMax - b.xMin), z = b.zMin + ((j + 0.5) / 15) * (b.zMax - b.zMin);
  sim.velocity(x, sim.terrain.height(x, z) + 90, z, v);
  assert.ok(Math.abs(top.speed[j * 20 + i] - Math.hypot(...v)) < 1e-4);
  assert.ok(top.speed.every((s, k) => s <= top.free[k] + 1e-4)); // wakes only slow the wind
  const t = interestingTurbine(sim), side = sliceSide(sim, t, { ns: 40, ny: 20 });
  for (let k = 0; k < side.ns * side.ny; k++) {
    const i2 = k % side.ns, yj = side.yMin + ((Math.floor(k / side.ns) + 0.5) / side.ny) * (side.yMax - side.yMin);
    assert.equal(Number.isNaN(side.speed[k]), yj <= side.ground[i2]);
  }
  assert.ok(side.nearby.some((o) => o.self && Math.abs(o.s) < 1e-9 && Math.abs(o.offset) < 1e-9));
});

test('profiles: wake deficit appears downstream only', () => {
  const t = interestingTurbine(sim), [up, ...down] = profilesAt(sim, t, [-2, 3, 7]);
  const hubPt = (p) => p.pts.reduce((a, q) => (Math.abs(q.y - t.hub[1]) < Math.abs(a.y - t.hub[1]) ? q : a));
  // upstream of the rotor only other turbines' wakes can act; downstream its own wake must show
  const own = (p) => hubPt(p).u0 - hubPt(p).u;
  for (const p of down) assert.ok(own(p) > own(up) && hubPt(p).u < hubPt(p).u0);
});

test('spanwise BEM state and compass convention', () => {
  const t = sim.farm.turbines.find((q) => q.op.region !== 'parked'), sp = spanwise(sim, t);
  assert.equal(sp.length, sim.model.rotor.sections.length);
  assert.ok(Math.abs(compassFrom([1, 0, 0]) - 270) < 1e-9); // wind blowing east comes from the west
  assert.ok(Math.abs(compassFrom([0, 0, -1]) - 180) < 1e-9); // blowing north comes from the south
});
