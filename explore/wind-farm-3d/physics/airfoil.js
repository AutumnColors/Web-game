// Simplified airfoil polars Cl(α), Cd(α).  STATUS: approximation (see parameters.js, airfoilPolars).
//
// Attached flow:  x = a0 · (α − α0)                        (thin-airfoil form, slope a0 per rad)
//                 Cl = x / (1 + |x/Cl_max|^p)^(1/p)          (smooth saturation at Cl_max)
//                 Cd = Cd0 + kd · (Cl − Cl_d)²             (parabolic drag polar)
// Deep stall:     Cl = (Cd90/2) sin 2α,  Cd = Cd0 + Cd90 sin²α   (flat plate)
// Drag switches to the flat-plate value at stall onset α_s = α0 + Cl_max/a0;
// lift keeps a plateau near Cl_max for a further `postStallPlateau` degrees,
// then falls to the flat-plate value. Real airfoils stall differently; this is
// only meant to keep the solver well behaved and qualitatively right.
//
// Family parameters
//   tc     thickness / chord (used by the renderer for the section shape)
//   alpha0 zero-lift angle [deg]
//   a0     lift slope [1/rad] (2π for an ideal thin airfoil; thick sections are lower)
//   clMax  maximum attached-flow lift coefficient
//   cd0    minimum drag coefficient
//   kd     drag-rise factor of the parabolic polar
//   clD    lift coefficient at minimum drag
// Cylinder values Cd = 0.50 / 0.35, Cl = 0 are those of the reference design.

import { FLAT_PLATE_CD90, STALL_BLEND_WIDTH_DEG, LIFT_SATURATION_EXPONENT, POST_STALL_PLATEAU_DEG } from './parameters.js';

const D = Math.PI / 180;

export const FAMILIES = {
  Cylinder1: { tc: 1.0, cylinder: true, cd: 0.50 },
  Cylinder2: { tc: 1.0, cylinder: true, cd: 0.35 },
  DU40: { tc: 0.405, alpha0: -2.2, a0: 5.3, clMax: 1.05, cd0: 0.0130, kd: 0.020, clD: 0.3 },
  DU35: { tc: 0.35, alpha0: -2.5, a0: 5.6, clMax: 1.15, cd0: 0.0100, kd: 0.016, clD: 0.4 },
  DU30: { tc: 0.30, alpha0: -2.8, a0: 5.9, clMax: 1.25, cd0: 0.0085, kd: 0.013, clD: 0.5 },
  DU25: { tc: 0.25, alpha0: -3.6, a0: 6.1, clMax: 1.30, cd0: 0.0070, kd: 0.011, clD: 0.6 },
  DU21: { tc: 0.21, alpha0: -4.2, a0: 6.2, clMax: 1.35, cd0: 0.0065, kd: 0.010, clD: 0.6 },
  NACA64: { tc: 0.18, alpha0: -4.0, a0: 6.3, clMax: 1.40, cd0: 0.0065, kd: 0.010, clD: 0.6 },
};

// An ideal, frictionless, never-stalling airfoil for analytic tests.
export function idealPolar(a0 = 2 * Math.PI) {
  return { tc: 0.12, coeffs(alpha, out) { out[0] = a0 * alpha; out[1] = 0; return out; } };
}

export function polar(name) {
  const f = FAMILIES[name];
  if (!f) throw new Error('Unknown airfoil ' + name);
  if (f.cylinder) return { name, tc: f.tc, coeffs(alpha, out) { out[0] = 0; out[1] = f.cd; return out; } };
  const a0r = f.alpha0 * D;
  const stall = f.clMax / f.a0; // (α − α0) at which the linear lift reaches Cl_max
  const width = STALL_BLEND_WIDTH_DEG * D, plateau = POST_STALL_PLATEAU_DEG * D, p = LIFT_SATURATION_EXPONENT;
  return {
    name, tc: f.tc,
    coeffs(alpha, out) {
      // wrap to (−π, π]
      alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
      const da = alpha - a0r, ada = Math.abs(da);
      const x = f.a0 * da;
      const y = Math.abs(x) / f.clMax, y2 = y * y;
      const clAtt = x / (p === 6 ? Math.cbrt(Math.sqrt(1 + y2 * y2 * y2)) : Math.pow(1 + Math.pow(y, p), 1 / p));
      const cdAtt = f.cd0 + f.kd * (clAtt - f.clD) ** 2;
      const sa = Math.sin(alpha);
      const clFp = 0.5 * FLAT_PLATE_CD90 * Math.sin(2 * alpha);
      const cdFp = f.cd0 + FLAT_PLATE_CD90 * sa * sa;
      const wd = 1 / (1 + Math.exp(-(ada - stall) / width));            // drag: 0 attached → 1 separated
      const wl = 1 / (1 + Math.exp(-(ada - stall - plateau) / width));  // lift: leaves the plateau later
      out[0] = (1 - wl) * clAtt + wl * clFp;
      out[1] = (1 - wd) * cdAtt + wd * cdFp;
      return out;
    },
  };
}
