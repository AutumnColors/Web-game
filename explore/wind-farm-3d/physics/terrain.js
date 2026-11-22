// Terrain height fields H(x, z) in metres, with analytic gradients.
// Coordinates: x and z horizontal, y up (same convention as the renderer, but
// this module does not depend on it). Heights are above a common datum y = 0.
//
// Each terrain also reports `decayLength` L (see parameters.js, terrainDecayLength):
// the vertical scale over which its influence on the flow fades.

export const DOMAIN = { xMin: -2000, xMax: 2000, zMin: -1500, zMax: 1500 };

function waves(rng, count, ampRange, lengthRange) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const A = rng.range(...ampRange);
    const lambda = rng.range(...lengthRange);
    const dir = rng.range(0, Math.PI);
    const k = (2 * Math.PI) / lambda;
    list.push({ A, k, kx: k * Math.cos(dir), kz: k * Math.sin(dir), phase: rng.range(0, 2 * Math.PI) });
  }
  return list;
}

function evalWaves(list, x, z, out) {
  let h = 0, hx = 0, hz = 0;
  for (const w of list) {
    const a = w.kx * x + w.kz * z + w.phase;
    h += w.A * Math.sin(a);
    const c = w.A * Math.cos(a);
    hx += c * w.kx;
    hz += c * w.kz;
  }
  out[0] = h; out[1] = hx; out[2] = hz;
  return out;
}

const tmp = [0, 0, 0];

export function createTerrain(kind, rng) {
  if (kind === 'flat') {
    // used by tests and as a reference case: H = 0 everywhere
    return finish({ kind, decayLength: 1000, sample(x, z, out) { out[0] = out[1] = out[2] = 0; return out; }, isWater: () => false });
  }
  if (kind === 'plain') {
    const list = waves(rng, 3, [3, 9], [900, 2200]);
    const dominant = list.reduce((a, b) => (b.A > a.A ? b : a));
    return finish({
      kind, decayLength: 1 / dominant.k,
      sample(x, z, out) { return evalWaves(list, x, z, out); },
      isWater: () => false,
    });
  }
  if (kind === 'mountain') {
    const A = rng.range(120, 200), sigma = rng.range(350, 500);
    const x0 = rng.range(-600, 600), z0 = rng.range(-500, 500);
    const list = waves(rng, 2, [2, 5], [700, 1500]);
    return finish({
      kind, decayLength: sigma, hill: { A, sigma, x0, z0 },
      sample(x, z, out) {
        evalWaves(list, x, z, out);
        const dx = x - x0, dz = z - z0;
        const g = A * Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
        out[0] += g;
        out[1] += -g * dx / (sigma * sigma);
        out[2] += -g * dz / (sigma * sigma);
        return out;
      },
      isWater: () => false,
    });
  }
  if (kind === 'coast') {
    // Sea at low x, land rising across a smooth shoreline ramp.
    const gamma = rng.range(-0.3, 0.3), c = Math.cos(gamma), s = Math.sin(gamma);
    const s0 = rng.range(-300, 300), width = rng.range(120, 250), A = rng.range(12, 30);
    const dunes = waves(rng, 2, [1, 3], [400, 900]);
    return finish({
      kind, decayLength: width, shore: { s0, width, gamma },
      sample(x, z, out) {
        const u = (x * c + z * s - s0) / width;
        const th = Math.tanh(u), S = 0.5 * (1 + th), dS = 0.5 * (1 - th * th) / width;
        evalWaves(dunes, x, z, tmp);
        const base = A + tmp[0];
        out[0] = S * base;
        out[1] = dS * c * base + S * tmp[1];
        out[2] = dS * s * base + S * tmp[2];
        return out;
      },
      isWater(x, z) { return (x * c + z * s - s0) / width < -1; },
    });
  }
  throw new Error('Unknown terrain: ' + kind);
}

function finish(t) {
  const o = [0, 0, 0];
  t.bounds = DOMAIN;
  t.height = (x, z) => t.sample(x, z, o)[0];
  return t;
}
