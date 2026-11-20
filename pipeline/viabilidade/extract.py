# Extract compact parquet tables from raw Mongo-export CSVs. Usage: extract.py <which...>
import duckdb, sys, time
import os; B=os.environ["RIASENSE_DATA_RAW"].rstrip("/")+"/"
con=duckdb.connect(); con.execute("SET threads=8")
def num(p): # Extended JSON number -> double
    return f"""coalesce(try_cast(json_extract_string(d,'$.{p}."$numberDouble"') as double),
      try_cast(json_extract_string(d,'$.{p}."$numberInt"') as double),
      try_cast(json_extract_string(d,'$.{p}."$numberLong"') as double),
      try_cast(json_extract_string(d,'$.{p}') as double))"""
def ts(p): return f"make_timestamp(cast(json_extract_string(d,'$.{p}.\"$date\".\"$numberLong\"') as bigint)*1000)"
src=lambda f: f"(select entityId, documentJson d from read_csv('{B}{f}', all_varchar=true, header=true, max_line_size=10000000))"
Q={
"cw": f"select entityId id, {ts('eventTimestamp')} t, {num('traverse_time')} trav, {num('wait_time')} wait, json_extract_string(d,'$.observedBy') rsu from {src('smartcrosswalk.csv')}",
"park": f"select entityId id, {ts('eventTimestamp')} t, json_extract_string(d,'$.status') status, json_extract_string(d,'$.refDevice') rsu, {num('duration')} dur, {num('location.coordinates[0]')} lon, {num('location.coordinates[1]')} lat from {src('smartparking.csv')}",
"vis": f"select json_extract_string(d,'$.refZone') zone, {ts('entryTime')} tin, {ts('exitTime')} tout, {ts('eventTimestamp')} t, {num('dwellTime')} dwell, json_extract_string(d,'$.observedBy') cam from {src('touriststats_visits.csv')}",
"rs": f"select entityId id, {ts('eventTimestamp')} t, json_extract_string(d,'$.sensorType') st, json_extract_string(d,'$.vehicleCategory') cat, {num('averageVelocity')} v, {num('maxVelocity')} vmax, {num('duration')} dur, {num('directionLane')} lane, json_extract_string(d,'$.observedBy') obs from {src('roadsegments_stats.csv')}",
}
for k in sys.argv[1:]:
    t0=time.time(); con.execute(f"copy ({Q[k]}) to 'data/{k}.parquet' (format parquet)")
    print(k, con.execute(f"select count(*) from 'data/{k}.parquet'").fetchall(), con.execute(f"select * from 'data/{k}.parquet' limit 2").fetchall(), round(time.time()-t0,1),'s')
