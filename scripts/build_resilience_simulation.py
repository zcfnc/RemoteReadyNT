"""Build deterministic community resilience planning scenarios.

The published community points and cyclone encounters remain in their existing
files. This output is a planning exercise, not a network assessment or a list
of deployable sites.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONNECTIVITY = ROOT / "app/public/data/connectivity.geojson"
EXPOSURE = ROOT / "app/public/data/community-cyclone-exposure.json"
OUTPUT = ROOT / "app/public/data/community-resilience-simulation.json"
MODEL_VERSION = "resilience-planning-v1"

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


def build(connectivity_path: Path = CONNECTIVITY, exposure_path: Path = EXPOSURE) -> dict:
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

    communities = []
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
        dimension_scores = {
            key: {
                "sourceType": "simulation",
                "state": spec["states"][indices[key]],
                "level": level(indices[key]),
                "points": spec["weight"] * level(indices[key]),
            }
            for key, spec in DIMENSIONS.items()
        }
        gaps = sorted(
            (key for key in DIMENSIONS if indices[key] < 2),
            key=lambda key: (-DIMENSIONS[key]["weight"] * (1 - level(indices[key])), key),
        )
        communities.append({
            "communityId": community_id,
            "sourceType": "simulation",
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
        "sourceType": "simulation",
        "notice": "Fictional planning exercise only. Capability states, costs, effects and resource eligibility are simulated; no site, damage, stock or deployment condition is verified.",
        "sourceBoundaries": {
            "communityPoints": {"sourceType": "published_source", "file": connectivity_path.name, "generatedAt": connectivity.get("generated_at"), "provider": connectivity.get("source"), "upstreamRecordDate": None, "dateCaveat": "generatedAt is the conversion timestamp, not the date each location was surveyed."},
            "cycloneProximity": {"sourceType": "published_derived", "file": exposure_path.name, "metric": exposure.get("metric"), "trackProvider": exposure.get("sources", {}).get("cycloneProvider"), "trackGeneratedAt": exposure.get("sources", {}).get("cycloneTrackGeneratedAt")},
            "capabilityAndResources": {"sourceType": "simulation", "modelVersion": MODEL_VERSION},
        },
        "method": {
            "score": "Sum of dimension weight multiplied by simulated level (0, 0.5 or 1). Historical cyclone proximity is not an input.",
            "assumptionAssignment": "Stable SHA-256 assignment from modelVersion, communityId and dimension; not inferred from a community's actual conditions. A route/power consistency constraint is then applied.",
            "resourceEffect": "Eligible resources advance one state in exactly one target dimension; scoreAfter is recalculated using the same weights.",
            "missingActualData": "Unknown real-world capability is not zero. These complete fictional scenarios must never be presented as verified assessments.",
            "costUnits": "Relative simulation units, not dollars or procurement estimates.",
        },
        "dimensions": {
            key: {
                "label": spec["label"],
                "weight": spec["weight"],
                "states": [{"id": state, "level": level(index)} for index, state in enumerate(spec["states"])],
            }
            for key, spec in DIMENSIONS.items()
        },
        "resourceCatalog": [{**resource, "sourceType": "simulation", "effect": "Advance target dimension by one simulated state, capped at level 1"} for resource in RESOURCES],
        "counts": {"coveragePoints": len(communities)},
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
