# C) silent gaps > 2 h per sensor, with expected count (same hours, other days) and neighbour silence.
import duckdb, numpy as np, pandas as pd, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from geo import sensors
con=duckdb.connect()
ev=con.sql("""select 'cw' ty, id, t from 'data/cw.parquet'
 union all select 'tz', zone, tin from 'data/vis.parquet'
 union all select 'pk', rsu, t from 'data/park.parquet'
 union all select 'rs', id, t from 'data/rs.parquet' where id in (select id from 'data/rs.parquet' where st<>'V2X' group by id having count(*)>=1000)""").df()
ev=ev.sort_values(["id","t"])
lim=ev.groupby("ty").t.agg(["min","max"])
# hourly counts for expectation & neighbour checks
ev["h"]=ev.t.dt.floor("h"); HC=ev.groupby(["id","h"]).size().unstack(0).reindex(pd.date_range(ev.h.min(),ev.h.max(),freq="h")).fillna(0)
prof=HC.groupby(HC.index.hour).mean()  # mean count per hour-of-day (incl. gaps -> conservative)
gaps=[]
for (ty,i),g in ev.groupby(["ty","id"]):
    t=pd.concat([pd.Series([lim.loc[ty,"min"]]),g.t,pd.Series([lim.loc[ty,"max"]])]).reset_index(drop=True)
    d=t.diff()
    for k in np.where(d>pd.Timedelta("2h"))[0]:
        a,b=t[k-1],t[k]; hrs=pd.date_range(a.ceil("h"),b.floor("h"),freq="h",inclusive="left")
        gaps.append(dict(ty=ty,id=i,start=a,end=b,hours=round((b-a).total_seconds()/3600,1),expected=round(prof.loc[hrs.hour,i].sum(),1) if len(hrs) else 0))
G=pd.DataFrame(gaps)
S=sensors(set(ev.id)); xy=S[["x","y"]]
tt=dict(tuple(ev.groupby("id").t))
def silent_nb(r, maxd=500):
    if r.id not in S.index: return (np.nan,np.nan)
    d=np.hypot(xy.x-xy.x[r.id],xy.y-xy.y[r.id]); nb=d[(d<=maxd)&(d.index!=r.id)].index
    # count only neighbours that are expected to be active in those hours (expected >=3 events)
    hrs=pd.date_range(r.start.ceil("h"),r.end.floor("h"),freq="h",inclusive="left")
    act=[n for n in nb if len(hrs) and prof.loc[hrs.hour,n].sum()>=3]
    sil=[n for n in act if ((tt[n]>r.start)&(tt[n]<r.end)).sum()==0]
    return len(act),len(sil)
G[["nb_active","nb_silent"]]=G.apply(lambda r: pd.Series(silent_nb(r)),axis=1)
G["unexpected"]=G.expected>=10  # would normally have seen >=10 events in those hours
G["kind"]=np.select([~G.unexpected,G.nb_silent>=np.maximum(1,0.5*G.nb_active)],["normal-quiet (low demand)","simultaneous (network/area)"],"isolated (device)")
pd.set_option("display.width",250); pd.set_option("display.max_rows",500)
G["id"]=G.id.str.split(":").str[-1]
print("events window per type:\n",lim)
print("\n== gaps >2h by type and kind"); print(G.groupby(["ty","kind"]).agg(n=("id","size"),sensors=("id","nunique"),med_h=("hours","median"),max_h=("hours","max")).to_string())
print("\n== unexpected gaps (expected>=10 events)"); print(G[G.unexpected].sort_values(["ty","start"]).to_string(index=False))
G.to_csv("out_C_gaps.csv",index=False)
