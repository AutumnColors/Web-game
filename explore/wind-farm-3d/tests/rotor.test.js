// Rotor aerodynamics: momentum theory limits, BEM against Glauert's optimum rotor,
// internal consistency of the BEM solution, and a plausibility comparison with the
// published NREL 5-MW results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actuatorDisk, evaluateRotor, solveSection, brent } from '../physics/bem.js';
import { idealPolar } from '../physics/airfoil.js';
import { createTurbineModel } from '../physics/turbine.js';
import { AIR_DENSITY, NREL5MW_PUBLISHED, BUHL_TRANSITION_K } from '../physics/parameters.js';

const model = createTurbineModel();
const BETZ = 16 / 27;

test('actuator disk: Betz limit Cp = 16/27 and Ct = 8/9 at a = 1/3', () => {
  const r = actuatorDisk(1 / 3);
  assert.ok(Math.abs(r.Cp - BETZ) < 1e-15);
  assert.ok(Math.abs(r.Ct - 8 / 9) < 1e-15);
  for (let a = 0; a <= 0.5; a += 0.01) assert.ok(actuatorDisk(a).Cp <= BETZ + 1e-15);
});

// Glauert's optimum rotor with wake rotation, no drag, no tip loss.
// Local optimum: λr² = (1−a)(4a−1)²/(1−3a), a' = (1−3a)/(4a−1), dCp = (8/λ²) a'(1−a) λr³ dλr.
function glauertA(lr) {
  return brent((a) => (1 - a) * (4 * a - 1) ** 2 / (1 - 3 * a) - lr * lr, 0.25 + 1e-12, 1 / 3 - 1e-12, 1e-15);
}
function glauertCp(lambda, lh = 0) {
  const N = 4000; let s = 0; // Simpson
  for (let i = 0; i <= N; i++) {
    const lr = lh + ((lambda - lh) * i) / N, a = glauertA(Math.max(lr, 1e-9)), ap = (1 - 3 * a) / (4 * a - 1);
    const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
    s += w * ap * (1 - a) * lr ** 3;
  }
  return (8 / lambda ** 2) * s * ((lambda - lh) / N) / 3;
}
function glauertRotor(lambda, n = 600) {
  const R = 1, Rhub = 1e-3, B = 3, alphaD = 6 * Math.PI / 180, pol = idealPolar(), Cl = 2 * Math.PI * alphaD;
  const sections = [];
  for (let i = 0; i < n; i++) {
    const r = Rhub + ((i + 0.5) / n) * (R - Rhub), lr = (lambda * r) / R;
    const phi = (2 / 3) * Math.atan(1 / lr);
    sections.push({ r, chord: (8 * Math.PI * r * (1 - Math.cos(phi))) / (B * Cl), twist: phi - alphaD, polar: pol });
  }
  return { B, R, Rhub, sections };
}

test('BEM reproduces Glauert optimum-rotor Cp(λ) (no drag, no losses)', () => {
  // classical table (Manwell et al., Wind Energy Explained, Table 3.2), 3 decimals
  const table = { 1: 0.416, 2: 0.512, 5: 0.570, 7.5: 0.581, 10: 0.585 };
  for (const [l, ref] of Object.entries(table)) {
    const lambda = +l, rotor = glauertRotor(lambda), U = 10;
    const res = evaluateRotor(rotor, U, (lambda * U) / rotor.R, 0, { tipLoss: false, hubLoss: false, endLoads: 'extrapolate' });
    const g = glauertCp(lambda, (lambda * rotor.Rhub) / rotor.R);
    assert.ok(Math.abs(res.Cp - g) / g < 2e-3, `λ=${lambda}: BEM ${res.Cp} vs Glauert ${g}`);
    assert.ok(Math.abs(g - ref) < 1.5e-3, `λ=${lambda}: Glauert integral ${g} vs table ${ref}`);
    // and section-by-section the induction is Glauert's
    for (const s of res.sections.filter((_, i) => i % 97 === 50)) {
      const a = glauertA((lambda * s.r) / rotor.R);
      assert.ok(Math.abs(s.a - a) < 1e-6, `a at r=${s.r}: ${s.a} vs ${a}`);
    }
  }
});

