# Web-game

A collection of small browser puzzle games. Open the landing page, pick a level, play, come back.

Plain static HTML — no build step. Progress (played / best score / cleared) is saved in the player's browser.

## Structure

```
index.html            landing page (level select)
levels.js             level registry
shared/progress.js    progress store used by every level
levels/
  01-smiley-paths/    Smiley Paths
  02-vector-pairs/    Vector Pairs
  03-lines/           Lines
```

## Add a level

1. Create `levels/NN-name/index.html` (a self-contained game page).
2. Add a back link: `<a href="../../">← Levels</a>`.
3. Load progress: `<script src="../../shared/progress.js"></script>`, then call
   - `GameKit.played(id)` on start
   - `GameKit.best(id, score)` when the score changes
   - `GameKit.complete(id)` when the level is won
4. Add an entry to `levels.js` with the same `id`.

## Run locally

Open `index.html` in a browser, or `python3 -m http.server` in this folder.

## Publish

Settings → Pages → Deploy from branch → `main` / root. The site will be at https://autumncolors.github.io/Web-game/
