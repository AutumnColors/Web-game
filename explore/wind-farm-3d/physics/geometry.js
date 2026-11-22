// Rotor kinematics shared by the physics and the renderer (pure vector maths, no rendering).
//
// Conventions (y up):
//   n      rotor axis, unit, pointing DOWNWIND (the rotor is yawed so n ∥ horizontal hub wind)
//   up     world up projected ⊥ n (n is horizontal, so up = ŷ)
//   right  n × up  = "right" for an observer upwind looking downwind
//   Blade azimuth ψ = 0 points up; the rotor turns clockwise seen from upwind,
//   i.e. right-handed about +n: blade direction b(ψ) = cos ψ·up + sin ψ·right.
//   Section frame at radius r:  motion t̂ = n × b̂ (blade velocity Ω r t̂)
//   chord (trailing → leading edge)  ĉ = cos θ·t̂ − sin θ·n      θ = twist + pitch
//   suction-side normal              ŝ = sin θ·t̂ + cos θ·n      (suction side faces downwind)
//   Relative wind arrives from  cos φ·t̂ − sin φ·n  ⇒ geometric angle of attack α = φ − θ,
//   lift  L̂ = sin φ·t̂ + cos φ·n  (drives the rotor along t̂ and thrusts it along n).

export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => scale(a, 1 / norm(a));

// Rotor basis from a horizontal wind vector (only its x and z parts are used).
export function rotorBasis(windX, windZ) {
  const n = unit([windX, 0, windZ]);
  const up = [0, 1, 0];
  const right = cross(n, up);
  return { n, up, right };
}

export function bladeDirection(basis, psi) {
  return add(scale(basis.up, Math.cos(psi)), basis.right, Math.sin(psi));
}

export function sectionFrame(basis, psi, theta) {
  const b = bladeDirection(basis, psi);
  const t = cross(basis.n, b);
  const chord = add(scale(t, Math.cos(theta)), basis.n, -Math.sin(theta));
  const suction = add(scale(t, Math.sin(theta)), basis.n, Math.cos(theta));
  return { b, t, chord, suction };
}

// Hub (rotor centre) of an upwind rotor: hub height above the tower base, `overhang` upwind.
export function hubCenter(base, hubHeight, overhang, basis) {
  return [base[0] - overhang * basis.n[0], base[1] + hubHeight, base[2] - overhang * basis.n[2]];
}
