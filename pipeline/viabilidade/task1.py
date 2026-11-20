# Task 1: can we fill SC0019-0022 during the RSU0030 outage from only 29 h of own history?
import duckdb, numpy as np, pandas as pd, sys, os, warnings
sys.path.insert(0, os.path.dirname(__file__)); from geo import sensors
from sklearn.linear_model import RidgeCV
import lightgbm as lgb
warnings.filterwarnings("ignore")
T0,T1="2026-11-03 15:00:00","2026-11-10 11:00:00"
CUT=pd.Timestamp("2026-11-04 20:00")  # outage 20:06 -> 20:00 bin partial, 29 h before it
con=duckdb.connect()
def series():  # hourly counts: cw, tz visits, rs events (same as seriesA, MIN_RS=3000) + parking occupancy
    b="time_bucket(interval '1 hour', t)"
    q=[f"select 'cw' ty, id, {b} b, count(*) n from 'data/cw.parquet' where t>='{T0}' and t<'{T1}' group by all",
       f"select 'tz', zone, time_bucket(interval '1 hour', tin), count(*) from 'data/vis.parquet' where tin>='{T0}' and tin<'{T1}' group by all",
       f"""select 'rs', id, {b}, count(*) from 'data/rs.parquet' where t>='{T0}' and t<'{T1}'
           and id in (select id from 'data/rs.parquet' group by id having count(*)>=3000) group by all"""]
    long=con.sql(" union all ".join(q)).df().set_axis(["ty","id","b","n"],axis=1)
    pk=con.sql(f"""with g as (select unnest(generate_series(timestamp '{T0}', timestamp '{T1}' - interval '1 hour', interval '1 hour')) b),
      spots as (select distinct id, rsu from 'data/park.parquet'), grid as (select id, rsu, b, b + interval '30 minutes' m from spots, g),
      ev as (select distinct id, t, status from 'data/park.parquet')
      select 'pk' ty, rsu id, b, avg((status='occupied')::int) n from grid asof left join ev on grid.id=ev.id and ev.t<=grid.m group by all""").df()
    W=pd.concat([long,pk]).pivot_table(index="b",columns="id",values="n").reindex(pd.date_range(T0,T1,freq="h",inclusive="left"))
    return W.fillna(0)
H=series(); S=sensors(set(H.columns)); S=S.loc[[c for c in H.columns if c in S.index]]
D=pd.DataFrame(np.hypot(S.x.values[:,None]-S.x.values[None],S.y.values[:,None]-S.y.values[None]),S.index,S.index)
cid=lambda k:f"urn:ngsi-ld:SmartCrosswalk:{k}" if f"urn:ngsi-ld:SmartCrosswalk:{k}" in S.index else [c for c in S.index if c.endswith(k)][0]
AFF=[cid(f"00{k}") for k in (19,20,21,22)]; BAD=AFF+[cid("0023"),"urn:ngsi-ld:RoadSideUnit:0030"]
post=H.index>=CUT
dead=[c for c in S.index if H.loc[post,c].sum()==0 or H.loc[post,c].std()==0]  # silent/frozen after outage
print("excluded as neighbours (silent/frozen after cut):",[c[-12:] for c in dead])
POOL=[c for c in S.index if c not in BAD and c not in dead]
HEALTHY=[c for c in S.index if S.type[c]=="cw" and c not in BAD]
hourD=pd.get_dummies(H.index.hour,prefix="h",dtype=float).set_index(H.index); we=pd.Series((H.index.dayofweek>=5).astype(float),H.index,name="we")
tr=H.index<CUT; te=H.index>=CUT
def nbrs(s,excl=()):
    d=D[s].drop([s,*excl],errors="ignore"); d=d[d.index.isin(POOL)]
    same=d[S.type[d.index]=="cw"].nsmallest(5); oth=d[S.type[d.index]!="cw"].nsmallest(5)
    return list(same.index), list(oth.index), same.values, oth.values
MU=H.mean()  # neighbour means (neighbours are observed the whole time)
def fit_log(s):  # ridge on log1p counts: multiplicative, keeps nights near 0
    a,b,_,_=nbrs(s); X=pd.concat([np.log1p(H[a+b]),hourD,we],axis=1); X.columns=X.columns.astype(str)
    return np.expm1(RidgeCV(alphas=np.logspace(-2,4,15)).fit(X[tr],np.log1p(H[s][tr])).predict(X)).clip(0)
