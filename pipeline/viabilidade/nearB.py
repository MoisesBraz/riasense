# B) near-conflict feasibility: crosswalk<->segment co-location and timestamp alignment vs chance.
import duckdb, json, numpy as np, pandas as pd, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from geo import R, KX, KY
from shapely.geometry import Polygon, LineString
con=duckdb.connect()
obs=con.sql("select id, st, count(*) n from 'data/rs.parquet' group by all").df()
segs={e:LineString(np.array(json.loads(l)["coordinates"])*[KX,KY]) for e,l in con.sql(f"select entityId, location from read_csv('{R}RoadSegment.csv')").fetchall() if e in set(obs.id)}
# duration semantics: does segment length / duration ~ averageVelocity (m/s)?
L=pd.Series({e:g.length for e,g in segs.items()},name="len")
chk=con.sql("select id, st, median(dur) dur, median(v) v from 'data/rs.parquet' where dur>0 and v<16383 group by all").df().join(L,on="id")
chk["len_over_dur"]=chk.len/chk.dur; chk["ratio"]=chk.len_over_dur/chk.v
print("== duration check: median(segment_length/duration)/median(averageVelocity) by sensor"); print(chk.groupby("st").ratio.describe()[["count","25%","50%","75%"]].round(2))
cws={e:Polygon(np.array(json.loads(l)["coordinates"][0])*[KX,KY]) for e,l in con.sql(f"select entityId, location from read_csv('{R}SmartCrosswalk.csv')").fetchall()}
cw=con.sql("select id, epoch(t) t, trav from 'data/cw.parquet' where trav<=60").df()
rs=con.sql("select id, st, epoch(t) t, dur, v, cat from 'data/rs.parquet' where v<16383").df()
rng=np.random.default_rng(0); SH=np.concatenate([rng.uniform(60,600,10),-rng.uniform(60,600,10)])
def matches(c,v,w):  # number of crossings with >=1 vehicle event within w s
    v=np.sort(v); lo=np.searchsorted(v,c-w); hi=np.searchsorted(v,c+w,side="right"); return (hi>lo).sum(), hi-lo
rows=[];near=[]
for e,p in cws.items():
    d={s:p.distance(g) for s,g in segs.items()}
    s30=[s for s,x in d.items() if x<=30]; s60=[s for s,x in d.items() if x<=60]
    st30=obs[obs.id.isin(s30)].groupby("st").n.sum().to_dict(); st60=obs[obs.id.isin(s60)].groupby("st").n.sum().to_dict()
    near.append(dict(cw=e[-4:],n30=len(s30),types30=st30,n60=len(s60),types60=st60))
    c=cw[cw.id==e]; v=rs[rs.id.isin(s30)]
    if not len(s30) or not len(v): continue
    # only overlap period of both sensors (rs ends 10/11 11:22)
    a,b=max(c.t.min(),v.t.min()),min(c.t.max(),v.t.max()); c=c[(c.t>=a)&(c.t<=b)]; v=v[(v.t>=a)&(v.t<=b)]
    r=dict(cw=e[-4:],n_cross=len(c),n_veh=len(v),veh_per_h=round(len(v)/((b-a)/3600),1))
    for cname,ct in [("cEnd",c.t.values),("cStart",(c.t-c.trav).values)]:
        for vname,vt in [("vT",v.t.values),("vT-dur",(v.t-v.dur.fillna(0)).values)]:
            for w in [2,5]:
                m,_=matches(ct,vt,w); ch=np.mean([matches(ct,vt+s,w)[0] for s in SH])
                r[f"{cname}|{vname}|{w}s"]=f"{m}/{ch:.0f}"
    m=matches(c.t.values,v.t.values,2)[1]; vs=np.sort(v.t.values)
    # speeds of vehicles matched within +-2s of crossing end, by sensor
    lo=np.searchsorted(vs,c.t.values-2); hi=np.searchsorted(vs,c.t.values+2,side="right")
    idx=np.concatenate([np.arange(l,h) for l,h in zip(lo,hi)]) if len(lo) else []
    vv=v.sort_values("t").iloc[idx]
    r["matched_v_med_by_st"]={k:round(x,1) for k,x in vv.groupby("st").v.median().items()}
    r["all_v_med_by_st"]={k:round(x,1) for k,x in v.groupby("st").v.median().items()}
    rows.append(r)
print("\n== crosswalk -> observed segments within 30/60 m (event counts by sensorType)"); print(pd.DataFrame(near).to_string())
print("\n== timestamp alignment: '#crossings with >=1 vehicle event within w / chance mean (20 shifts of +-1..10 min)'")
o=pd.DataFrame(rows); pd.set_option("display.width",250); print(o.to_string())
o.to_csv("out_B.csv",index=False)
