// Explore registry: interactive math pages (no score). Group viewers are listed in groups.js. To add one: create explore/name/index.html, then add an entry here.
window.EXPLORE = [
  {
    id: 'rainbow',
    badge: 'RGB',
    title: 'Rainbow vectors',
    path: 'explore/rainbow/',
    desc: 'Every wavelength as an RGB vector. See what falls outside the cube, then rebuild the rainbow from k vectors.'
  },
  {
    id: 'constants',
    badge: '1/α',
    title: 'Scale of Constants',
    path: 'explore/constants/',
    desc: 'π, e, φ and the Standard Model\'s free parameters on one zoomable ruler. Run the force strengths up to the Planck scale.'
  },
  {
    id: 'rubiks-cube',
    badge: '3³',
    title: 'Vector Cube',
    path: 'explore/rubiks-cube/',
    desc: 'A Rubik\'s cube as 54 stickers, each a position, facing and color vector. One rotation rule turns every layer.'
  },
  {
    id: 'galois',
    badge: 'Gal',
    title: 'Galois Workbench',
    path: 'explore/galois/',
    desc: 'From field extensions to the impossible quintic. Watch S₃ permute the roots of x³ − 2, match subgroups to fields, and see why A₅ blocks a formula for x⁵ − x − 1.'
  },
  {
    id: 'constants-table',
    badge: 'cħG',
    title: 'Table of Physical Constants',
    path: 'explore/constants-table/',
    desc: 'c, ħ, G, k_B and k_e as switches. A 5 × 5 table of what each pair of constants builds, opening into a 60-cell table of triples, one per element of A₅, each with its symmetry group.'
  },
  {
    id: 'seed-lab',
    badge: 'z²',
    title: 'Seed → Structure Lab',
    path: 'explore/seed-lab/',
    desc: 'A tiny rule, an enormous structure. Zoom into the Mandelbrot set, flip the 8 bits of a cell rule, grow a plant from one letter, roll dice into a fractal, and compare seed size with result size.'
  },
  {
    id: 'fractal-map',
    badge: '∞',
    title: 'Mandelbrot Map',
    path: 'explore/fractal-map/',
    desc: 'Only the map. Drag and pinch through z → z² + c until the numbers run out, then drift back to the whole set.'
  },
  {
    id: 'fractal-map-survey',
    badge: '⌖',
    title: 'Mandelbrot Survey Map',
    path: 'explore/fractal-map-survey/',
    desc: 'The same map with survey tools: a scale bar, twist to rotate with a compass, tap a point to read its coordinates, and screenshots that keep the scale, compass and coordinates.'
  },
  {
    id: 'julia-lab',
    badge: 'Jc',
    title: 'Julia Lab',
    path: 'explore/julia-lab/',
    desc: 'Pick a seed c on the Mandelbrot plane or type it, watch its Julia set change live, then explore it with the survey tools: scale, compass, tap coordinates with the orbit, screenshots that keep the seed.'
  },
  {
    id: 'zeta-map',
    badge: 'ζ',
    title: 'Zeta Map',
    path: 'explore/zeta-map/',
    desc: 'The Riemann zeta function as a map. Colour is the direction of ζ(s), darkness its size; zeros are the points where every colour meets. Drag and pinch anywhere, and where the numbers run out the view comes back.'
  }
];
