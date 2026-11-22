# 3D Wind Farm Research Lab

## Mission
Build a browser-based scientific playground to investigate how wind turbine geometry, height, placement and operation change power extraction and the surrounding three-dimensional atmospheric flow. This is an exploratory simulation, **not yet an engineering or weather prediction tool**.

## Current state (Nov 2026)
- Runs in desktop and mobile browsers (checked in headless Chrome, desktop 1280×800 and an emulated Pixel 7 with real multi-touch events).
- Minimal UI kept: scenario (Coastal, Plains, Mountains, Variable winds), New random map, Pause/Play, Reset camera. The legend is tappable and switches the particle colouring between *speed ÷ reference hub-height speed* and *wake: speed ÷ turbine-free speed at the same point*.
- Maps are reproducible: the URL holds `#scenario=…&seed=…`.
- 12 NREL 5-MW reference turbines on a 4 km × 3 km site, real dimensions in metres, yawed into the local wind, rotor speed and blade pitch from the turbine controller.
- Particles are advected by the physics velocity field (wake deficits included) at 10× real time; rotors spin at real speed.

### Why the previous prototype never started
It imported `examples/jsm/controls/OrbitControls.js` from the CDN. That file imports the bare specifier `"three"`, which a browser can only resolve with an import map, so the module graph failed ("Failed to resolve module specifier 'three'") and the page stayed at "Loading Three.js…" with no message. Reproduced in headless Chrome. Fix: only the three.js core build is loaded (it has no imports), from jsDelivr with unpkg as fallback, and the camera control is our own Pointer-Events controller (`render/controls.js`). Any loading or WebGL failure now shows a visible message.

## Architecture

```
index.html            minimal UI, error panel (classic script, so it works even if modules fail)
main.js               UI wiring, URL state, animation loop
physics/              PURE JavaScript — no three.js, no DOM (enforced by tests/architecture.test.js)
  parameters.js       registry of every coefficient: value, unit, meaning, source, status
  random.js           seeded RNG
  terrain.js          height fields H(x,z) with analytic gradients (coast, plain, mountain, flat)
  atmosphere.js       ambient velocity field v(x,y,z,t)
  airfoil.js          simplified airfoil polars
  bem.js              blade-element momentum solver (+ actuator-disk reference)
  turbine.js          NREL 5-MW geometry, controller, power/thrust table
  geometry.js         rotor axis, blade azimuth, section frames (shared with the renderer)
  wake.js             Gaussian far-wake model
  farm.js             layout, turbine–wake coupling, combined velocity field
  index.js            createSimulation({scenario, seed}), scenarios, layout rules
render/               three.js only; reads the simulation, never changes its physics
  three-loader.js     CDN loading with fallback
  controls.js         orbit / pan / zoom for mouse and touch
  turbine-mesh.js     tower, nacelle, hub, lofted blades from the chord/twist table
  scene.js            terrain mesh, turbines, particle streaks, render/physics self-check
tests/                node --test (physics) and browser_smoke.py (headless browser)
```

Coordinates: metres, x = east, y = up, z = south (three.js convention, −z = north). Wind direction in the status line is the compass direction the wind comes **from**.

## Models and how far to trust them

| Part | Model | Status |
|---|---|---|
| Vertical profile | Neutral log law U(h) = U_ref ln(h/z0)/ln(z_ref/z0), z0 from the Davenport–Wieringa classes (sea 0.0002, open 0.03, roughly open 0.10 m) | Standard surface-layer theory; no stability, veer or boundary-layer top |
| Terrain flow | Stream function ψ = Ψ0(η), η = y − H e^{−(y−H)/L} in each vertical plane along the wind; L = width of the dominant terrain feature | **Approximation.** Exactly mass-conserving and tangent to the ground (tested), reduces to linear potential flow for small sinusoidal terrain with uniform U. Flow goes over hills, never around; no separation; one decay length for all features |
| Turbulence intensity | I = 2.5 κ / ln(z/z0) (σ_u = 2.5 u*) | Neutral surface-layer relation; ambient only, no wake-added turbulence |
| Variable winds | Slow, spatially uniform sinusoidal changes of speed and direction with σ_U = I·U | **Illustrative**, quasi-steady (wakes respond instantly) |
| Airfoils | Smooth thin-airfoil lift with saturation, parabolic drag, flat-plate deep stall; cylinder drag 0.50/0.35 | **Approximation** — not the reference polar tables |
| Rotor | BEM, Ning (2014) guaranteed-convergence form, Prandtl tip/hub loss, Buhl high-thrust correction | Solver verified (below); results only as good as the polars. No yaw/tilt/cone, dynamic or 3-D effects |
| Turbine | NREL 5-MW chord/twist/airfoil table, 6.9–12.1 rpm, variable speed at λ_opt, pitch-to-feather above rated | Geometry is the reference design; controller simplified; precone 2.5° and tilt 5° not yet modelled |
| Wake | Bastankhah & Porté-Agel (2014) Gaussian; k* = 0.3837 I + 0.003678 (Niayifar & Porté-Agel 2016) | Literature model, implemented and checked against its own momentum derivation. Far wake only (x < 3D frozen at the 3D value); straight centreline from the hub, no ground image, no terrain following |
| Coupling | Disk-averaged inflow (32 equal-area points), Gauss–Seidel iteration, quadratic (Katić) superposition, perfect yaw | Engineering wake-model coupling; empirical superposition |
| Wake-modified field | Ambient velocity scaled by (speed − ΔU) ÷ speed | **Not divergence-free** (no radial wake velocity); a visual of the deficit, not CFD |

