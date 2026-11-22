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
export const LAYOUT_RULES = { minSpacingD: 4, margin: 350, minTipClearance: 15 };

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

export function createSimulation({ scenario = 'coast', seed = 1, turbines: count = 12 } = {}) {
  const sc = SCENARIOS[scenario];
  if (!sc) throw new Error('Unknown scenario ' + scenario);
  const rng = createRng(seed);
  const terrain = createTerrain(sc.terrain, rng);
  const model = turbineModel();
  // Reference wind at hub height over flat ground, 6–14 m/s; blowing towards +x ± 25°.
  const uRef = rng.range(6, 14);
  const direction = rng.range(-25, 25) * (Math.PI / 180);
  const atmosphere = createAtmosphere({ terrain, z0: sc.z0, uRef, zRef: model.def.hubHeight, direction, variable: sc.variable, rng });
  const layout = placeTurbines({
    terrain, rng, count, minSpacing: LAYOUT_RULES.minSpacingD * model.D, margin: LAYOUT_RULES.margin,
    accept: (x, z) => tipClearance(terrain, model, x, z) >= LAYOUT_RULES.minTipClearance,
  });
  const farm = createFarm({ terrain, atmosphere, model, layout });
  let summary = farm.solve(0);
  return {
    scenario, seed, label: sc.label, terrain, atmosphere, model, farm, rho: AIR_DENSITY,
    get summary() { return summary; },
    // advance the quasi-steady state to time t (only changes anything for variable winds)
    update(t) { summary = farm.solve(t); return summary; },
    velocity: farm.velocity,
    ambient: atmosphere.velocity,
  };
}
