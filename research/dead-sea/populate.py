import io,math,sqlite3,hashlib,pathlib,requests
from PIL import Image
import numpy as np
P=pathlib.Path(__file__).resolve().parent
DB=P/'dead_sea.sqlite'
con=sqlite3.connect(DB)
con.executescript("""
CREATE TABLE IF NOT EXISTS elevation_cells (row_idx INTEGER,col_idx INTEGER,latitude REAL,longitude REAL,area_km2 REAL,elevation_m REAL,source TEXT,PRIMARY KEY(row_idx,col_idx));
CREATE TABLE IF NOT EXISTS source_tiles (z INTEGER,x INTEGER,y INTEGER,sha256 TEXT,PRIMARY KEY(z,x,y));
""")
S,N,W,E,NX,NY,Z=30.,33.25,34.75,36.15,155,260,8
def xy(lat,lon):
 n=2**Z;r=math.radians(lat)
 return (lon+180)/360*n,(1-math.log(math.tan(r)+1/math.cos(r))/math.pi)*n/2
samples=[];tiles=set()
for j in range(NY):
 lat=N-(N-S)*j/(NY-1)
 for i in range(NX):
  lon=W+(E-W)*i/(NX-1);x,y=xy(lat,lon);tx,ty=int(x),int(y)
  samples.append((j,i,lat,lon,tx,ty,x-tx,y-ty));tiles.add((tx,ty))
cache={}
for tx,ty in sorted(tiles):
 url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png'
 response=requests.get(url,timeout=40);response.raise_for_status()
 raw=response.content;arr=np.asarray(Image.open(io.BytesIO(raw)).convert('RGB'))
 if arr.shape!=(256,256,3):raise ValueError('Invalid tile dimensions')
 cache[(tx,ty)]=arr
 con.execute('INSERT OR REPLACE INTO source_tiles VALUES(?,?,?,?)',(Z,tx,ty,hashlib.sha256(raw).hexdigest()))
rows=[]
for j,i,lat,lon,tx,ty,fx,fy in samples:
 rgb=cache[(tx,ty)][min(255,int(fy*256)),min(255,int(fx*256))].astype(float)
 h=float(rgb[0]*256+rgb[1]+rgb[2]/256-32768)
 area=(111.32*(N-S)/(NY-1))*(111.32*(E-W)/(NX-1)*math.cos(math.radians(lat)))
 rows.append((j,i,lat,lon,area,h,'AWS Terrarium z8'))
con.executemany('INSERT OR REPLACE INTO elevation_cells VALUES (?,?,?,?,?,?,?)',rows)
con.commit()
assert con.execute('SELECT COUNT(*) FROM elevation_cells').fetchone()[0]==NX*NY
print('Populated',len(rows),'cells from',len(tiles),'tiles; elevation range',min(x[5] for x in rows),max(x[5] for x in rows))
