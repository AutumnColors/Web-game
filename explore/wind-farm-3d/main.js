// UI wiring: scenario controls, URL state (#scenario=…&seed=…&view=…&t=…), view switch,
// turbine selection shared by all views and the learning panel.
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
  return {
    scenario, seed: Number.isFinite(seed) && seed > 0 ? seed : 1 + Math.floor(Math.random() * 99999),
    view: VIEWS.includes(p.get('view')) ? p.get('view') : '3d', turbine: parseInt(p.get('t'), 10) || null,
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
  const plan = new PlanView(stage, { mobile, onPick: (id) => select(id) });
  const panel = new InfoPanel($('panel'), { onSelect: (id) => select(id) });
  let state = readHash(), sim = null, selected = null, running = true, clock = 0, lastSolve = 0, lastSlow = 0;

  const writeHash = () => history.replaceState(null, '', `#scenario=${state.scenario}&seed=${state.seed}&view=${state.view}${selected ? '&t=' + selected.id : ''}`);

  function describe() {
    const s = sim.summary, a = sim.atmosphere.state;
    return `${sim.label} · seed ${sim.seed} · wind ${a.uRef.toFixed(1)} m/s from ${bearingFrom(a.direction)}° · `
      + `farm ${(s.power / 1e6).toFixed(1)} MW (wake loss ${(100 * s.wakeLoss).toFixed(1)} %)`;
  }

  function select(id) {
    selected = sim.farm.turbines.find((t) => t.id === id) || selected;
    view.setSelected(selected); plan.setSelected(selected); panel.update(sim, selected);
    writeHash();
  }

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

  function build() {
    $('scenario').value = state.scenario;
    sim = createSimulation(state);
    view.setSimulation(sim);
    selected = sim.farm.turbines.find((t) => t.id === state.turbine) || interestingTurbine(sim);
    state.turbine = null;
    view.setSelected(selected);
    plan.setSimulation(sim, selected);
    panel.update(sim, selected);
    setView(state.view);
    clock = 0; lastSolve = 0;
    statusEl.textContent = describe();
    showLegend();
    const chk = view.selfCheck();
    if (chk.tipError_m > 0.01 || chk.chordDirectionError > 1e-4) console.warn('Render/physics geometry mismatch', chk);
    window.windLab = { THREE, sim, view, plan, panel, selfCheck: () => view.selfCheck(), select, setView, get selected() { return selected; } };
  }

  $('scenario').onchange = (e) => { state = { ...state, scenario: e.target.value }; build(); };
  $('random').onclick = () => { state = { ...state, seed: 1 + Math.floor(Math.random() * 99999) }; build(); };
  $('pause').onclick = (e) => { running = !running; e.target.textContent = running ? 'Pause' : 'Play'; };
  $('reset').onclick = () => view.controls.reset();
  $('viewSwitch').onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
  $('legend').onclick = () => {
    const m = view.colorMode === 'speed' ? 'wake' : 'speed';
    view.setColorMode(m); plan.setColorMode(m); showLegend();
  };
  // tap (not drag) on the 3D view selects a turbine
  let down = null;
  view.renderer.domElement.addEventListener('pointerdown', (e) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  view.renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 500) {
      const i = view.pick(e.clientX, e.clientY);
      if (i >= 0) select(sim.farm.turbines[i].id);
    }
    down = null;
  });
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (h.scenario !== state.scenario || h.seed !== state.seed) { state = h; build(); }
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
          view.setSelected(selected); plan.refreshField(); panel.update(sim, selected);
        }
      }
    }
    view.frame(dt, running, state.view === '3d');
    plan.frame(dt * VISUAL.timeScale, running);
  }
  requestAnimationFrame(frame);
}

start().catch((e) => { console.error(e); fail(e && e.message ? e.message : String(e)); });
