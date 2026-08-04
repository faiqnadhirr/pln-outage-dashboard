#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PLN Outage Top-Site Engine v3.1 — coords from separate Long/Lat cols."""
import argparse, json, re, os, datetime as dt
import duckdb, openpyxl
MLABEL=["Jan","Feb","Mar","Apr","May","Jun"]
def dur_to_sec(s):
    if s is None: return 0
    if isinstance(s,(int,float)): return int(s)
    h=mi=se=0
    for a,b,c in re.findall(r'(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?', str(s)):
        if a:h=int(a)
        if b:mi=int(b)
        if c:se=int(c)
    return h*3600+mi*60+se
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
    con=duckdb.connect(); g=f"read_csv_auto('{d}/*.csv')"
    site_rows=con.execute(f'''SELECT site_id,
        any_value(area) area, any_value(regional) regional,
        any_value(networksite) nop, any_value(districtoperation) too,
        any_value(kabupaten) city, any_value(kecamatan) subdist,
        any_value(site_class) cls, any_value(vendor) vendor,
        sum(LEAST("duration_power (Sec)",86400)) cap, sum("duration_power (Sec)") raw,
        sum(("duration_power (Sec)">0)::int) pdays, min("ava_power (%)") minava
        FROM {g} GROUP BY site_id''').fetchall()
    sm=con.execute(f'''SELECT site_id, CAST(substr(CAST(period AS VARCHAR),5,2) AS INT) mo,
        sum(LEAST("duration_power (Sec)",86400)) cap FROM {g} GROUP BY 1,2''').fetchall()
    gd=con.execute(f'''SELECT regional, networksite, districtoperation, period,
        sum(LEAST("duration_power (Sec)",86400)) cap FROM {g} GROUP BY 1,2,3,4''').fetchall()
    sd=con.execute(f'''SELECT site_id, CAST(period AS VARCHAR) p,
        sum(LEAST("duration_power (Sec)",86400)) cap FROM {g}
        WHERE "duration_power (Sec)">0 GROUP BY 1,2''').fetchall()
    sc=['site_id','area','regional','nop','to','city','subdist','cls','vendor','cap','raw','pdays','minava']
    sites={r[0]:dict(zip(sc,r)) for r in site_rows}
    monthly={}
    for sid,mo,cap in sm:
        monthly.setdefault(sid,[0.0]*6)
        if mo and 1<=mo<=6: monthly[sid][mo-1]=round((cap or 0)/3600.0,1)
    return sites, monthly, gd, sd

