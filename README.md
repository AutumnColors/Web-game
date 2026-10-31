# Web-game

A collection of small browser puzzle games, plus a few interactive math pages. Open the landing page, pick a level, play, come back.

Plain static HTML — no build step. Progress (played / best score / cleared) is saved in the player's browser.

## Structure

```
index.html            landing page (levels + explore)
levels.js             level registry
explore.js            explore registry (interactive math, no score)
shared/progress.js    progress store used by every level
levels/
  01-smiley-paths/    Smiley Paths
  02-vector-pairs/    Vector Pairs
  03-path-to-zero/    Path to Zero
  04-counting-strokes/ Counting Strokes
  05-minesweeper/     Minesweeper (own level list inside: Classic 16×16, Circle)
explore/
  m11/                M11 symmetry (S(4,5,11) and the Mathieu group M11)
  simple-groups/      Periodic table of finite simple groups (families by Lie rank, sporadics, order lookup, character tables)
    chartables/       Character tables (A5, A6, 26 sporadics, Tits) as JSON, from the GAP Character Table Library
  rainbow/            Rainbow vectors (spectrum → RGB, gamut loss, metrics, rebuild from k vectors)
  constants/          Scale of Constants (math constants and Standard Model parameters on one ruler, running couplings)
  rubiks-cube/        Vector Cube (Rubik's cube as 54 position/facing/color sticker vectors, one rotation rule)
  j1/                 J1 viewer (the Livingstone graph: 266 vertices built from J1; spin, re-root, random symmetries)
  a5/                 A5 viewer (dodecahedron with its 5 inscribed cubes, icosahedron dual; derive the character table from fixed points)
tools/
  chartable_convert.py  Regenerates explore/simple-groups/chartables from CTblLib data files
  j1/build_action.py  Rebuilds J1's 266-point action from Janko's 7×7 matrices over F11 (the generators in explore/j1)
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

## Run locally

Open `index.html` in a browser, or `python3 -m http.server` in this folder.

## Live

https://web-game-cyan-eta.vercel.app (Vercel, from `main`).
