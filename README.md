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
explore/
  m11/                M11 symmetry (S(4,5,11) and the Mathieu group M11)
  simple-groups/      Periodic table of finite simple groups (families by Lie rank, sporadics, order lookup)
```

## Add a level

1. Create `levels/NN-name/index.html` (a self-contained game page).
2. Add a back link: `<a href="../../">← Levels</a>`.
3. Load progress: `<script src="../../shared/progress.js"></script>`, then call
   - `GameKit.played(id)` on start
   - `GameKit.best(id, score)` when the score changes
   - `GameKit.complete(id)` when the level is won
4. Add an entry to `levels.js` with the same `id`.

## Add an explore page

1. Create `explore/name/index.html` (self-contained, back link to `../../`).
2. Add an entry to `explore.js` with a short `badge` (up to ~3 characters).

## Run locally

Open `index.html` in a browser, or `python3 -m http.server` in this folder.

## Live

https://web-game-cyan-eta.vercel.app (Vercel, from `main`).
