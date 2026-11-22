// Rotor orientation, blade kinematics, aerodynamic sign conventions and terrain clearance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rotorBasis, bladeDirection, sectionFrame, dot, cross, norm, add, scale } from '../physics/geometry.js';
import { evaluateRotor } from '../physics/bem.js';
import { createSimulation, SCENARIOS, turbineModel } from '../physics/index.js';

const close = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;

test('rotor axis is parallel to the hub-height wind and the basis is orthonormal', () => {
  for (let a = -Math.PI; a < Math.PI; a += 0.37) {
    const B = rotorBasis(Math.cos(a) * 9, Math.sin(a) * 9);
    assert.ok(close(B.n[0], Math.cos(a)) && close(B.n[2], Math.sin(a)) && B.n[1] === 0);
    for (const [u, v] of [[B.n, B.up], [B.n, B.right], [B.up, B.right]]) assert.ok(close(dot(u, v), 0));
    for (const u of [B.n, B.up, B.right]) assert.ok(close(norm(u), 1));
  }
  // facing east (+x) with y up, the observer's right is +z
  const E = rotorBasis(1, 0); assert.ok(close(E.right[2], 1));
});

test('blades rotate in the plane perpendicular to the axis, clockwise seen from upwind', () => {
  const B = rotorBasis(0.8, -0.6), R = 63;
  for (let psi = 0; psi < 2 * Math.PI; psi += 0.1) {
    const tip = scale(bladeDirection(B, psi), R);
    assert.ok(close(dot(tip, B.n), 0, 1e-12) && close(norm(tip), R, 1e-9));
  }
  // small positive ψ moves the top blade toward the upwind observer's right
  assert.ok(dot(bladeDirection(B, 0.1), B.right) > 0);
  // the motion direction n × b equals d b / dψ (right-handed rotation about +n)
  const psi = 0.7, h = 1e-6, t = sectionFrame(B, psi, 0).t;
  const db = scale(add(bladeDirection(B, psi + h), bladeDirection(B, psi - h), -1), 1 / (2 * h));
  for (let i = 0; i < 3; i++) assert.ok(close(t[i], db[i], 1e-8));
});

test('geometric angle of attack equals BEM α and blade forces drive the rotor forward', () => {
  const m = turbineModel(), U = 8, op = m.operatingPoint(U);
  const res = evaluateRotor(m.rotor, U, op.omega, op.pitch);
  const B = rotorBasis(1, 0.3), psi = 1.1;
  let torque = 0, thrust = 0;
  m.rotor.sections.forEach((sec, i) => {
    const s = res.sections[i], f = sectionFrame(B, psi, sec.twist + op.pitch);
    // air velocity relative to the blade section
    const W = add(scale(B.n, U * (1 - s.a)), f.t, -op.omega * sec.r * (1 + s.ap));
    const from = scale(W, -1 / norm(W));                 // direction the air comes from
    const ang = (v) => Math.atan2(dot(v, scale(B.n, -1)), dot(v, f.t));
    assert.ok(close(ang(from) - ang(f.chord), s.alpha, 1e-9), `α at r=${sec.r}`);
    // lift ⊥ W towards the suction side, drag along W
    const wHat = scale(W, 1 / norm(W));
    let L = cross(wHat, cross(f.suction, wHat)); L = scale(L, 1 / norm(L));
    if (dot(L, f.suction) < 0) L = scale(L, -1);
    const q = 0.5 * 1.225 * dot(W, W) * sec.chord;
    const F = add(scale(L, s.cl * q), wHat, s.cd * q);
    assert.ok(close(dot(F, f.t), s.Tp, 1e-6 * Math.abs(s.Tp) + 1e-6), `tangential r=${sec.r}`);
    assert.ok(close(dot(F, B.n), s.Np, 1e-6 * Math.abs(s.Np) + 1e-6), `normal r=${sec.r}`);
    torque += s.Tp; thrust += s.Np;
  });
  assert.ok(torque > 0 && thrust > 0);
});

test('every turbine in every scenario clears the terrain with its lowest blade tip', () => {
  let worst = Infinity;
  for (const scenario of Object.keys(SCENARIOS)) for (let seed = 1; seed <= 25; seed++) {
    const sim = createSimulation({ scenario, seed }), R = sim.model.rotor.R;
    for (const t of sim.farm.turbines) for (let psi = 0; psi < 2 * Math.PI; psi += Math.PI / 36) {
      const tip = add(t.hub, bladeDirection(t.basis, psi), R);
      worst = Math.min(worst, tip[1] - sim.terrain.height(tip[0], tip[2]));
    }
  }
  console.log(`  minimum tip clearance over 100 maps: ${worst.toFixed(1)} m`);
  assert.ok(worst >= 15);
});
