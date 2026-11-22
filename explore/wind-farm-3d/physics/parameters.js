// Registry of every physical or numerical coefficient used by the physics engine.
//
// Rule of this project: no number with physical meaning appears in the solver
// without an entry here that states its unit, what it means, where it comes
// from, and how much it can be trusted. The tests check that every entry is
// complete.
//
// status values
//   'standard'          physical constant or standard-atmosphere value
//   'reference-design'  taken from the NREL 5-MW reference turbine specification
//   'literature'        published empirical fit, used inside its stated range
//   'approximation'     our own modelling choice; plausible but NOT validated
//   'numerical'         solver tolerance / smoothing; should not change physics

export const REGISTRY = {};

function def(key, value, unit, meaning, source, status) {
  REGISTRY[key] = { key, value, unit, meaning, source, status };
  return value;
}

// ---- atmosphere -----------------------------------------------------------
export const AIR_DENSITY = def('airDensity', 1.225, 'kg/m³',
  'Air density used for all forces and power.',
  'ISO 2533 standard atmosphere at sea level, 15 °C.', 'standard');

export const SIGMA_U_OVER_USTAR = def('sigmaUOverUstar', 2.5, '–',
  'Ratio of streamwise velocity standard deviation to friction velocity in the neutral surface layer. '
  + 'With the log law it gives turbulence intensity I = 2.5 κ / ln(z/z0) ≈ 1 / ln(z/z0).',
  'Panofsky & Dutton (1984), neutral surface-layer observations (≈2.4–2.5).', 'literature');

export const VON_KARMAN = def('vonKarman', 0.41, '–',
  'von Kármán constant of the logarithmic wind profile.', 'Standard boundary-layer value (0.40–0.41).', 'standard');

export const SIGMA_V_OVER_SIGMA_U = def('sigmaVOverSigmaU', 0.8, '–',
  'Lateral/streamwise turbulence ratio; used only to size the slow direction swings of the "Variable winds" scenario.',
  'Neutral surface-layer typical value (≈0.75–0.8), Panofsky & Dutton (1984).', 'literature');

export const ROUGHNESS = def('roughnessLength', { sea: 0.0002, open: 0.03, roughlyOpen: 0.10 }, 'm',
  'Aerodynamic roughness length z0 of the log profile for each scenario surface.',
  'Davenport–Wieringa roughness classification (WMO).', 'literature');

// ---- terrain flow ---------------------------------------------------------
export const TERRAIN_DECAY_NOTE = def('terrainDecayLength', 'per terrain', 'm',
  'Vertical e-folding length L of terrain-induced streamline displacement. In linearised potential flow a terrain '
  + 'Fourier mode of wavenumber k decays as exp(-k y), so each terrain sets L = 1/k of its dominant feature '
  + '(hill width σ for a Gaussian hill, wavelength/2π for waves, ramp width for the coast).',
  'Linear potential-flow theory over small-slope terrain; one decay length for all modes is our simplification.',
  'approximation');

// ---- airfoils -------------------------------------------------------------
export const FLAT_PLATE_CD90 = def('flatPlateCd90', 2.0, '–',
  'Drag coefficient of a flat plate normal to the flow; sets the deep-stall polar (Cl = Cd90/2·sin 2α, Cd = Cd90·sin²α).',
  'Hoerner, Fluid-Dynamic Drag (≈1.98 for infinite aspect ratio).', 'literature');

export const STALL_BLEND_WIDTH_DEG = def('stallBlendWidth', 2.0, 'deg',
  'Width of the logistic blends between attached, post-stall and flat-plate polars. Smoothing for root finding; '
  + 'real stall behaviour of each airfoil is not represented.', 'Numerical choice.', 'numerical');

export const LIFT_SATURATION_EXPONENT = def('liftSaturationExponent', 6, '–',
  'Sharpness p of the smooth lift saturation Cl = x / (1 + |x/Cl_max|^p)^(1/p), x = a0(α − α0). Large p = sharp corner '
  + 'at Cl_max; p = 6 keeps Cl within 1 % of the linear value up to 0.6·Cl_max.', 'Shape choice.', 'approximation');

