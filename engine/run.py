#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PLN/Power Availability Engine v4 — availability-first, cause attribution, CAPEX justification."""
import argparse, json, re, os, datetime as dt
import duckdb, openpyxl
MLABEL=["Jan","Feb","Mar","Apr","May","Jun"]
def num(x):
    if x is None or x=='':return None
    if isinstance(x,(int,float)):return float(x)
    try:return float(str(x).replace(',','.'))
    except:return None
def parse_coord(s):
    if not s:return(None,None)
    m=re.match(r'\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)',str(s))
    return (float(m.group(1)),float(m.group(2))) if m else (None,None)
def clean_nop(s): return re.sub(r'^\s*\d+\s+','',str(s)).strip() if s else None
def clean_grp(s):
    if s is None: return None
    t=str(s).strip()
    return None if t in ('#N/A','nan','None','','N/A','#REF!') else t
def slug(s): return re.sub(r'[^a-z0-9]+','-',str(s).lower()).strip('-')

def load_avail(d):
    con=duckdb.connect(); g=f"read_csv_auto('{d}/*.csv', delim=';')"
    site_rows=con.execute(f'''SELECT site_id,
        any_value(area) area, any_value(regional) regional, any_value(networksite) nop,
        any_value(districtoperation) too, any_value(kabupaten) city, any_value(kecamatan) subdist,
        any_value(site_class) cls, any_value(vendor) vendor,
        avg("availability (%)") avail, avg("target (%)") tgt, avg("ava_power (%)") avapow,
        min("ava_power (%)") minpow,
        sum((1-"availability (%)"/100.0)*86400) dark_all, sum((1-"ava_power (%)"/100.0)*86400) dark_pow,
        sum("outage (Sec)") o_all, sum("duration_power (Sec)") o_pow, sum("duration_transport (Sec)") o_tr,
        sum("duration_ran (Sec)") o_ran, sum("duration_other (Sec)") o_oth,
        sum(("duration_power (Sec)">0)::int) pdays
        FROM {g} GROUP BY site_id''').fetchall()
    sc=['site_id','area','regional','nop','to','city','subdist','cls','vendor','avail','tgt','avapow','minpow',
        'dark_all','dark_pow','o_all','o_pow','o_tr','o_ran','o_oth','pdays']
    sites={r[0]:dict(zip(sc,r)) for r in site_rows}
    sm=con.execute(f'''SELECT site_id, CAST(substr(CAST(period AS VARCHAR),5,2) AS INT) mo,
        sum((1-"ava_power (%)"/100.0)*86400) dp FROM {g} GROUP BY 1,2''').fetchall()
    monthly={}
    for sid,mo,dp in sm:
        monthly.setdefault(sid,[0.0]*6)
        if mo and 1<=mo<=6: monthly[sid][mo-1]=round((dp or 0)/3600.0,1)
    gd=con.execute(f'''SELECT regional, networksite, districtoperation, period,
        sum((1-"ava_power (%)"/100.0)*86400) dp FROM {g} GROUP BY 1,2,3,4''').fetchall()
    sd=con.execute(f'''SELECT site_id, CAST(period AS VARCHAR) p,
        sum((1-"ava_power (%)"/100.0)*86400) dp FROM {g} WHERE "ava_power (%)"<100 GROUP BY 1,2''').fetchall()
    return sites, monthly, gd, sd

