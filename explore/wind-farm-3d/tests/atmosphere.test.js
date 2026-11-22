// Ambient flow: log law, exact mass conservation, terrain streamlines, variability statistics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../physics/terrain.js';
import { createAtmosphere, turbulenceIntensity } from '../physics/atmosphere.js';
import { createRng } from '../physics/random.js';

function atm(kind, seed = 3, extra = {}) {
  const rng = createRng(seed);
  const terrain = createTerrain(kind, rng);
  return { terrain, a: createAtmosphere({ terrain, z0: 0.03, uRef: 10, zRef: 90, direction: 0.3, rng, ...extra }) };
}

test('flat terrain: logarithmic profile, horizontal flow, U(z_ref) = U_ref', () => {
  const { a } = atm('flat'), v = [0, 0, 0];
  a.velocity(100, 90, -50, v);
  assert.ok(Math.abs(Math.hypot(v[0], v[2]) - 10) < 1e-12 && v[1] === 0);
  assert.ok(Math.abs(Math.atan2(v[2], v[0]) - 0.3) < 1e-12);
  let prev = 0;
  for (const z of [0.5, 2, 10, 40, 90, 150, 300]) {
    a.velocity(0, z, 0, v);
    const U = Math.hypot(v[0], v[2]), expect = (10 * Math.log(z / 0.03)) / Math.log(90 / 0.03);
    assert.ok(Math.abs(U - expect) < 1e-12 && U > prev);
    prev = U;
  }
  a.velocity(0, 0.01, 0, v); assert.equal(Math.hypot(...v), 0); // below z0
});

// Central differences with one Richardson step (error O(h⁴)), so truncation error cannot hide
// or fake a divergence.
function gradients(f, x, y, z, h) {
  const g1 = gradients2(f, x, y, z, h), g2 = gradients2(f, x, y, z, h / 2);
  return g1.map((row, j) => row.map((v, i) => (4 * g2[j][i] - v) / 3));
}
function gradients2(f, x, y, z, h) {
  const g = [];
  for (const d of [[h, 0, 0], [0, h, 0], [0, 0, h]]) {
    const p = f(x + d[0], y + d[1], z + d[2]), m = f(x - d[0], y - d[1], z - d[2]);
    g.push(p.map((pi, i) => (pi - m[i]) / (2 * h)));
  }
  return g; // g[j][i] = ∂v_i/∂x_j
}

for (const kind of ['mountain', 'coast', 'plain']) {
  test(`${kind}: ∇·v = 0 to finite-difference accuracy and v is tangent to the η-surfaces`, () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { terrain, a } = atm(kind, seed), rng = createRng(100 + seed);
      const vel = (x, y, z) => a.velocity(x, y, z, [0, 0, 0]);
      let worst = 0, worstT = 0;
      for (let i = 0; i < 300; i++) {
        const x = rng.range(-1800, 1800), z = rng.range(-1300, 1300), y = terrain.height(x, z) + rng.range(5, 500);
        const g = gradients(vel, x, y, z, 0.1);
        const div = g[0][0] + g[1][1] + g[2][2];
        const scale = Math.max(...g.flat().map(Math.abs));
        worst = Math.max(worst, Math.abs(div) / scale);
        const e = gradients((X, Y, Z) => [a.eta(X, Y, Z)], x, y, z, 0.05);
        const v = vel(x, y, z), gn = [e[0][0], e[1][0], e[2][0]];
        worstT = Math.max(worstT, Math.abs(v[0] * gn[0] + v[1] * gn[1] + v[2] * gn[2]) / (Math.hypot(...v) * Math.hypot(...gn)));
      }
      assert.ok(worst < 1e-8, `relative divergence ${worst}`);
      assert.ok(worstT < 1e-7, `v·∇η / |v||∇η| = ${worstT}`);
    }
  });
}

test('mountain: flow is nearly tangent to the ground 1 m above it, zero at the surface', () => {
  const { terrain, a } = atm('mountain', 5), rng = createRng(9), h3 = [0, 0, 0], v = [0, 0, 0];
  let worst = 0;
  for (let i = 0; i < 500; i++) {
    const x = rng.range(-1800, 1800), z = rng.range(-1300, 1300);
    terrain.sample(x, z, h3);
    const nrm = [-h3[1], 1, -h3[2]], nn = Math.hypot(...nrm);
    a.velocity(x, h3[0] + 1, z, v);
    worst = Math.max(worst, Math.abs(v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2]) / (nn * Math.hypot(...v)));
    a.velocity(x, h3[0], z, v); assert.equal(Math.hypot(...v), 0);
  }
  assert.ok(worst < 0.01, `normal/total at 1 m: ${worst}`);
});

test('mountain: speed-up over the hill top is positive and modest (reported, not validated)', () => {
  const { terrain, a } = atm('mountain', 5), { A, sigma, x0, z0 } = terrain.hill, v = [0, 0, 0];
  a.velocity(x0, terrain.height(x0, z0) + 80, z0, v); const top = Math.hypot(...v);
  const flat = createAtmosphere({ terrain: createTerrain('flat'), z0: 0.03, uRef: 10, zRef: 90, direction: 0.3 });
  flat.velocity(0, 80, 0, v); const ref = Math.hypot(...v);
  const ratio = top / ref - 1;
  console.log(`  hill H=${A.toFixed(0)} m, L=σ=${sigma.toFixed(0)} m: fractional speed-up at 80 m = ${ratio.toFixed(3)} (H/L = ${(A / sigma).toFixed(3)})`);
  assert.ok(ratio > 0 && ratio < 2 * A / sigma);
});

test('stream coordinate is monotonic in height for all generated terrains (no folded streamlines)', () => {
  for (const kind of ['mountain', 'coast', 'plain']) for (let seed = 1; seed < 40; seed++) {
    const { terrain } = atm(kind, seed), L = terrain.decayLength, b = terrain.bounds;
    for (let x = b.xMin; x <= b.xMax; x += 100) for (let z = b.zMin; z <= b.zMax; z += 100) assert.ok(terrain.height(x, z) > -L);
  }
});

test('turbulence intensity from roughness and the variable-wind statistics', () => {
  assert.ok(Math.abs(turbulenceIntensity(90, 0.03) - 1.025 / Math.log(3000)) < 1e-12);
  const { a } = atm('plain', 11, { variable: true });
  let s = 0, s2 = 0, n = 0;
  for (let t = 0; t < 200000; t += 1.3) { a.setTime(t); s += a.state.uRef; s2 += a.state.uRef ** 2; n++; }
  const mean = s / n, std = Math.sqrt(s2 / n - mean * mean);
  assert.ok(Math.abs(mean - 10) < 0.05 && Math.abs(std / (a.turbulenceIntensity * 10) - 1) < 0.05, `mean ${mean} std ${std}`);
});
