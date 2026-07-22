import unittest

from aperture_research.manifest import build_dataset_manifest, validate_dataset_rows


def row(index: int) -> dict:
    feature = 1_000_000 + index * 100_000
    return {
        "sessionDate": f"2026-07-{index + 1:02d}",
        "featureAsOfMs": feature,
        "predictionGeneratedAtMs": feature + 10,
        "trainedThroughMs": 0 if index == 0 else feature - 90_000,
        "outcomeAvailableAtMs": feature + 10_000,
        "officialOpenSource": "NASDAQ_OFFICIAL_CROSS",
        "officialOpenCents": 20_000 + index,
        "previousCloseCents": 19_990 + index,
        "overnightMidpointCents": 19_995 + index,
        "candidatePredictionCents": 20_001 + index,
        "probabilityUp": 0.7,
    }


class ManifestTests(unittest.TestCase):
    def test_manifest_is_deterministic_and_source_bound(self):
        rows = [row(1), row(0)]
        sources = [{"objectKey": "segment-1", "contentHash": "sha256:" + "a" * 64, "byteLength": 100}]
        first = build_dataset_manifest(rows, sources, feature_schema_version="features-v1", created_at_ms=9, code_version="abc")
        second = build_dataset_manifest(rows, sources, feature_schema_version="features-v1", created_at_ms=9, code_version="abc")
        self.assertEqual(first, second)
        self.assertEqual(first["firstSession"], "2026-07-01")
        self.assertEqual(first["rowCount"], 2)
        self.assertTrue(first["manifestHash"].startswith("sha256:"))

    def test_point_in_time_and_official_source_rules_fail_closed(self):
        premature = row(0)
        premature["predictionGeneratedAtMs"] = premature["featureAsOfMs"] - 1
        with self.assertRaisesRegex(ValueError, "before its feature snapshot"):
            validate_dataset_rows([premature])
        late = row(0)
        late["predictionGeneratedAtMs"] = late["outcomeAvailableAtMs"]
        with self.assertRaisesRegex(ValueError, "after its official-open outcome"):
            validate_dataset_rows([late])
        hindsight = row(0)
        hindsight["outcomeAvailableAtMs"] = hindsight["featureAsOfMs"]
        with self.assertRaisesRegex(ValueError, "after the feature cutoff"):
            validate_dataset_rows([hindsight])
        proxy = row(0)
        proxy["officialOpenSource"] = "FIRST_TRADE"
        with self.assertRaisesRegex(ValueError, "NASDAQ_OFFICIAL_CROSS"):
            validate_dataset_rows([proxy])

    def test_duplicate_sessions_and_absent_sources_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            validate_dataset_rows([row(0), row(0)])
        with self.assertRaisesRegex(ValueError, "immutable source"):
            build_dataset_manifest([row(0)], [], feature_schema_version="features-v1", created_at_ms=9, code_version="abc")


if __name__ == "__main__":
    unittest.main()
