"""Build an auditable community-to-historical-cyclone proximity catalogue.

Uses only Python's standard library. Coordinates in both GeoJSON inputs are
[longitude, latitude]; distances follow the shortest great-circle arc between
each pair of consecutive track points, including across the date line.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COMMUNITIES = ROOT / "app/public/data/connectivity.geojson"
DEFAULT_TRACKS = ROOT / "app/public/data/bom-tropical-cyclone-tracks.geojson"
DEFAULT_POINTS = ROOT / "app/public/data/bom-tropical-cyclone-points.geojson"
DEFAULT_OUTPUT = ROOT / "app/public/data/community-cyclone-exposure.json"
EARTH_RADIUS_KM = 6371.0088


def angular_distance(point_a: tuple[float, float], point_b: tuple[float, float]) -> float:
    """Great-circle angle between two (longitude, latitude) points."""
    lon_a, lat_a = map(math.radians, point_a)
    lon_b, lat_b = map(math.radians, point_b)
    delta_lon = (lon_b - lon_a + math.pi) % (2 * math.pi) - math.pi
    haversine = (
        math.sin((lat_b - lat_a) / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * math.asin(math.sqrt(min(1.0, max(0.0, haversine))))


def bearing(point_a: tuple[float, float], point_b: tuple[float, float]) -> float:
    lon_a, lat_a = map(math.radians, point_a)
    lon_b, lat_b = map(math.radians, point_b)
    delta_lon = (lon_b - lon_a + math.pi) % (2 * math.pi) - math.pi
    return math.atan2(
        math.sin(delta_lon) * math.cos(lat_b),
        math.cos(lat_a) * math.sin(lat_b)
        - math.sin(lat_a) * math.cos(lat_b) * math.cos(delta_lon),
    )


def distance_to_segment_km(
    community: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    """Shortest spherical distance to the minor great-circle segment."""
    segment_angle = angular_distance(start, end)
    if segment_angle < 1e-12:
        return EARTH_RADIUS_KM * angular_distance(community, start)

    to_community = angular_distance(start, community)
    direction_delta = bearing(start, community) - bearing(start, end)
    cross_track = math.asin(max(-1.0, min(1.0, math.sin(to_community) * math.sin(direction_delta))))
    along_track = math.atan2(
        math.sin(to_community) * math.cos(direction_delta), math.cos(to_community)
    )
    if 0 <= along_track <= segment_angle:
        return EARTH_RADIUS_KM * abs(cross_track)
    return EARTH_RADIUS_KM * min(
        angular_distance(community, start), angular_distance(community, end)
    )


def valid_point(value: object) -> tuple[float, float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError(f"Expected [longitude, latitude], got {value!r}")
    lon, lat = value
    if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
        raise ValueError(f"Non-numeric coordinate: {value!r}")
    if not math.isfinite(lon) or not math.isfinite(lat) or not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise ValueError(f"Coordinate out of range: {value!r}")
    return float(lon), float(lat)


def load_communities(path: Path) -> list[dict]:
    features = json.loads(path.read_text(encoding="utf-8"))["features"]
    communities = []
    seen_ids = set()
    for feature in features:
        properties = feature["properties"]
        if properties.get("kind") != "community":
            continue
        community_id = properties["id"]
        if community_id in seen_ids:
            raise ValueError(f"Duplicate community ID: {community_id}")
        seen_ids.add(community_id)
        if feature["geometry"]["type"] != "Point":
            raise ValueError(f"Community {community_id} does not have a Point geometry")
        communities.append({
            "communityId": community_id,
            "name": properties["name"],
            "coordinates": valid_point(feature["geometry"]["coordinates"]),
        })
    return communities


def load_cyclone_ids(path: Path) -> set[str]:
    """BoM TYPE T means tropical cyclone; L, E and O are other systems."""
    features = json.loads(path.read_text(encoding="utf-8"))["features"]
    return {
        feature["properties"]["stormId"]
        for feature in features
        if feature["properties"].get("type") == "T"
    }


def load_storms(path: Path) -> tuple[list[dict], dict]:
    source = json.loads(path.read_text(encoding="utf-8"))
    by_id: dict[str, dict] = {}
    for feature in source["features"]:
        properties = feature["properties"]
        storm_id = properties.get("stormId")
        if not storm_id:
            raise ValueError("Cyclone track has no stormId")
        if feature["geometry"]["type"] != "LineString":
            raise ValueError(f"Cyclone {storm_id} does not have a LineString geometry")
        points = [valid_point(value) for value in feature["geometry"]["coordinates"]]
        if len(points) < 2:
            raise ValueError(f"Cyclone {storm_id} has fewer than two positions")
        start, end = properties["start"], properties["end"]
        if not (len(start) >= 4 and start[:4].isdigit()):
            raise ValueError(f"Cyclone {storm_id} has no usable start year")
        if storm_id not in by_id:
            by_id[storm_id] = {
                "stormId": storm_id,
                "name": properties.get("name") or "Unnamed",
                "year": int(start[:4]),
                "start": start,
                "end": end,
                "segments": [],
            }
        else:
            by_id[storm_id]["start"] = min(by_id[storm_id]["start"], start)
            by_id[storm_id]["end"] = max(by_id[storm_id]["end"], end)
            by_id[storm_id]["year"] = int(by_id[storm_id]["start"][:4])
        by_id[storm_id]["segments"].extend(zip(points, points[1:]))
    return list(by_id.values()), source


def summarise(communities: list[dict], from_year: int, to_year: int, radius_km: float) -> list[dict]:
    results = []
    for community in communities:
        encounters = [
            item for item in community["encounters"]
            if from_year <= item["year"] <= to_year and item["distanceKm"] <= radius_km
        ]
        nearest = min(encounters, key=lambda item: (item["distanceKm"], item["stormId"]), default=None)
        latest = max(encounters, key=lambda item: (item["year"], item["end"], item["stormId"]), default=None)
        results.append({
            "communityId": community["communityId"],
            "name": community["name"],
            "encounterCount": len(encounters),
            "nearestPathDistanceKm": nearest["distanceKm"] if nearest else None,
            "nearestStormId": nearest["stormId"] if nearest else None,
            "latestEncounterYear": latest["year"] if latest else None,
            "latestStormId": latest["stormId"] if latest else None,
        })
    return sorted(results, key=lambda item: (
        -item["encounterCount"],
        item["nearestPathDistanceKm"] if item["nearestPathDistanceKm"] is not None else math.inf,
        item["name"].casefold(),
        item["communityId"],
    ))


def build(
    communities_path: Path,
    tracks_path: Path,
    points_path: Path,
    from_year: int,
    to_year: int,
    radius_km: float,
    catalog_radius_km: float,
) -> dict:
    communities = load_communities(communities_path)
    all_storms, track_source = load_storms(tracks_path)
    cyclone_ids = load_cyclone_ids(points_path)
    storms = [storm for storm in all_storms if storm["stormId"] in cyclone_ids]
    missing_tracks = cyclone_ids - {storm["stormId"] for storm in all_storms}
    if missing_tracks:
        raise ValueError(f"Cyclone point records lack a matching track: {sorted(missing_tracks)[:5]}")
    if not communities or not storms:
        raise ValueError("Community and cyclone inputs must both contain features")
    available_years = [storm["year"] for storm in storms]
    if from_year > to_year or from_year < min(available_years) or to_year > max(available_years):
        raise ValueError(f"Year range must be within {min(available_years)}–{max(available_years)}")
    if radius_km <= 0 or catalog_radius_km < radius_km:
        raise ValueError("Radius must be positive and no larger than the catalogue radius")

    for community in communities:
        point = community["coordinates"]
        encounters = []
        for storm in storms:
            distance_km = min(
                distance_to_segment_km(point, segment_start, segment_end)
                for segment_start, segment_end in storm["segments"]
            )
            if distance_km <= catalog_radius_km:
                encounters.append({
                    "stormId": storm["stormId"],
                    "name": storm["name"],
                    "year": storm["year"],
                    "start": storm["start"],
                    "end": storm["end"],
                    "distanceKm": round(distance_km, 3),
                })
        community["encounters"] = sorted(encounters, key=lambda item: (item["year"], item["stormId"]))
        community["coordinates"] = list(point)

    return {
        "schemaVersion": 1,
        "metric": "historical_track_proximity",
        "notice": "Historical cyclone track proximity only; not observed damage, wind impact or a future forecast.",
        "sources": {
            "communities": "connectivity.geojson",
            "cycloneTracks": "bom-tropical-cyclone-tracks.geojson",
            "cycloneTypes": "bom-tropical-cyclone-points.geojson",
            "cycloneTrackGeneratedAt": track_source.get("generated_at"),
            "cycloneProvider": track_source.get("source"),
        },
        "method": {
            "distance": "Minimum great-circle distance to any segment of each storm's complete LineString track, in kilometres.",
            "count": "One encounter per unique stormId per community when distance is within the selected radius.",
            "eligibility": "Only systems with BoM TYPE T (tropical cyclone) are included; TYPE L, E and O are excluded.",
            "year": "Storm start year; ranges are inclusive.",
            "ranking": "Encounter count descending, nearest qualifying path distance ascending, community name ascending.",
            "missingIntensity": "No intensity weighting. Missing wind speed does not change the count.",
            "precision": "Distances rounded to 0.001 km for filtering; source positions have lower practical accuracy.",
        },
        "availableYears": {"from": min(available_years), "to": max(available_years)},
        "catalogRadiusKm": catalog_radius_km,
        "defaultFilter": {"fromYear": from_year, "toYear": to_year, "radiusKm": radius_km},
        "counts": {"communities": len(communities), "cyclones": len(storms), "excludedOtherSystems": len(all_storms) - len(storms)},
        "ranking": summarise(communities, from_year, to_year, radius_km),
        "communities": communities,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--communities", type=Path, default=DEFAULT_COMMUNITIES)
    parser.add_argument("--tracks", type=Path, default=DEFAULT_TRACKS)
    parser.add_argument("--points", type=Path, default=DEFAULT_POINTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--from-year", type=int, default=2007)
    parser.add_argument("--to-year", type=int, default=None)
    parser.add_argument("--radius-km", type=float, default=100)
    parser.add_argument("--catalog-radius-km", type=float, default=300)
    args = parser.parse_args()
    storms, _ = load_storms(args.tracks)
    cyclone_ids = load_cyclone_ids(args.points)
    to_year = args.to_year if args.to_year is not None else max(storm["year"] for storm in storms if storm["stormId"] in cyclone_ids)
    result = build(args.communities, args.tracks, args.points, args.from_year, to_year, args.radius_km, args.catalog_radius_km)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}: {result['counts']['communities']} communities, {result['counts']['cyclones']} tropical cyclones")
    for rank, item in enumerate(result["ranking"][:10], 1):
        print(f"{rank:2}. {item['name']}: {item['encounterCount']} encounters, nearest {item['nearestPathDistanceKm']} km")


if __name__ == "__main__":
    main()
