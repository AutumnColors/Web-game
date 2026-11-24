// Category tags for the home page. Every app gets exactly one of four tags.
// To tag an app: an exact path in TAG_OVERRIDES wins, then the first matching
// folder prefix in TAG_RULES, otherwise it falls back to TAG_DEFAULT.
window.APP_TAGS = [
  { id: 'map-viewer', label: 'Map viewer', color: '#79d4ff' },
  { id: 'game',       label: 'Game',       color: '#81e9a1' },
  { id: 'laboratory', label: 'Laboratory', color: '#c9a2ff' },
  { id: 'graphics',   label: 'Graphics',   color: '#ffb86b' }
];

window.TAG_OVERRIDES = {
  'explore/fractal-map-survey/': 'map-viewer',
  'explore/zeta-map/': 'map-viewer',
  'world/': 'map-viewer',
  'explore/mandelbulb-3d/': 'graphics'
};

window.TAG_RULES = [
  ['levels/', 'game'],
  ['sketches/', 'graphics']
];

window.TAG_DEFAULT = 'laboratory';

window.tagFor = function (path) {
  const p = String(path || '').split('#')[0];
  if (window.TAG_OVERRIDES[p]) return window.TAG_OVERRIDES[p];
  for (const [prefix, tag] of window.TAG_RULES) if (p.startsWith(prefix)) return tag;
  return window.TAG_DEFAULT;
};
