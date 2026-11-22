// Public entry of the physics engine. Pure JavaScript: no DOM, no WebGL, no three.js.
// The renderer only calls createSimulation() and reads the returned object.

import { createRng } from './random.js';
import { createTerrain } from './terrain.js';
import { createAtmosphere } from './atmosphere.js';
import { createTurbineModel } from './turbine.js';
import { placeTurbines, createFarm } from './farm.js';
import { ROUGHNESS, AIR_DENSITY } from './parameters.js';

export { REGISTRY } from './parameters.js';

// Scenario = terrain kind + surface roughness + whether the wind varies in time.
export const SCENARIOS = {
  coast: { label: 'Coastal', terrain: 'coast', z0: ROUGHNESS.sea, variable: false },
  plain: { label: 'Plains', terrain: 'plain', z0: ROUGHNESS.open, variable: false },
  mountain: { label: 'Mountains', terrain: 'mountain', z0: ROUGHNESS.roughlyOpen, variable: false },
  gust: { label: 'Variable winds', terrain: 'plain', z0: ROUGHNESS.open, variable: true },
};

// Layout rules: site-selection choices, not physics.
//   minSpacingD      minimum distance between towers, in rotor diameters
//   margin           distance kept from the domain edge [m]
//   minTipClearance  lowest blade tip must stay this far above the terrain under it, for any yaw [m]
//                    (flat-ground clearance of the reference turbine is 90 − 63 = 27 m)
//   buildMinSpacingD minimum spacing when the user places turbines by hand: 1 D, the physical limit
//                    where two rotors side by side would touch. Real farms use about 3–5 D across
//                    and 5–10 D along the wind; closer than 3 D downstream the wake model is a placeholder.
//   buildMargin      hand-placed towers must keep the whole rotor inside the map [m]
//   maxTurbines      cap for hand-placed layouts (keeps the solver interactive)
export const LAYOUT_RULES = { minSpacingD: 4, margin: 350, minTipClearance: 15, buildMinSpacingD: 1, buildMargin: 80, maxTurbines: 40 };

// Worst-case tip clearance over all yaw angles: lowest possible tip height minus the highest
// terrain within the horizontal reach of the rotor (overhang + R) around the tower.
export function tipClearance(terrain, model, x, z) {
  const { hubHeight, overhang } = model.def, R = model.rotor.R;
  const base = terrain.height(x, z), reach = overhang + R;
  let hmax = -Infinity;
  for (let i = 0; i <= 6; i++) for (let k = 0; k < 24; k++) {
    const r = (reach * i) / 6, a = (k / 24) * 2 * Math.PI;
    hmax = Math.max(hmax, terrain.height(x + r * Math.cos(a), z + r * Math.sin(a)));
  }
  return base + hubHeight - R - hmax;
}

let sharedModel = null; // the BEM table depends only on the turbine, so it is built once
export function turbineModel() { return (sharedModel ??= createTurbineModel()); }

// layout: 'random' (12 turbines placed by the layout rules) or an array of {x, z[, id]} positions [m].
// The terrain and the wind depend only on scenario + seed, so the same seed gives the same site in
// both modes.
export function createSimulation({ scenario = 'coast', seed = 1, turbines: count = 12, layout = 'random' } = {}) {
  const sc = SCENARIOS[scenario];
  if (!sc) throw new Error('Unknown scenario ' + scenario);
  const rng = createRng(seed);
  const terrain = createTerrain(sc.terrain, rng);
  const model = turbineModel();
  // Reference wind at hub height over flat ground, 6–14 m/s; blowing towards +x ± 25°.
  const uRef = rng.range(6, 14);
  const direction = rng.range(-25, 25) * (Math.PI / 180);
  const atmosphere = createAtmosphere({ terrain, z0: sc.z0, uRef, zRef: model.def.hubHeight, direction, variable: sc.variable, rng });
  const positions = layout === 'random'
    ? placeTurbines({
      terrain, rng, count, minSpacing: LAYOUT_RULES.minSpacingD * model.D, margin: LAYOUT_RULES.margin,
      accept: (x, z) => tipClearance(terrain, model, x, z) >= LAYOUT_RULES.minTipClearance,
    })
    : layout;

  let farm = null, summary = null;
  function setLayout(points) {
    let next = 1 + points.reduce((m, p) => Math.max(m, p.id || 0), 0);
    const list = points.map((p) => ({ id: p.id || next++, x: p.x, z: p.z, base: terrain.height(p.x, p.z) }));
    farm = createFarm({ terrain, atmosphere, model, layout: list });
    summary = farm.solve(atmosphere.state.t);
    return summary;
  }
  setLayout(positions);

  // Can a turbine stand at (x, z)? ignoreId: the turbine being moved.
  function canPlace(x, z, ignoreId = null) {
    const b = terrain.bounds, m = LAYOUT_RULES.buildMargin + model.rotor.R;
    if (x < b.xMin + m || x > b.xMax - m || z < b.zMin + m || z > b.zMax - m) return { ok: false, reason: 'too close to the edge of the map' };
    const others = farm.turbines.filter((t) => t.id !== ignoreId);
    if (ignoreId === null && others.length >= LAYOUT_RULES.maxTurbines) return { ok: false, reason: `at most ${LAYOUT_RULES.maxTurbines} turbines` };
    const near = others.find((t) => Math.hypot(t.x - x, t.z - z) < LAYOUT_RULES.buildMinSpacingD * model.D);
    if (near) return { ok: false, reason: `rotors would touch T${near.id} (closer than ${LAYOUT_RULES.buildMinSpacingD} D)` };
    if (tipClearance(terrain, model, x, z) < LAYOUT_RULES.minTipClearance) return { ok: false, reason: 'blade tips would come too close to the slope' };
    return { ok: true };
  }

  return {
    scenario, seed, label: sc.label, terrain, atmosphere, model, rho: AIR_DENSITY,
    get farm() { return farm; },
    get summary() { return summary; },
    // advance the quasi-steady state to time t (only changes anything for variable winds)
    update(t) { summary = farm.solve(t); return summary; },
    setLayout, canPlace,
    positions() { return farm.turbines.map((t) => ({ id: t.id, x: t.x, z: t.z })); },
    velocity: (x, y, z, out) => farm.velocity(x, y, z, out),
    ambient: atmosphere.velocity,
  };
}
