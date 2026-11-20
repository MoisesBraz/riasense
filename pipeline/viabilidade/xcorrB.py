# B2) cross-correlogram: vehicle-event time minus crossing time, all pairs within +-60 s, segments within 30 m.
# A real interaction (vehicles stopping for pedestrians) would show a dip/peak near 0 vs the flat 30-60 s baseline.
import duckdb, json, numpy as np, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from geo import R, KX, KY
from shapely.geometry import Polygon, LineString
con=duckdb.connect()
ids=set(r[0] for r in con.sql("select distinct id from 'data/rs.parquet'").fetchall())
segs={e:LineString(np.array(json.loads(l)["coordinates"])*[KX,KY]) for e,l in con.sql(f"select entityId, location from read_csv('{R}RoadSegment.csv')").fetchall() if e in ids}
cws={e:Polygon(np.array(json.loads(l)["coordinates"][0])*[KX,KY]) for e,l in con.sql(f"select entityId, location from read_csv('{R}SmartCrosswalk.csv')").fetchall()}
cw=con.sql("select id, epoch(t) t from 'data/cw.parquet'").df(); rs=con.sql("select id, st, epoch(t) t from 'data/rs.parquet'").df()
bins=np.arange(-60,61,2); H={}
for e,p in cws.items():
    s=[k for k,g in segs.items() if p.distance(g)<=30]
    for st,v in rs[rs.id.isin(s)].groupby("st"):
        vt=np.sort(v.t.values); c=cw[cw.id==e].t.values
        lo=np.searchsorted(vt,c-60); hi=np.searchsorted(vt,c+60)
        off=np.concatenate([vt[l:h]-x for l,h,x in zip(lo,hi,c)])
        H[st]=H.get(st,0)+np.histogram(off,bins)[0]
for st,h in H.items():
    base=np.r_[h[:10],h[-10:]].mean()  # |offset| 40-60 s
    print(st, "pairs", h.sum(), "ratio to baseline per 2s bin from -20..+20s:", np.round(h[20:40]/base,2))