def load_events(path):
    wb=openpyxl.load_workbook(path,read_only=True,data_only=True); ws=wb["Sheet1"]
    agg={}; evlist={}; gday={}
    for r in ws.iter_rows(min_row=2,values_only=True):
        sid=r[4]
        if not sid: continue
        fl=str(r[6] or ""); ne='NE Down' in fl; start=r[7]
        d=agg.setdefault(sid,{'n':0,'ne':0,'om':0,'bs':0})
        d['n']+=1; d['bs']+=int(r[14] or 0)
        if fl=='ONLY MAINS FAIL': d['om']+=1
        if ne: d['ne']+=1
        if isinstance(start,dt.datetime):
            key=start.strftime('%Y%m%d')
            for lvl,k in (('cluster',r[3]),('nop',clean_nop(r[2])),('region',r[1]),('estate','AREA1')):
                if k: gday[(lvl,k,key)]=gday.get((lvl,k,key),0)+1
        evlist.setdefault(sid,[]).append((start,int(r[14] or 0),fl,ne))
    wb.close()
    for sid,l in evlist.items():
        l.sort(key=lambda x:(x[0] or dt.datetime.min),reverse=True); evlist[sid]=l[:50]
    return agg, evlist, gday

def load_config(path):
    wb=openpyxl.load_workbook(path,read_only=True,data_only=True); ws=wb["Data Site JPP H1 2025 A1"]
    cfg={}; now=dt.datetime(2026,7,1)
    for r in ws.iter_rows(min_row=4,values_only=True):
        sid=r[1]
        if not sid: continue
        bd=r[8]; age=round((now-bd).days/365.25,1) if isinstance(bd,dt.datetime) else None
        lat=num(r[16]); lng=num(r[15])
        if lat is None or lng is None or not (-6.5<lat<6.5 and 94<lng<108): lat,lng=parse_coord(r[14])
        if lat is None or lng is None or not (-6.5<lat<6.5 and 94<lng<108): lat=lng=None
        cfg[sid]={'age':age,'bt':r[69],'bq':num(r[71]),'load':num(r[9]),'tmax':num(r[11]),
                  'gen':r[67],'lat':lat,'lng':lng,'to':clean_grp(r[13]),'nop':clean_nop(r[12]),'vip':r[7],'hub':r[6]}
    wb.close(); return cfg

def pctile(vals,p):
    xs=sorted(v for v in vals if v is not None)
    if not xs: return 0
    import math; k=(len(xs)-1)*p; f=math.floor(k); c=math.ceil(k)
    return xs[f] if f==c else xs[f]+(xs[c]-xs[f])*(k-f)

