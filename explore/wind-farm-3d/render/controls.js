// Orbit camera for a landscape, written for both mouse and touch (Pointer Events).
//   one finger / left mouse     orbit
//   two fingers                 pinch = zoom, drag = pan, twist = turn
//   right mouse or shift+drag   pan (map-like, in the horizontal plane)
//   wheel                       zoom
// The orbit centre follows the terrain while panning and the camera never goes below ground.

export class OrbitCamera {
  constructor(camera, dom, { groundHeight, bounds, home }) {
    this.camera = camera; this.dom = dom; this.ground = groundHeight; this.bounds = bounds;
    this.home = { ...home };
    this.minDistance = 40; this.maxDistance = 9000;
    this.minElev = 2 * Math.PI / 180; this.maxElev = 88 * Math.PI / 180;
    this.pointers = new Map();
    this.reset();
    const on = (t, f, o) => dom.addEventListener(t, f, o);
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) on(t, (e) => this.up(e));
    on('wheel', (e) => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015))); }, { passive: false });
    on('contextmenu', (e) => e.preventDefault());
    dom.style.touchAction = 'none';
  }

  reset() {
    const h = this.home;
    this.target = [h.target[0], 0, h.target[2]];
    this.targetLift = h.target[1];
    this.distance = h.distance; this.azimuth = h.azimuth; this.elevation = h.elevation;
    this.update();
  }

  down(e) {
    try { this.dom.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, pan: e.button === 2 || e.shiftKey || e.ctrlKey });
    this.gesture = null;
  }

  up(e) { this.pointers.delete(e.pointerId); this.gesture = null; }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (this.pointers.size === 1) {
      if (p.pan) this.pan(dx, dy); else this.rotate(dx, dy);
      p.x = e.clientX; p.y = e.clientY;
      return;
    }
    // two (or more) pointers: use the first two
    p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...this.pointers.values()];
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2], dist = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (this.gesture) {
      if (dist > 0 && this.gesture.dist > 0) this.zoom(this.gesture.dist / dist);
      this.pan(mid[0] - this.gesture.mid[0], mid[1] - this.gesture.mid[1]);
      let da = ang - this.gesture.ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.azimuth -= da;
    }
    this.gesture = { mid, dist, ang };
    this.update();
  }

  rotate(dx, dy) {
    const k = (2 * Math.PI) / Math.max(300, this.dom.clientHeight) * 0.6;
    this.azimuth -= dx * k;
    this.elevation = Math.min(this.maxElev, Math.max(this.minElev, this.elevation + dy * k));
    this.update();
  }

  zoom(f) {
    this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance * f));
    this.update();
  }

  pan(dx, dy) {
    const fov = (this.camera.fov * Math.PI) / 180;
    const s = (2 * this.distance * Math.tan(fov / 2)) / Math.max(1, this.dom.clientHeight);
    const fx = -Math.cos(this.azimuth), fz = -Math.sin(this.azimuth); // horizontal forward (camera → target)
    const rx = -fz, rz = fx;                                            // right = forward × up
    this.target[0] += (-dx * rx + dy * fx) * s;
    this.target[2] += (-dx * rz + dy * fz) * s;
    const b = this.bounds;
    this.target[0] = Math.min(b.xMax, Math.max(b.xMin, this.target[0]));
    this.target[2] = Math.min(b.zMax, Math.max(b.zMin, this.target[2]));
    this.update();
  }

  update() {
    const t = this.target;
    t[1] = this.ground(t[0], t[2]) + this.targetLift;
    const ce = Math.cos(this.elevation);
    let x = t[0] + this.distance * ce * Math.cos(this.azimuth);
    let z = t[2] + this.distance * ce * Math.sin(this.azimuth);
    let y = t[1] + this.distance * Math.sin(this.elevation);
    const floor = this.ground(x, z) + 8;
    if (y < floor) y = floor;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(t[0], t[1], t[2]);
  }
}
