#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Telecom Power — PLN Outage Top-Site Engine (v1-v3)
Reads 3 raw datasets, cleans + joins on Site ID, derives impact ranking,
writes a compact data.json for the dashboard app.

Usage:
  python run.py --avail <dir of Avail *.csv> \
                --events <event export .xlsx> \
                --config <New_BBT config .xlsx> \
                --out ../app/public/data.json
"""
import argparse, json, re, glob, os, datetime as dt
import duckdb, openpyxl

def dur_to_sec(s):
    if s is None: return 0
    if isinstance(s,(int,float)): return int(s)
    m=re.findall(r'(\d+)\s*h|\b(\d+)\s*m|\b(\d+)\s*s', str(s))
    h=mi=se=0
    for a,b,c in re.findall(r'(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?', str(s)):
        if a: h=int(a)
        if b: mi=int(b)
        if c: se=int(c)
    return h*3600+mi*60+se

def num(x):
    if x is None or x=='': return None
    if isinstance(x,(int,float)): return float(x)
    x=str(x).strip().replace('.','').replace(',','.') if re.match(r'^\d{1,3}(\.\d{3})+(,\d+)?$',str(x)) else str(x).replace(',','.')
    try: return float(x)
    except: return None

def parse_coord(s):
    if not s: return (None,None)
    m=re.match(r'\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)',str(s))
    if m: return (float(m.group(1)), float(m.group(2)))
    return (None,None)

def clean_nop(s):
    if not s: return None
    return re.sub(r'^\s*\d+\s+','',str(s)).strip()

# ---------------- 1. AVAIL (network impact) via DuckDB ----------------
def load_avail(avail_dir):
    con=duckdb.connect()
    g=f"read_csv_auto('{avail_dir}/*.csv')"
    rows=con.execute(f'''
      SELECT site_id,
             any_value(area) area, any_value(regional) regional,
             any_value(networksite) nop, any_value(districtoperation) too,
             any_value(site_class) site_class, any_value(vendor) vendor,
             sum(LEAST("duration_power (Sec)",86400)) power_sec_cap,
             sum("duration_power (Sec)") power_sec_raw,
             sum(("duration_power (Sec)">0)::int) power_days,
             count(*) site_days,
             min("ava_power (%)") min_ava_power
      FROM {g} GROUP BY site_id''').fetchall()
    cols=['site_id','area','regional','nop','to','site_class','vendor','power_sec_cap','power_sec_raw','power_days','site_days','min_ava_power']
    return {r[0]:dict(zip(cols,r)) for r in rows}

# ---------------- 2. EVENT EXPORT (frequency + quality + genset) --------
def load_events(path):
    wb=openpyxl.load_workbook(path, read_only=True, data_only=True); ws=wb["Sheet1"]
    it=ws.iter_rows(min_row=2, values_only=True)
    agg={}
    for r in it:
        sid=r[4]
        if not sid: continue
        fl=str(r[6] or "")
        d=agg.setdefault(sid,{'n_events':0,'n_ne_down':0,'n_only_mains':0,'backup_sec':0,
                              'q_bad':0,'q_ok':0})
        d['n_events']+=1
        d['backup_sec']+=int(r[14] or 0)
        ne_down = 'NE Down' in fl
        if fl=='ONLY MAINS FAIL': d['n_only_mains']+=1; d['q_ok']+=1
        if ne_down: d['n_ne_down']+=1
        if ('Empty LOW BATT' in fl) and ne_down: d['q_bad']+=1   # battery emptied -> site down
        else: d['q_ok']+=1 if not ne_down else 0
    wb.close()
    return agg

# ---------------- 3. CONFIG (v2 lifecycle + v3 payload) -----------------
def load_config(path):
    wb=openpyxl.load_workbook(path, read_only=True, data_only=True); ws=wb["Data Site JPP H1 2025 A1"]
    cfg={}
    now=dt.datetime(2026,7,1)
    for r in ws.iter_rows(min_row=4, values_only=True):
        sid=r[1]
        if not sid: continue
        bd=r[8]; age=None
        if isinstance(bd,dt.datetime): age=round((now-bd).days/365.25,1)
        lat,lng=parse_coord(r[14])
        payload=0.0; pcount=0; bad=0
        for i in (73,74,75,76):
            v=num(r[i])
            if v is not None and 0<=v<1_000_000: payload+=v; pcount+=1   # drop corrupt month values
            elif v is not None: bad+=1
        cfg[sid]={
          'batt_age_yr':age,'batt_type':r[69],'batt_qty':num(r[71]),'batt_bank':num(r[72]),
          'load_a':num(r[9]),'target_max_h':num(r[11]),'main_power':r[65],'backup_power':r[66],
          'genset_fix':r[67],'payload_gb':(payload if pcount else None),'payload_months':pcount,'payload_bad':bad,
          'lat':lat,'lng':lng,'cluster_to':(r[13] or None),'nop_cfg':clean_nop(r[12]),
          'vip':r[7],'hub':r[6]}
    wb.close()
    return cfg

def pct(vals,p):
    xs=sorted(v for v in vals if v is not None)
    if not xs: return 0
    import math; k=(len(xs)-1)*p; f=math.floor(k); c=math.ceil(k)
    return xs[f] if f==c else xs[f]+(xs[c]-xs[f])*(k-f)

def build(avail,events,config):
    sites=[]
    all_sids=set(avail)|set(events)|set(config)
    for sid in all_sids:
        a=avail.get(sid,{}); e=events.get(sid,{}); c=config.get(sid,{})
        power_sec=a.get('power_sec_cap') or 0            # wall-clock (capped 24h/day)
        power_h=round(power_sec/3600.0,2)
        power_ne_h=round((a.get('power_sec_raw') or 0)/3600.0,1)   # NE-hours severity (reference)
        n_events=e.get('n_events',0); n_ne=e.get('n_ne_down',0)
        payload=c.get('payload_gb'); pm=c.get('payload_months') or 0
        # v3 lost-GB proxy: equivalent full-outage site-days * daily payload
        lost_gb=None
        if payload and pm:
            daily=payload/(pm*30.0); eq_days=power_sec/86400.0
            lost_gb=round(daily*eq_days,0)
        # v2 tri-state: True=backup failed(site down); False=held; None=no event data
        under_dim = (n_ne>0) if sid in events else None
        sites.append({
          'site_id':sid,
          'area':a.get('area'),'region':a.get('regional'),
          'nop':clean_nop(a.get('nop')) or c.get('nop_cfg'),
          'cluster':a.get('to') or c.get('cluster_to'),
          'class':a.get('site_class') or None,'vendor':a.get('vendor'),
          'vip':c.get('vip'),'hub':c.get('hub'),
          # v1
          'n_outage':n_events,'n_ne_down':n_ne,'n_only_mains':e.get('n_only_mains',0),
          'power_dt_hours':power_h,'power_ne_hours':power_ne_h,'power_days':a.get('power_days',0),
          'min_ava_power':round(a.get('min_ava_power'),2) if a.get('min_ava_power') is not None else None,
          # v3
          'payload_gb':round(payload,0) if payload else None,'lost_gb':lost_gb,
          # v2
          'under_dim':under_dim,'batt_age_yr':c.get('batt_age_yr'),'batt_type':c.get('batt_type'),
          'batt_qty':c.get('batt_qty'),'target_max_h':c.get('target_max_h'),
          'genset_fix':c.get('genset_fix'),
          'lat':c.get('lat'),'lng':c.get('lng'),
          'in_avail':sid in avail,'in_events':sid in events,'in_config':sid in config,
        })
    # impact score = wall-clock power downtime hours (primary, universal, genset-adjusted)
    for s in sites:
        s['impact_score']=round(s['power_dt_hours'] or 0,1)
    # bad-grid threshold = 75th pct of power_dt_hours among sites with any power dt
    thr=pct([s['power_dt_hours'] for s in sites if s['power_dt_hours']>0],0.75)
    for s in sites: s['bad_grid']= s['power_dt_hours']>=thr and s['power_dt_hours']>0
    sites.sort(key=lambda s:s['impact_score'], reverse=True)

    def rollup(level):
        agg={}
        for s in sites:
            k=s.get(level)
            if not k: continue
            d=agg.setdefault(k,{level:k,'nop':s.get('nop'),'region':s.get('region'),
                'n_sites':0,'n_outage':0,'n_ne_down':0,'power_dt_hours':0.0,'lost_gb':0.0,
                'bad_grid_sites':0,'under_dim_sites':0})
            d['n_sites']+=1; d['n_outage']+=s['n_outage']; d['n_ne_down']+=s['n_ne_down']
            d['power_dt_hours']+=s['power_dt_hours'] or 0; d['lost_gb']+=s['lost_gb'] or 0
            d['bad_grid_sites']+=int(s['bad_grid']); d['under_dim_sites']+=int(s['under_dim'] is True)
        out=list(agg.values())
        for d in out:
            d['power_dt_hours']=round(d['power_dt_hours'],1); d['lost_gb']=round(d['lost_gb'],1)
            d['impact_score']=d['power_dt_hours']
        out.sort(key=lambda d:d['impact_score'],reverse=True)
        return out

    clusters=rollup('cluster'); nops=rollup('nop'); regions=rollup('region')
    meta={'area':'AREA1','period':'2026-H1','generated':dt.datetime.now().isoformat(timespec='seconds'),
          'n_sites':len(sites),'n_sites_impacted':sum(1 for s in sites if s['power_dt_hours']>0),
          'total_outages':sum(s['n_outage'] for s in sites),
          'total_ne_down':sum(s['n_ne_down'] for s in sites),
          'total_power_dt_hours':round(sum(s['power_dt_hours'] or 0 for s in sites),0),
          'bad_grid_threshold_h':round(thr,1),
          'coverage':{'in_avail':sum(s['in_avail'] for s in sites),
                      'in_events':sum(s['in_events'] for s in sites),
                      'in_config':sum(s['in_config'] for s in sites),
                      'payload':sum(1 for s in sites if s['payload_gb']),
                      'batt_age':sum(1 for s in sites if s['batt_age_yr'] is not None)}}
    return {'meta':meta,'sites':sites,'clusters':clusters,'nops':nops,'regions':regions}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--avail',required=True); ap.add_argument('--events',required=True)
    ap.add_argument('--config',required=True); ap.add_argument('--out',default='data.json')
    ap.add_argument('--topn',type=int,default=0)
    a=ap.parse_args()
    print("[1/4] Avail (DuckDB)…"); avail=load_avail(a.avail); print("   sites:",len(avail))
    print("[2/4] Events…"); events=load_events(a.events); print("   sites:",len(events))
    print("[3/4] Config…"); config=load_config(a.config); print("   sites:",len(config))
    print("[4/4] Join + score…"); data=build(avail,events,config)
    os.makedirs(os.path.dirname(a.out) or '.',exist_ok=True)
    json.dump(data,open(a.out,'w'),ensure_ascii=False)
    m=data['meta']
    print(f"\n  wrote {a.out}  ({os.path.getsize(a.out)/1024:.0f} KB)")
    print(f"  sites={m['n_sites']:,}  impacted={m['n_sites_impacted']:,}  outages={m['total_outages']:,}  NE-down={m['total_ne_down']:,}")
    if a.topn:
        print(f"\n=== TOP {a.topn} SITES by impact ===")
        for s in data['sites'][:a.topn]:
            ud={True:'YES',False:'no',None:'?'}[s['under_dim']]
            print(f"  {s['site_id']:8} {str(s['cluster'])[:15]:15} {str(s['region']):11} "
                  f"pwrDT={s['power_dt_hours']:7.0f}h  out={s['n_outage']:3}  NEdown={s['n_ne_down']:3}  "
                  f"lostGB={('' if s['lost_gb'] is None else format(int(s['lost_gb']),','))!s:>10}  underdim={ud}")
        print(f"\n=== TOP 10 CLUSTERS ===")
        for d in data['clusters'][:10]:
            print(f"  {str(d['cluster'])[:20]:20} {str(d['nop'])[:16]:16} sites={d['n_sites']:3} "
                  f"pwrDT={d['power_dt_hours']:9.1f}h outages={d['n_outage']:4} bad_grid={d['bad_grid_sites']:3} underdim={d['under_dim_sites']:3}")

if __name__=='__main__': main()
