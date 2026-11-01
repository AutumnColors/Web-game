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
    id: 'gdp-share',
    badge: '%',
    title: 'Share of world GDP, 1955–2025',
    file: 'layers/gdp-share.json',
    desc: 'Each country\'s slice of the world economy, decade by decade. Press play to watch 70 years of change.'
  },
  {
    id: 'typical-income',
    badge: '½',
    title: 'Typical income, 1990–2020',
    file: 'layers/typical-income.json',
    desc: 'What the median person lives on per day, how far that sits below GDP per person, and how unequal households are.'
  },
  {
    id: 'gdp-per-capita',
    badge: '$',
    title: 'GDP per capita',
    file: 'layers/gdp-per-capita.json',
    desc: 'Output per person, in purchasing power and in nominal dollars, plus real growth over ten years.'
  }
];
