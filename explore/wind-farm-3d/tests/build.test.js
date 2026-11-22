// Hand-built layouts: empty map, placing, moving, removing — the physics must stay consistent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, LAYOUT_RULES } from '../physics/index.js';
import { turbineReport } from '../physics/diagnostics.js';

test('empty map: no turbines, no power, the wind is the ambient wind everywhere', () => {
  const sim = createSimulation({ scenario: 'plain', seed: 4, layout: [] }), v = [0, 0, 0], w = [0, 0, 0];
  assert.equal(sim.farm.turbines.length, 0);
  assert.equal(sim.summary.power, 0);
  assert.equal(sim.summary.wakeLoss, 0);
  sim.velocity(100, 120, 50, v); sim.ambient(100, 120, 50, w);
  assert.deepEqual(v, w);
});

test('same seed ⇒ same site and wind in random and build mode; random positions rebuilt by hand give the same power', () => {
  const rnd = createSimulation({ scenario: 'mountain', seed: 9 });
  const built = createSimulation({ scenario: 'mountain', seed: 9, layout: rnd.positions() });
  assert.equal(built.atmosphere.state.uRef, rnd.atmosphere.state.uRef);
  assert.equal(built.terrain.height(123, -45), rnd.terrain.height(123, -45));
  assert.ok(Math.abs(built.summary.power - rnd.summary.power) < 1e-6);
});

test('placing a turbine directly downstream lowers its power; moving it sideways restores it', () => {
  const sim = createSimulation({ scenario: 'plain', seed: 4, layout: [{ x: -1000, z: 0 }] });
  const n = sim.farm.turbines[0].basis.n, D = sim.model.D;
  const alone = sim.farm.turbines[0].op.Pel;
  const behind = { x: -1000 + 6 * D * n[0], z: 6 * D * n[2] };
  assert.ok(sim.canPlace(behind.x, behind.z).ok);
  sim.setLayout([...sim.positions(), behind]);
  const t2 = sim.farm.turbines.find((t) => t.id === 2), r2 = turbineReport(sim, t2);
  assert.ok(t2.op.Pel < sim.farm.turbines[0].op.Pel && r2.shadowedBy[0].id === 1 && Math.abs(r2.shadowedBy[0].xD - 6) < 0.2);
  assert.ok(sim.summary.wakeLoss > 0);
  assert.ok(Math.abs(sim.farm.turbines[0].op.Pel - alone) < 1e-6, 'upstream turbine unaffected');
  sim.setLayout([sim.positions()[0], { id: 2, x: behind.x - 6 * D * n[2], z: behind.z + 6 * D * n[0] }]);
  assert.equal(sim.farm.turbines[1].id, 2, 'ids survive moves');
  assert.ok(sim.summary.wakeLoss < 0.005);
});

test('near-wake placement is flagged; placement rules reject overlaps, edges and steep slopes', () => {
  const sim = createSimulation({ scenario: 'plain', seed: 4, layout: [{ x: 0, z: 0 }] });
  const n = sim.farm.turbines[0].basis.n, D = sim.model.D;
  assert.equal(sim.canPlace(0.5 * D, 0).ok, false);              // rotors would touch
  assert.equal(sim.canPlace(sim.terrain.bounds.xMax - 10, 0).ok, false); // edge
  sim.setLayout([...sim.positions(), { x: 2 * D * n[0], z: 2 * D * n[2] }]);
  assert.deepEqual(turbineReport(sim, sim.farm.turbines[1]).inNearWakeOf, [1]);
  const mtn = createSimulation({ scenario: 'mountain', seed: 3, layout: [] });
  let rejectedSlope = false;
  for (let x = -1500; x <= 1500 && !rejectedSlope; x += 25) for (let z = -1100; z <= 1100; z += 25) {
    const r = mtn.canPlace(x, z);
    if (!r.ok && /slope/.test(r.reason)) { rejectedSlope = true; break; }
  }
  assert.ok(rejectedSlope || mtn.terrain.hill.A / mtn.terrain.hill.sigma < 0.3, 'steep mountain slopes are refused');
  const many = createSimulation({ scenario: 'plain', seed: 4, layout: [] });
  const pts = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) pts.push({ x: -1600 + i * 400, z: -1100 + j * 400 });
  many.setLayout(pts.slice(0, LAYOUT_RULES.maxTurbines));
  assert.equal(many.canPlace(1700, 1200).ok, false);
});
