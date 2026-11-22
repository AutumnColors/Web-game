// UI wiring: scenario and layout controls, URL state, view switch, turbine selection shared by
// all views and the learning panel, and the build mode (place / move / remove turbines).
// URL: #scenario=…&seed=…&view=3d|top|side&t=<id>[&layout=build&L=id:x:z,id:x:z,…]
import { createSimulation, SCENARIOS } from './physics/index.js';
import { interestingTurbine } from './physics/diagnostics.js';
import { loadThree } from './render/three-loader.js';
import { FarmView, VISUAL } from './render/scene.js';
import { PlanView } from './render/plan-views.js';
import { InfoPanel } from './render/panel.js';
import { COLOR_MODES, cssGradient } from './render/colors.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const fail = (msg) => (window.windLabError ? window.windLabError(msg) : alert(msg));
const VIEWS = ['3d', 'top', 'side'];

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const scenario = SCENARIOS[p.get('scenario')] ? p.get('scenario') : 'coast';
  const seed = parseInt(p.get('seed'), 10);
  const build = p.get('layout') === 'build';
  const positions = build && p.get('L')
    ? p.get('L').split(',').map((s) => s.split(':').map(Number)).filter((a) => a.length === 3 && a.every(Number.isFinite)).map(([id, x, z]) => ({ id, x, z }))
    : [];
  return {
    scenario, seed: Number.isFinite(seed) && seed > 0 ? seed : 1 + Math.floor(Math.random() * 99999),
    view: VIEWS.includes(p.get('view')) ? p.get('view') : (build ? 'top' : '3d'),
    turbine: parseInt(p.get('t'), 10) || null, build, positions,
  };
}
function bearingFrom(direction) {
  // flow towards (cos d, sin d) in (x = east, z = south); report the compass direction it comes FROM
  const b = (Math.atan2(-Math.cos(direction), Math.sin(direction)) * 180) / Math.PI;
  return Math.round((b + 360) % 360);
}
function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

