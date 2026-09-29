"""Convert the Bureau of Meteorology best-track CSV into map-ready GeoJSON."""

from __future__ import annotations

import csv
import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "bom-tropical-cyclones.csv"
DATA = ROOT / "data"
PUBLIC = ROOT / "app" / "public" / "data"
PUBLIC.mkdir(parents=True, exist_ok=True)


def as_float(value: str):
    try:
        return float(value.strip())
    except (AttributeError, ValueError):
        return None


with RAW.open("r", encoding="utf-8-sig", newline="", errors="replace") as handle:
    lines = handle.readlines()

header_index = next(i for i, line in enumerate(lines) if line.startswith("NAME,"))
reader = csv.DictReader(lines[header_index:])
groups = defaultdict(list)
points = []

for row in reader:
    lat, lon = as_float(row.get("LAT")), as_float(row.get("LON"))
    storm_id = (row.get("DISTURBANCE_ID") or "").strip()
    if not storm_id or lat is None or lon is None:
        continue
    item = {
        "name": (row.get("NAME") or "Unnamed").strip(),
        "stormId": storm_id,
        "time": (row.get("TM") or "").strip(),
        "type": (row.get("TYPE") or "").strip(),
        "lat": lat,
        "lon": lon,
        "centralPressure": as_float(row.get("CENTRAL_PRES")),
        "maxWindSpeed": as_float(row.get("MAX_WIND_SPD")),
        "windSpeedPeriod": (row.get("WIND_SPD_PER") or "").strip(),
        "positionUncertainty": (row.get("POSITION_UNCERTAINTY") or "").strip(),
    }
    groups[storm_id].append(item)
    points.append({
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": item,
    })

tracks = []
for storm_id, rows in groups.items():
    rows.sort(key=lambda r: r["time"])
    coords = [[r["lon"], r["lat"]] for r in rows]
    if len(coords) < 2:
        continue
    pressures = [r["centralPressure"] for r in rows if r["centralPressure"] is not None]
    winds = [r["maxWindSpeed"] for r in rows if r["maxWindSpeed"] is not None]
    tracks.append({
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": {
            "stormId": storm_id,
            "name": rows[0]["name"],
            "start": rows[0]["time"],
            "end": rows[-1]["time"],
            "positions": len(rows),
            "minCentralPressure": min(pressures) if pressures else None,
            "maxWindSpeed": max(winds) if winds else None,
            "source": "Bureau of Meteorology Australian Tropical Cyclone Database",
        },
    })

generated = datetime.now(timezone.utc).isoformat()
for filename, collection in (
    ("bom-tropical-cyclone-points.geojson", {"type": "FeatureCollection", "generated_at": generated, "source": "Bureau of Meteorology", "features": points}),
    ("bom-tropical-cyclone-tracks.geojson", {"type": "FeatureCollection", "generated_at": generated, "source": "Bureau of Meteorology", "features": tracks}),
):
    destination = DATA / filename
    destination.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copyfile(destination, PUBLIC / filename)

metadata = {
    "source": "Bureau of Meteorology Australian Tropical Cyclone Database",
    "sourceUrl": "https://www.bom.gov.au/clim_data/IDCKMSTM0S.csv",
    "databasePage": "https://www.bom.gov.au/cyclone/tropical-cyclone-knowledge-centre/databases/",
    "generatedAt": generated,
    "records": len(points),
    "storms": len(groups),
    "tracks": len(tracks),
    "coordinateOrder": "[longitude, latitude]",
    "notes": "Historical best-track data. Not a live warning feed.",
}
(DATA / "bom-tropical-cyclone-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
shutil.copyfile(DATA / "bom-tropical-cyclone-metadata.json", PUBLIC / "bom-tropical-cyclone-metadata.json")
print(json.dumps(metadata, indent=2))
