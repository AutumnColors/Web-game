// UI wiring: minimal controls, URL state (#scenario=…&seed=…), status line.
import { createSimulation, SCENARIOS } from './physics/index.js';
import { loadThree } from './render/three-loader.js';
import { FarmView, VISUAL } from './render/scene.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const fail = (msg) => (window.windLabError ? window.windLabError(msg) : alert(msg));

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const scenario = SCENARIOS[p.get('scenario')] ? p.get('scenario') : 'coast';
  const seed = parseInt(p.get('seed'), 10);
  return { scenario, seed: Number.isFinite(seed) && seed > 0 ? seed : 1 + Math.floor(Math.random() * 99999) };
}
function writeHash(scenario, seed) {
  history.replaceState(null, '', `#scenario=${scenario}&seed=${seed}`);
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

  const view = new FarmView(THREE, $('view'), { mobile });
  let state = readHash(), sim = null, running = true, clock = 0, lastSolve = 0, lastStatus = -1;

  function describe() {
    const s = sim.summary, a = sim.atmosphere.state;
    return `${sim.label} · seed ${sim.seed} · wind ${a.uRef.toFixed(1)} m/s at 90 m from ${bearingFrom(a.direction)}° · `
      + `farm ${(s.power / 1e6).toFixed(1)} MW of ${(s.freePower / 1e6).toFixed(1)} MW wake-free (wake loss ${(100 * s.wakeLoss).toFixed(1)} %)` + (mobile ? '' : ' · ')
      + (mobile ? '' : `12 × NREL 5-MW reference · particles ${VISUAL.timeScale}× real time`);
  }

  function build() {
    $('scenario').value = state.scenario;
    writeHash(state.scenario, state.seed);
    sim = createSimulation(state);
    view.setSimulation(sim);
    clock = 0; lastSolve = 0;
    statusEl.textContent = describe();
    showLegend();
    const chk = view.selfCheck();
    if (chk.tipError_m > 0.01 || chk.chordDirectionError > 1e-4) console.warn('Render/physics geometry mismatch', chk);
    window.windLab = { THREE, sim, view, selfCheck: () => view.selfCheck() };
  }

  $('scenario').onchange = (e) => { state = { ...state, scenario: e.target.value }; build(); };
  $('random').onclick = () => { state = { ...state, seed: 1 + Math.floor(Math.random() * 99999) }; build(); };
  $('pause').onclick = (e) => { running = !running; e.target.textContent = running ? 'Pause' : 'Play'; };
  $('reset').onclick = () => view.controls.reset();
  function showLegend() {
    const m = VISUAL.colorModes[view.colorMode], st = m.stops, lo = st[0][0], hi = st[st.length - 1][0];
    $('legendLabel').textContent = m.label;
    $('legendBar').style.background = 'linear-gradient(90deg,' + st.map(([v, c]) => '#' + c.toString(16).padStart(6, '0') + ' ' + (100 * (v - lo) / (hi - lo)).toFixed(0) + '%').join(',') + ')';
    $('legend').querySelectorAll('.ends span').forEach((el, i) => { el.textContent = i ? hi : lo; });
    $('legend').hidden = false;
  }
  $('legend').onclick = () => { view.setColorMode(view.colorMode === 'speed' ? 'wake' : 'speed'); showLegend(); };
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
        if (now - lastStatus > 500) { statusEl.textContent = describe(); lastStatus = now; }
      }
    }
    view.frame(dt, running);
  }
  requestAnimationFrame(frame);
}

start().catch((e) => { console.error(e); fail(e && e.message ? e.message : String(e)); });