export const POST_STALL_PLATEAU_DEG = def('postStallPlateau', 8, 'deg',
  'Angle range beyond stall onset over which lift stays near Cl_max before falling to the flat-plate value. '
  + 'Thick wind-turbine sections stall gradually, and inboard sections gain lift from rotational augmentation.',
  'Qualitative behaviour of published DU polars; value not fitted.', 'approximation');

export const MOMENTUM_LIMIT_CT = def('momentumLimitCt', 0.96, '–',
  'Largest thrust coefficient passed to the wake model: Ct = 4a(1−a) at a = 0.4, where momentum theory stops '
  + 'being valid (same point as the Buhl transition). The Gaussian wake is undefined for Ct ≥ 1.',
  'Glauert / Buhl momentum-theory limit.', 'literature');

export const AIRFOIL_FAMILIES = def('airfoilPolars', 'see airfoil.js', '–',
  'Simplified lift/drag polars per airfoil family (zero-lift angle, lift slope, Cl_max, minimum drag, drag rise). '
  + 'Shaped to resemble published DU and NACA 64 polars at Re ≈ 6–10 million; they are NOT the tabulated polars '
  + 'of the NREL 5-MW turbine. Cylinder drag values (0.50 / 0.35) are the reference-design values.',
  'Values rounded from typical published polars; to be replaced by tabulated data.', 'approximation');

// ---- BEM numerics ----------------------------------------------------------
export const BEM_TOLERANCE = def('bemTolerance', 1e-10, 'rad',
  'Bracketing tolerance of the inflow-angle root solve in BEM.', 'Numerical choice.', 'numerical');

export const BUHL_TRANSITION_K = def('buhlTransition', 2 / 3, '–',
  'Value of k = σ′c_n/(4F sin²φ) above which the Buhl high-thrust correction replaces momentum theory '
  + '(corresponds to a = 0.4).', 'Buhl (2005), NREL/TP-500-36834; Ning (2014).', 'literature');

// ---- reference turbine ------------------------------------------------------
export const NREL5MW = def('nrel5mw', 'see turbine.js', 'various',
  'NREL 5-MW reference turbine: 3 blades, R = 63 m, hub radius 1.5 m, hub height 90 m, chord/twist table, '
  + 'rated 5 MW electrical, 94.4 % drivetrain efficiency, 6.9–12.1 rpm, cut-in 3 m/s, cut-out 25 m/s, overhang 5 m.',
  'Jonkman et al. (2009), NREL/TP-500-38060.', 'reference-design');

export const NREL5MW_PUBLISHED = def('nrel5mwPublished', { cpMax: 0.482, tsrOpt: 7.55, ratedWind: 11.4 }, '–, –, m/s',
  'Published aerodynamic results of the reference turbine, used only for comparison (not tuning).',
  'Jonkman et al. (2009).', 'reference-design');

// ---- wakes ------------------------------------------------------------------
export const WAKE_K_FIT = def('wakeGrowthFit', { slope: 0.3837, intercept: 0.003678 }, '–',
  'Wake growth rate k* = 0.3837·I + 0.003678 of the Gaussian wake as a function of hub-height turbulence intensity I.',
  'Niayifar & Porté-Agel (2016), Energies 9:741; fitted for I ≈ 0.065–0.15.', 'literature');

export const WAKE_EPSILON_FACTOR = def('wakeEpsilonFactor', 0.2, '–',
  'Initial wake width ε = 0.2·√β (σ/D at x = 0 of the Gaussian wake).',
  'Bastankhah & Porté-Agel (2014), J. Renew. Energy 70:116.', 'literature');

export const NEAR_WAKE_END = def('nearWakeEnd', 3, 'rotor diameters',
  'Downstream distance below which the Gaussian far-wake model is not used. Between the rotor and this distance the '
  + 'deficit is held at its x = 3D value: a placeholder, not a near-wake model.',
  'Far-wake range of the Gaussian model (its validation used x/D ≳ 3).', 'approximation');

export const ROTOR_SAMPLES = def('rotorSamples', { rings: 4, perRing: 8 }, 'points',
  'Equal-area quadrature used to average the inflow over each rotor disk.', 'Numerical choice.', 'numerical');
