// Rendering of a physics simulation. Reads the simulation; never changes its physics.
import { createTurbineFactory } from './turbine-mesh.js';
import { OrbitCamera } from './controls.js';
import { bladeDirection, sectionFrame } from '../physics/geometry.js';
import { COLOR_MODES } from './colors.js';

// Visual settings (no physical meaning).
export const VISUAL = {
  timeScale: 10,          // particles and atmosphere clock run 10× real time; rotors spin at real speed
  streakSeconds: 4,       // streak length = velocity × this many (simulated) seconds
  particles: { desktop: 4000, mobile: 1800 },
  heightRange: [10, 250], // m above ground where particles are seeded (rotor spans 27–153 m)
  colorModes: COLOR_MODES,
};

function colorRamp(THREE, mode) {
  const stops = VISUAL.colorModes[mode].stops.map(([v, c]) => [v, new THREE.Color(c)]);
  return (v, out) => {
    if (v <= stops[0][0]) return out.copy(stops[0][1]);
    for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      return out.copy(ca).lerp(cb, (v - a) / (b - a));
    }
    return out.copy(stops[stops.length - 1][1]);
  };
}

export class FarmView {
  constructor(THREE, container, { mobile }) {
    this.THREE = THREE; this.container = container; this.mobile = mobile;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    container.prepend(renderer.domElement);
    this.renderer = renderer;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b2233);
    scene.fog = new THREE.Fog(0x0b2233, 3500, 11000);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x2a3a2c, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(-3000, 2200, 2000);
    scene.add(sun);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, 1, 5, 30000);
    this.setColorMode('speed');
    this.group = null;
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      window.windLabError?.('The WebGL context was lost (the GPU reset or the tab was in the background too long). Reload the page.');
    });
    this.resize = this.resize.bind(this);
    new ResizeObserver(() => requestAnimationFrame(this.resize)).observe(container);
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 200));
  }

  setColorMode(mode) {
    this.colorMode = mode;
    this.ramp = colorRamp(this.THREE, mode);
    if (this.pState) this.stepParticles(0);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setSimulation(sim) {
    const THREE = this.THREE;
    this.disposeGroup();
    this.sim = sim;
    const group = new THREE.Group();
    this.group = group;
    this.scene.add(group);
    group.add(this.buildTerrain(sim.terrain));
    this.factory = createTurbineFactory(THREE, sim.model.def);
    this.turbines = sim.farm.turbines.map((t) => {
      const h = this.factory.create(t);
      group.add(h.root);
      return h;
    });
    this.syncTurbines();
    this.buildParticles();
    const b = sim.terrain.bounds, d = sim.atmosphere.state.direction;
    // home view: from upwind-left, looking over the farm
    const home = { target: [0, 60, 0], distance: 3600, azimuth: d + Math.PI - 0.55, elevation: 0.42 };
    if (!this.controls) this.controls = new OrbitCamera(this.camera, this.renderer.domElement, { groundHeight: sim.terrain.height, bounds: b, home });
    else { this.controls.ground = sim.terrain.height; this.controls.bounds = b; this.controls.home = home; this.controls.reset(); }
    this.resize();
  }

  buildTerrain(terrain) {
    const THREE = this.THREE, b = terrain.bounds;
    const W = b.xMax - b.xMin, D = b.zMax - b.zMin;
    const geo = new THREE.PlaneGeometry(W, D, 160, 120);
    geo.rotateX(-Math.PI / 2);
    geo.translate((b.xMin + b.xMax) / 2, 0, (b.zMin + b.zMax) / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const h3 = [0, 0, 0], rock = new THREE.Color(0.36, 0.34, 0.29);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      terrain.sample(x, z, h3);
      pos.setY(i, h3[0]);
      const slope = Math.hypot(h3[1], h3[2]);
      if (terrain.isWater(x, z)) c.setRGB(0.05, 0.16, 0.26);
      else {
        c.setRGB(0.16, 0.27, 0.17).lerp(rock, Math.min(1, slope * 3));
        c.multiplyScalar(0.85 + 0.35 * Math.min(1, Math.max(0, h3[0] / 180)));
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    mesh.name = 'terrain';
    return mesh;
  }

  buildParticles() {
    const THREE = this.THREE, n = this.mobile ? VISUAL.particles.mobile : VISUAL.particles.desktop;
    this.pState = { n, p: new Float32Array(n * 3), age: new Float32Array(n), life: new Float32Array(n) };
    this.lineGeo = new THREE.BufferGeometry();
    this.linePos = new Float32Array(n * 6); this.lineCol = new Float32Array(n * 6);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setAttribute('color', new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    lines.frustumCulled = false;
    this.headGeo = new THREE.BufferGeometry();
    this.headPos = new Float32Array(n * 3); this.headCol = new Float32Array(n * 3);
    this.headGeo.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.headGeo.setAttribute('color', new THREE.BufferAttribute(this.headCol, 3).setUsage(THREE.DynamicDrawUsage));
    const heads = new THREE.Points(this.headGeo, new THREE.PointsMaterial({ size: this.mobile ? 2.5 : 2.2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    heads.frustumCulled = false;
    this.group.add(lines, heads);
    for (let i = 0; i < n; i++) { this.spawn(i); this.pState.age[i] = Math.random() * this.pState.life[i]; }
    this.stepParticles(0);
  }

  spawn(i) {
    const { p, age, life } = this.pState, b = this.sim.terrain.bounds, [h0, h1] = VISUAL.heightRange;
    const x = b.xMin + Math.random() * (b.xMax - b.xMin), z = b.zMin + Math.random() * (b.zMax - b.zMin);
    p[i * 3] = x; p[i * 3 + 1] = this.sim.terrain.height(x, z) + h0 + Math.random() * (h1 - h0); p[i * 3 + 2] = z;
    age[i] = 0; life[i] = 30 + Math.random() * 60;
  }

  // Advance tracers with the physics field (explicit Euler; steps are small vs. flow scales).
  stepParticles(dtSim) {
    const { n, p, age, life } = this.pState, b = this.sim.terrain.bounds, v = [0, 0, 0, 1], col = this.tmpColor ??= new this.THREE.Color();
    const uRef = this.sim.atmosphere.state.uRef, tau = VISUAL.streakSeconds, wakeMode = this.colorMode === 'wake';
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let x = p[k], y = p[k + 1], z = p[k + 2];
      this.sim.velocity(x, y, z, v);
      x += v[0] * dtSim; y += v[1] * dtSim; z += v[2] * dtSim;
      age[i] += dtSim;
      if (age[i] > life[i] || x < b.xMin || x > b.xMax || z < b.zMin || z > b.zMax || y < this.sim.terrain.height(x, z) + 1) {
        this.spawn(i); x = p[k]; y = p[k + 1]; z = p[k + 2]; this.sim.velocity(x, y, z, v);
      } else { p[k] = x; p[k + 1] = y; p[k + 2] = z; }
      this.ramp(wakeMode ? v[3] : Math.hypot(v[0], v[1], v[2]) / uRef, col);
      const fade = Math.max(0, Math.min(1, age[i] / 3, (life[i] - age[i]) / 3));
      const j = i * 6;
      this.linePos[j] = x - v[0] * tau; this.linePos[j + 1] = y - v[1] * tau; this.linePos[j + 2] = z - v[2] * tau;
      this.linePos[j + 3] = x; this.linePos[j + 4] = y; this.linePos[j + 5] = z;
      const f0 = 0.15 * fade, f1 = fade;
      this.lineCol[j] = col.r * f0; this.lineCol[j + 1] = col.g * f0; this.lineCol[j + 2] = col.b * f0;
      this.lineCol[j + 3] = col.r * f1; this.lineCol[j + 4] = col.g * f1; this.lineCol[j + 5] = col.b * f1;
      this.headPos[k] = x; this.headPos[k + 1] = y; this.headPos[k + 2] = z;
      this.headCol[k] = col.r * f1; this.headCol[k + 1] = col.g * f1; this.headCol[k + 2] = col.b * f1;
    }
    for (const g of [this.lineGeo, this.headGeo]) { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
  }

  // Highlight one turbine: translucent rotor disk + dashed wake centreline (15 D downstream).
  setSelected(t) {
    const THREE = this.THREE;
    this.selected = t;
    if (this.selGroup) { this.group?.remove(this.selGroup); this.selGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); }
    this.selGroup = null;
    if (!t || !this.group) return;
    const g = new THREE.Group(), R = this.sim.model.rotor.R, D = this.sim.model.D;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ color: 0xffd65a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 1.2, R + 1.2, 64), new THREE.MeshBasicMaterial({ color: 0xffd65a, side: THREE.DoubleSide }));
    for (const m of [disk, ring]) {
      m.position.fromArray(t.hub);
      m.lookAt(t.hub[0] + t.basis.n[0], t.hub[1], t.hub[2] + t.basis.n[2]);
      g.add(m);
    }
    const pts = [];
    for (let xd = 0; xd <= 15 * D; xd += 25) pts.push(new THREE.Vector3(t.hub[0] + xd * t.basis.n[0], this.sim.farm.centreHeight(t, xd), t.hub[2] + xd * t.basis.n[2]));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffd65a, dashSize: 25, gapSize: 18 }));
    line.computeLineDistances();
    g.add(line);
    this.selGroup = g;
    this.group.add(g);
  }

  // Turbine index under a screen point, or -1.
  pick(clientX, clientY) {
    const THREE = this.THREE, rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    let best = -1, bestD = Infinity;
    this.turbines.forEach((h, i) => {
      const hit = ray.intersectObject(h.root, true)[0];
      if (hit && hit.distance < bestD) { bestD = hit.distance; best = i; }
    });
    if (best >= 0) return best;
    // forgiving fallback for small targets: nearest hub within 40 px
    let near = -1, nd = 40;
    this.sim.farm.turbines.forEach((t, i) => {
      const p = new THREE.Vector3(...t.hub).project(this.camera);
      if (p.z > 1) return;
      const sx = rect.left + ((p.x + 1) / 2) * rect.width, sy = rect.top + ((1 - p.y) / 2) * rect.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < nd) { nd = d; near = i; }
    });
    return near;
  }

  // Copy yaw and pitch from the physics state into the meshes.
  syncTurbines() {
    this.sim.farm.turbines.forEach((t, i) => this.turbines[i].orient(t.basis, t.op.pitch));
  }

  frame(dtReal, running, visible = true) {
    if (!visible) return;
    if (running) {
      this.stepParticles(dtReal * VISUAL.timeScale);
      this.sim.farm.turbines.forEach((t, i) => this.turbines[i].setAzimuth(this.turbines[i].psi + t.op.omega * dtReal));
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Compare rendered geometry with the physics conventions (blade tips and chord lines).
  selfCheck() {
    const THREE = this.THREE, R = this.sim.model.rotor.R, sec = this.sim.model.rotor.sections[12];
    this.scene.updateMatrixWorld(true);
    let tipErr = 0, chordErr = 0;
    this.sim.farm.turbines.forEach((t, i) => {
      const h = this.turbines[i];
      h.pitchGroups.forEach((pg, k) => {
        const psi = h.psi + (2 * Math.PI * k) / this.sim.model.rotor.B;
        const tip = new THREE.Vector3(0, R, 0).applyMatrix4(pg.matrixWorld);
        const want = bladeDirection(t.basis, psi).map((c, j) => t.hub[j] + R * c);
        tipErr = Math.max(tipErr, tip.distanceTo(new THREE.Vector3(...want)));
        const th = sec.twist + t.op.pitch;
        const local = new THREE.Vector3(Math.cos(sec.twist), 0, Math.sin(sec.twist)); // chord at θ = twist in mesh frame
        const q = new THREE.Quaternion(); pg.getWorldQuaternion(q); local.applyQuaternion(q);
        const ref = sectionFrame(t.basis, psi, th).chord;
        chordErr = Math.max(chordErr, local.distanceTo(new THREE.Vector3(...ref)));
      });
    });
    return { tipError_m: tipErr, chordDirectionError: chordErr };
  }

  disposeGroup() {
    if (!this.group) return;
    this.setSelected(null);
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.name === 'terrain' || o.isLineSegments || o.isPoints) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.factory?.dispose();
    this.selGroup = null;
    this.group = null;
  }
}