def fit_ratio(s):  # own 29h hour profile x (5 nearest crosswalks now / their same-hour 29h level)
    a,_,_,_=nbrs(s); N=H[a].sum(1); hr=H.index.hour
    base=N[tr].groupby(hr[tr]).mean().reindex(hr).values; prof=H[s][tr].groupby(hr[tr]).mean().reindex(hr).values
    return np.nan_to_num(prof*np.clip(N.values/np.maximum(base,1),0,3))
def pooled_X(s,excl):
    a,b,da,db=nbrs(s,excl); N=H[a+b]/MU[a+b].replace(0,1)
    X=pd.DataFrame(N.values,H.index,[f"n{i}" for i in range(10)])
    for i,(dd) in enumerate(np.r_[da,db]): X[f"d{i}"]=dd
    X["hour"]=H.index.hour; X["we"]=we.values; return X
res=[];RESID=[]
for s in HEALTHY:
    y=H[s]; a,b,_,_=nbrs(s); nb=a+b; m29=y[tr].mean()
    X=pd.concat([H[nb],hourD,we],axis=1); X.columns=X.columns.astype(str)
    p_r=np.clip(RidgeCV(alphas=np.logspace(-2,4,15)).fit(X[tr],y[tr]).predict(X[te]),0,None)
    p_l=fit_log(s)[te]; p_ra=fit_ratio(s)[te]
    Xg=H[nb].copy(); Xg.columns=[f"n{i}" for i in range(10)]; Xg["hour"]=H.index.hour
    p_g=np.clip(lgb.LGBMRegressor(n_estimators=200,learning_rate=0.05,min_child_samples=3,num_leaves=7,verbose=-1).fit(Xg[tr],y[tr]).predict(Xg[te]),0,None)
    prof=y[tr].groupby(y.index[tr].hour).mean(); p_prof=prof.reindex(y.index[te].hour).values
    naive=y.shift(24)[te].values
    # transfer: pooled model on all OTHER healthy crosswalks (full period), target normalised by own mean
    others=[o for o in HEALTHY if o!=s]
    XP=pd.concat([pooled_X(o,[s]) for o in others]); yP=pd.concat([H[o]/MU[o] for o in others])
    Xs=pooled_X(s,[])
    gb=lgb.LGBMRegressor(n_estimators=300,learning_rate=0.05,num_leaves=15,min_child_samples=20,verbose=-1).fit(XP,yP)
    p_tg=np.clip(gb.predict(Xs[te]),0,None)*m29
    hd=lambda X:pd.concat([X.drop(columns="hour").reset_index(drop=True),pd.get_dummies(X.hour,prefix="h",dtype=float).reset_index(drop=True)],axis=1)
    rp=RidgeCV(alphas=np.logspace(-2,4,15)).fit(hd(XP),yP); p_tr=np.clip(rp.predict(hd(Xs[te])),0,None)*m29
    # hybrid: transfer shape, rescaled so its 29 h fit matches own 29 h mean
    k=y[tr].sum()/max(1e-9,(np.clip(gb.predict(Xs[tr]),0,None)*m29).sum()); p_tgk=p_tg*k
    wkte=(H.index[te].day_of_week>=5); yt=y[te].values; mu=yt.mean(); mae=lambda p:np.mean(np.abs(p-yt))/mu
    res.append(dict(cw=s[-4:],mean_te=round(mu,1),ridge29=mae(p_r),ratio29=mae(p_ra),we_ratio29=np.abs(p_ra-yt)[wkte].sum()/yt[wkte].sum(),ridge29log=mae(p_l),we_ridge29=np.abs(p_r-yt)[wkte].sum()/yt[wkte].sum(),we_ridge29log=np.abs(p_l-yt)[wkte].sum()/yt[wkte].sum(),lgbm29=mae(p_g),profile29=mae(p_prof),naive24=np.nanmean(np.abs(naive-yt))/mu,
                    transfer_lgbm=mae(p_tg),transfer_ridge=mae(p_tr),transfer_lgbm_rescaled=mae(p_tgk)))
    RESID.append(pd.DataFrame(dict(cw=s,t=H.index[te],y=yt,p=p_r,pl=p_l,pra=p_ra,m29=m29)))
