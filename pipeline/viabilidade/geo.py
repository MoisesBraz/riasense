# Sensor locations (centroids, local metric projection) for all 4 sensor types.
import duckdb, json, numpy as np, pandas as pd
import os; R=os.environ["RIASENSE_DATA_RAW"].rstrip("/")+"/reference-entities/"
LAT0=40.64; KX=111320*np.cos(np.radians(LAT0)); KY=110540  # shortcut: equirectangular metres, fine at city scale (<0.1% err)
def xy(lon,lat): return np.asarray(lon)*KX, np.asarray(lat)*KY
def poly(s): return np.array(json.loads(s)["coordinates"][0])
def sensors(rs_ids=None):
    rows=[]
    for e,loc in duckdb.sql(f"select entityId, location from read_csv('{R}SmartCrosswalk.csv')").fetchall():
        c=poly(loc).mean(0); rows.append(("cw",e,*c))
    for e,loc in duckdb.sql(f"select entityId, location from read_csv('{R}TouristZone.csv')").fetchall():
        c=poly(loc).mean(0); rows.append(("tz",e,*c))
    for r,lon,lat in duckdb.sql("select rsu, avg(lon), avg(lat) from 'data/park.parquet' group by 1").fetchall():
        rows.append(("pk",r,lon,lat))
    if rs_ids is not None:
        for e,loc in duckdb.sql(f"select entityId, location from read_csv('{R}RoadSegment.csv')").fetchall():
            if e in rs_ids:
                c=np.array(json.loads(loc)["coordinates"]); m=c[len(c)//2] if len(c)>2 else c.mean(0)
                rows.append(("rs",e,*m))
    df=pd.DataFrame(rows,columns=["type","id","lon","lat"]); df["x"],df["y"]=xy(df.lon,df.lat)
    return df.set_index("id")
