"""Data-contract checks for the fictional resilience planning catalogue."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_resilience_simulation import (
    CONNECTIVITY,
    DIMENSIONS,
    EXPOSURE,
    MODEL_VERSION,
    RESOURCES,
    build,
    resource_evaluation,
    score,
)


class ResilienceSimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.result = build()

    def test_every_coverage_point_has_one_scenario_and_clear_provenance(self) -> None:
        connectivity = json.loads(CONNECTIVITY.read_text(encoding="utf-8"))
        expected = {
            feature["properties"]["id"]
            for feature in connectivity["features"]
            if feature["properties"]["kind"] == "community"
        }
        actual = [item["communityId"] for item in self.result["communities"]]
        self.assertEqual(len(actual), len(expected))
        self.assertEqual(set(actual), expected)
        self.assertEqual(self.result["modelVersion"], MODEL_VERSION)
        self.assertEqual(self.result["sourceBoundaries"]["capabilityAndResources"]["sourceType"], "mixed")
        self.assertEqual(self.result["sourceBoundaries"]["cycloneProximity"]["sourceType"], "published_derived")
        self.assertEqual(next(item for item in self.result["communities"] if item["communityId"] == "bynoe")["sourcePoint"]["reviewStatus"], "locality_name_requires_review")
        self.assertTrue(all(not item["sourcePoint"]["deploymentSiteConfirmed"] for item in self.result["communities"]))

    def test_scores_are_recomputable_and_resource_effects_are_capped(self) -> None:
        self.assertEqual(sum(spec["weight"] for spec in DIMENSIONS.values()), 100)
        catalog = {item["id"]: item for item in RESOURCES}
        for item in self.result["communities"]:
            indices = {}
            for key, value in item["dimensions"].items():
                indices[key] = next(index for index, state in enumerate(DIMENSIONS[key]["states"]) if state == value["state"])
                self.assertIn(value["sourceType"], ("simulation", "evidence"))
                expected_status = "no_community_level_verified_evidence" if value["sourceType"] == "simulation" else "matched_published_evidence"
                self.assertEqual(value["evidenceStatus"], expected_status)
                self.assertTrue(self.result["dimensions"][key]["simulationReason"])
                self.assertTrue(self.result["dimensions"][key]["sourcesReviewed"])
                self.assertTrue(all(source["name"] and source["url"] and source["limitation"] for source in self.result["dimensions"][key]["sourcesReviewed"]))
                self.assertEqual(value["points"], DIMENSIONS[key]["weight"] * value["level"])
            self.assertEqual(item["baselineScore"], score(indices))
            self.assertFalse(indices["backup_power"] == 0 and indices["route_redundancy"] == 2)
            self.assertGreaterEqual(item["baselineScore"], 0)
            self.assertLessEqual(item["baselineScore"], 100)
            expected_source_type = "simulation" if all(value["sourceType"] == "simulation" for value in item["dimensions"].values()) else "mixed"
            self.assertEqual(item["sourceType"], expected_source_type)
            self.assertEqual(len(item["resourceEvaluations"]), len(RESOURCES))
            for evaluation in item["resourceEvaluations"]:
                expected = resource_evaluation(catalog[evaluation["resourceId"]], indices)
                self.assertEqual(evaluation, expected)
                self.assertFalse(evaluation["deploymentEligible"])
                if evaluation["planningEligible"]:
                    self.assertEqual(evaluation["blockedBy"], [])
                    self.assertLessEqual(evaluation["scoreAfter"], 100)
                    self.assertGreater(evaluation["upliftPoints"], 0)
                else:
                    self.assertIsNone(evaluation["scoreAfter"])

    def test_historical_exposure_is_not_an_input_to_capability_score(self) -> None:
        exposure = json.loads(EXPOSURE.read_text(encoding="utf-8"))
        self.assertEqual(set(self.result["communities"][0]), {"communityId", "sourceType", "sourcePoint", "dimensions", "baselineScore", "gapDimensions", "resourceEvaluations"})
        self.assertEqual(len(exposure["communities"]), len(self.result["communities"]))
        with tempfile.TemporaryDirectory() as directory:
            altered = Path(directory) / "community-cyclone-exposure.json"
            for point in exposure["communities"]:
                point["encounters"] = []
            altered.write_text(json.dumps(exposure), encoding="utf-8")
            self.assertEqual(build(exposure_path=altered)["communities"], self.result["communities"])

    def test_changed_or_missing_source_points_fail_validation(self) -> None:
        exposure = json.loads(EXPOSURE.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            altered = Path(directory) / "community-cyclone-exposure.json"
            exposure["communities"][0]["coordinates"][0] += 1
            altered.write_text(json.dumps(exposure), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Location changed"):
                build(exposure_path=altered)
            exposure["communities"].pop()
            altered.write_text(json.dumps(exposure), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "IDs do not match"):
                build(exposure_path=altered)

    def test_generation_is_deterministic(self) -> None:
        self.assertEqual(build(), self.result)

    def test_provenance_catalog_covers_all_dimensions_and_counts_fallbacks(self) -> None:
        self.assertEqual(set(self.result["dimensions"]), set(DIMENSIONS))
        self.assertEqual(self.result["counts"]["simulatedDimensions"] + self.result["counts"]["evidenceScoredDimensions"], len(self.result["communities"]) * len(DIMENSIONS))
        self.assertGreater(self.result["counts"]["evidenceScoredDimensions"], 0)
        galiwinku = next(item for item in self.result["communities"] if item["communityId"] == "galiwinku")
        self.assertEqual(galiwinku["dimensions"]["route_redundancy"]["evidenceStatus"], "matched_published_evidence")
        minjilang = next(item for item in self.result["communities"] if item["communityId"] == "minjilang")
        self.assertEqual(minjilang["dimensions"]["backup_power"]["evidenceStatus"], "matched_published_evidence")


if __name__ == "__main__":
    unittest.main()
