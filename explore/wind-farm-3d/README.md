# 3D Wind Farm Research Lab

## Mission
Build a browser-based scientific playground to investigate how wind turbine geometry, height, placement and operation change power extraction and the surrounding three-dimensional atmospheric flow. This is an exploratory simulation, **not yet an engineering or weather prediction tool**.

## Current prototype
- Standalone Three.js HTML at `index.html`.
- Orbitable 3D landscape; coastal, plains, mountain, variable-wind scenarios.
- New random map, pause/play, reset camera.
- Twelve procedurally positioned towers and animated three-blade rotors.
- 3D advected wind particles with a **prescribed** velocity field and analytical Gaussian wake deficits.
- Requires network access for Three.js CDN modules.
- IMPORTANT: prototype has not been browser-validated in this session; diagnose import/runtime issues first.

## What we tried before
1. 2D wind field: uniform flow, shear, gusts, vortex and terrain scenarios; particle, vector and speed views.
2. Turbine design explorer: rotor radius, number of blades, chord shape (tapered/wide/slender/straight), twist, pitch, wind speed.
3. Approximate blade-element momentum (BEM) prototype: estimated torque, rotor power, power coefficient versus tip-speed ratio; simplified lift/drag polar and axial induction. **Not validated**, and extreme parameters may yield unphysical results.
4. 2D integrated wind farm: randomly placed turbines and simplified wakes. It used a fixed power coefficient 0.42, **not** a real coupling from BEM thrust to wake strength.
5. First 3D standalone HTML was reported nonworking. This branch starts a fresh, simpler replacement to debug and extend.

## Physical architecture
Keep three separate modules:
- **Atmosphere**: velocity vector field v(x,y,z,t), terrain and boundary conditions.
- **Turbine**: geometry, hub height, rotor plane/yaw, rotor speed, blade sections, aerodynamic forces; calculate Cp and Ct.
- **Coupling and rendering**: turbine thrust influences downstream velocity/momentum; 3D visualization is independent of the solver.

### Core relations
- Wind kinetic power through rotor area: P_wind = 0.5 rho pi R^2 U^3.
- Tip-speed ratio: lambda = omega R / U.
- Power coefficient: Cp = P_rotor / P_wind.
- Angle of attack in simplified blade element: alpha(r) = phi(r) - (twist(r) + pitch).
- Wake models must use a physically consistent thrust coefficient Ct and momentum budget, not arbitrarily multiply unrelated deficits.
- Betz ideal actuator-disk bound Cp <= 16/27 under its assumptions.

## Next tasks for coding assistant (in order)
1. **Get it running**: test desktop and mobile browser, fix module loading, rendering, resize, touch orbit controls, performance and errors. Add a visible fallback error if imports fail.
2. **Validate geometry**: rotor axis perpendicular to incoming wind, blade rotations around the actual rotor axis, terrain clearance, and wake alignment.
3. **Visual diagnostics**: selectable particle / vector / velocity slice; wind direction, speeds, wake deficit and turbine IDs; distinguish reference wind from wake-modified wind.
4. **Correct wind field**: spatially varying 3D vector flow, terrain deflection and vertical shear; label analytic approximations; no claim of incompressible CFD unless divergence/mass conservation is actually enforced.
5. **Aerodynamic turbine module**: reusable, tested BEM solver with airfoil polar, radial chord/twist, tip/hub loss, induction and high-thrust correction; compute Cp, Ct, torque and RPM. Validate against known reference turbine curves.
6. **Coupling**: use computed Ct and rotor-plane inflow to drive a wake model (e.g. Jensen or Gaussian/Bastankhah), include vertical wake expansion and overlap; compare energy balance and expected limiting behavior.
7. **Layout optimization**: compare fixed-grid, staggered and optimized farms under same wind rose and terrain. Quantify AEP and wake losses; later incorporate construction cost and environmental disturbance.
8. **Advanced research**: atmospheric boundary-layer modeling, turbulence and mesoscale feedback. Explicitly distinguish fast wake models from CFD and regional weather/climate models.

## Design philosophy
- Keep first-run UI minimal: scenario, randomize, pause and reset camera.
- Make model configuration modular for later advanced controls.
- Reproducible random seeds and unit-aware outputs.
- Never equate visual wake effects with physically validated simulations.
- Preserve other labs in the repository.
