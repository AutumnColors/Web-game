// 2D views of the same physics field, drawn on a canvas (no three.js):
//   'top'  – horizontal cut at hub height above the local ground, seen from above (north up)
//   'side' – vertical cut through the selected turbine, along its rotor axis (wind left → right)
// These are slices (cuts) of the 3D field, not projections: a projection would pile all heights
// on top of each other, a slice shows the wind exactly at the plane drawn.
import { rampRGB } from './colors.js';
import { sliceTop, sliceSide, profilesAt } from '../physics/diagnostics.js';

const PAD = { l: 12, r: 12, t: 74, b: 58 }; // top: view switch + legend overlays; bottom: captions
const TRACER_SECONDS = { top: 15, side: 10 };
const PROFILE_STATIONS_D = [-2, 3, 7, 12];

export class PlanView {
  constructor(stage, { mobile, onPick }) {
    this.stage = stage; this.mobile = mobile; this.onPick = onPick;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'plan';
    this.canvas.hidden = true;
    stage.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.mode = 'top'; this.colorMode = 'speed';
    this.img = document.createElement('canvas');
    this.tracers = null;
    new ResizeObserver(() => this.resize()).observe(stage);
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.t < 600) this.tap(e);
      down = null;
    });
  }

  show(mode) {
    this.mode = mode;
    this.canvas.hidden = !(mode === 'top' || mode === 'side');
    if (!this.canvas.hidden) { this.resize(); this.refreshField(); this.resetTracers(); }
  }

  setSimulation(sim, selected) { this.sim = sim; this.selected = selected; if (!this.canvas.hidden) { this.refreshField(); this.resetTracers(); } }
  setSelected(t) { this.selected = t; if (this.mode === 'side' && !this.canvas.hidden) { this.refreshField(); this.resetTracers(); } }
  setColorMode(m) { this.colorMode = m; this.buildImage(); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.canvas.width = Math.max(1, Math.round(w * dpr)); this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.dpr = dpr; this.W = w; this.H = h;
    this.layout();
  }

  layout() {
    if (!this.sim) return;
    const w = this.W - PAD.l - PAD.r, h = this.H - PAD.t - PAD.b;
    if (this.mode === 'top') {
      const b = this.sim.terrain.bounds, k = Math.min(w / (b.xMax - b.xMin), h / (b.zMax - b.zMin));
      const ww = k * (b.xMax - b.xMin), hh = k * (b.zMax - b.zMin);
      this.map = { k, ox: PAD.l + (w - ww) / 2, oy: PAD.t + (h - hh) / 2, ww, hh };
    } else if (this.field && this.field.kind === 'side') {
      const f = this.field;
      this.map = { kx: w / (f.sMax - f.sMin), ky: h / (f.yMax - f.yMin), ox: PAD.l, oy: PAD.t, ww: w, hh: h };
      this.map.exaggeration = this.map.ky / this.map.kx;
    }
  }

  // world → screen
  topXY(x, z) { const m = this.map, b = this.sim.terrain.bounds; return [m.ox + (x - b.xMin) * m.k, m.oy + (z - b.zMin) * m.k]; }
  sideXY(s, y) { const m = this.map, f = this.field; return [m.ox + (s - f.sMin) * m.kx, m.oy + (f.yMax - y) * m.ky]; }

  refreshField() {
    if (!this.sim) return;
    if (this.mode === 'top') {
      this.field = { kind: 'top', ...sliceTop(this.sim, this.mobile ? { nx: 120, nz: 90 } : { nx: 160, nz: 120 }) };
    } else if (this.mode === 'side' && this.selected) {
      this.field = { kind: 'side', ...sliceSide(this.sim, this.selected, this.mobile ? { ns: 160, ny: 70 } : {}) };
      this.profiles = profilesAt(this.sim, this.selected, PROFILE_STATIONS_D);
    }
    this.layout();
    this.buildImage();
  }

  buildImage() {
    const f = this.field;
    if (!f) return;
    const nx = f.kind === 'top' ? f.nx : f.ns, ny = f.kind === 'top' ? f.nz : f.ny;
    this.img.width = nx; this.img.height = ny;
    const ictx = this.img.getContext('2d'), data = ictx.createImageData(nx, ny), ramp = rampRGB(this.colorMode), c = [0, 0, 0];
    const uRef = this.sim.atmosphere.state.uRef;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, row = f.kind === 'top' ? j : ny - 1 - j; // side: y up
      const sp = f.speed[k], o = (row * nx + i) * 4;
      if (Number.isNaN(sp)) { data.data[o + 3] = 0; continue; }
      ramp(this.colorMode === 'wake' ? (f.free[k] > 0 ? sp / f.free[k] : 1) : sp / uRef, c);
      data.data[o] = c[0] * 255; data.data[o + 1] = c[1] * 255; data.data[o + 2] = c[2] * 255; data.data[o + 3] = 255;
    }
    ictx.putImageData(data, 0, 0);
  }

  resetTracers() {
    const n = this.mode === 'top' ? (this.mobile ? 500 : 900) : (this.mobile ? 300 : 500);
    this.tracers = { n, a: new Float32Array(n), b: new Float32Array(n), age: new Float32Array(n), life: new Float32Array(n), va: new Float32Array(n), vb: new Float32Array(n) };
    for (let i = 0; i < n; i++) { this.spawn(i); this.tracers.age[i] = Math.random() * this.tracers.life[i]; }
  }

  spawn(i) {
    const T = this.tracers, f = this.field;
    if (!f) return;
    if (f.kind === 'top') {
      const b = f.bounds;
      T.a[i] = b.xMin + Math.random() * (b.xMax - b.xMin); T.b[i] = b.zMin + Math.random() * (b.zMax - b.zMin);
    } else {
      const s = f.sMin + Math.random() * (f.sMax - f.sMin), g = this.groundAt(s);
      T.a[i] = s; T.b[i] = g + 2 + Math.random() * (f.yMax - g - 2);
    }
    T.age[i] = 0; T.life[i] = 20 + Math.random() * 40;
  }

  groundAt(s) {
    const f = this.field, u = ((s - f.sMin) / (f.sMax - f.sMin)) * f.ns - 0.5, i = Math.max(0, Math.min(f.ns - 1, Math.round(u)));
    return f.ground[i];
  }

  step(dt) {
    const T = this.tracers, f = this.field, sim = this.sim, v = [0, 0, 0, 1];
    if (!T || !f) return;
    const hub = sim.model.def.hubHeight;
    for (let i = 0; i < T.n; i++) {
      if (f.kind === 'top') {
        const x = T.a[i], z = T.b[i];
        sim.velocity(x, sim.terrain.height(x, z) + hub, z, v);
        T.va[i] = v[0]; T.vb[i] = v[2];
        T.a[i] += v[0] * dt; T.b[i] += v[2] * dt;
        const b = f.bounds;
        if (T.a[i] < b.xMin || T.a[i] > b.xMax || T.b[i] < b.zMin || T.b[i] > b.zMax) this.spawn(i);
      } else {
        const t = this.selected, n = t.basis.n, s = T.a[i], y = T.b[i];
        sim.velocity(t.hub[0] + s * n[0], y, t.hub[2] + s * n[2], v);
        const us = v[0] * n[0] + v[2] * n[2];
        T.va[i] = us; T.vb[i] = v[1];
        T.a[i] += us * dt; T.b[i] += v[1] * dt;
        if (T.a[i] > f.sMax || T.a[i] < f.sMin || T.b[i] > f.yMax || T.b[i] < this.groundAt(T.a[i]) + 1) this.spawn(i);
      }
      T.age[i] += dt;
      if (T.age[i] > T.life[i]) this.spawn(i);
    }
  }

  frame(dtSim, running) {
    if (this.canvas.hidden || !this.field) return;
    if (running) this.step(dtSim);
    const ctx = this.ctx, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.field.kind === 'top') this.drawTop(ctx); else this.drawSide(ctx);
  }

  clipToMap(ctx, fn) {
    const m = this.map;
    ctx.save(); ctx.beginPath(); ctx.rect(m.ox, m.oy, m.ww, m.hh); ctx.clip(); fn(); ctx.restore();
  }

  drawTracers(ctx, toXY) {
    const T = this.tracers, tau = TRACER_SECONDS[this.field.kind];
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    for (let i = 0; i < T.n; i++) {
      const fade = Math.min(1, T.age[i] / 2, (T.life[i] - T.age[i]) / 2);
      if (fade <= 0.05) continue;
      const [x1, y1] = toXY(T.a[i], T.b[i]), [x0, y0] = toXY(T.a[i] - T.va[i] * tau, T.b[i] - T.vb[i] * tau);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }

  drawTop(ctx) {
    const m = this.map, sim = this.sim, R = sim.model.rotor.R, D = sim.model.D;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, m.ox, m.oy, m.ww, m.hh);
    this.clipToMap(ctx, () => this.drawTracers(ctx, (x, z) => this.topXY(x, z)));
    // selected turbine: the side-view cut line
    const sel = this.selected;
    if (sel) {
      const n = sel.basis.n, [ax, ay] = this.topXY(sel.hub[0] - 4 * D * n[0], sel.hub[2] - 4 * D * n[2]);
      const [bx, by] = this.topXY(sel.hub[0] + 18 * D * n[0], sel.hub[2] + 18 * D * n[2]);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (const t of sim.farm.turbines) {
      const r = t.basis.right, [x1, y1] = this.topXY(t.hub[0] - R * r[0], t.hub[2] - R * r[2]), [x2, y2] = this.topXY(t.hub[0] + R * r[0], t.hub[2] + R * r[2]);
      const isSel = t === sel;
      ctx.strokeStyle = isSel ? '#ffd65a' : '#ffffff'; ctx.lineWidth = isSel ? 4 : 3;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [tx, ty] = this.topXY(t.x, t.z);
      ctx.fillStyle = isSel ? '#ffd65a' : '#ffffff';
      ctx.fillText('T' + t.id, tx + 7, ty - 9);
    }
    // wind arrow + scale bar
    const st = sim.atmosphere.state, cx = m.ox + m.ww - 40, cy = m.oy + m.hh - 44, L = 20;
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - L * st.cos, cy - L * st.sin); ctx.lineTo(cx + L * st.cos, cy + L * st.sin); ctx.stroke();
    const ang = Math.atan2(st.sin, st.cos);
    ctx.beginPath(); ctx.moveTo(cx + L * st.cos, cy + L * st.sin);
    ctx.lineTo(cx + L * st.cos - 8 * Math.cos(ang - 0.45), cy + L * st.sin - 8 * Math.sin(ang - 0.45));
    ctx.lineTo(cx + L * st.cos - 8 * Math.cos(ang + 0.45), cy + L * st.sin - 8 * Math.sin(ang + 0.45)); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillText('wind', cx, cy + 30); ctx.fillText('N ↑', m.ox + m.ww - 16, m.oy + 12); ctx.textAlign = 'left';
    const bar = 1000 * m.k, bx0 = m.ox + 10, by0 = m.oy + m.hh - 12;
    ctx.fillRect(bx0, by0, bar, 3); ctx.fillText('1 km', bx0 + bar + 6, by0 + 1);
    this.caption(`From above · cut at ${sim.model.def.hubHeight} m above the ground (hub height) · tap a turbine`);
  }

  drawSide(ctx) {
    const m = this.map, f = this.field, sim = this.sim, t = this.selected, D = f.D, R = f.R, uRef = sim.atmosphere.state.uRef;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, m.ox, m.oy, m.ww, m.hh);
    // ground
    ctx.beginPath();
    for (let i = 0; i < f.ns; i++) {
      const s = f.sMin + ((i + 0.5) / f.ns) * (f.sMax - f.sMin), [x, y] = this.sideXY(s, f.ground[i]);
      if (i === 0) ctx.moveTo(m.ox, y); ctx.lineTo(x, y);
    }
    ctx.lineTo(m.ox + m.ww, this.sideXY(f.sMax, f.ground[f.ns - 1])[1]);
    ctx.lineTo(m.ox + m.ww, m.oy + m.hh); ctx.lineTo(m.ox, m.oy + m.hh); ctx.closePath();
    ctx.fillStyle = '#2e3f2c'; ctx.fill();
    this.clipToMap(ctx, () => this.drawTracers(ctx, (s, y) => this.sideXY(s, y)));
    // velocity profiles: horizontal offset ∝ axial speed (1 × U_ref = 1.2 D)
    const w1 = 1.2 * D * m.kx;
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    for (const p of this.profiles) {
      const [x0] = this.sideXY(p.sD * D, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x0, this.sideXY(0, p.ground)[1]); ctx.lineTo(x0, m.oy); ctx.stroke();
      for (const [key, dash, col] of [['u0', [4, 3], 'rgba(255,255,255,0.7)'], ['u', [], '#ffffff']]) {
        ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = key === 'u' ? 2 : 1.3;
        ctx.beginPath();
        p.pts.forEach((q, k) => { const [, y] = this.sideXY(0, q.y), x = x0 + (q[key] / uRef) * w1; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      }
      ctx.setLineDash([]); ctx.fillStyle = '#fff';
      ctx.fillText(p.sD === 0 ? 'rotor' : `${p.sD > 0 ? '+' : ''}${p.sD}D`, x0 + 3, m.oy + m.hh + 14);
    }
    // turbines in (or near) this plane
    for (const o of f.nearby) {
      const [x, yHub] = this.sideXY(o.s, o.hubY), [, yBase] = this.sideXY(o.s, o.baseY), [, yTop] = this.sideXY(o.s, o.hubY + R), [, yBot] = this.sideXY(o.s, o.hubY - R);
      const col = o.self ? '#ffd65a' : 'rgba(255,255,255,0.85)';
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, yBase); ctx.lineTo(x, yHub); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yBot); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, yHub, 3.5, 0, 7); ctx.fill();
      const off = Math.abs(o.offset) > 5 ? ` (${Math.round(Math.abs(o.offset))} m to the side)` : '';
      const label = `T${o.id}${off}`;
      ctx.fillText(label, Math.min(x + 6, m.ox + m.ww - ctx.measureText(label).width - 4), yTop - 6);
    }
    // height ticks (above this turbine's base)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.textAlign = 'right';
    for (let h = 0; h <= f.yMax - t.base; h += 100) {
      const [, y] = this.sideXY(0, t.base + h);
      if (y > m.oy + 8 && y < m.oy + m.hh) ctx.fillText(h + ' m', m.ox + m.ww - 4, y + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillText('wind →', m.ox + 6, m.oy + 14);
    this.caption(`Side cut through T${t.id} along the wind · height stretched ×${m.exaggeration.toFixed(1)} · `
      + 'profiles: solid = with wakes, dashed = no turbines');
  }

  caption(text) {
    const ctx = this.ctx;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(230,243,248,0.85)'; ctx.textBaseline = 'alphabetic';
    const words = text.split(' '), maxW = this.W - 24, lines = [''];
    for (const w of words) { const tryL = lines[lines.length - 1] + (lines[lines.length - 1] ? ' ' : '') + w; if (ctx.measureText(tryL).width > maxW) lines.push(w); else lines[lines.length - 1] = tryL; }
    lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, 12, this.H - PAD.b + 30 + i * 15));
  }

  tap(e) {
    if (!this.sim) return;
    const rect = this.canvas.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    let best = null, bestD = 30;
    for (const t of this.sim.farm.turbines) {
      let x, y;
      if (this.field.kind === 'top') [x, y] = this.topXY(t.x, t.z);
      else {
        const o = this.field.nearby.find((q) => q.id === t.id);
        if (!o) continue;
        [x, y] = this.sideXY(o.s, o.hubY);
        const [, yb] = this.sideXY(o.s, o.baseY);
        if (py > y && py < yb) y = py; // anywhere on the tower
      }
      const dd = Math.hypot(px - x, py - y);
      if (dd < bestD) { bestD = dd; best = t; }
    }
    if (best) this.onPick(best.id);
  }
}
