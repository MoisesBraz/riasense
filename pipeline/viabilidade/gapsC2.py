# C2) group unexpected gaps that start within 15 min of each other (co-temporal outages across sensors)
import pandas as pd, duckdb, json, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from geo import R
G=pd.read_csv("out_C_gaps.csv",parse_dates=["start","end"]); U=G[G.unexpected].sort_values("start").reset_index(drop=True)
U["grp"]=(U.start.diff()>pd.Timedelta("15min")).cumsum()
# RSU of each sensor for context
rsu={}
for e,o in duckdb.sql(f"select entityId, observedBy from read_csv('{R}SmartCrosswalk.csv')").fetchall(): rsu[e.split(':')[-1]]=o.split(':')[-1]
for e,o in duckdb.sql(f"select entityId, observedBy from read_csv('{R}TouristZone.csv')").fetchall(): rsu[e.split(':')[-1]]=o.split(':')[-1]
for e,o in duckdb.sql("select id, any_value(obs) from 'data/rs.parquet' where obs is not null and obs<>'[]' group by 1").fetchall(): rsu[e.split(':')[-1]]=",".join(x.split(':')[-1] for x in json.loads(o))
U["rsu"]=[i if t=="pk" else rsu.get(i,"?") for t,i in zip(U.ty,U.id.astype(str).str.zfill(4))]
g=U.groupby("grp").agg(start=("start","min"),n=("id","size"),members=("id",lambda s:list(s)),types=("ty",lambda s:"".join(sorted(set(s)))),rsus=("rsu",lambda s:sorted(set(s))),med_h=("hours","median"))
pd.set_option("display.width",250); pd.set_option("display.max_colwidth",120)
print("unexpected gaps:",len(U),"| groups:",len(g),"| groups with >=2 sensors:",(g.n>=2).sum(),"covering",g.n[g.n>=2].sum(),"gaps")
print(g[g.n>=2].to_string())
