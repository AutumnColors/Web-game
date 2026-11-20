"""Reproducible basin masks from the independently populated SQLite DEM.

This script extracts DEM-derived connected components and exports auditable grids.
It deliberately does NOT estimate lake volume: submerged bathymetry and a validated
present-day lake footprint are not available in this DEM.
"""
import argparse, csv, json, sqlite3
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEED = (31.50, 35.50)  # Geographic reference near northern Dead Sea
LEVELS = (-163.0, -440.0)

def connected(heights, rows, cols, threshold, seed):
    allowed = {key for key, h in heights.items() if h <= threshold}
    if not allowed:
        return set(), "no cells below threshold"
    # The geographic seed is deliberately NOT snapped to a distant depression.
    nearest = min(rows, key=lambda r: (r[2]-seed[0])**2 + (r[3]-seed[1])**2)
    start = (nearest[0], nearest[1])
    if start not in allowed:
        return set(), "reference cell above threshold; shoreline/bathymetry required"
    seen = {start}
    q = deque([start])
    while q:
        y,x=q.popleft()
        for p in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if p in allowed and p not in seen:
                seen.add(p);q.append(p)
    return seen, "DEM-connected component from reference cell"

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--db",type=Path,default=ROOT/"dead_sea.sqlite")
    p.add_argument("--out",type=Path,default=ROOT/"derived")
    a=p.parse_args()
    con=sqlite3.connect(a.db)
    rows=con.execute("SELECT row_idx,col_idx,latitude,longitude,area_km2,elevation_m FROM elevation_cells ORDER BY row_idx,col_idx").fetchall()
    if len(rows)!=40300 or len({(r[0],r[1]) for r in rows})!=40300:
        raise SystemExit("Expected 40,300 unique cells; run populate.py first")
    heights={(r[0],r[1]):r[5] for r in rows}
    a.out.mkdir(parents=True,exist_ok=True)
    masks={}
    summary={"grid_cells":len(rows),"seed_lat_lon":SEED,"levels":{},"volume_km3":None,
             "volume_status":"not computed: no verified present lake footprint or submerged bathymetry"}
    for level in LEVELS:
        mask,status=connected(heights,rows,155,level,SEED)
        masks[level]=mask
        summary["levels"][str(int(level))]={"connected_cells":len(mask),
          "area_km2":round(sum(r[4] for r in rows if (r[0],r[1]) in mask),4),
          "status":status}
    with (a.out/"basin_grid.csv").open("w",newline="") as f:
        w=csv.writer(f)
        w.writerow(["row","col","latitude","longitude","area_km2","dem_elevation_m",
                    "in_dem_connected_minus_163","in_dem_connected_minus_440","surface_source"])
        for r in rows:
            k=(r[0],r[1])
            w.writerow([*r,int(k in masks[-163.0]),int(k in masks[-440.0]),"AWS Terrarium z8"])
    (a.out/"diagnostics.json").write_text(json.dumps(summary,indent=2)+"\n")
    print(json.dumps(summary,indent=2))
if __name__=="__main__":
    main()