Every coefficient is listed with its meaning, source and status in `physics/parameters.js`; the layout rules (spacing 4D, 350 m edge margin, ≥ 15 m tip clearance for any yaw) are in `physics/index.js` and are site choices, not physics.

## What has been verified
`npm test` (Node 18+) in this folder runs 30 tests:

- **Momentum theory**: actuator disk gives Cp = 16/27, Ct = 8/9 at a = 1/3.
- **BEM vs Glauert's optimum rotor** (ideal airfoil, no drag, no tip loss, chord and twist from the optimum design): BEM Cp agrees with an independent numerical Glauert integral within 0.2 % at λ = 1, 2, 5, 7.5, 10, and that integral matches the classical table (Manwell et al.) within 0.0015; induction a agrees section by section to 1e-6.
- **BEM internal consistency**: in every momentum-region annulus, blade-element thrust and torque equal momentum thrust and torque to 1e-8.
- **Bounds**: Cp < 16/27 for 300 random rotor variants and for the ideal rotor at any pitch; Buhl correction continuous at a = 0.4; all power-curve points converge; rated power held exactly with pitch rising monotonically.
- **Atmosphere**: log law reproduced exactly on flat ground; ∇·v = 0 (relative error < 1e-8 with Richardson-extrapolated differences) and v·∇η = 0 on mountain, coast and plain maps; flow tangent to the ground; stream coordinate never folds; variable-wind statistics have the intended σ.
- **Wake**: momentum-deficit flux equals rotor thrust within 1e-6 for Ct 0.2–0.9, I 0.07–0.15, x/D 3–40; linear width growth k*; monotonically decaying deficit.
- **Geometry**: rotor axis parallel to the hub wind; tips stay in the rotor plane at radius R; rotation clockwise seen from upwind; geometric angle of attack from the section frame equals BEM α, and the vector lift + drag reproduce the BEM thrust and driving force; minimum tip clearance over 100 maps 25.8 m.
- **Farm**: single-turbine power equals the power curve at its inflow; downstream inflow equals the disk-averaged upstream wake; power loss decreases with spacing; farm power ≤ wake-free power; deterministic per seed; spacing respected.
- **Browser** (`tests/browser_smoke.py`, see its header for how to run it offline): all four scenarios start with a clean console; rendered blade tips and chord directions equal the physics geometry (≤ 3e-13 m, 2e-15); mouse orbit/zoom; phone layout without page scroll; one-finger orbit, two-finger pinch/pan/twist; legend tap; jsDelivr blocked → unpkg; no CDN → visible error.

## Comparisons, not validations
- NREL 5-MW with our approximate polars: Cp_max 0.461 at λ 8.24, rated wind 11.7 m/s, pitch 22.5° at 25 m/s. Published: 0.482 at 7.55, 11.4 m/s, ≈ 23.5°. The gap comes from the polars; tabulated DU/NACA 64 polars are the next step before any turbine result is called validated.
- Two aligned turbines, 9 m/s, I = 0.128: downstream power loss 41 % / 31 % / 21 % / 12 % at 5 / 7 / 10 / 15 D. Plausible order of magnitude, not compared with measurements yet.
- Gaussian hill (H/L ≈ 0.38): fractional speed-up 0.37 at 80 m above the top. Jackson–Hunt linear theory would give roughly 0.5 for this shape; neither is validated here, and real hills this steep can separate.

## Known limitations
- Only the ambient field is mass-conserving; wakes are superposed deficits.
- Near wake (< 3D) is a placeholder; ground effect on wakes ignored.
- No atmospheric stability, Coriolis veer, internal boundary layer at the coastline (single z0 per scenario), or flow around (instead of over) hills.
- Quasi-steady: in "Variable winds" wakes change everywhere at once.
- Parked turbines (below cut-in or above cut-out) are given zero thrust.

## Next tasks (in order)
1. **Visual diagnostics**: optional velocity slice at hub height and a vertical slice along a wake; tap a turbine to see inflow, Ct, Cp, rpm, pitch.
2. **Airfoil data**: replace the simplified polars with the tabulated NREL 5-MW polars and re-run the reference comparison; add precone and tilt.
3. **Turbine operation**: yaw misalignment (needs skewed BEM correction and wake deflection), derating.
4. **Wake model**: near-wake length (Bastankhah & Porté-Agel 2016), ground image, added turbulence, terrain-following centreline; compare superposition methods against published LES / Horns Rev data.
5. **Layout optimisation**: fixed-grid vs staggered vs optimised under a wind rose; AEP and wake losses.
6. **Advanced**: boundary-layer modelling, stability, mesoscale coupling — kept clearly separate from fast wake models and from CFD.

## What we tried before
1. 2D wind field: uniform flow, shear, gusts, vortex and terrain scenarios; particle, vector and speed views.
2. Turbine design explorer: rotor radius, number of blades, chord shape, twist, pitch, wind speed.
3. Approximate BEM prototype (not validated).
4. 2D integrated wind farm with a fixed Cp = 0.42 (no BEM–wake coupling).
5. First 3D standalone HTML — reported nonworking (cause above).
6. Second 3D prototype (this folder, first commit): prescribed velocity field and ad-hoc wake deficits; replaced by the modules above.

## Design philosophy
- Keep first-run UI minimal; model configuration modular for later advanced controls.
- Reproducible random seeds and unit-aware outputs.
- Never equate visual wake effects with physically validated simulations.
- Preserve other labs in the repository.