r=pd.DataFrame(res).set_index("cw"); pd.set_option("display.width",200)
print("\n== 29h-train simulation on healthy crosswalks: rel. MAE on test (04/11 20:00 - 10/11 11:00)"); print(r.round(2).to_string())
print("\nmedian:"); print(r.drop(columns="mean_te").median().round(3).to_string())
print("count-weighted (sum MAE / sum mean):"); print((r.drop(columns="mean_te").mul(r.mean_te,axis=0).sum()/r.mean_te.sum()).round(3).to_string())
R=pd.concat(RESID); R["rel"]=(R.y-R.p)/R.m29; R["rell"]=(R.y-R.pl)/R.m29; R["relra"]=(R.y-R.pra)/R.m29
# by-day error to check degradation with horizon
R["day"]=R.t.dt.date; print("\nridge29 rel MAE by day (pooled over cws):"); print(R.groupby("day").apply(lambda g:np.abs(g.y-g.p).sum()/g.y.sum()).round(2).to_string())
r.to_csv("out_T1_sim.csv")
R.to_csv("out_T1_resid.csv",index=False)
# (b) fill RSU0030 crosswalks with best method, chosen in-script by median rel MAE
best=sys.argv[1] if len(sys.argv)>1 else r.drop(columns=["mean_te","naive24","we_ridge29","we_ridge29log","we_ratio29"]).median().idxmin(); print("\nbest method:",best)
q10,q90=np.quantile({"ridge29log":R.rell,"ratio29":R.relra}.get(best,R.rel),[0.1,0.9]); print("80% rel interval (residual/mean29):",round(q10,2),round(q90,2))
XP=pd.concat([pooled_X(o,[]) for o in HEALTHY]); yP=pd.concat([H[o]/MU[o] for o in HEALTHY])
gb=lgb.LGBMRegressor(n_estimators=300,learning_rate=0.05,num_leaves=15,min_child_samples=20,verbose=-1).fit(XP,yP)
out=[]
for s in AFF:
    y=H[s]; m29=y[tr].mean(); Xs=pooled_X(s,[])
    if best=="ridge29log": p=fit_log(s)
    elif best=="ratio29": p=fit_ratio(s)
    elif best=="ridge29":
        a,b,_,_=nbrs(s); X=pd.concat([H[a+b],hourD,we],axis=1); X.columns=X.columns.astype(str)
        p=np.clip(RidgeCV(alphas=np.logspace(-2,4,15)).fit(X[tr],y[tr]).predict(X),0,None)
        print(s[-4:],"neighbours:",[c[-4:] for c in a+b])
    elif best.startswith("transfer_lgbm"):
        p=np.clip(gb.predict(Xs),0,None)*m29
        if best.endswith("rescaled"): p*=y[tr].sum()/max(1e-9,p[tr].sum())
    else: raise SystemExit(f"best={best}: fill path not implemented")  # shortcut: only the transfer path is wired for filling
    print(s[-4:],"29h fit rel MAE:",round(np.mean(np.abs(p[tr]-y[tr]))/m29,2),"mean29:",round(m29,1))
    out.append(pd.DataFrame(dict(crosswalk=s,hour=H.index[te],est=p[te].round(1),lo80=np.clip(p[te]+q10*m29,0,None).round(1),hi80=(p[te]+q90*m29).round(1))))
O=pd.concat(out); O.to_csv("out_fill_rsu0030.csv",index=False)
# sanity: daily shape & weekend dip vs healthy crosswalks
O["h"]=O.hour.dt.hour; O["we"]=O.hour.dt.dayofweek>=5
print("\nfilled: mean by hour (all 4 summed):"); print(O.groupby("h").est.sum().div(O.hour.dt.date.nunique()).round(0).to_dict())
fw=O.groupby(["crosswalk","we"]).est.mean().unstack(); print("filled weekend/weekday ratio:",(fw[True]/fw[False]).round(2).to_dict())
hw=H.loc[te,HEALTHY].groupby(H.index[te].dayofweek>=5).mean(); print("healthy weekend/weekday ratio median:",round((hw.loc[True]/hw.loc[False]).median(),2))
print("own 29h hourly profile (4 summed):",H.loc[tr,AFF].sum(1).groupby(H.index[tr].hour).mean().round(0).to_dict())
