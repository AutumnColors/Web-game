# Web-game

A collection of small browser puzzle games, plus interactive math pages, a world map viewer, 3D models of sketches and music made from symmetry. Open the landing page, pick a level, play, come back.

Plain static HTML — no build step. Progress (played / best score / cleared) is saved in the player's browser.

## Structure

```
index.html            landing page (levels, explore, explore › groups, world, sketches, music)
levels.js             level registry
explore.js            explore registry (interactive math, no score)
groups.js             groups registry (group viewers in explore/, shown as Explore › Groups)
world.js              world registry (map layers)
sketches.js           sketches registry (drawings rebuilt as 3D models)
music.js              music registry (groups played as sound)
shared/progress.js    progress store used by every level
levels/
  01-smiley-paths/    Smiley Paths
  02-vector-pairs/    Vector Pairs
  03-path-to-zero/    Path to Zero
  04-counting-strokes/ Counting Strokes
  05-minesweeper/     Minesweeper (own level list inside: Classic 16×16, Circle)
explore/
  m11/                M11 symmetry (S(4,5,11) and the Mathieu group M11)
  m11-tree/           M11 Discovery Tree (all 7920 elements as one tree; data/ holds the packed tree)
  simple-groups/      Periodic table of finite simple groups (families by Lie rank, sporadics, order lookup, character tables)
    chartables/       Character tables (A5, A6, 26 sporadics, Tits) as JSON, from the GAP Character Table Library
  rainbow/            Rainbow vectors (spectrum → RGB, gamut loss, metrics, rebuild from k vectors)
  constants/          Scale of Constants (math constants and Standard Model parameters on one ruler, running couplings)
  rubiks-cube/        Vector Cube (Rubik's cube as 54 position/facing/color sticker vectors, one rotation rule)
  j1/                 J1 viewer (the Livingstone graph: 266 vertices built from J1; spin, re-root, random symmetries)
  a5/                 A5 viewer (dodecahedron with its 5 inscribed cubes, icosahedron dual; derive the character table from fixed points)
  m24/                M₂₄ viewer (24 points moved by α, β, γ, δ on PL(23); fixed points, duads, octads, dodecads, sextets, trios per class; census of the 26 classes; peel the counts into the character table)
  golay/              Golay MOG Lab (binary Golay code on the Miracle Octad Generator: octads, sextets, decoding games, M24 acting on the board)
  an-lab/             Aₙ(q) Lab (PSL(n+1, q): family grid, order from the Dynkin diagram, action on PG(n, q), element-order census and comparisons)
  galois/             Galois Workbench (field extensions, S₃ on the roots of x³ − 2, the Galois correspondence, why A₅ blocks the quintic)
  nonsimple/          Non-simple groups (C₄, V₄, D₃, D₄, Q₈, D₅, D₆, A₄, S₄: subgroup lattice, coset-colored Cayley table, quotients, composition series, splitting)
  constants-table/    Table of Physical Constants (c, ħ, G, k_B, k_e: 5 × 5 pair table linked to the 60-cell A₅ table of triples, with a symmetry group in every cell)
world/
  index.html          World viewer: one base map, switchable data layers, country panel, ranking
  countries.json      Natural Earth id → ISO-3 code and display name (outlines load from world-atlas on jsDelivr, projected to Equal Earth)
  layers/             One JSON file per layer (alcohol.json, gdp-share.json, typical-income.json, gdp-per-capita.json)
sketches/
  pineapple-umbrella/ Pineapple Umbrella (colored-pencil umbrella with a pineapple crown, as a three.js model; the original drawing is embedded)
  corn-cob/           Corn Cob (an ear of corn in its husk: instanced kernels, silk, peeling husk leaves; the original drawing is embedded)
music/
  sound-of-a5/        Sound of A₅ (60 elements played by a band: irreps 1, 3, 3′, 4, 5 as bass, drums, piano, violin, gamelan; Web Audio, octave clock)
  sound-of-d4/        Sound of D₄ (the square's 8 symmetries played by a band: irreps 1, 1′, 1″, 1‴, 2; by-class walk by default, every layer's instrument swappable)
tools/
  chartable_convert.py  Regenerates explore/simple-groups/chartables from CTblLib data files
  j1/build_action.py  Rebuilds J1's 266-point action from Janko's 7×7 matrices over F11 (the generators in explore/j1)
  world/build_layers.py  Rebuilds world/layers/*.json from World Bank bulk CSVs and the WHO table (see the script's header)
  world/build_gdp_share.py  Rebuilds world/layers/gdp-share.json from the Maddison Project 2023 and World Bank data
  world/build_typical_income.py  Rebuilds world/layers/typical-income.json from World Bank PIP survey data (via Our World in Data) and WDI GDP
```

