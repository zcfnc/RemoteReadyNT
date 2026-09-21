"""Refresh public sources and build browser-ready GeoJSON for RemoteReady NT."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import re
import urllib.parse
import urllib.request

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DIST_DATA = ROOT / "dist" / "data"
DATA.mkdir(exist_ok=True)
DIST_DATA.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "nt_mobile_coverage_source.txt": {
        "title": "Remote communities with mobile coverage",
        "provider": "Northern Territory Government Open Data",
        "url": "https://data.nt.gov.au/dataset/?license_id=cc-by&tags=Mobile+Coverage",
    },
    "accc_mobile_infrastructure_source.txt": {
        "title": "Mobile Infrastructure Report 2025",
        "provider": "Australian Competition and Consumer Commission",
        "url": "https://www.accc.gov.au/by-industry/telecommunications-and-internet/mobile-services-regulation/mobile-infrastructure-report/mobile-infrastructure-report-2025",
    },
    "bom_cyclone_source.txt": {
        "title": "Australian tropical cyclone database",
        "provider": "Bureau of Meteorology",
        "url": "https://www.bom.gov.au/cyclone/tropical-cyclone-knowledge-centre/databases/",
    },
    "first_nations_map_source.txt": {
        "title": "First Nations digital inclusion",
        "provider": "Department of Infrastructure",
        "url": "https://www.infrastructure.gov.au/media-communications/first-nations-digital-inclusion",
    },
    "abs_census_source.txt": {
        "title": "Census DataPacks",
        "provider": "Australian Bureau of Statistics",
        "url": "https://www.abs.gov.au/census/find-census-data/datapacks",
    },
}

RESOURCE_FILES = {
    "nt_remote-small-cell-coverage-nt.xlsx": "Small cell coverage sites",
    "nt_remote-communities-mobile-coverage.xlsx": "Remote community mobile coverage",
}

now = datetime.now(timezone.utc)
log = {"last_attempt": now.date().isoformat(), "generated_at": now.isoformat(), "sources": {}}


def request_bytes(url: str, timeout: int = 30, data: bytes | None = None) -> bytes:
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": "RemoteReadyNT-MVP/2.0 (+local competition prototype)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def safe_id(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


for filename, meta in SOURCES.items():
    try:
        body = request_bytes(meta["url"], timeout=20)
        (DATA / filename).write_text(body.decode("utf-8", errors="ignore")[:20000], encoding="utf-8")
        log["sources"][filename] = {**meta, "status": "ok", "type": "source page"}
        print("Downloaded", filename)
    except Exception as exc:
        log["sources"][filename] = {**meta, "status": "unavailable", "error": str(exc)}
        print("Kept cached metadata for", filename)


try:
    api = "https://data.nt.gov.au/api/3/action/package_search?q=mobile%20coverage"
    payload = json.loads(request_bytes(api, timeout=20).decode("utf-8"))
    resources = []
    for package in payload.get("result", {}).get("results", []):
        resources.extend(package.get("resources", []))
    for resource in resources:
        link = resource.get("url")
        if not link or not link.lower().endswith((".xlsx", ".csv", ".zip")):
            continue
        name = "nt_" + Path(link.split("?")[0]).name
        if name not in RESOURCE_FILES:
            continue
        (DATA / name).write_bytes(request_bytes(link, timeout=45))
        log["sources"][name] = {
            "title": RESOURCE_FILES[name],
            "provider": "Northern Territory Government Open Data",
            "status": "ok",
            "url": link,
            "type": "dataset",
        }
        print("Downloaded data", name)
except Exception as exc:
    log["sources"]["nt_mobile_resources"] = {
        "title": "NT mobile coverage resources",
        "provider": "Northern Territory Government Open Data",
        "status": "unavailable",
        "error": str(exc),
    }


demo_path = DATA / "communities.json"
demo_records = json.loads(demo_path.read_text(encoding="utf-8")) if demo_path.exists() else []
demo_by_name = {item["name"].casefold(): item for item in demo_records}


def workbook_features(path: Path, kind: str) -> list[dict]:
    if not path.exists():
        return []
    sheet = load_workbook(path, data_only=True, read_only=True).active
    features = []
    for row in list(sheet.values)[2:]:
        if not row or not row[0] or row[1] is None or row[2] is None:
            continue
        name = str(row[0]).strip()
        demo = demo_by_name.get(name.casefold(), {})
        props = {
            "id": safe_id(name),
            "name": name,
            "kind": kind,
            "provider": str(row[4] or "Not supplied") if kind == "community" else str(row[3] or "Not supplied"),
            "backhaul": str(row[3] or "Not supplied") if kind == "community" else "Small cell",
            "risk": demo.get("risk", "Not assessed"),
            "resilience": demo.get("resilience"),
            "population": demo.get("population"),
            "region": demo.get("region", "Northern Territory"),
            "coverage": demo.get("coverage", "Recorded mobile coverage" if kind == "community" else "Small cell"),
            "reason": demo.get("reason", "Risk score not yet assessed for this location"),
            "action": demo.get("action", "Confirm local redundancy and backup power with the service provider"),
            "offlinePack": demo.get("offlinePack", "Available on request"),
            "confidence": demo.get("confidence", "Source location"),
            "facilities": demo.get("facilities", []),
        }
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(row[2]), float(row[1])]},
            "properties": props,
        })
    return features


connectivity_features = workbook_features(DATA / "nt_remote-communities-mobile-coverage.xlsx", "community")
connectivity_features += workbook_features(DATA / "nt_remote-small-cell-coverage-nt.xlsx", "small-cell")
connectivity = {
    "type": "FeatureCollection",
    "generated_at": now.isoformat(),
    "source": "Northern Territory Government Open Data",
    "features": connectivity_features,
}
(DATA / "connectivity.geojson").write_text(json.dumps(connectivity, ensure_ascii=False), encoding="utf-8")
(DIST_DATA / "connectivity.geojson").write_text(json.dumps(connectivity, ensure_ascii=False), encoding="utf-8")
print("Built connectivity.geojson", len(connectivity_features), "features")


overpass_query = """
[out:json][timeout:90];
(
  nwr[\"amenity\"~\"^(clinic|hospital|school|community_centre|shelter)$\"](-26.1,129.0,-10.8,138.1);
);
out center tags;
""".strip()

facility_features = []
try:
    response = json.loads(request_bytes(
        "https://overpass-api.de/api/interpreter",
        timeout=120,
        data=urllib.parse.urlencode({"data": overpass_query}).encode("utf-8"),
    ).decode("utf-8"))
    labels = {
        "clinic": "Clinic",
        "hospital": "Hospital",
        "school": "School",
        "community_centre": "Community centre",
        "shelter": "Shelter",
    }
    for element in response.get("elements", []):
        tags = element.get("tags", {})
        amenity = tags.get("amenity")
        coords = element if "lat" in element else element.get("center", {})
        if amenity not in labels or "lat" not in coords or "lon" not in coords:
            continue
        name = tags.get("name") or f"Unnamed {labels[amenity].lower()}"
        facility_features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [coords["lon"], coords["lat"]]},
            "properties": {
                "id": f"osm-{element.get('type')}-{element.get('id')}",
                "name": name,
                "kind": amenity,
                "label": labels[amenity],
                "source": "OpenStreetMap contributors",
            },
        })
    log["sources"]["openstreetmap_facilities"] = {
        "title": "Essential service locations",
        "provider": "OpenStreetMap contributors",
        "status": "ok",
        "url": "https://www.openstreetmap.org/copyright",
        "type": "map data",
        "records": len(facility_features),
    }
    print("Downloaded facilities", len(facility_features))
except Exception as exc:
    log["sources"]["openstreetmap_facilities"] = {
        "title": "Essential service locations",
        "provider": "OpenStreetMap contributors",
        "status": "unavailable",
        "url": "https://www.openstreetmap.org/copyright",
        "error": str(exc),
    }
    cached = DATA / "facilities.geojson"
    if cached.exists():
        facility_features = json.loads(cached.read_text(encoding="utf-8")).get("features", [])
    print("Kept cached facilities")

facilities = {
    "type": "FeatureCollection",
    "generated_at": now.isoformat(),
    "source": "OpenStreetMap contributors",
    "features": facility_features,
}
(DATA / "facilities.geojson").write_text(json.dumps(facilities, ensure_ascii=False), encoding="utf-8")
(DIST_DATA / "facilities.geojson").write_text(json.dumps(facilities, ensure_ascii=False), encoding="utf-8")

if demo_path.exists():
    (DIST_DATA / "communities.json").write_bytes(demo_path.read_bytes())

log["counts"] = {
    "connectivity": len(connectivity_features),
    "communities": sum(1 for feature in connectivity_features if feature["properties"]["kind"] == "community"),
    "small_cells": sum(1 for feature in connectivity_features if feature["properties"]["kind"] == "small-cell"),
    "facilities": len(facility_features),
}
(DATA / "download_log.json").write_text(json.dumps(log, indent=2), encoding="utf-8")
(DIST_DATA / "download_log.json").write_text(json.dumps(log, ensure_ascii=False), encoding="utf-8")
print("Source refresh complete.")