def load_events(path):
    wb=openpyxl.load_workbook(path,read_only=True,data_only=True); ws=wb["Sheet1"]
    agg={}; evlist={}; gday={}
    for r in ws.iter_rows(min_row=2,values_only=True):
        sid=r[4]
        if not sid: continue
        fl=str(r[6] or ""); ne='NE Down' in fl; start=r[7]
        d=agg.setdefault(sid,{'n':0,'ne':0,'om':0,'bs':0,'reg':r[1],'nop':r[2],'to':r[3]})
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
        # coordinates: prefer clean separate Long(15)/Lat(16); fallback to combined 'Koordinat'(14)
        lat=num(r[16]); lng=num(r[15])
        if lat is None or lng is None or not (-6.5<lat<6.5 and 94<lng<108):
            lat,lng=parse_coord(r[14])
        if lat is None or lng is None or not (-6.5<lat<6.5 and 94<lng<108): lat=lng=None
        pay=0.0; pm=0
        for i in (73,74,75,76):
            v=num(r[i])
            if v is not None and 0<=v<1_000_000: pay+=v; pm+=1
        cfg[sid]={'age':age,'bt':r[69],'bq':num(r[71]),'load':num(r[9]),'tmax':num(r[11]),
                  'gen':r[67],'pay':(pay if pm else None),'pm':pm,'lat':lat,'lng':lng,
                  'to':clean_grp(r[13]),'nop':clean_nop(r[12]),'vip':r[7],'hub':r[6]}
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
        cap=a.get('cap') or 0; power_h=round(cap/3600.0,1); m=monthly.get(sid,[0.0]*6)
        n=e['n'] if e else 0; ne=e['ne'] if e else 0
        pay=c.get('pay'); pm=c.get('pm') or 0
        lost=round((pay/(pm*30.0))*(cap/86400.0),0) if (pay and pm) else None
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
        sites.append({'site_id':sid,'area':a.get('area'),'region':a.get('regional'),
            'nop':clean_grp(clean_nop(a.get('nop')) or c.get('nop')),'cluster':clean_grp(a.get('to') or c.get('to')),
            'class':a.get('cls'),'vendor':a.get('vendor'),'city':clean_grp(a.get('city')),'vip':c.get('vip'),'hub':c.get('hub'),
            'n_outage':n,'n_ne_down':ne,'n_only_mains':(e['om'] if e else 0),
            'power_dt_hours':power_h,'power_ne_hours':round((a.get('raw') or 0)/3600.0,1),
            'power_days':a.get('pdays',0),'min_ava_power':round(a['minava'],2) if a.get('minava') is not None else None,
            'payload_gb':round(pay,0) if pay else None,'lost_gb':lost,
            'backup_insufficient':insuff,'pattern':pattern,'repeat':repeat,'trend':trend,'m':[round(x,1) for x in m],
            'batt_age_yr':c.get('age'),'batt_type':c.get('bt'),'batt_qty':c.get('bq'),
            'target_max_h':c.get('tmax'),'genset_fix':c.get('gen'),'lat':c.get('lat'),'lng':c.get('lng'),
            'backup_sec':(e['bs'] if e else 0),
            'in_avail':sid in av,'in_events':sid in events,'in_config':sid in cfg})
    for s in sites: s['impact_score']=s['power_dt_hours']
    thr=pctile([s['power_dt_hours'] for s in sites if s['power_dt_hours']>0],0.75)
    for s in sites: s['bad_grid']=s['power_dt_hours']>=thr and s['power_dt_hours']>0
    sites.sort(key=lambda s:s['impact_score'],reverse=True)

    dates=sorted({str(r[3]) for r in gd}); didx={d:i for i,d in enumerate(dates)}
    def blank(): return [0.0]*len(dates)
    ddt={'estate':{'AREA1':blank()},'region':{},'nop':{},'cluster':{}}
    for reg,nop,too,period,cap in gd:
        i=didx.get(str(period));
        if i is None: continue
        h=(cap or 0)/3600.0; ddt['estate']['AREA1'][i]+=h
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
                'power_dt_hours':0.0,'lost_gb':0.0,'bad_grid_sites':0,'insuff_sites':0,'nodata_sites':0,'bsec':0,
                'pat':{'both':0,'grid_backup_ok':0,'backup_fail':0,'minimal':0,'no_data':0}})
            d['n_sites']+=1; d['n_outage']+=s['n_outage']; d['n_ne_down']+=s['n_ne_down']
            d['power_dt_hours']+=s['power_dt_hours']; d['lost_gb']+=s['lost_gb'] or 0
            d['bad_grid_sites']+=int(s['bad_grid']); d['insuff_sites']+=int(s['backup_insufficient'] is True)
            d['nodata_sites']+=int(s['in_events'] is False); d['bsec']+=s['backup_sec']; d['pat'][s['pattern']]+=1
        out=list(agg.values())
        for d in out:
            d['power_dt_hours']=round(d['power_dt_hours'],1); d['lost_gb']=round(d['lost_gb'],1); d['impact_score']=d['power_dt_hours']
            d['avg_outage_dur_min']=round((d['bsec']/60)/d['n_outage'],1) if d['n_outage'] else None; d.pop('bsec',None)
            ds=ddt.get(level,{}).get(d[level]); os_=dout.get(level,{}).get(d[level])
            d['daily_dt']=[round(x,1) for x in ds] if ds else None; d['daily_out']=os_ if os_ else None
            if ds:
                half=len(ds)//2; earlier=sum(ds[:half]); recent=sum(ds[half:])
                pctd=(recent-earlier)/earlier if earlier>0 else (1 if recent>0 else 0)
                d['earlier_h']=round(earlier,0); d['recent_h']=round(recent,0); d['delta_pct']=round(pctd*100,0)
                d['trend']="worsening" if (pctd>0.25 and (recent-earlier)>1000) else ("improving" if (pctd<-0.25 and (earlier-recent)>1000) else "stable")
            else: d['trend']="stable"; d['earlier_h']=0; d['recent_h']=0; d['delta_pct']=0
        out.sort(key=lambda d:d['impact_score'],reverse=True); return out

    clusters=rollup('cluster'); nops=rollup('nop'); regions=rollup('region')
    tot_out=sum(s['n_outage'] for s in sites); tot_dt=sum(s['power_dt_hours'] for s in sites); tot_bs=sum(s['backup_sec'] for s in sites)
    meta={'area':'AREA1','period':'2026-H1','generated':dt.date.today().isoformat(),'months':MLABEL,'dates':dates,
        'estate_daily_dt':[round(x,1) for x in ddt['estate']['AREA1']],'estate_daily_out':dout['estate']['AREA1'],
        'n_sites':len(sites),'n_sites_impacted':sum(1 for s in sites if s['power_dt_hours']>0),
        'total_outages':tot_out,'total_ne_down':sum(s['n_ne_down'] for s in sites),'total_power_dt_hours':round(tot_dt,0),
        'avg_outage_dur_min':round((tot_bs/60)/tot_out,1) if tot_out else None,
        'avg_outage_per_site':round(tot_out/max(1,sum(1 for s in sites if s['in_events'])),1),
        'bad_grid_threshold_h':round(thr,1),
        'pattern_counts':{p:sum(1 for s in sites if s['pattern']==p) for p in ['both','grid_backup_ok','backup_fail','minimal','no_data']},
        'repeat_counts':{r:sum(1 for s in sites if s['repeat']==r) for r in ['chronic','intermittent','one_off','none']},
        'coverage':{'in_avail':sum(s['in_avail'] for s in sites),'in_events':sum(s['in_events'] for s in sites),
                    'in_config':sum(s['in_config'] for s in sites),'payload':sum(1 for s in sites if s['payload_gb'])}}
    data={'meta':meta,'sites':sites,'clusters':clusters,'nops':nops,'regions':regions}
    os.makedirs(outdir,exist_ok=True)
    json.dump(data,open(os.path.join(outdir,'data.json'),'w'),ensure_ascii=False,separators=(',',':'))
    cdir=os.path.join(outdir,'clusters'); os.makedirs(cdir,exist_ok=True)
    site2cl={s['site_id']:s['cluster'] for s in sites}
    def fmt_t(t): return t.strftime('%Y-%m-%d %H:%M') if isinstance(t,dt.datetime) else (str(t) if t else None)
    sdaily={}
    for sid,p,cap in sitedaily:
        i=didx.get(str(p))
        if i is None: continue
        arr=sdaily.get(sid)
        if arr is None: arr=[0]*len(dates); sdaily[sid]=arr
        arr[i]=round((cap or 0)/3600.0,1)
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
    wc=sum(1 for s in data['sites'] if s.get('lat')); north=sum(1 for s in data['sites'] if s.get('lat') and s['lat']>1.5); south=sum(1 for s in data['sites'] if s.get('lat') and s['lat']<-1.5)
    print(f"\n  data.json {sz:.1f} MB · {ncl} cluster files")
    print(f"  sites={m['n_sites']:,} impacted={m['n_sites_impacted']:,} outages={m['total_outages']:,}")
    print(f"  coords={wc:,} (north={north:,} south={south:,})  cities={len(set(s['city'] for s in data['sites'] if s.get('city')))}")
    print(f"  patterns={m['pattern_counts']}")

if __name__=='__main__': main()