## Add a level

1. Create `levels/NN-name/index.html` (a self-contained game page).
2. Add a back link: `<a href="../../">← Levels</a>`.
3. Load progress: `<script src="../../shared/progress.js"></script>`, then call
   - `GameKit.played(id)` on start
   - `GameKit.best(id, score)` when the score changes
   - `GameKit.complete(id)` when the level is won
4. Add an entry to `levels.js` with the same `id`.

### Minesweeper sub-levels

Minesweeper keeps its own level list in the `LEVELS` array at the top of the script in `levels/05-minesweeper/index.html`. Each entry sets `rows`, `cols`, `mines` and an optional `shape` (`square` or `disc`; add new shapes to `SHAPES`). It reports `complete` to the main page once every sub-level has been won.

## Add an explore page

1. Create `explore/name/index.html` (self-contained, back link to `../../`).
2. Add an entry to `explore.js` with a short `badge` (up to ~3 characters).

## Add a group viewer

1. Create `explore/name/index.html` like any explore page.
2. Add the entry to `groups.js` instead of `explore.js`. It then shows in the Explore › Groups section of the landing page.

## Add a sketch

1. Create `sketches/name/index.html` (self-contained, back link to `../../`).
2. Add an entry to `sketches.js` with a short `badge`.

## Add a music page

1. Create `music/name/index.html` (self-contained, back link to `../../`). Sound must start from a button (browsers block autoplay).
2. Add an entry to `music.js` with a short `badge`.

## Add a world layer

1. Create `world/layers/name.json` (format below). Countries are keyed by ISO 3166-1 alpha-3 (`VNM`, `CHE`), matching `world/countries.json`.
2. Add an entry to `world.js` with the same `id`, a `badge` and the `file` path.

```json
{
  "id": "alcohol",
  "title": "Alcohol consumption",
  "kind": "choropleth",
  "year": 2019,
  "about": "What the numbers mean, shown under the map.",
  "source": { "name": "WHO …", "url": "https://…" },
  "reference": { "label": "World", "values": { "total": 5.5 } },
  "fields": [
    { "key": "total", "label": "Total", "unit": "L", "format": "decimal", "primary": true,
      "scale": { "type": "linear", "palette": "amber", "bins": [1, 2.5, 5, 7.5, 10, 12.5] } },
    { "key": "beer", "label": "Beer share", "unit": "%", "format": "decimal" },
    { "key": "ppp_year", "hidden": true }
  ],
  "data": {
    "VNM": { "total": 9.3, "beer": 92.4, "note": "Optional free text for this country." }
  }
}
```

- `fields`: every visible field becomes a switch above the map and a row in the country panel. `primary` colors the map first. `hidden` fields are data only (e.g. a year), shown next to the field that names them in `yearKey`.
- `format`: `decimal`, `money` (unit `US$` or `intl $`), `signed` (+/−), or plain.
- `scale.bins`: the colour class edges (6 edges → 7 colours). Leave them out and the page uses quantiles. Palettes: `amber`, `teal`, `blue`, `purple`, `redgreen` (diverging).
- Values may be text like `"<0.1"` or `"≈0.2"`; the page shows the text and colours by the number.
- `reference` (optional): values the country panel compares against, e.g. the world average.
- `time` (optional): `{ "years": [1955, 1965, …], "default": 2025, "label": "Decade" }`. Each field's value is then an array with one entry per year (`null` where there is no data). The page shows a slider with play, and the country panel shows the field across all years.
- `groups` (optional, for time layers): `{ "SUN": { "name": "Soviet Union", "members": ["RUS", "UKR", …], "until": 1992 } }`. Before `until`, the members are coloured and ranked as one country using `data.SUN`.
- More formats: `share` (percent with precision that suits small values), `billions` (shown as bn / tn). Palette `spectrum` has 9 colours for 8 bin edges.
- `times` (shown as 2.5×) and `perday` (shown as $4.20 a day).
- `ratio` (optional): `"ratio": ["share", "pop_share"]` makes a derived field, the first field divided by the second, computed in the page (no data stored for it).
- `kind` is `choropleth` for now; other kinds (points, categories) can be added in the viewer later.

## Run locally

Open `index.html` in a browser, or `python3 -m http.server` in this folder. The World viewer and character tables load JSON, so they need the server.

## Live

https://web-game-cyan-eta.vercel.app (Vercel, from `main`).
