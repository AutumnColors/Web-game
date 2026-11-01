// World registry: data layers for the world map viewer (world/index.html).
// To add a layer: put a JSON file in world/layers/ (format in README), then add an entry here.
// `file` is relative to world/. The first entry is the default layer.
window.WORLD_LAYERS = [
  {
    id: 'alcohol',
    badge: 'L',
    title: 'Alcohol consumption',
    file: 'layers/alcohol.json',
    desc: 'Litres of pure alcohol per adult per year, recorded and unrecorded, and what people drink: beer, wine or spirits.'
  },
  {
    id: 'gdp-per-capita',
    badge: '$',
    title: 'GDP per capita',
    file: 'layers/gdp-per-capita.json',
    desc: 'Output per person, in purchasing power and in nominal dollars, plus real growth over ten years.'
  }
];
