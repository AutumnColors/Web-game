# Dead Sea basin: reproducible numerical foundation

This project separates **observed DEM**, **shoreline interpretation**, and **volume integration**.

## Reproduce

1. Run `python -m pip install requests pillow numpy`.
2. Run `python research/dead-sea/populate.py` (downloads Terrarium z8 tiles and creates `dead_sea.sqlite`).
3. Run `python research/dead-sea/analyze.py` (reads SQLite, writes `derived/basin_grid.csv` and `derived/diagnostics.json`).
4. Alternatively use the GitHub Actions workflow `Dead Sea DEM`, which publishes these files as a downloadable artifact.

## Three components

1. Hypothetical lake at **−163 m**: DEM-derived connected lowland mask; requires review for spillovers, historical geography and resolution.
2. Current lake at **approximately −440 m**: **not resolved by this DEM**. Many DEM samples over water describe the water surface near −415 m rather than lakebed. A reliable modern shoreline footprint must be provided or independently sourced.
3. Exposed elevation field: **available** in SQLite, but the grid is coarse and sampled from z8 raster tiles.

## Intended integral (not yet executed)

For a validated present-water footprint `W` and highstand footprint `L`, the incremental water volume is

`ΔV = Σ_(cell in W) A_cell × (−163 − (−440)) / 1000 + Σ_(cell in L\\W) A_cell × max(0, −163 − h_cell) / 1000`

where area is km², elevation is metres, and output is km³. This does not require underwater bathymetry. It **does** require correctly identifying the present footprint and the connected highstand basin. Avoid interpreting a raw DEM threshold as a validated shoreline.

No lake-volume number is hardcoded or inferred from published totals. The output intentionally reports no volume until the boundaries are verified.
