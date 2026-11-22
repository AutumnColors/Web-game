// three.js meshes for a turbine, built from the physics turbine definition.
// Blade: lofted from the reference chord/twist table; section shapes are a visual
// approximation (NACA-like thickness with the station's t/c, blended to a circle at the root).
//
// Local frames (must match physics/geometry.js; checked by selfCheck in scene.js):
//   yaw group:  X = right, Y = up, Z = −n (upwind)       (makeBasis(right, up, −n))
//   spin group: rotation.z = −ψ  (right-handed rotation by ψ about +n)
//   blade k:    arm.rotation.z = −2πk/3,  pitch group rotation.y = −pitch
//   section:    chord (TE→LE) = cos θ X + sin θ Z,  suction normal = sin θ X − cos θ Z,  span = +Y

import { FAMILIES } from '../physics/airfoil.js';

function naca(xi, t) { // half thickness / chord of a NACA 4-digit section with thickness ratio t
  return 5 * t * (0.2969 * Math.sqrt(xi) - 0.126 * xi - 0.3516 * xi ** 2 + 0.2843 * xi ** 3 - 0.1036 * xi ** 4);
}

export function bladeStations(def) {
  const { rotor } = def, s = rotor.sections;
  const st = s.map((q) => ({ r: q.r, chord: q.chord, twist: q.twist, tc: FAMILIES[q.airfoil].tc }));
  st.unshift({ r: rotor.Rhub, chord: s[0].chord, twist: s[0].twist, tc: 1 });
  st.push({ r: rotor.R - 0.3, chord: s[s.length - 1].chord * 0.6, twist: 0, tc: 0.18 });
  st.push({ r: rotor.R, chord: 0.15, twist: 0, tc: 0.18 });
  return st;
}

export function buildBladeGeometry(THREE, def, chordPoints = 14) {
  const st = bladeStations(def), N = chordPoints;
  const ring = 2 * N - 2; // LE..TE on upper side, then back on lower side (LE and TE shared)
  const pos = [];
  for (const q of st) {
    const w = Math.min(1, Math.max(0, (q.tc - 0.4) / 0.6)); // 0 airfoil … 1 circle
    const xp = 0.25 + 0.25 * w;                              // pitch-axis chord fraction (visual)
    const camber = 0.02 * (1 - w);
    const c = Math.cos(q.twist), s = Math.sin(q.twist);
    const pts = [];
    for (let i = 0; i < N; i++) pts.push(0.5 * (1 - Math.cos((Math.PI * i) / (N - 1))));
    const emit = (xi, sign) => {
      const ang = Math.acos(1 - 2 * xi);
      const half = (1 - w) * naca(xi, Math.min(q.tc, 0.4)) + w * 0.5 * Math.sin(ang);
      const y = sign * half + 4 * camber * xi * (1 - xi);
      const a = (xp - xi) * q.chord, b = y * q.chord; // along chord (towards LE), along suction normal
      pos.push(a * c + b * s, q.r, a * s - b * c);
    };
    for (let i = 0; i < N; i++) emit(pts[i], +1);
    for (let i = N - 2; i >= 1; i--) emit(pts[i], -1);
  }
  const idx = [];
  for (let j = 0; j < st.length - 1; j++) for (let i = 0; i < ring; i++) {
    const a = j * ring + i, b = j * ring + ((i + 1) % ring), c2 = a + ring, d = b + ring;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createTurbineFactory(THREE, def) {
  const white = new THREE.MeshStandardMaterial({ color: 0xeef4f6, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const grey = new THREE.MeshStandardMaterial({ color: 0xc9d3d7, roughness: 0.6 });
  const towerGeo = new THREE.CylinderGeometry(def.towerTopDiameter / 2, def.towerBaseDiameter / 2, def.towerHeight + 4, 20, 1, true);
  towerGeo.translate(0, (def.towerHeight + 4) / 2 - 4, 0); // extends 4 m into the ground for slopes
  const nacelleGeo = new THREE.BoxGeometry(4.2, 4.2, 15);
  nacelleGeo.translate(0, 2.4, -3);
  const hubGeo = new THREE.SphereGeometry(def.rotor.Rhub + 0.3, 16, 12);
  const spinnerGeo = new THREE.ConeGeometry(def.rotor.Rhub + 0.3, 3, 16);
  spinnerGeo.rotateX(Math.PI / 2); spinnerGeo.translate(0, 0, 1.5);
  const bladeGeo = buildBladeGeometry(THREE, def);
  const tmpM = new THREE.Matrix4(), vR = new THREE.Vector3(), vU = new THREE.Vector3(), vB = new THREE.Vector3();

  function create(turbine) {
    const root = new THREE.Group();
    const tower = new THREE.Mesh(towerGeo, white);
    tower.position.set(turbine.x, turbine.base, turbine.z);
    root.add(tower);
    const yaw = new THREE.Group();
    yaw.position.set(turbine.x, turbine.base + def.towerHeight, turbine.z);
    root.add(yaw);
    yaw.add(new THREE.Mesh(nacelleGeo, white));
    const spin = new THREE.Group();
    spin.position.set(0, def.hubHeight - def.towerHeight, def.overhang);
    yaw.add(spin);
    spin.add(new THREE.Mesh(hubGeo, grey), new THREE.Mesh(spinnerGeo, grey));
    const pitchGroups = [];
    for (let k = 0; k < def.rotor.B; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (-2 * Math.PI * k) / def.rotor.B;
      const pitch = new THREE.Group();
      pitch.add(new THREE.Mesh(bladeGeo, white));
      arm.add(pitch); spin.add(arm); pitchGroups.push(pitch);
    }
    const handle = {
      root, yaw, spin, pitchGroups, psi: Math.random() * 2 * Math.PI,
      orient(basis, pitch) {
        vR.fromArray(basis.right); vU.fromArray(basis.up); vB.fromArray(basis.n).negate();
        tmpM.makeBasis(vR, vU, vB);
        yaw.quaternion.setFromRotationMatrix(tmpM);
        for (const p of pitchGroups) p.rotation.y = -pitch;
      },
      setAzimuth(psi) { handle.psi = psi % (2 * Math.PI); spin.rotation.z = -handle.psi; },
    };
    handle.setAzimuth(handle.psi);
    return handle;
  }

  function dispose() { for (const o of [towerGeo, nacelleGeo, hubGeo, spinnerGeo, bladeGeo, white, grey]) o.dispose(); }
  return { create, dispose };
}
