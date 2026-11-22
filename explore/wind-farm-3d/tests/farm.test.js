// Turbine–wake coupling and farm energy bookkeeping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../physics/terrain.js';
import { createAtmosphere } from '../physics/atmosphere.js';
import { createFarm } from '../physics/farm.js';
import { createSimulation, SCENARIOS, turbineModel } from '../physics/index.js';

const model = turbineModel(), D = model.D;
function flatFarm(positions, uRef = 9, superposition) {
  const terrain = createTerrain('flat');
  const atmosphere = createAtmosphere({ terrain, z0: 0.03, uRef, zRef: 90, direction: 0 });
  const farm = createFarm({ terrain, atmosphere, model, superposition, layout: positions.map(([x, z], i) => ({ id: i + 1, x, z, base: 0 })) });
  return { farm, summary: farm.solve(0) };
}

test('single turbine: power is the power curve at its disk-averaged inflow', () => {
  const { farm, summary } = flatFarm([[0, 0]]), t = farm.turbines[0];
  assert.ok(Math.abs(t.op.Pel - model.operatingPoint(t.inflow).Pel) < 1e-6);
  assert.equal(summary.wakeLoss, 0);
  // sheared inflow: disk average is a little below hub-height speed for a log profile
  assert.ok(t.inflow < 9 && t.inflow > 8.5, `inflow ${t.inflow}`);
});

test('aligned pair: downstream turbine loses power, recovering with spacing; side-by-side pair does not', () => {
  const losses = [5, 7, 10, 15].map((s) => {
    const { farm } = flatFarm([[0, 0], [s * D, 0]]);
    return 1 - farm.turbines[1].op.Pel / farm.turbines[0].op.Pel;
  });
  console.log('  downstream power loss at 5/7/10/15 D: ' + losses.map((l) => (100 * l).toFixed(1) + '%').join(', '));
  for (let i = 1; i < losses.length; i++) assert.ok(losses[i] < losses[i - 1] && losses[i] > 0);
  const side = flatFarm([[0, 0], [0, 10 * D]]).farm.turbines;
  assert.ok(Math.abs(side[0].op.Pel - side[1].op.Pel) < 1e-6);
});

test('the downstream inflow equals the disk average of the upstream wake model', () => {
  const { farm } = flatFarm([[0, 0], [7 * D, 0]]), [a, b] = farm.turbines;
  // reconstruct independently: ambient disk average minus a's deficit averaged over b's disk
  assert.ok(b.inflow < b.freeInflow);
  const expected = b.freeInflow - avgDeficit(farm, a, b);
  assert.ok(Math.abs(b.inflow - expected) < 1e-9, `${b.inflow} vs ${expected}`);
});
function avgDeficit(farm, src, dst) {
  let s = 0, n = 0;
  for (let j = 0; j < 4; j++) for (let k = 0; k < 8; k++) {
    const rho = Math.sqrt((j + 0.5) / 4), beta = ((k + 0.5 * (j % 2)) / 8) * 2 * Math.PI, R = model.rotor.R;
    const y = dst.hub[1] + rho * R * Math.cos(beta), z = dst.hub[2] + rho * R * Math.sin(beta) * dst.basis.right[2];
    const xd = dst.hub[0] - src.hub[0], r2 = (y - src.hub[1]) ** 2 + (z - src.hub[2]) ** 2;
    s += src.wake.deficit(xd, r2) * src.inflow; n++;
  }
  return s / n;
}

test('quadratic superposition gives less deficit than linear; both reduce to one wake', () => {
  const pos = [[0, 0], [6 * D, 0.2 * D], [12 * D, 0]];
  const q = flatFarm(pos, 9, 'quadratic').farm.turbines[2].inflow, l = flatFarm(pos, 9, 'linear').farm.turbines[2].inflow;
  assert.ok(l < q);
  const one = [[0, 0], [7 * D, 0]];
  assert.ok(Math.abs(flatFarm(one, 9, 'quadratic').farm.turbines[1].inflow - flatFarm(one, 9, 'linear').farm.turbines[1].inflow) < 1e-12);
});

test('every scenario: converged, deterministic, farm power ≤ wake-free power', () => {
  for (const scenario of Object.keys(SCENARIOS)) for (let seed = 1; seed <= 10; seed++) {
    const a = createSimulation({ scenario, seed }), b = createSimulation({ scenario, seed });
    assert.ok(a.summary.converged, `${scenario} ${seed}`);
    assert.equal(a.summary.power, b.summary.power);
    assert.ok(a.summary.power <= a.summary.freePower + 1e-6);
    assert.equal(a.farm.turbines.length, 12);
    for (const t of a.farm.turbines) for (const u of a.farm.turbines) if (t !== u) assert.ok(Math.hypot(t.x - u.x, t.z - u.z) >= 4 * D);
  }
});
