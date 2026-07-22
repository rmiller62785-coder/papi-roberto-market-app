import unittest

from aperture_research.walk_forward import EvaluationConfig, evaluate_expanding_walk_forward


def rows(count: int) -> list[dict]:
    output = []
    prior_outcome_available = 0
    for index in range(count):
        feature = 1_000_000 + index * 100_000
        official = 20_000 + (10 if index % 2 == 0 else -10)
        output.append({
            "sessionDate": f"2026-{1 + index // 28:02d}-{1 + index % 28:02d}",
            "featureAsOfMs": feature,
            "predictionGeneratedAtMs": feature + 10,
            "trainedThroughMs": prior_outcome_available,
            "outcomeAvailableAtMs": feature + 10_000,
            "officialOpenSource": "NASDAQ_OFFICIAL_CROSS",
            "officialOpenCents": official,
            "previousCloseCents": 20_000,
            "overnightMidpointCents": 20_000 + (5 if index % 2 == 0 else -5),
            "candidatePredictionCents": 20_000 + (8 if index % 2 == 0 else -8),
            "probabilityUp": 0.8 if index % 2 == 0 else 0.2,
        })
        prior_outcome_available = feature + 10_000
    return output


class WalkForwardTests(unittest.TestCase):
    def test_expanding_folds_recompute_costed_baselines_and_calibration(self):
        data = rows(12)
        for index in range(6, 9):
            data[index]["trainedThroughMs"] = data[5]["outcomeAvailableAtMs"]
        for index in range(9, 12):
            data[index]["trainedThroughMs"] = data[8]["outcomeAvailableAtMs"]
        report = evaluate_expanding_walk_forward(
            data,
            dataset_manifest_hash="sha256:" + "a" * 64,
            model_version="candidate-v1",
            config=EvaluationConfig(minimum_train_sessions=6, test_sessions_per_fold=3, candidate_cost_cents=2),
        )
        self.assertEqual(report["promotionDecision"], "NOT_PERFORMED")
        self.assertFalse(report["strictGateEligible"])
        self.assertEqual(report["modelTrainingMode"], "EXTERNAL_PREDICTIONS_EVALUATED_ONLY")
        self.assertIn("FOLD_LOCAL_MODEL_TRAINING_NOT_PERFORMED", report["promotionBlockers"])
        self.assertEqual(len(report["folds"]), 2)
        self.assertEqual(report["folds"][0]["trainThroughSession"], "2026-01-06")
        self.assertEqual(report["folds"][0]["testFromSession"], "2026-01-07")
        self.assertEqual(report["aggregate"]["observations"], 6)
        self.assertEqual(report["aggregate"]["candidate"]["grossMaeCents"], 2)
        self.assertEqual(report["aggregate"]["candidate"]["netMaeCents"], 4)
        self.assertLess(report["calibration"]["expectedCalibrationErrorPct"], 25)
        self.assertTrue(report["contentHash"].startswith("sha256:"))

    def test_insufficient_samples_and_training_leakage_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "too small"):
            evaluate_expanding_walk_forward(
                rows(4), dataset_manifest_hash="sha256:" + "a" * 64, model_version="candidate-v1",
                config=EvaluationConfig(minimum_train_sessions=4, test_sessions_per_fold=1),
            )
        leaking = rows(8)
        leaking[4]["trainedThroughMs"] = leaking[4]["featureAsOfMs"]
        with self.assertRaisesRegex(ValueError, "training cutoff"):
            evaluate_expanding_walk_forward(
                leaking, dataset_manifest_hash="sha256:" + "a" * 64, model_version="candidate-v1",
                config=EvaluationConfig(minimum_train_sessions=4, test_sessions_per_fold=2),
            )
        unavailable_training = rows(8)
        unavailable_training[4]["trainedThroughMs"] = unavailable_training[3]["outcomeAvailableAtMs"] - 1
        with self.assertRaisesRegex(ValueError, "training evidence was not available"):
            evaluate_expanding_walk_forward(
                unavailable_training, dataset_manifest_hash="sha256:" + "a" * 64, model_version="candidate-v1",
                config=EvaluationConfig(minimum_train_sessions=4, test_sessions_per_fold=2),
            )


if __name__ == "__main__":
    unittest.main()
