"""Expanding chronological evaluation with recomputed baselines and calibration."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Any, Iterable, Mapping

from .manifest import content_hash, validate_dataset_rows

EVALUATION_SCHEMA = "aperture-walk-forward-evaluation-v1"


@dataclass(frozen=True)
class EvaluationConfig:
    minimum_train_sessions: int = 20
    test_sessions_per_fold: int = 5
    candidate_cost_cents: float = 3.0
    previous_close_cost_cents: float = 0.0
    overnight_midpoint_cost_cents: float = 0.0
    calibration_bins: int = 10

    def validate(self) -> None:
        if self.minimum_train_sessions < 1 or self.test_sessions_per_fold < 1:
            raise ValueError("walk-forward train and test sizes must be positive")
        if self.calibration_bins < 2 or self.calibration_bins > 50:
            raise ValueError("calibration_bins must be between 2 and 50")
        for label, value in (
            ("candidate_cost_cents", self.candidate_cost_cents),
            ("previous_close_cost_cents", self.previous_close_cost_cents),
            ("overnight_midpoint_cost_cents", self.overnight_midpoint_cost_cents),
        ):
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"{label} must be finite and nonnegative")


def _mean(values: list[float]) -> float:
    if not values:
        raise ValueError("metric requires observations")
    return sum(values) / len(values)


def _mae(rows: list[dict[str, Any]], prediction_key: str) -> float:
    return _mean([abs(row[prediction_key] - row["officialOpenCents"]) for row in rows])


def _metrics(rows: list[dict[str, Any]], config: EvaluationConfig) -> dict[str, Any]:
    candidate_gross = _mae(rows, "candidatePredictionCents")
    previous_gross = _mae(rows, "previousCloseCents")
    overnight_gross = _mae(rows, "overnightMidpointCents")
    candidate_net = candidate_gross + config.candidate_cost_cents
    previous_net = previous_gross + config.previous_close_cost_cents
    overnight_net = overnight_gross + config.overnight_midpoint_cost_cents
    return {
        "observations": len(rows),
        "candidate": {"grossMaeCents": candidate_gross, "costCents": config.candidate_cost_cents, "netMaeCents": candidate_net},
        "baselines": [
            {
                "baseline": "PREVIOUS_CLOSE",
                "grossMaeCents": previous_gross,
                "costCents": config.previous_close_cost_cents,
                "netMaeCents": previous_net,
                "candidateImprovementCents": previous_net - candidate_net,
            },
            {
                "baseline": "OVERNIGHT_MIDPOINT",
                "grossMaeCents": overnight_gross,
                "costCents": config.overnight_midpoint_cost_cents,
                "netMaeCents": overnight_net,
                "candidateImprovementCents": overnight_net - candidate_net,
            },
        ],
    }


def _calibration(rows: list[dict[str, Any]], bins: int) -> dict[str, Any]:
    grouped: list[list[tuple[float, int]]] = [[] for _ in range(bins)]
    brier_terms: list[float] = []
    for row in rows:
        probability = row["probabilityUp"]
        actual = 1 if row["officialOpenCents"] > row["previousCloseCents"] else 0
        index = min(bins - 1, int(probability * bins))
        grouped[index].append((probability, actual))
        brier_terms.append((probability - actual) ** 2)
    details = []
    weighted_error = 0.0
    for index, values in enumerate(grouped):
        if not values:
            continue
        mean_probability = _mean([value[0] for value in values])
        observed_rate = _mean([float(value[1]) for value in values])
        absolute_error = abs(mean_probability - observed_rate)
        weighted_error += absolute_error * len(values) / len(rows)
        details.append({
            "lowerInclusive": index / bins,
            "upperInclusive": (index + 1) / bins,
            "observations": len(values),
            "meanPredictedProbability": mean_probability,
            "observedUpRate": observed_rate,
            "absoluteCalibrationError": absolute_error,
        })
    return {
        "method": "equal-width-out-of-sample-v1",
        "sampleSize": len(rows),
        "binCount": bins,
        "expectedCalibrationErrorPct": weighted_error * 100,
        "brierScore": _mean(brier_terms),
        "bins": details,
    }


def evaluate_expanding_walk_forward(
    rows: Iterable[Mapping[str, Any]],
    *,
    dataset_manifest_hash: str,
    model_version: str,
    config: EvaluationConfig | None = None,
) -> dict[str, Any]:
    normalized = validate_dataset_rows(rows)
    settings = config or EvaluationConfig()
    settings.validate()
    if not isinstance(dataset_manifest_hash, str) or not dataset_manifest_hash.startswith("sha256:"):
        raise ValueError("dataset_manifest_hash is required")
    if not isinstance(model_version, str) or not model_version.strip():
        raise ValueError("model_version is required")
    if len(normalized) <= settings.minimum_train_sessions:
        raise ValueError("dataset is too small for one out-of-sample fold")

    folds = []
    evaluated: list[dict[str, Any]] = []
    fold_number = 0
    for test_start in range(settings.minimum_train_sessions, len(normalized), settings.test_sessions_per_fold):
        training = normalized[:test_start]
        testing = normalized[test_start:test_start + settings.test_sessions_per_fold]
        if not testing:
            break
        last_training_outcome_available = max(row["outcomeAvailableAtMs"] for row in training)
        for row in testing:
            if row["trainedThroughMs"] < last_training_outcome_available:
                raise ValueError(f"expanding training evidence was not available by trainedThroughMs for {row['sessionDate']}")
            if row["trainedThroughMs"] >= row["featureAsOfMs"]:
                raise ValueError(f"training leakage detected for {row['sessionDate']}")
        metrics = _metrics(testing, settings)
        folds.append({
            "fold": fold_number,
            "trainFromSession": training[0]["sessionDate"],
            "trainThroughSession": training[-1]["sessionDate"],
            "trainThroughOutcomeAvailableAtMs": last_training_outcome_available,
            "testFromSession": testing[0]["sessionDate"],
            "testThroughSession": testing[-1]["sessionDate"],
            **metrics,
        })
        evaluated.extend(testing)
        fold_number += 1

    aggregate = _metrics(evaluated, settings)
    calibration = _calibration(evaluated, settings.calibration_bins)
    base = {
        "schemaVersion": EVALUATION_SCHEMA,
        "purpose": "RESEARCH_CANDIDATE_EVALUATION",
        "promotionDecision": "NOT_PERFORMED",
        "modelVersion": model_version,
        "datasetManifestHash": dataset_manifest_hash,
        "configuration": asdict(settings),
        "folds": folds,
        "aggregate": aggregate,
        "calibration": calibration,
    }
    return {**base, "contentHash": content_hash(base)}