def build(av,monthly,gd,sitedaily,events,evlist,gday,cfg,outdir):
    alls=set(av)|set(events)|set(cfg)
    op75=pctile([events[s]['n'] for s in events],0.75) or 1
    sites=[]
    for sid in alls:
        a=av.get(sid,{}); e=events.get(sid); c=cfg.get(sid,{})
        pdark=round((a.get('dark_pow') or 0)/3600.0,1)       # PRIMARY: site-dark power hours (honest)
        dark_all=round((a.get('dark_all') or 0)/3600.0,1)
        o_all=a.get('o_all') or 0
        cause={k:round((a.get('o_'+k) or 0)/3600.0,1) for k in ('pow','tr','ran','oth')}
        pow_share=round(100*(a.get('o_pow') or 0)/o_all,1) if o_all else None
        avail=round(a['avail'],3) if a.get('avail') is not None else None
        target=round(a['tgt'],3) if a.get('tgt') is not None else None
        gap=round(target-avail,3) if (avail is not None and target is not None) else None
        m=monthly.get(sid,[0.0]*6)
        n=e['n'] if e else 0; ne=e['ne'] if e else 0
        insuff=(ne>0) if e else None
        if not e: pattern="no_data"
        else:
            gb=n>=op75
            pattern="both" if (gb and ne>0) else "grid_backup_ok" if (gb and ne==0) else "backup_fail" if ne>0 else "minimal"
        mi=sum(1 for x in m if x>24)
        repeat="chronic" if mi>=4 else ("intermittent" if mi>=2 else ("one_off" if mi==1 else "none"))
        earlier=sum(m[0:3]); recent=sum(m[3:6])
        if earlier+recent<24: trend="stable"
        else:
            pctd=(recent-earlier)/earlier if earlier>0 else (1 if recent>0 else 0)
            trend="worsening" if pctd>0.2 else ("improving" if pctd<-0.2 else "stable")
        # likely-dead: no event feed + near-permanently dark (avail very low) -> exclude from ranking
        likely_dead = (e is None) and (avail is not None and avail<40) and (a.get('pdays',0)>=140)
        # fault class for CAPEX attribution
        if e is None: fault="unverified"
        elif insuff: fault="backup"      # CAPEX-addressable (backup failed)
        else: fault="pln"                # grid issue, backup held -> escalate PLN
        sites.append({'site_id':sid,'area':a.get('area'),'region':a.get('regional'),
            'nop':clean_grp(clean_nop(a.get('nop')) or c.get('nop')),'cluster':clean_grp(a.get('to') or c.get('to')),
            'class':a.get('cls'),'vendor':a.get('vendor'),'city':clean_grp(a.get('city')),'vip':c.get('vip'),'hub':c.get('hub'),
            'avail_pct':avail,'target_pct':target,'avail_gap':gap,
            'power_dt_hours':pdark,'dark_all_h':dark_all,'power_share_pct':pow_share,
            'cause_pow':cause['pow'],'cause_tr':cause['tr'],'cause_ran':cause['ran'],'cause_oth':cause['oth'],
            'power_ne_hours':cause['pow'],  # raw NE-summed power = severity
            'n_outage':n,'n_ne_down':ne,'n_only_mains':(e['om'] if e else 0),
            'power_days':a.get('pdays',0),'min_ava_power':round(a['minpow'],2) if a.get('minpow') is not None else None,
            'backup_insufficient':insuff,'pattern':pattern,'repeat':repeat,'trend':trend,'m':[round(x,1) for x in m],
            'fault':fault,'likely_dead':bool(likely_dead),
            'batt_age_yr':c.get('age'),'batt_type':c.get('bt'),'batt_qty':c.get('bq'),
            'target_max_h':c.get('tmax'),'genset_fix':c.get('gen'),'lat':c.get('lat'),'lng':c.get('lng'),
            'backup_sec':(e['bs'] if e else 0),
            'in_avail':sid in av,'in_events':sid in events,'in_config':sid in cfg})
    for s in sites: s['impact_score']=s['power_dt_hours']
    thr=pctile([s['power_dt_hours'] for s in sites if s['power_dt_hours']>0 and not s['likely_dead']],0.75)
    for s in sites: s['bad_grid']=s['power_dt_hours']>=thr and s['power_dt_hours']>0
    sites.sort(key=lambda s:s['impact_score'],reverse=True)

    dates=sorted({str(r[3]) for r in gd}); didx={d:i for i,d in enumerate(dates)}
    def blank(): return [0.0]*len(dates)
    ddt={'estate':{'AREA1':blank()},'region':{},'nop':{},'cluster':{}}
    for reg,nop,too,period,dp in gd:
        i=didx.get(str(period));
        if i is None: continue
        h=(dp or 0)/3600.0; ddt['estate']['AREA1'][i]+=h
        for lvl,k in (('region',reg),('nop',clean_nop(nop)),('cluster',too)):
            if k: ddt[lvl].setdefault(k,blank())[i]+=h
    dout={'estate':{'AREA1':[0]*len(dates)},'region':{},'nop':{},'cluster':{}}
    for (lvl,k,day),cnt in gday.items():
        i=didx.get(day)
        if i is None or lvl not in dout: continue
        dout[lvl].setdefault(k,[0]*len(dates))[i]+=cnt

    def rollup(level):
        agg={}
        for s in sites:
            k=s.get(level)
            if not k: continue
            d=agg.setdefault(k,{level:k,'nop':s.get('nop'),'region':s.get('region'),'n_sites':0,'n_outage':0,'n_ne_down':0,
                'power_dt_hours':0.0,'dark_all_h':0.0,'cause_pow':0.0,'cause_tr':0.0,'cause_ran':0.0,'cause_oth':0.0,
                'bad_grid_sites':0,'insuff_sites':0,'nodata_sites':0,'bsec':0,'avail_sum':0.0,'target_sum':0.0,'ac':0,
                'fault_backup_h':0.0,'fault_pln_h':0.0,'fault_unver_h':0.0,
                'pat':{'both':0,'grid_backup_ok':0,'backup_fail':0,'minimal':0,'no_data':0}})
            d['n_sites']+=1; d['n_outage']+=s['n_outage']; d['n_ne_down']+=s['n_ne_down']
            d['power_dt_hours']+=s['power_dt_hours']; d['dark_all_h']+=s['dark_all_h']
            for cc in ('pow','tr','ran','oth'): d['cause_'+cc]+=s['cause_'+cc]
            d['bad_grid_sites']+=int(s['bad_grid']); d['insuff_sites']+=int(s['backup_insufficient'] is True)
            d['nodata_sites']+=int(s['in_events'] is False); d['bsec']+=s['backup_sec']; d['pat'][s['pattern']]+=1
            if s.get('avail_pct') is not None: d['avail_sum']+=s['avail_pct']; d['target_sum']+=s['target_pct']; d['ac']+=1
            d['fault_'+('backup' if s['fault']=='backup' else 'pln' if s['fault']=='pln' else 'unver')+'_h']+=s['power_dt_hours']
        out=list(agg.values())
        for d in out:
            d['power_dt_hours']=round(d['power_dt_hours'],1); d['dark_all_h']=round(d['dark_all_h'],1); d['impact_score']=d['power_dt_hours']
            tot=sum(d['cause_'+cc] for cc in ('pow','tr','ran','oth')) or 1
            d['pow_share_pct']=round(100*d['cause_pow']/tot,1)
            for cc in ('pow','tr','ran','oth'): d['cause_'+cc]=round(d['cause_'+cc],1)
            d['avail_pct']=round(d['avail_sum']/d['ac'],3) if d['ac'] else None
            d['target_pct']=round(d['target_sum']/d['ac'],3) if d['ac'] else None
            d['avail_gap']=round(d['target_pct']-d['avail_pct'],3) if d['ac'] else None
            for kk in ('avail_sum','target_sum','ac'): d.pop(kk,None)
            d['fault_backup_h']=round(d['fault_backup_h'],1); d['fault_pln_h']=round(d['fault_pln_h'],1); d['fault_unver_h']=round(d['fault_unver_h'],1)
            d['avg_outage_dur_min']=round((d['bsec']/60)/d['n_outage'],1) if d['n_outage'] else None; d.pop('bsec',None)
            ds=ddt.get(level,{}).get(d[level]); os_=dout.get(level,{}).get(d[level])
            d['daily_dt']=[round(x,1) for x in ds] if ds else None; d['daily_out']=os_ if os_ else None
            if ds:
                half=len(ds)//2; earlier=sum(ds[:half]); recent=sum(ds[half:])
                pctd=(recent-earlier)/earlier if earlier>0 else (1 if recent>0 else 0)
                d['earlier_h']=round(earlier,0); d['recent_h']=round(recent,0); d['delta_pct']=round(pctd*100,0)
                d['trend']="worsening" if (pctd>0.25 and (recent-earlier)>500) else ("improving" if (pctd<-0.25 and (earlier-recent)>500) else "stable")
            else: d['trend']="stable"; d['earlier_h']=0; d['recent_h']=0; d['delta_pct']=0
        out.sort(key=lambda d:d['impact_score'],reverse=True); return out

    clusters=rollup('cluster'); nops=rollup('nop'); regions=rollup('region')

    # === Backup-failure drivers (CAPEX justification) ===
    ev_sites=[s for s in sites if s['in_events'] and s['n_outage']>0]
    def ff(grp):
        o=sum(s['n_outage'] for s in grp); return round(100*sum(s['n_ne_down'] for s in grp)/o,1) if o else 0
    # 1) DRIVER: fail-fraction by outage duration (backup_sec/n_outage)
    dur_buckets=[('<30m',0,1800),('30-60m',1800,3600),('1-2h',3600,7200),('2-4h',7200,14400),('>4h',14400,9e18)]
    duration_corr=[]
    for lab,lo,hi in dur_buckets:
        grp=[s for s in ev_sites if lo<=(s['backup_sec']/max(1,s['n_outage']))<hi]
        duration_corr.append({'bucket':lab,'n':len(grp),'fail_pct':ff(grp)})
    # 2) age (flat — proves it's NOT age)
    age_buckets=[('0-2',0,2),('2-4',2,4),('4-6',4,6),('6-8',6,8),('8+',8,99)]
    age_corr=[]
    for lab,lo,hi in age_buckets:
        grp=[s for s in ev_sites if s['batt_age_yr'] is not None and lo<=s['batt_age_yr']<hi]
        age_corr.append({'bucket':lab,'n':len(grp),'fail_pct':ff(grp)})
    # 3) genset effect
    def has_gen(s): return bool(s['genset_fix'] and str(s['genset_fix']).strip() not in ('','-','None','No','no'))
    gen_y=[s for s in ev_sites if has_gen(s)]; gen_n=[s for s in ev_sites if not has_gen(s)]
    genset_effect={'with':{'n':len(gen_y),'fail_pct':ff(gen_y),'avg_dark_h':round(sum(s['power_dt_hours'] for s in gen_y)/max(1,len(gen_y)),1)},
                   'without':{'n':len(gen_n),'fail_pct':ff(gen_n),'avg_dark_h':round(sum(s['power_dt_hours'] for s in gen_n)/max(1,len(gen_n)),1)}}
    batt={'duration_corr':duration_corr,'age_corr':age_corr,'genset_effect':genset_effect}

    # estate cause + fault totals
    C={cc:round(sum(s['cause_'+cc] for s in sites),0) for cc in ('pow','tr','ran','oth')}
    ctot=sum(C.values()) or 1
    fault={'backup':round(sum(s['power_dt_hours'] for s in sites if s['fault']=='backup'),0),
           'pln':round(sum(s['power_dt_hours'] for s in sites if s['fault']=='pln'),0),
           'unverified':round(sum(s['power_dt_hours'] for s in sites if s['fault']=='unverified'),0)}
    live=[s for s in sites if not s['likely_dead']]
    av_sites=[s for s in sites if s.get('avail_pct') is not None]
    meta={'area':'AREA1','period':'2026-H1','generated':dt.date.today().isoformat(),'months':MLABEL,'dates':dates,
        'estate_daily_dt':[round(x,1) for x in ddt['estate']['AREA1']],'estate_daily_out':dout['estate']['AREA1'],
        'n_sites':len(sites),'n_sites_impacted':sum(1 for s in sites if s['power_dt_hours']>0),
        'n_likely_dead':sum(1 for s in sites if s['likely_dead']),'n_event_confirmed':sum(1 for s in sites if s['in_events']),
        'avail_pct':round(sum(s['avail_pct'] for s in av_sites)/len(av_sites),3),
        'target_pct':round(sum(s['target_pct'] for s in av_sites)/len(av_sites),3),
        'avail_gap':round(sum(s['target_pct']-s['avail_pct'] for s in av_sites)/len(av_sites),3),
        'total_power_dt_hours':round(sum(s['power_dt_hours'] for s in sites),0),
        'total_dark_all_h':round(sum(s['dark_all_h'] for s in sites),0),
        'cause':{'power':C['pow'],'transport':C['tr'],'ran':C['ran'],'other':C['oth']},
        'cause_pct':{'power':round(100*C['pow']/ctot,1),'transport':round(100*C['tr']/ctot,1),'ran':round(100*C['ran']/ctot,1),'other':round(100*C['oth']/ctot,1)},
        'fault':fault,'fault_pct':{k:round(100*v/sum(fault.values()),1) for k,v in fault.items()} if sum(fault.values()) else {},
        'backup_drivers':batt,
        'total_outages':sum(s['n_outage'] for s in sites),'total_ne_down':sum(s['n_ne_down'] for s in sites),
        'avg_outage_dur_min':round((sum(s['backup_sec'] for s in sites)/60)/sum(s['n_outage'] for s in sites),1) if sum(s['n_outage'] for s in sites) else None,
        'bad_grid_threshold_h':round(thr,1),
        'pattern_counts':{p:sum(1 for s in sites if s['pattern']==p) for p in ['both','grid_backup_ok','backup_fail','minimal','no_data']},
        'repeat_counts':{r:sum(1 for s in sites if s['repeat']==r) for r in ['chronic','intermittent','one_off','none']},
        'coverage':{'in_avail':sum(s['in_avail'] for s in sites),'in_events':sum(s['in_events'] for s in sites),'in_config':sum(s['in_config'] for s in sites)}}
    data={'meta':meta,'sites':sites,'clusters':clusters,'nops':nops,'regions':regions}
    os.makedirs(outdir,exist_ok=True)
    json.dump(data,open(os.path.join(outdir,'data.json'),'w'),ensure_ascii=False,separators=(',',':'))
    cdir=os.path.join(outdir,'clusters'); os.makedirs(cdir,exist_ok=True)
    def fmt_t(t): return t.strftime('%Y-%m-%d %H:%M') if isinstance(t,dt.datetime) else (str(t) if t else None)
    sdaily={}
    for sid,p,dp in sitedaily:
        i=didx.get(str(p))
        if i is None: continue
        arr=sdaily.get(sid)
        if arr is None: arr=[0]*len(dates); sdaily[sid]=arr
        arr[i]=round((dp or 0)/3600.0,1)
    bycl={}
    for s in sites:
        cl=s['cluster']
        if not cl: continue
        entry={}; d=sdaily.get(s['site_id']); ev=evlist.get(s['site_id'])
        if d: entry['d']=d
        if ev: entry['e']=[{'t':fmt_t(t),'d':dd,'f':f} for t,dd,f,ne in ev]
        if entry: bycl.setdefault(cl,{})[s['site_id']]=entry
    for cl,obj in bycl.items():
        json.dump(obj,open(os.path.join(cdir,slug(cl)+'.json'),'w'),ensure_ascii=False,separators=(',',':'))
    return data,len(bycl)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--avail',required=True); ap.add_argument('--events',required=True)
    ap.add_argument('--config',required=True); ap.add_argument('--outdir',default='../public')
    a=ap.parse_args()
    print("[1/4] Avail…"); av,mo,gd,sd=load_avail(a.avail); print("  sites",len(av))
    print("[2/4] Events…"); ev,evl,gday=load_events(a.events); print("  sites",len(ev))
    print("[3/4] Config…"); cf=load_config(a.config); print("  sites",len(cf))
    print("[4/4] Build…"); data,ncl=build(av,mo,gd,sd,ev,evl,gday,cf,a.outdir)
    m=data['meta']; sz=os.path.getsize(os.path.join(a.outdir,'data.json'))/1048576
    print(f"\n  data.json {sz:.1f} MB · {ncl} cluster files")
    print(f"  Availability {m['avail_pct']}% vs target {m['target_pct']}% (gap {m['avail_gap']:+}pp)")
    print(f"  Cause %: {m['cause_pct']}")
    print(f"  Power fault split: {m['fault_pct']}  (backup=CAPEX addressable)")
    print(f"  Power site-dark total: {m['total_power_dt_hours']:,.0f}h | likely-dead sites: {m['n_likely_dead']}")
    print(f"  Backup fail vs OUTAGE DURATION (the driver):")
    for b in m['backup_drivers']['duration_corr']: print(f"    {b['bucket']:8} n={b['n']:5} fail={b['fail_pct']:5}%")
    ge=m['backup_drivers']['genset_effect']
    print(f"  Genset: with {ge['with']['avg_dark_h']}h vs without {ge['without']['avg_dark_h']}h avg dark")

if __name__=='__main__': main()
