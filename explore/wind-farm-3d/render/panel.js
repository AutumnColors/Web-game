// Learning panel: the selected turbine's story as expandable cards, the farm table and the model list.
// Reads physics diagnostics only.
import { turbineReport, spanwise } from '../physics/diagnostics.js';
import { REGISTRY } from '../physics/index.js';

const CHIPS = {
  exact: ['exact', 'Definition or exact physical law'],
  theory: ['theory', 'Ideal momentum theory (exact for an ideal rotor)'],
  literature: ['published model', 'Published engineering model, implemented and checked against its own derivation'],
  approx: ['approximate', 'Our approximation — plausible, not validated'],
  reference: ['reference design', 'NREL 5-MW reference turbine specification'],
  numerical: ['numerical', 'Solver setting (tolerance, smoothing, sampling) — not physics'],
};
const REGISTRY_CHIP = { standard: 'exact', 'reference-design': 'reference', literature: 'literature', approximation: 'approx', numerical: 'numerical' };
const chip = (k) => `<span class="chip ${k}" title="${CHIPS[k][1]}">${CHIPS[k][0]}</span>`;
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const MW = (w) => f(w / 1e6, 2);

const REGION_TEXT = {
  '1.5': 'Region 1.5 — rotor held at its minimum speed (6.9 rpm); the tip-speed ratio is above the best value.',
  '2': 'Region 2 — below rated wind: pitch 0°, rotor speed follows the wind to keep the best tip-speed ratio (maximum Cp).',
  '2.5': 'Region 2.5 — rotor at its maximum speed (12.1 rpm) but power still below 5 MW; the tip-speed ratio falls below the best value.',
  '3': 'Region 3 — above rated wind: power held at 5 MW by pitching the blades towards feather, which lowers the angle of attack.',
  parked: 'Parked — wind below cut-in (3 m/s) or above cut-out (25 m/s); the rotor is stopped.',
};

function regionOf(r) {
  if (r.region === '2' && Math.abs(r.rpm - 6.9) < 0.01) return '1.5';
  return r.region;
}