async function start() {
  if (!webglAvailable()) return fail('WebGL is not available in this browser, so the 3D view cannot start.');
  statusEl.textContent = 'Loading three.js…';
  const { THREE } = await loadThree();
  const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
  statusEl.textContent = 'Computing turbine aerodynamics…';
  await new Promise((r) => setTimeout(r, 0)); // let the status paint before the BEM table is built

  const stage = $('stage');
  const view = new FarmView(THREE, stage, { mobile });
  const plan = new PlanView(stage, { mobile, onPick: (id) => select(id), onPlace: (x, z) => place(x, z), onMove: (id, x, z, final) => move(id, x, z, final) });
  const panel = new InfoPanel($('panel'), { onSelect: (id) => select(id), onRemove: (id) => remove(id), onClear: () => clearAll() });
  let state = readHash(), sim = null, selectedId = null, running = true, clock = 0, lastSolve = 0, lastSlow = 0, lastDrag = 0;
  const selected = () => (sim ? sim.farm.turbines.find((t) => t.id === selectedId) || null : null);

  function writeHash() {
    let h = `#scenario=${state.scenario}&seed=${state.seed}&view=${state.view}${selectedId ? '&t=' + selectedId : ''}`;
    if (state.build) h += '&layout=build&L=' + sim.positions().map((p) => `${p.id}:${Math.round(p.x)}:${Math.round(p.z)}`).join(',');
    history.replaceState(null, '', h);
  }

  function describe() {
    const s = sim.summary, a = sim.atmosphere.state, n = sim.farm.turbines.length;
    return `${sim.label} · seed ${sim.seed} · wind ${a.uRef.toFixed(1)} m/s from ${bearingFrom(a.direction)}° · `
      + (n ? `${n} turbine${n > 1 ? 's' : ''} · ${(s.power / 1e6).toFixed(1)} MW (wake loss ${(100 * s.wakeLoss).toFixed(1)} %)` : 'no turbines yet');
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }

  function select(id) {
    selectedId = id;
    const t = selected();
    view.setSelected(t); plan.setSelected(t); panel.update(sim, t, { build: state.build });
    writeHash();
  }

  // Everything that depends on the layout, after it changed.
  function layoutChanged({ light = false } = {}) {
    if (!selected()) selectedId = null;
    const t = selected();
    if (!light || state.view === '3d') { view.rebuildTurbines(); view.setSelected(t); }
    plan.refresh(t, { coarse: light });
    panel.update(sim, t, { build: state.build });
    statusEl.textContent = describe();
    if (!light) writeHash();
  }

  function place(x, z) {
    const ok = sim.canPlace(x, z);
    if (!ok.ok) return toast('Cannot place here: ' + ok.reason);
    sim.setLayout([...sim.positions(), { x, z }]);
    const ids = sim.farm.turbines.map((t) => t.id);
    selectedId = Math.max(...ids);
    layoutChanged();
  }

  function move(id, x, z, final) {
    const now = performance.now();
    if (!final && now - lastDrag < 90) return; // keep dragging smooth on phones
    lastDrag = now;
    const ok = sim.canPlace(x, z, id);
    if (!ok.ok) { if (final) { toast('Cannot place here: ' + ok.reason); layoutChanged(); } return; }
    sim.setLayout(sim.positions().map((p) => (p.id === id ? { id, x, z } : p)));
    selectedId = id;
    layoutChanged({ light: !final });
  }

  function remove(id) {
    sim.setLayout(sim.positions().filter((p) => p.id !== id));
    selectedId = null;
    layoutChanged();
  }

  function clearAll() { sim.setLayout([]); selectedId = null; layoutChanged(); }

  function setView(v) {
    state.view = v;
    for (const b of $('viewSwitch').children) b.classList.toggle('on', b.dataset.view === v);
    plan.show(v);
    writeHash();
  }

  function showLegend() {
    const m = COLOR_MODES[view.colorMode], st = m.stops;
    $('legendLabel').textContent = m.label;
    $('legendBar').style.background = cssGradient(view.colorMode);
    $('legend').querySelectorAll('.ends span').forEach((el, i) => { el.textContent = i ? st[st.length - 1][0] : st[0][0]; });
    $('legend').hidden = false;
  }

  // keep: positions to carry over (build mode, new map or new scenario) — invalid ones are dropped
  function build(keep = null) {
    $('scenario').value = state.scenario;
    $('layoutMode').value = state.build ? 'build' : 'random';
    sim = createSimulation({ scenario: state.scenario, seed: state.seed, layout: state.build ? [] : 'random' });
    if (state.build) {
      const wanted = keep ?? state.positions, accepted = [];
      for (const p of wanted) {
        if (sim.canPlace(p.x, p.z).ok) { accepted.push(p); sim.setLayout(accepted); }
      }
      if (accepted.length < wanted.length) toast(`${wanted.length - accepted.length} turbine(s) did not fit on this map and were left out`);
      state.positions = [];
    }
    view.setSimulation(sim);
    selectedId = state.turbine ?? (sim.farm.turbines.length ? (interestingTurbine(sim) || sim.farm.turbines[0]).id : null);
    if (!selected()) selectedId = null;
    state.turbine = null;
    const t = selected();
    view.setSelected(t);
    plan.build = state.build;
    plan.setSimulation(sim, t);
    panel.update(sim, t, { build: state.build });
    setView(state.view);
    clock = 0; lastSolve = 0;
    statusEl.textContent = describe();
    showLegend();
    const chk = view.selfCheck();
    if (chk.tipError_m > 0.01 || chk.chordDirectionError > 1e-4) console.warn('Render/physics geometry mismatch', chk);
    window.windLab = { THREE, sim, view, plan, panel, selfCheck: () => view.selfCheck(), select, setView, place, move, remove, get selected() { return selected(); } };
  }

  $('scenario').onchange = (e) => { const keep = state.build ? sim.positions() : null; state = { ...state, scenario: e.target.value }; build(keep); };
  $('layoutMode').onchange = (e) => {
    state = { ...state, build: e.target.value === 'build', positions: [] };
    if (state.build && state.view === '3d') state.view = 'top'; // placing is easiest from above
    build(state.build ? [] : null);
  };
  $('random').onclick = () => { const keep = state.build ? sim.positions() : null; state = { ...state, seed: 1 + Math.floor(Math.random() * 99999) }; build(keep); };
  $('pause').onclick = (e) => { running = !running; e.target.textContent = running ? 'Pause' : 'Play'; };
  $('reset').onclick = () => view.controls.reset();
  $('viewSwitch').onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
  $('legend').onclick = () => {
    const m = view.colorMode === 'speed' ? 'wake' : 'speed';
    view.setColorMode(m); plan.setColorMode(m); showLegend();
  };
  // tap (not drag) on the 3D view: select a turbine, or (build mode) place one on the ground
  let down = null;
  view.renderer.domElement.addEventListener('pointerdown', (e) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  view.renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500) {
      const i = view.pick(e.clientX, e.clientY);
      if (i >= 0) select(sim.farm.turbines[i].id);
      else if (state.build) { const g = view.pickGround(e.clientX, e.clientY); if (g) place(g[0], g[1]); }
    }
    down = null;
  });
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (h.scenario !== state.scenario || h.seed !== state.seed || h.build !== state.build) { state = h; build(); }
  });

  build();
  window.windLabReady = true;

  let prev = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000));
    prev = now;
    if (running) {
      clock += dt * VISUAL.timeScale;
      // quasi-steady update of yaw, pitch, rotor speed and wakes for time-varying wind
      if (sim.atmosphere.isVariable && clock - lastSolve > 0.5) {
        sim.update(clock); lastSolve = clock; view.syncTurbines();
        if (now - lastSlow > 1500) { // heavier refreshes at most every 1.5 s
          lastSlow = now; statusEl.textContent = describe();
          const t = selected();
          view.setSelected(t); plan.refreshField(); panel.update(sim, t);
        }
      }
    }
    view.frame(dt, running, state.view === '3d');
    plan.frame(dt * VISUAL.timeScale, running);
  }
  requestAnimationFrame(frame);
}

start().catch((e) => { console.error(e); fail(e && e.message ? e.message : String(e)); });
