# Task 2: do vehicles slow down when pedestrians cross? 15-min bins, segments within 30 m of each crosswalk.
import duckdb, json, numpy as np, pandas as pd, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from geo import R, KX, KY
from shapely.geometry import Polygon, LineString
T0,T1="2026-11-03 15:00:00","2026-11-10 11:00:00"; CUT=pd.Timestamp("2026-11-04 20:00")
con=duckdb.connect()
ids=set(r[0] for r in con.sql("select distinct id from 'data/rs.parquet'").fetchall())
ref=con.sql(f"select entityId, location, maxAllowedVelocity from read_csv('{R}RoadSegment.csv')").fetchall()
segs={e:LineString(np.array(json.loads(l)["coordinates"])*[KX,KY]) for e,l,_ in ref if e in ids}
# limit in m/s; shortcut: two-direction lists -> take the min, ok since only ~6 segments have two values
LIM={e:min(json.loads(m)) for e,_,m in ref if m and e in ids}
cws={e:Polygon(np.array(json.loads(l)["coordinates"][0])*[KX,KY]) for e,l in con.sql(f"select entityId, location from read_csv('{R}SmartCrosswalk.csv')").fetchall()}
rs=con.sql(f"""select id, st, time_bucket(interval '15 minutes', t) b, v*3.6 kmh, v from 'data/rs.parquet'
   where v<16383 and dur>0 and t>='{T0}' and t<'{T1}'""").df()  # speeds are m/s (limits 13.889 = 50 km/h) -> km/h
rs["lim"]=rs.id.map(LIM); rs["over"]=np.where(rs.lim.notna(),(rs.v>rs.lim).astype(float),np.nan)
print("unit check: median v/limit by sensor (m/s both):",(rs.groupby("st").apply(lambda g:(g.v/g.lim).median())).round(2).to_dict())
cw=con.sql(f"select id, time_bucket(interval '15 minutes', t) b, count(*) n from 'data/cw.parquet' where t>='{T0}' and t<'{T1}' group by all").df()
idx=pd.date_range(T0,T1,freq="15min",inclusive="left")
def ols(y,X):  # OLS with HC1 and Newey-West(4 lags) SE for coefficient 0
    X=np.column_stack([X,np.ones(len(y))]); b,*_=np.linalg.lstsq(X,y,rcond=None); e=y-X@b; n,k=X.shape
    XtXi=np.linalg.pinv(X.T@X); S=(X*e[:,None]).T@(X*e[:,None])
    for L in range(1,5):
        w=1-L/5; G=(X[L:]*e[L:,None]).T@(X[:-L]*e[:-L,None]); S+=w*(G+G.T)
    return b[0], np.sqrt((XtXi@S@XtXi)[0,0]*n/(n-k))
rows=[]
for e,p in sorted(cws.items()):
    s30=[s for s,g in segs.items() if p.distance(g)<=30]
    v=rs[rs.id.isin(s30)]
    if not len(v): continue
    g=v.groupby("b").agg(spd=("kmh","mean"),spd_med=("kmh","median"),nveh=("kmh","size"),over=("over","mean")).reindex(idx)
    g["cross"]=cw[cw.id==e].set_index("b").n.reindex(idx).fillna(0)
    if e[-4:] in ("0019","0020","0021","0022"): g=g[g.index<CUT]
    g=g.dropna(subset=["spd"]); g=g[g.nveh>=5]
    hd=pd.get_dummies(g.index.hour,dtype=float).values[:,1:]; wk=(g.index.day_of_week>=5).astype(float)
    out=dict(cw=e[-4:],n_bins=len(g),segs=len(s30),st=",".join(sorted(v.st.unique())),cross_mean=round(g.cross.mean(),1),veh_mean=round(g.nveh.mean(),0),spd_mean=round(g.spd.mean(),1))
    for dep in ["spd","spd_med"]:
        b,se=ols(g[dep].values,np.column_stack([g.cross.values,g.nveh.values,hd,wk]))
        out[f"{dep}_eff10"]=round(10*b,2); out[f"{dep}_ci"]=f"[{10*(b-1.96*se):.2f},{10*(b+1.96*se):.2f}]"
    # placebo: crossings of the farthest crosswalk (same bins) -> similar effect means it's a city-wide activity proxy
    far=max(cws,key=lambda k:p.centroid.distance(cws[k].centroid)); g["pl"]=cw[cw.id==far].set_index("b").n.reindex(g.index).fillna(0)
    X0=lambda c:np.column_stack([g[c].values/g[c].std(),g.nveh.values,hd,wk])
    out["eff_perSD"]=round(ols(g.spd.values,X0("cross"))[0],2); out["placebo_perSD"]=round(ols(g.spd.values,X0("pl"))[0],2)
    rc=np.corrcoef(g.cross,g.spd)[0,1]; out["raw_r"]=round(rc,2)
    if g.over.notna().any():
        q1,q3=g.cross.quantile([.25,.75])
        out["over_hiPed"]=round(g.over[g.cross>=q3].mean(),3); out["over_loPed"]=round(g.over[g.cross<=q1].mean(),3)
    rows.append(out)
o=pd.DataFrame(rows)
lo=o.spd_ci.str.strip("[]").str.split(",").str[0].astype(float); hi=o.spd_ci.str.strip("[]").str.split(",").str[1].astype(float)
o["slows"]=np.where(hi<0,"yes",np.where(lo>0,"FASTER","n.s."))
o["flag"]=(o.slows!="yes")&(o.cross_mean>=o.cross_mean.median())
pd.set_option("display.width",250); print(o.to_string())
print("\nslows yes / n.s. / faster:",o.slows.value_counts().to_dict(), "| flagged (no slowdown & high crossings):",list(o.cw[o.flag]))
o.to_csv("out_T2_speed.csv",index=False)
