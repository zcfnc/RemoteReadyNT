"""Refresh public source metadata while preserving the runnable demo dataset."""
from pathlib import Path
from datetime import date
import json, urllib.request
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/"data"; DATA.mkdir(exist_ok=True)
DIST_DATA=ROOT/"dist"/"data"; DIST_DATA.mkdir(exist_ok=True)
SOURCES={"nt_mobile_coverage_source.txt":"https://data.nt.gov.au/dataset/?license_id=cc-by&tags=Mobile+Coverage","accc_mobile_infrastructure_source.txt":"https://www.accc.gov.au/by-industry/telecommunications-and-internet/mobile-services-regulation/mobile-infrastructure-report/mobile-infrastructure-report-2025","bom_cyclone_source.txt":"https://www.bom.gov.au/cyclone/tropical-cyclone-knowledge-centre/databases/","first_nations_map_source.txt":"https://www.infrastructure.gov.au/media-communications/first-nations-digital-inclusion","abs_census_source.txt":"https://www.abs.gov.au/census/find-census-data/datapacks"}
log={"last_attempt":str(date.today()),"sources":{}}
for filename,url in SOURCES.items():
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"RemoteReadyNT-MVP/1.0"})
        with urllib.request.urlopen(req,timeout=20) as response: (DATA/filename).write_text(response.read().decode("utf-8",errors="ignore")[:20000],encoding="utf-8")
        log["sources"][filename]={"status":"ok","url":url}; print("Downloaded",filename)
    except Exception as exc:
        log["sources"][filename]={"status":"unavailable","url":url,"error":str(exc)}; print("Kept demo data for",filename)

# Resolve and download the small NT mobile-coverage resources through the public CKAN API.
try:
    api="https://data.nt.gov.au/api/3/action/package_search?q=mobile%20coverage"
    payload=json.loads(urllib.request.urlopen(api,timeout=20).read().decode("utf-8"))
    resources=[]
    for package in payload.get("result",{}).get("results",[]):
        resources.extend(package.get("resources",[]))
    for resource in resources[:4]:
        link=resource.get("url")
        if not link or not link.lower().endswith((".xlsx",".csv",".zip")): continue
        name="nt_"+Path(link.split("?")[0]).name
        target=DATA/name
        req=urllib.request.Request(link,headers={"User-Agent":"RemoteReadyNT-MVP/1.0"})
        with urllib.request.urlopen(req,timeout=45) as response: target.write_bytes(response.read())
        log["sources"][name]={"status":"ok","url":link,"type":"resource"}; print("Downloaded data",name)
except Exception as exc:
    log["sources"]["nt_mobile_resources"]={"status":"unavailable","error":str(exc)}
(DATA/"download_log.json").write_text(json.dumps(log,indent=2),encoding="utf-8")
if (DATA/"communities.json").exists(): (DIST_DATA/"communities.json").write_bytes((DATA/"communities.json").read_bytes())
print("Source refresh complete.")