export class InfoPanel {
  constructor(el, { onSelect, onRemove, onClear }) {
    this.el = el; this.onSelect = onSelect; this.onRemove = onRemove; this.onClear = onClear; this.tab = 'turbine';
    this.build = false;
    this.open = new Set(['wake']);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-action]');
      if (act) { if (act.dataset.action === 'remove') this.onRemove(this.selected.id); else this.onClear(); return; }
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; this.render(); return; }
      const row = e.target.closest('[data-select]');
      if (row) { this.tab = 'turbine'; this.onSelect(+row.dataset.select); return; }
      const card = e.target.closest('[data-card]');
      if (card && !e.target.closest('select') && !e.target.closest('.more')) {
        const id = card.dataset.card;
        if (this.open.has(id)) this.open.delete(id); else this.open.add(id);
        this.render();
      }
    });
    el.addEventListener('change', (e) => { if (e.target.id === 'turbineSelect') this.onSelect(+e.target.value); });
  }

  update(sim, selected, { build = this.build } = {}) { this.sim = sim; this.selected = selected; this.build = build; this.render(); }

  render() {
    if (!this.sim) return;
    const scroll = this.el.scrollTop;
    const tabs = [['turbine', 'Turbine'], ['farm', 'Farm'], ['model', 'Model & trust']]
      .map(([k, l]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('');
    let body = '';
    if (this.tab === 'turbine') body = this.turbineTab();
    else if (this.tab === 'farm') body = this.farmTab();
    else body = this.modelTab();
    this.el.innerHTML = `<div class="tabs">${tabs}</div><div class="tabbody">${body}</div>`;
    this.el.scrollTop = scroll;
    this.drawCharts();
  }

  card(id, title, value, unit, sub, status, more) {
    const open = this.open.has(id);
    return `<div class="card ${open ? 'open' : ''}" data-card="${id}">
      <div class="ct">${title} ${chip(status)}</div>
      ${value !== null ? `<div class="val">${value}<small> ${unit}</small></div>` : ''}
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      <div class="more">${open ? more : ''}</div>
      <div class="hint">${open ? 'less ▲' : 'why? ▼'}</div>
    </div>`;
  }

  turbineTab() {
    const sim = this.sim, t = this.selected;
    if (!t) {
      return sim.farm.turbines.length
        ? '<p class="intro">Tap a turbine in any view, or pick one in the Farm tab, to follow the wind through it.</p>'
        : `<p class="intro"><b>Empty map.</b> Tap the ground in the <b>Top</b> view (or in 3D) to place a turbine.
           Then place a second one behind it — downwind — and watch how the first one's wake changes the second one's power.</p>
           <p class="muted">The wind here: ${f(sim.atmosphere.state.uRef, 1)} m/s at 90 m. The arrow in the Top view shows where it blows.</p>`;
    }
    const r = turbineReport(sim, t), reg = regionOf(r);
    this.report = r;
    const nearWarn = r.inNearWakeOf.length
      ? `<br><span class="warn">⚠ closer than 3 D behind T${r.inNearWakeOf.join(', T')}: here the wake model is only a placeholder</span>` : '';
    const options = sim.farm.turbines.map((q) => `<option value="${q.id}" ${q === t ? 'selected' : ''}>T${q.id}</option>`).join('');
    const shadowTxt = r.shadowedBy.length
      ? 'slowed by the wake of ' + r.shadowedBy.map((s) => `T${s.id} (−${f(s.dU, 2)} m/s, ${f(s.dist, 1)} D away)`).join(', ')
      : 'no other wake reaches it';
    const wakeRows = r.stations.map((s) => `<tr><td>${s.xD} D = ${Math.round(s.xD * r.D)} m</td><td>${f(s.centre, 1)} m/s</td><td>−${f(100 * s.deficit, 0)} %</td><td>${Math.round(s.width)} m</td></tr>`).join('');
    const shadowsTxt = r.shadows.length
      ? r.shadows.map((s) => `T${s.id}: −${f(s.dU, 2)} m/s at ${f(s.dist, 1)} D`).join('<br>')
      : 'none — no turbine stands in this wake';
    const betzPct = (100 * r.cp) / (16 / 27);
    return `
    <div class="pick">Follow the wind through turbine <select id="turbineSelect">${options}</select>
      <span class="muted">or tap a turbine in any view</span>
      ${this.build ? `<button class="small" data-action="remove">Remove T${t.id}</button>` : ''}</div>
    <h3>① Wind arriving</h3>
    <div class="grid">
      ${this.card('u0', 'Wind if no other turbines', f(r.U0, 2), 'm/s', 'average over the rotor disk', 'approx',
        `Average wind speed over the rotor disk (32 points) if this turbine stood alone. It comes from the logarithmic wind profile — wind grows with height because the ground slows the air — and from the terrain flow model (hills speed it up, valleys slow it).<div class="eq">U(h) = U<sub>ref</sub> · ln(h/z₀) / ln(90 m/z₀)</div>`)}
      ${this.card('u', 'Wind it actually gets', f(r.U, 2), 'm/s', (r.wakeReduction > 0.0005 ? `−${f(100 * r.wakeReduction, 1)} % · ${shadowTxt}` : shadowTxt) + nearWarn, 'literature',
        `The same disk average after subtracting the slowed air (wakes) of turbines upstream. This is the speed that decides the turbine's power and thrust. Wakes from several turbines are combined as the square root of the sum of squares (an empirical rule).`)}
      ${this.card('shear', 'Top tip vs bottom tip', `${f(r.uTop, 1)} / ${f(r.uBottom, 1)}`, 'm/s', `blade tips at ${Math.round(r.hubHeight + r.R)} m and ${Math.round(r.hubHeight - r.R)} m`, 'approx',
        `Wind speed where a blade tip is at the top and at the bottom of its circle. Friction with the ground makes the lower air slower (wind shear), so every blade meets faster and slower air once per revolution.`)}
      ${this.card('ti', 'Gustiness (turbulence intensity)', f(100 * r.TI, 1), '%', `wake growth rate k* = ${f(r.kStar, 3)}`, 'literature',
        `Typical gust size relative to the mean wind, I = σ<sub>u</sub>/U, estimated from the ground roughness z₀ for neutral air: I ≈ 1/ln(z/z₀). More turbulence mixes the wake with fast surrounding air sooner, so wakes recover faster.<div class="eq">k* = 0.384·I + 0.0037 (Niayifar & Porté-Agel 2016)</div>`)}
    </div>
    <h3>② What the turbine does</h3>
    <div class="grid">
      ${this.card('rpm', 'Rotor speed', f(r.rpm, 1), 'rpm', `tip speed ${f(r.tipSpeed, 0)} m/s · tip-speed ratio λ = ${f(r.tsr, 1)}`, 'approx',
        `The controller sets the rotor speed so the blade tips move about λ<sub>opt</sub> = ${f(sim.model.tsrOpt, 1)} times faster than the wind — where our blade model captures the most energy — within the limits 6.9–12.1 rpm.<div class="eq">tip speed = Ω·R,  λ = Ω·R / U</div>`)}
      ${this.card('pitch', 'Blade pitch', f(r.pitchDeg, 1), '°', reg === 'parked' ? 'parked' : `control region ${reg}`, 'approx', REGION_TEXT[reg] || '')}
      ${this.card('yaw', 'Facing the wind', 'from ' + Math.round(r.yawFromDeg), '°', 'rotor turned into the local wind', 'approx',
        `The nacelle turns (yaws) so the rotor faces the wind at hub height. We assume perfect yaw control; real turbines lag and can be misaligned by several degrees, which lowers power and bends the wake.`)}
    </div>
    <h3>③ Energy</h3>
    <div class="grid">
      ${this.card('pwind', 'Power carried by the wind', MW(r.pWind), 'MW', 'through the rotor area every second', 'exact',
        `Kinetic energy flowing through the 126 m rotor disk per second. It grows with the cube of the wind speed: twice the wind carries eight times the power.<div class="eq">P<sub>wind</sub> = ½ ρ A U³,  ρ = 1.225 kg/m³,  A = π·63² = 12 469 m²</div>`)}
      ${this.card('cp', 'Share captured (Cp)', f(r.cp, 3), '', `<div class="bar"><span style="width:${Math.min(100, betzPct).toFixed(0)}%"></span></div>${f(betzPct, 0)} % of the Betz limit 0.593`, 'approx',
        `Fraction of the wind's power turned into shaft power, from the blade-element momentum (BEM) model. No rotor can take more than 16/27 ≈ 0.593 (Betz limit): stopping the air completely would block the flow. The BEM solver is verified; our airfoil data are approximate, giving a maximum of ${f(sim.model.cpMax, 3)} (published turbine: 0.482).`)}
      ${this.card('pel', 'Electrical power', MW(r.pElec), 'MW', `shaft ${MW(r.pAero)} MW × ${f(100 * r.efficiency, 1)} % drivetrain efficiency`, 'reference',
        `Shaft power after gearbox and generator losses (94.4 % efficiency of the reference design). Above rated wind the controller holds it at 5 MW.`)}
    </div>
    <h3>④ Push on the air → the wake</h3>
    <div class="grid">
      ${this.card('thrust', 'Thrust on the rotor', f(r.thrust / 1e3, 0), 'kN', `thrust coefficient Ct = ${f(r.ct, 2)}`, 'approx',
        `The wind pushes the rotor downwind with this force. By Newton's third law the rotor pushes back on the air — this is what slows the wind and creates the wake.<div class="eq">T = Ct · ½ ρ A U²</div>`)}
      ${this.card('slow', 'Wind slowed at the rotor', f(r.uRotor, 1), 'm/s', `induction a = ${f(r.a, 3)} · ideal far wake ${f(r.uFarIdeal, 1)} m/s`, 'theory',
        `Momentum theory for an ideal rotor: a thrust coefficient Ct slows the wind at the rotor by the fraction a, and twice as much far behind it in frictionless flow. In real air the wake mixes with the fast air around it and recovers.<div class="eq">Ct = 4a(1 − a)  ⇒  a = (1 − √(1 − Ct)) / 2<br>U<sub>rotor</sub> = U(1 − a),  U<sub>far, ideal</sub> = U(1 − 2a)</div>${r.ctClamped ? '<p class="warn">Ct here exceeds 0.96, the limit of momentum theory; the wake model uses 0.96.</p>' : ''}`)}
      ${this.card('wake', 'Its wake downstream', null, '', `<table class="mini"><tr><th>distance</th><th>centre speed</th><th>deficit</th><th>width</th></tr>${wakeRows}</table>`, 'literature',
        `Speed at the wake centre and wake width (4σ, which holds about 95 % of the slowed air) from the Gaussian wake model of Bastankhah & Porté-Agel (2014). The momentum the wake lacks equals the rotor thrust — checked in the tests. The model describes the far wake; closer than 3 D its values are held at the 3 D value. Open the Side view to see the wake.`)}
      ${this.card('shadows', 'Turbines in its wake', r.shadows.length ? String(r.shadows.length) : '0', '', shadowsTxt, 'literature',
        `Turbines whose rotor centre lies in this wake with a slowdown above 0.5 % of their wind. They produce less power — this is the farm's wake loss.`)}
    </div>
    <h3>⑤ Inside the numbers</h3>
    <div class="grid">
      ${this.card('curve', 'Power curve', null, '', 'electrical power vs wind speed · dot = now', 'approx',
        `<canvas class="chart" data-chart="curve"></canvas>Computed once from the BEM model and controller for wind 0–30 m/s. Below cut-in (3 m/s) and above cut-out (25 m/s) the rotor is parked. Cp curve dashed (right axis).`)}
      ${this.card('span', 'Along the blade', null, '', 'angle of attack and induction from root to tip', 'approx',
        `<canvas class="chart" data-chart="span"></canvas>Blade-element state at this operating point. The blade is twisted (13° at the root to 0° at the tip) because the tip moves much faster than the root; the twist keeps the angle of attack α (solid, °) near the airfoil's best lift-to-drag angle. Dashed: axial induction a (×10). The first stations are round cylinders that only make drag.`)}
    </div>`;
  }

  farmTab() {
    const sim = this.sim, s = sim.summary, a = sim.atmosphere;
    const rows = sim.farm.turbines.map((t) => {
      const loss = t.freeInflow > 0 ? 1 - t.inflow / t.freeInflow : 0;
      return `<tr data-select="${t.id}" class="${t === this.selected ? 'sel' : ''}"><td>T${t.id}</td><td>${f(t.inflow, 1)}</td><td>${loss > 0.0005 ? '−' + f(100 * loss, 1) : '0'}</td><td>${f(t.op.Pel / 1e6, 2)}</td><td>${f(t.op.Ct, 2)}</td><td>${f((t.op.omega * 60) / (2 * Math.PI), 1)}</td><td>${f((t.op.pitch * 180) / Math.PI, 1)}</td></tr>`;
    }).join('');
    return `
    <div class="grid">
      ${this.card('fp', 'Farm power', MW(s.power), 'MW', `${sim.farm.turbines.length} turbines × 5 MW rated`, 'approx', 'Sum of the electrical power of all turbines.')}
      ${this.card('ff', 'Without wakes', MW(s.freePower), 'MW', `wake loss ${f(100 * s.wakeLoss, 1)} %`, 'literature',
        'What the same turbines would produce if none stood in another\'s wake. The difference is the wake loss — the main thing layout optimisation tries to reduce.')}
      ${this.card('fw', 'Reference wind', f(a.state.uRef, 1), 'm/s', `at 90 m over flat ground · roughness z₀ = ${a.z0} m`, 'approx',
        'Wind speed at hub height that the scenario starts from. The roughness length z₀ describes the surface (sea 0.0002 m, open grass 0.03 m, rougher land 0.1 m) and sets both the wind profile and the turbulence.')}
    </div>
    <p class="muted">Tap a row to follow that turbine.${this.build && sim.farm.turbines.length ? ' <button class="small" data-action="clear">Remove all turbines</button>' : ''}</p>
    <table class="list"><tr><th>turbine</th><th>wind m/s</th><th>wake %</th><th>MW</th><th>Ct</th><th>rpm</th><th>pitch °</th></tr>${rows}</table>`;
  }

  modelTab() {
    const parts = [
      ['Vertical wind profile', 'Neutral logarithmic law', 'approx'],
      ['Flow over terrain', 'Mass-conserving stream function; over hills, never around', 'approx'],
      ['Blade aerodynamics', 'BEM solver (verified) with approximate airfoil data', 'approx'],
      ['Turbine', 'NREL 5-MW geometry and limits, simplified controller', 'reference'],
      ['Wakes', 'Gaussian far-wake model, quadratic superposition', 'literature'],
      ['Momentum relations', 'Actuator-disk theory (Betz, induction)', 'theory'],
      ['Particles', 'Tracers moved by the same field; 10× real time', 'exact'],
    ].map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${chip(c)}</td></tr>`).join('');
    const reg = Object.values(REGISTRY).map((e) => {
      const id = 'reg-' + e.key, open = this.open.has(id);
      const val = typeof e.value === 'object' ? Object.entries(e.value).map(([k, v]) => `${k} ${v}`).join(', ') : e.value;
      return `<div class="card ${open ? 'open' : ''}" data-card="${id}"><div class="ct">${e.key} ${chip(REGISTRY_CHIP[e.status] || 'approx')}</div>
        <div class="sub">${val} ${e.unit}</div><div class="more">${open ? `${e.meaning}<p class="muted">Source: ${e.source}</p>` : ''}</div><div class="hint">${open ? 'less ▲' : 'meaning ▼'}</div></div>`;
    }).join('');
    return `<p>Labels used everywhere: ${Object.keys(CHIPS).map(chip).join(' ')}</p>
      <table class="list">${parts}</table>
      <h3>Every coefficient in the physics</h3><div class="grid one">${reg}</div>
      <p class="muted">Tests that check these models: <code>npm test</code> in this folder; details in the README.</p>`;
  }

  drawCharts() {
    for (const c of this.el.querySelectorAll('canvas[data-chart]')) {
      if (c.dataset.chart === 'curve') this.chartCurve(c); else this.chartSpan(c);
    }
  }

  chartSetup(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = c.clientWidth || 300, h = 150;
    c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#9fb9c6'; ctx.strokeStyle = '#3d5a6b';
    return { ctx, w, h, L: 34, R: w - 30, T: 8, B: h - 22 };
  }

  chartCurve(c) {
    const { ctx, L, R, T, B } = this.chartSetup(c), tab = this.sim.model.table.filter((p) => p.U <= 26);
    const X = (u) => L + (u / 26) * (R - L), Y = (p) => B - (p / 5.5e6) * (B - T), Yc = (cp) => B - (cp / 0.6) * (B - T);
    this.axes(ctx, L, R, T, B, [0, 5, 10, 15, 20, 25].map((u) => [X(u), u]), [0, 1, 2, 3, 4, 5].map((p) => [Y(p * 1e6), p]), 'wind m/s', 'MW');
    ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 2; ctx.beginPath();
    tab.forEach((p, i) => (i ? ctx.lineTo(X(p.U), Y(p.Pel)) : ctx.moveTo(X(p.U), Y(p.Pel)))); ctx.stroke();
    ctx.strokeStyle = '#c7e9b4'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.beginPath();
    tab.forEach((p, i) => (i ? ctx.lineTo(X(p.U), Yc(Math.max(0, p.Cp))) : ctx.moveTo(X(p.U), Yc(0)))); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#c7e9b4'; ctx.textAlign = 'left';
    [0, 0.2, 0.4].forEach((v) => ctx.fillText(v.toFixed(1), R + 4, Yc(v) + 3)); ctx.fillText('Cp', R + 4, T + 4);
    const t = this.selected;
    ctx.fillStyle = '#ffd65a'; ctx.beginPath(); ctx.arc(X(Math.min(26, t.inflow)), Y(t.op.Pel), 4.5, 0, 7); ctx.fill();
  }

  chartSpan(c) {
    const { ctx, L, R, T, B } = this.chartSetup(c), sp = spanwise(this.sim, this.selected);
    const X = (r) => L + (r / 63) * (R - L), Y = (v) => B - ((v + 5) / 25) * (B - T);
    this.axes(ctx, L, R, T, B, [0, 10, 20, 30, 40, 50, 60].map((r) => [X(r), r]), [-5, 0, 5, 10, 15, 20].map((v) => [Y(v), v]), 'radius m', '');
    if (!sp) { ctx.fillText('rotor parked', L + 10, T + 20); return; }
    const airfoil = sp.filter((s) => !s.airfoil.startsWith('Cyl'));
    ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 2; ctx.beginPath();
    airfoil.forEach((s, i) => (i ? ctx.lineTo(X(s.r), Y(s.alphaDeg)) : ctx.moveTo(X(s.r), Y(s.alphaDeg)))); ctx.stroke();
    ctx.strokeStyle = '#fdd49e'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.beginPath();
    airfoil.forEach((s, i) => (i ? ctx.lineTo(X(s.r), Y(10 * s.a)) : ctx.moveTo(X(s.r), Y(10 * s.a)))); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#7fd3ff'; ctx.fillText('α °', L + 4, T + 8); ctx.fillStyle = '#fdd49e'; ctx.fillText('a ×10', L + 30, T + 8);
  }

  axes(ctx, L, R, T, B, xt, yt, xl, yl) {
    ctx.strokeStyle = '#3d5a6b'; ctx.lineWidth = 1; ctx.fillStyle = '#9fb9c6'; ctx.textAlign = 'center';
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
    for (const [x, v] of xt) ctx.fillText(String(v), x, B + 12);
    ctx.textAlign = 'right';
    for (const [y, v] of yt) ctx.fillText(String(v), L - 4, y + 3);
    ctx.textAlign = 'center'; ctx.fillText(xl, (L + R) / 2, B + 21);
    ctx.textAlign = 'left'; if (yl) ctx.fillText(yl, 2, T + 4);
  }
}