test('BEM solution satisfies blade-element = momentum balance in every momentum-region annulus', () => {
  const U = 8, op = model.operatingPoint(U);
  const res = evaluateRotor(model.rotor, U, op.omega, op.pitch);
  let checked = 0;
  for (const s of res.sections) {
    assert.ok(s.converged);
    if (s.k > BUHL_TRANSITION_K || s.region !== 'momentum') continue;
    const dTblade = model.rotor.B * s.Np;
    const dTmom = 4 * Math.PI * s.r * AIR_DENSITY * U * U * s.a * (1 - s.a) * s.F;
    const dQblade = model.rotor.B * s.Tp * s.r;
    const dQmom = 4 * Math.PI * s.r ** 3 * AIR_DENSITY * U * op.omega * s.ap * (1 - s.a) * s.F;
    assert.ok(Math.abs(dTblade - dTmom) <= 1e-8 * Math.abs(dTmom) + 1e-9, `thrust r=${s.r}`);
    assert.ok(Math.abs(dQblade - dQmom) <= 1e-8 * Math.abs(dQmom) + 1e-9, `torque r=${s.r}`);
    checked++;
  }
  assert.ok(checked >= 10, 'enough sections in momentum region: ' + checked);
});

test('Cp never exceeds the Betz limit for random rotors, pitches and tip-speed ratios', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const cs = 0.3 + 2.5 * rnd(), tw = (rnd() - 0.5) * 0.3, pitch = (rnd() - 0.3) * 0.5, tsr = 1 + 15 * rnd();
    const rotor = { ...model.rotor, sections: model.rotor.sections.map((s) => ({ ...s, chord: s.chord * cs, twist: s.twist + tw })) };
    const res = evaluateRotor(rotor, 9, (tsr * 9) / rotor.R, pitch);
    assert.ok(res.Cp < BETZ, `Cp=${res.Cp} chord×${cs} tsr=${tsr}`);
  }
  // ideal airfoil, no drag, no losses: still below Betz
  for (const l of [2, 6, 12]) {
    const rotor = glauertRotor(l, 200);
    for (const p of [-0.05, 0, 0.05]) assert.ok(evaluateRotor(rotor, 10, (l * 10) / rotor.R, p, { tipLoss: false, hubLoss: false }).Cp < BETZ);
  }
});

test('Buhl high-thrust correction is continuous with momentum theory at the transition', () => {
  // F = 1: momentum a = k/(1+k); at k = 2/3 → a = 0.4. Evaluate both branches there.
  const k = BUHL_TRANSITION_K, F = 1, aMom = k / (1 + k);
  const g1 = 2 * F * k - (10 / 9 - F), g2 = 2 * F * k - F * (4 / 3 - F), g3 = 2 * F * k - (25 / 9 - 2 * F);
  const aBuhl = (g1 - Math.sqrt(g2)) / g3;
  assert.ok(Math.abs(aMom - 0.4) < 1e-12 && Math.abs(aBuhl - aMom) < 1e-12);
});

test('every operating point of the power curve converged', () => {
  assert.ok(model.table.every((t) => t.region === 'parked' || t.converged));
  const p = model.table.filter((t) => t.region === '3');
  assert.ok(p.every((t) => Math.abs(t.Pel - model.def.ratedPower) / model.def.ratedPower < 1e-6), 'rated power held in region 3');
  for (let i = 1; i < p.length; i++) assert.ok(p[i].pitch >= p[i - 1].pitch - 1e-9, 'pitch increases with wind in region 3');
});

test('plausibility vs published NREL 5-MW results (approximate polars → loose bounds)', () => {
  const pub = NREL5MW_PUBLISHED;
  console.log(`  Cp_max ${model.cpMax.toFixed(3)} (pub. ${pub.cpMax}), λ_opt ${model.tsrOpt.toFixed(2)} (pub. ${pub.tsrOpt}), `
    + `rated wind ${model.ratedWind.toFixed(1)} m/s (pub. ${pub.ratedWind})`);
  assert.ok(Math.abs(model.cpMax - pub.cpMax) < 0.04);
  assert.ok(Math.abs(model.tsrOpt - pub.tsrOpt) < 1.0);
  assert.ok(Math.abs(model.ratedWind - pub.ratedWind) < 0.6);
});

test('section solve is robust across extreme inflow (always converges or reports failure)', () => {
  for (const s of model.rotor.sections) for (const Vy of [0.1, 1, 10, 100]) for (const p of [-0.3, 0, 0.5, 1.4]) {
    const r = solveSection(model.rotor, s, 10, Vy, p);
    assert.ok(r.converged === false || Number.isFinite(r.Np + r.Tp));
  }
});
