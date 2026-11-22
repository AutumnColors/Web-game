// Gaussian wake: momentum-deficit flux equals rotor thrust (the condition the model is derived from).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGaussianWake, wakeGrowthRate } from '../physics/wake.js';
import { MOMENTUM_LIMIT_CT } from '../physics/parameters.js';

const D = 126;

function momentumFlux(w, x, Uin = 1) {
  // ∫ U (U_in − U) dA over the cross-section (axisymmetric), relative to ½ Ct A U_in²
  const sigma = w.sigmaOverD(x) * D, rMax = 10 * sigma, N = 20000;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const r = ((i + 0.5) / N) * rMax, d = w.deficit(x, r * r) * Uin, U = Uin - d;
    s += U * d * 2 * Math.PI * r * (rMax / N);
  }
  return s / (0.5 * w.Ct * Math.PI * (D / 2) ** 2 * Uin * Uin);
}

test('momentum deficit flux equals thrust at every far-wake distance', () => {
  for (const Ct of [0.2, 0.5, 0.78, 0.9]) for (const TI of [0.07, 0.1, 0.15]) {
    const w = createGaussianWake({ D, Ct, kStar: wakeGrowthRate(TI) });
    for (const xD of [3, 4, 6, 10, 20, 40]) {
      const ratio = momentumFlux(w, xD * D);
      assert.ok(Math.abs(ratio - 1) < 1e-6, `Ct=${Ct} TI=${TI} x/D=${xD}: flux/thrust = ${ratio}`);
    }
  }
});

test('wake shape: zero upstream, linear growth k*, decaying centre deficit, frozen near wake', () => {
  const k = wakeGrowthRate(0.1), w = createGaussianWake({ D, Ct: 0.8, kStar: k });
  assert.ok(Math.abs(k - (0.3837 * 0.1 + 0.003678)) < 1e-15);
  assert.equal(w.deficit(-10, 0), 0);
  assert.ok(Math.abs((w.sigmaOverD(20 * D) - w.sigmaOverD(10 * D)) / 10 - k) < 1e-12);
  let prev = Infinity;
  for (let xD = 3; xD <= 30; xD++) { const c = w.centreDeficit(xD * D); assert.ok(c < prev && c > 0); prev = c; }
  assert.equal(w.centreDeficit(1 * D), w.centreDeficit(3 * D)); // placeholder region
  assert.ok(w.centreDeficit(3 * D) < 1, 'model valid at its start point');
  assert.equal(createGaussianWake({ D, Ct: 0, kStar: k }).deficit(5 * D, 0), 0);
});

test('thrust coefficients above the momentum-theory limit are capped and flagged', () => {
  const w = createGaussianWake({ D, Ct: 1.09, kStar: 0.04 });
  assert.ok(w.clamped && w.Ct === MOMENTUM_LIMIT_CT && Number.isFinite(w.centreDeficit(5 * D)));
});
