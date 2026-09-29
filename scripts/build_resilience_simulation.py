"""Build deterministic community resilience planning scenarios.

The published community points and cyclone encounters remain in their existing
files. This output is a planning exercise, not a network assessment or a list
of deployable sites.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONNECTIVITY = ROOT / "app/public/data/connectivity.geojson"
EXPOSURE = ROOT / "app/public/data/community-cyclone-exposure.json"
OUTPUT = ROOT / "app/public/data/community-resilience-simulation.json"
STAND_DATA = ROOT / "data/raw/score-research/2026-09-29-followup/stand_sky_muster_deployments.geojson"
MNHP_STAGE_1 = ROOT / "data/raw/score-research/2026-09-29-followup/mnhp_round_1_stage_1_funded_base_stations.kml"
MNHP_STAGE_2 = ROOT / "data/raw/score-research/2026-09-29-followup/mnhp_round_1_stage_2_funded_base_stations.kml"
MODEL_VERSION = "resilience-planning-v1"
KML_NS = {"k": "http://www.opengis.net/kml/2.2"}

# Product draft only. These are not an official or validated assessment standard.
DIMENSIONS = {
    "route_redundancy": {
        "weight": 30,
        "label": "Independent communications route",
        "states": ["single_route", "backup_untested", "independent_tested"],
    },
    "backup_power": {
        "weight": 25,
        "label": "Backup power",
        "states": ["no_backup", "backup_unverified", "target_tested"],
    },
    "critical_service_continuity": {
        "weight": 20,
        "label": "Critical-service communications continuity",
        "states": ["no_plan", "partial_plan", "tested_plan"],
    },
    "alerts_and_offline": {
        "weight": 15,
        "label": "Alerts and offline information",
        "states": ["single_channel", "offline_untested", "multi_channel_tested"],
    },
    "operational_readiness": {
        "weight": 10,
        "label": "Operations and maintenance readiness",
        "states": ["no_owner", "owner_no_drill", "owner_drill_review"],
    },
}

# Sources checked for dimension evidence. Unmatched dimensions use a stable
# simulated fallback; matched published records are applied conservatively.
DIMENSION_EVIDENCE = {
    "route_redundancy": {
        "reason": "No public-access satellite backup site could be matched within 1 km of this community point. Provider/backhaul or more distant facility records alone do not establish a usable community backup route.",
        "sources": [
            {"name": "NT Remote Communities with Mobile Coverage and Backhaul Transmission", "url": "https://data.nt.gov.au/dataset/list-of-remote-communities-with-mobile-coverage", "date": "2019 dataset; updated 2022-06-30", "file": "data/nt_remote-communities-mobile-coverage.xlsx", "limitation": "Community-level location/provider/backhaul context; not proof of an independent backup route or failover test."},
            {"name": "ACCC Mobile Infrastructure Report data release", "url": "https://data.gov.au/data/dataset/accc-mobile-infrastructure-report-data-release", "date": "site records to 2025-01-31", "file": "data/raw/score-research/2026-09-29/accc_mobile_sites_*.csv", "limitation": "Mobile sites/operators do not reveal independent backhaul/failure domains; shared MOCN records must not be double-counted."},
            {"name": "STAND Sky Muster deployments", "url": "https://spatial.infrastructure.gov.au/server/rest/services/Strengthening_Telecommunications_Against_Natural_Disasters/MapServer", "date": "source map; deployment dates vary", "file": "data/raw/score-research/2026-09-29-followup/stand_sky_muster_deployments.geojson", "limitation": "A mapped deployment is not verified community-level route independence or availability during an emergency."},
        ],
    },
    "backup_power": {
        "reason": "No completed MNHP power upgrade was matched to this named community. Nearby or regional project records do not establish this community's backup-power capability.",
        "sources": [
            {"name": "Mobile Network Hardening Program (MNHP)", "url": "https://data.gov.au/data/en/dataset/mobile-network-hardening-program-mnhp-round-1", "date": "program data updated 2023-10-10; metadata 2024-10-10", "file": "data/raw/score-research/2026-09-29-followup/mnhp_round_1_stage_1_funded_base_stations.kml; mnhp_round_1_stage_2_funded_base_stations.kml", "limitation": "Funded upgrade/site records; stage 1 describes a 12-hour target, not present-day operation or a passed community-level test."},
            {"name": "NT Remote Small Cells program update", "url": "https://dcdd.nt.gov.au/news/2026/new-mobile-coverage-for-remote-territory-communities", "date": "2026-06-10", "file": None, "limitation": "Program-level report of new coverage; not a per-community runtime, maintenance or test register."},
        ],
    },
    "critical_service_continuity": {
        "reason": "Territory/local emergency plans describe coordination and arrangements, but available records do not verify a critical facility's communications plan and successful test.",
        "sources": [
            {"name": "NT Territory Emergency Plan", "url": "https://pfes.nt.gov.au/file/download/406", "date": "Version 10, endorsed 2024-11-27", "file": None, "limitation": "Territory-level emergency coordination; not facility-specific continuity/test evidence."},
            {"name": "NT Emergency Service local emergency plans", "url": "https://pfes.nt.gov.au/emergency-service/publications", "date": "plan versions vary by locality", "file": None, "limitation": "Local arrangements do not consistently establish critical-service plan implementation or successful drills."},
        ],
    },
    "alerts_and_offline": {
        "reason": "Public plans and mapped facilities identify potential channels, but do not verify reach, offline availability or test results for this community.",
        "sources": [
            {"name": "NT Emergency Service local emergency plans", "url": "https://pfes.nt.gov.au/emergency-service/publications", "date": "plan versions vary by locality", "file": None, "limitation": "A listed channel is not proof of reception by residents or successful offline testing."},
            {"name": "STAND Sky Muster deployments", "url": "https://spatial.infrastructure.gov.au/server/rest/services/Strengthening_Telecommunications_Against_Natural_Disasters/MapServer", "date": "source map; deployment dates vary", "file": "data/raw/score-research/2026-09-29-followup/stand_sky_muster_deployments.geojson", "limitation": "Map is illustrative; the publisher warns a site may not be used during an emergency."},
            {"name": "Secure NT Emergency Alert guidance", "url": "https://securent.nt.gov.au/respond/emergency-alert", "date": "2026-06-15", "file": None, "limitation": "Explains alert-system limits; mobile alerts are not offline when phone service is unavailable."},
        ],
    },
    "operational_readiness": {
        "reason": "Published plans name agencies and coordination roles, but no community-level device owner, maintenance log and completed drill evidence is linked to this point.",
        "sources": [
            {"name": "NT Territory Emergency Plan", "url": "https://pfes.nt.gov.au/file/download/406", "date": "Version 10, endorsed 2024-11-27", "file": None, "limitation": "Defines government coordination responsibilities; not a local maintenance or completed exercise record."},
            {"name": "NT Emergency Service local emergency plans", "url": "https://pfes.nt.gov.au/emergency-service/publications", "date": "plan versions vary by locality", "file": None, "limitation": "Emergency arrangements are not proof that telecommunications maintenance or drills occurred."},
        ],
    },
}


def normalise_place(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def haversine_km(left: tuple[float, float], right: tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, left)
    lon2, lat2 = map(math.radians, right)
    delta_lon, delta_lat = lon2 - lon1, lat2 - lat1
    arc = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(arc))


def kml_attributes(description: str) -> dict[str, str]:
    decoded = html.unescape(description)
    fields = re.findall(r"<th(?:\s[^>]*)?>(.*?)</th>\s*<td(?:\s[^>]*)?>(.*?)</td>", decoded, re.IGNORECASE | re.DOTALL)
    clean = lambda value: re.sub(r"<[^>]+>", "", value).strip()
    return {clean(key): clean(value) for key, value in fields}


def local_evidence(points: dict[str, dict], stand_path: Path = STAND_DATA, stage_1_path: Path = MNHP_STAGE_1, stage_2_path: Path = MNHP_STAGE_2) -> dict[str, dict]:
    """Return only evidence with an explicit public-access or exact-place match.

    A nearby public STAND Wi-Fi point supports an untested backup-route state,
    not tested resilience. MNHP power evidence requires an exact locality name,
    a completed fixed-site upgrade, and an explicitly reported capacity/type.
    """
    evidence: dict[str, dict] = {}
    points_by_name = {normalise_place(feature["properties"]["name"]): (community_id, feature) for community_id, feature in points.items()}

    if stand_path.exists():
        stand = json.loads(stand_path.read_text(encoding="utf-8"))
        public_sites = [
            feature for feature in stand.get("features", [])
            if str(feature.get("properties", {}).get("Public_Access", "")).strip().casefold() == "yes"
            and len(feature.get("geometry", {}).get("coordinates", [])) >= 2
        ]
        for community_id, feature in points.items():
            coordinates = tuple(feature["geometry"]["coordinates"])
            nearby = sorted(
                ((haversine_km(coordinates, tuple(site["geometry"]["coordinates"])), site) for site in public_sites),
                key=lambda item: item[0],
            )
            if not nearby or nearby[0][0] > 1.0:
                continue
            distance, site = nearby[0]
            props = site["properties"]
            source = {
                "name": "STAND Sky Muster satellite deployments",
                "url": "https://spatial.infrastructure.gov.au/server/rest/services/Strengthening_Telecommunications_Against_Natural_Disasters/MapServer",
                "date": None,
                "file": str(stand_path.relative_to(ROOT)),
                "recordId": str(props.get("Site_ID", props.get("OBJECTID", ""))),
                "limitation": "Public satellite Wi-Fi site is mapped within 1 km and marked Public Access=Yes. Current operation, power during an outage and community-wide reach are not verified.",
            }
            evidence.setdefault(community_id, {})["route_redundancy"] = {
                "sourceType": "evidence",
                "evidenceStatus": "matched_published_evidence",
                "state": "backup_untested",
                "level": 0.5,
                "points": DIMENSIONS["route_redundancy"]["weight"] * 0.5,
                "evidenceSummary": f"{props.get('Site_Name', 'Public Sky Muster site')} is listed for public access {distance:.1f} km from this community point.",
                "sourcesReviewed": [source],
            }

    mnhp_rows: list[tuple[str, dict[str, str], str, Path]] = []
    for path in (stage_1_path, stage_2_path):
        if not path.exists():
            continue
        for placemark in ET.parse(path).findall(".//k:Placemark", KML_NS):
            record_id = placemark.findtext("k:name", default="", namespaces=KML_NS)
            attrs = kml_attributes(placemark.findtext("k:description", default="", namespaces=KML_NS))
            if attrs.get("State") == "NT":
                mnhp_rows.append((record_id, attrs, " ".join(record_id.split()), path))

    for record_id, attrs, _, path in mnhp_rows:
        location_key = normalise_place(attrs.get("Location", ""))
        matched = points_by_name.get(location_key)
        if not matched or attrs.get("Site Status", "").casefold() != "complete":
            continue
        community_id, _ = matched
        upgrade = attrs.get("Upgrade Type", "")
        capacity = attrs.get("Backup Power Capcity after upgrade (Hours)", "")
        description = attrs.get("Description", "")
        fixed_power_upgrade = "battery" in upgrade.casefold() or "permanent generator" in upgrade.casefold()
        if not fixed_power_upgrade or not (capacity or description):
            continue
        date_complete = attrs.get("Date Complete", "")
        source = {
            "name": "Mobile Network Hardening Program (MNHP)",
            "url": "https://data.gov.au/data/en/dataset/mobile-network-hardening-program-mnhp-round-1",
            "date": date_complete,
            "file": str(path.relative_to(ROOT)),
            "recordId": record_id,
            "limitation": "The source marks the upgrade complete and reports its power specification, but does not provide a current inspection or community-level outage test.",
        }
        evidence.setdefault(community_id, {})["backup_power"] = {
            "sourceType": "evidence",
            "evidenceStatus": "matched_published_evidence",
            "state": "backup_unverified",
            "level": 0.5,
            "points": DIMENSIONS["backup_power"]["weight"] * 0.5,
            "evidenceSummary": f"MNHP record {record_id}: completed {upgrade.lower()} upgrade at {attrs.get('Location')}; reported capacity {capacity or description}.",
            "sourcesReviewed": [source],
        }

    return evidence

RESOURCES = [
    {
        "id": "independent_satellite_backup",
        "label": "Independent satellite link",
        "targetDimension": "route_redundancy",
        "prerequisites": {"backup_power": 0.5, "operational_readiness": 0.5},
        "costUnits": 5,
        "caveat": "Independent power, service plan, installation and local suitability still require verification.",
    },
    {
        "id": "backup_power_upgrade",
        "label": "Backup power",
        "targetDimension": "backup_power",
        "prerequisites": {"operational_readiness": 0.5},
        "costUnits": 4,
        "caveat": "Equipment compatibility, duration target, fuel and maintenance still require verification.",
    },
    {
        "id": "critical_service_comms_kit",
        "label": "Critical-service comms kit",
        "targetDimension": "critical_service_continuity",
        "prerequisites": {"route_redundancy": 0.5, "backup_power": 0.5},
        "costUnits": 3,
        "caveat": "No real facility-to-community relationship or installation location is asserted.",
    },
    {
        "id": "offline_alert_bundle",
        "label": "Offline alerts and information",
        "targetDimension": "alerts_and_offline",
        "prerequisites": {"operational_readiness": 0.5},
        "costUnits": 2,
        "caveat": "Language, distribution and actual community reach require local design and testing.",
    },
    {
        "id": "readiness_drill",
        "label": "Readiness drill",
        "targetDimension": "operational_readiness",
        "prerequisites": {},
        "costUnits": 1,
        "caveat": "A simulated drill does not establish actual preparedness.",
    },
]


def scenario_index(community_id: str, dimension: str) -> int:
    digest = hashlib.sha256(f"{MODEL_VERSION}:{community_id}:{dimension}".encode()).digest()
    return digest[0] % 3


def level(index: int) -> float:
    return index / 2


def score(state_indices: dict[str, int]) -> float:
    return round(sum(spec["weight"] * level(state_indices[key]) for key, spec in DIMENSIONS.items()), 1)


def resource_evaluation(resource: dict, state_indices: dict[str, int]) -> dict:
    target = resource["targetDimension"]
    unmet = [
        dimension for dimension, required in resource["prerequisites"].items()
        if level(state_indices[dimension]) < required
    ]
    if state_indices[target] == 2:
        unmet.append("target_already_at_maximum")
    eligible = not unmet
    result = {
        "resourceId": resource["id"],
        "sourceType": "simulation",
        "planningEligible": eligible,
        "deploymentEligible": False,
        "blockedBy": unmet,
        "targetDimension": target,
        "beforeState": DIMENSIONS[target]["states"][state_indices[target]],
        "afterState": DIMENSIONS[target]["states"][state_indices[target] + 1] if eligible else None,
        "scoreAfter": None,
        "upliftPoints": None,
    }
    if eligible:
        after = {**state_indices, target: state_indices[target] + 1}
        result["scoreAfter"] = score(after)
        result["upliftPoints"] = round(score(after) - score(state_indices), 1)
    return result


def build(connectivity_path: Path = CONNECTIVITY, exposure_path: Path = EXPOSURE, stand_path: Path = STAND_DATA, stage_1_path: Path = MNHP_STAGE_1, stage_2_path: Path = MNHP_STAGE_2) -> dict:
    connectivity = json.loads(connectivity_path.read_text(encoding="utf-8"))
    exposure = json.loads(exposure_path.read_text(encoding="utf-8"))
    points = {
        feature["properties"]["id"]: feature
        for feature in connectivity["features"]
        if feature["properties"]["kind"] == "community"
    }
    exposure_points = {item["communityId"]: item for item in exposure["communities"]}
    if len(points) != len(exposure_points) or set(points) != set(exposure_points):
        raise ValueError("Connectivity and exposure community IDs do not match")
    if sum(item["weight"] for item in DIMENSIONS.values()) != 100:
        raise ValueError("Simulation weights must sum to 100")
    evidence_by_point = local_evidence(points, stand_path, stage_1_path, stage_2_path)

    communities = []
    evidence_count = 0
    for community_id in sorted(points):
        feature = points[community_id]
        exposure_point = exposure_points[community_id]
        if feature["geometry"]["coordinates"] != exposure_point["coordinates"]:
            raise ValueError(f"Location changed without rebuilding cyclone exposure: {community_id}")
        indices = {key: scenario_index(community_id, key) for key in DIMENSIONS}
        # The scenario cannot claim a tested independent route while assuming
        # no usable backup power at its planning point.
        if indices["backup_power"] == 0 and indices["route_redundancy"] == 2:
            indices["route_redundancy"] = 1
        dimension_scores = {}
        for key, spec in DIMENSIONS.items():
            evidence = evidence_by_point.get(community_id, {}).get(key)
            if evidence:
                evidence_count += 1
                state_index = spec["states"].index(evidence["state"])
                indices[key] = state_index
                dimension_scores[key] = {**evidence, "simulationReason": None}
            else:
                dimension_scores[key] = {
                    "sourceType": "simulation",
                    "evidenceStatus": "no_community_level_verified_evidence",
                    "state": spec["states"][indices[key]],
                    "level": level(indices[key]),
                    "points": spec["weight"] * level(indices[key]),
                }
        simulated_count = sum(item["sourceType"] == "simulation" for item in dimension_scores.values())
        scenario_source_type = "simulation" if simulated_count == len(DIMENSIONS) else "evidence" if simulated_count == 0 else "mixed"
        gaps = sorted(
            (key for key in DIMENSIONS if indices[key] < 2),
            key=lambda key: (-DIMENSIONS[key]["weight"] * (1 - level(indices[key])), key),
        )
        communities.append({
            "communityId": community_id,
            "sourceType": scenario_source_type,
            "sourcePoint": {
                "sourceType": "published_source",
                "sourceFile": connectivity_path.name,
                "coordinateRole": "coverage_location_point",
                "reviewStatus": "locality_name_requires_review" if community_id == "bynoe" else "point_role_not_independently_verified",
                "reviewReference": "https://www.ntlis.nt.gov.au/placenames/print_extract.jsp?id=22329" if community_id == "bynoe" else None,
                "deploymentSiteConfirmed": False,
            },
            "dimensions": dimension_scores,
            "baselineScore": score(indices),
            "gapDimensions": gaps,
            "resourceEvaluations": [resource_evaluation(resource, indices) for resource in RESOURCES],
        })

    return {
        "schemaVersion": 1,
        "modelVersion": MODEL_VERSION,
        "sourceType": "mixed" if evidence_count else "simulation",
        "notice": "Planning score combines conservatively matched published records with simulated fallback values. Published records are not field-verified; resource effects and eligibility remain simulated.",
        "sourceBoundaries": {
            "communityPoints": {"sourceType": "published_source", "file": connectivity_path.name, "generatedAt": connectivity.get("generated_at"), "provider": connectivity.get("source"), "upstreamRecordDate": None, "dateCaveat": "generatedAt is the conversion timestamp, not the date each location was surveyed."},
            "cycloneProximity": {"sourceType": "published_derived", "file": exposure_path.name, "metric": exposure.get("metric"), "trackProvider": exposure.get("sources", {}).get("cycloneProvider"), "trackGeneratedAt": exposure.get("sources", {}).get("cycloneTrackGeneratedAt")},
            "capabilityAndResources": {"sourceType": "mixed" if evidence_count else "simulation", "modelVersion": MODEL_VERSION},
        },
        "method": {
            "score": "Sum of dimension weight multiplied by level (0, 0.5 or 1). Conservatively matched published records set some intermediate states; unmatched dimensions use simulated levels. Historical cyclone proximity is not an input.",
            "assumptionAssignment": "Stable SHA-256 assignment from modelVersion, communityId and dimension; not inferred from a community's actual conditions. A route/power consistency constraint is then applied.",
            "resourceEffect": "Eligible resources advance one state in exactly one target dimension; scoreAfter is recalculated using the same weights.",
            "missingActualData": "Unknown real-world capability is not zero. Published matches support only cautious intermediate states; current operation, tests and community reach are not inferred. Unmatched dimensions use a stable simulated fallback.",
            "costUnits": "Relative simulation units, not dollars or procurement estimates.",
        },
        "dimensions": {
            key: {
                "label": spec["label"],
                "weight": spec["weight"],
                "states": [{"id": state, "level": level(index)} for index, state in enumerate(spec["states"])],
                "simulationReason": DIMENSION_EVIDENCE[key]["reason"],
                "sourcesReviewed": DIMENSION_EVIDENCE[key]["sources"],
            }
            for key, spec in DIMENSIONS.items()
        },
        "resourceCatalog": [{**resource, "sourceType": "simulation", "effect": "Advance target dimension by one simulated state, capped at level 1"} for resource in RESOURCES],
        "counts": {"coveragePoints": len(communities), "simulatedDimensions": len(communities) * len(DIMENSIONS) - evidence_count, "evidenceScoredDimensions": evidence_count},
        "communities": communities,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connectivity", type=Path, default=CONNECTIVITY)
    parser.add_argument("--exposure", type=Path, default=EXPOSURE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    output = build(args.connectivity, args.exposure)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}: {output['counts']['coveragePoints']} fictional scenarios")


if __name__ == "__main__":
    main()
