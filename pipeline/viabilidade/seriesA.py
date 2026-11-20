# A) virtual-sensor feasibility: per-sensor series, neighbour correlations, leave-one-out prediction.
import duckdb, numpy as np, pandas as pd, sys
sys.path.insert(0, __import__("os").path.dirname(__file__)); from geo import sensors
from sklearn.linear_model import RidgeCV
T0,T1="2026-11-03 15:00:00","2026-11-10 11:00:00"  # rs ends 10/11 11:22
MIN_RS=int(sys.argv[1]) if len(sys.argv)>1 else 3000
con=duckdb.connect()
def series(freq):
    b=f"time_bucket(interval '{freq}', t)"
    q=[f"select 'cw' ty, id, {b} b, count(*) n from 'data/cw.parquet' where t>='{T0}' and t<'{T1}' group by all",
       f"select 'tz', zone, time_bucket(interval '{freq}', tin), count(*) from 'data/vis.parquet' where tin>='{T0}' and tin<'{T1}' group by all",
       f"""select 'rs', id, {b}, count(*) from 'data/rs.parquet' where t>='{T0}' and t<'{T1}'
           and id in (select id from 'data/rs.parquet' group by id having count(*)>={MIN_RS}) group by all"""]
    long=con.sql(" union all ".join(q)).df()
    # parking: occupied fraction per RSU, state of each spot sampled at bucket midpoint (asof)
    pk=con.sql(f"""with g as (select unnest(generate_series(timestamp '{T0}', timestamp '{T1}' - interval '{freq}', interval '{freq}')) b),
      spots as (select distinct id, rsu from 'data/park.parquet'),
      grid as (select id, rsu, b, b + interval '{freq}'/2 m from spots, g),
      ev as (select distinct id, t, status from 'data/park.parquet')
      select 'pk' ty, rsu id, b, avg((status='occupied')::int) n
      from grid asof left join ev on grid.id=ev.id and ev.t<=grid.m group by all""").df()
    long=pd.concat([long.set_axis(["ty","id","b","n"],axis=1),pk])
    idx=pd.date_range(T0,T1,freq=freq.replace(" minutes","min").replace("1 hour","h"),inclusive="left")
    W=long.pivot_table(index="b",columns="id",values="n").reindex(idx)
    W.loc[:, [c for c in W if not c.startswith("urn:ngsi-ld:RoadSideUnit")]] = W.loc[:, [c for c in W if not c.startswith("urn:ngsi-ld:RoadSideUnit")]].fillna(0)
    return W
def deseason(W):  # remove each sensor's mean hour-of-day profile
    return W - W.groupby(W.index.hour).transform("mean")
H=series("1 hour"); Q=series("15 minutes")
S=sensors(set(H.columns)); S=S.loc[[c for c in H.columns if c in S.index]]
print("sensors:",S.type.value_counts().to_dict(), "hours:",len(H))
D=np.hypot(S.x.values[:,None]-S.x.values[None],S.y.values[:,None]-S.y.values[None]); D=pd.DataFrame(D,S.index,S.index)
def neigh_corr(W,label):
    out=[]
    for meth in ["pearson","spearman"]:
        for ds in [False,True]:
            C=(deseason(W) if ds else W)[S.index].corr(method=meth)
            for s in S.index:
                ty=S.type[s]; d=D[s].drop(s)
                same=d[S.type[d.index]==ty].nsmallest(3).index
                other=d[(S.type[d.index]!=ty)&(d<=500)]
                other=other.groupby(S.type[other.index]).idxmin().values  # nearest of each other type
                out.append(dict(meth=meth,deseason=ds,ty=ty,id=s,max_same=C.loc[s,same].max(),
                    max_other=C.loc[s,other].max() if len(other) else np.nan,n_other=len(other)))
    o=pd.DataFrame(out)
    g=o.groupby(["meth","deseason","ty"]).agg(n=("id","size"),med_same=("max_same","median"),gt07_same=("max_same",lambda v:(v>0.7).sum()),
        med_other=("max_other","median"),gt07_other=("max_other",lambda v:(v>0.7).sum()),has_other=("max_other",lambda v:v.notna().sum()))
    print(f"\n== neighbour correlation ({label}); max over 3 nearest same-type / nearest other-type within 500m"); print(g.round(2).to_string())
    return o
oh=neigh_corr(H,"hourly"); oq=neigh_corr(Q,"15-min")
oh.to_csv("out_A_corr_hourly.csv",index=False)
# Leave-one-sensor-out: predict cw / tz hourly series from other sensors
split=pd.Timestamp("2026-11-08 11:00")  # ~5 days train / ~2 days test
res=[]
for s in S.index[S.type.isin(["cw","tz"])]:
    y=H[s]; d=D[s].drop(s)
    nb=list(d[S.type[d.index]==S.type[s]].nsmallest(5).index)+list(d[S.type[d.index]!=S.type[s]].nsmallest(5).index)
    X=pd.concat([H[nb].ffill().fillna(0), pd.get_dummies(H.index.hour,prefix="h",dtype=float).set_index(H.index),
                 pd.Series((H.index.dayofweek>=5).astype(float),H.index,name="we")],axis=1)
    X.columns=X.columns.astype(str)
    tr,te=H.index<split, H.index>=split
    m=RidgeCV(alphas=np.logspace(-2,3,12)).fit(X[tr],y[tr]); p=np.clip(m.predict(X[te]),0,None)
    Xh=X.drop(columns=nb); mh=RidgeCV(alphas=np.logspace(-2,3,12)).fit(Xh[tr],y[tr]); ph=np.clip(mh.predict(Xh[te]),0,None)
    naive=y.shift(24)[te]
    mae=lambda a:np.mean(np.abs(a-y[te]))
    res.append(dict(id=s[-6:],ty=S.type[s],mean=y[te].mean(),mae_ridge=mae(p),mae_hourOnly=mae(ph),mae_naive24=mae(naive),
        rel_ridge=mae(p)/y[te].mean(),rel_naive=mae(naive)/y[te].mean()))
r=pd.DataFrame(res); print("\n== LOSO ridge (neighbours+hour+weekend) vs hour-only ridge vs naive lag-24h, test = last ~2 days"); print(r.round(2).to_string())
print(r.groupby("ty")[["rel_ridge","rel_naive"]].median().round(2), "\nridge beats naive in", (r.mae_ridge<r.mae_naive24).sum(),"/",len(r),
      "; neighbours beat hour-only in",(r.mae_ridge<r.mae_hourOnly).sum(),"/",len(r))
r.to_csv("out_A_loso.csv",index=False)
