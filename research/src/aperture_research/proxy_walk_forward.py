"""Chronological expanding evaluation for the Alpaca opening proxy only."""

from __future__ import annotations

from dataclasses import dataclass
import math
from statistics import fmean
from typing import Any, Iterable, Mapping

from .manifest import content_hash
from .proxy_manifest import PROXY_LABEL_SOURCE, validate_proxy_rows

PROXY_EVALUATION_SCHEMA = "aperture-alpaca-proxy-walk-forward-v1"
PROXY_MODEL_CLASS = "EXPANDING_MEAN_PREVIOUS_CLOSE_GAP_V1"


@dataclass(frozen=True)
class ProxyEvaluationConfig:
    minimum_train_sessions: int = 60
    test_sessions_per_fold: int = 10
    candidate_cost_cents: float = 3.0
    previous_close_cost_cents: float = 0.0
    overnight_midpoint_cost_cents: float = 0.0

    def validate(self) -> None:
        if self.minimum_train_sessions < 1 or self.test_sessions_per_fold < 1:
            raise ValueError("walk-forward train and test sizes must be positive")
        for label, value in (
            ("candidate_cost_cents", self.candidate_cost_cents),
            ("previous_close_cost_cents", self.previous_close_cost_cents),
            ("overnight_midpoint_cost_cents", self.overnight_midpoint_cost_cents),
        ):
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
                raise ValueError(f"{label} must be finite and nonnegative")


def _round(value: float) -> float:
    return round(value, 6)


def _metrics(predictions: list[dict[str, Any]], cost: float) -> dict[str, float]:
    gross = fmean(abs(item["predictionCents"] - item["actualCents"]) for item in predictions)
    return {"grossMaeCents": _round(gross), "costCents": _round(cost), "netMaeCents": _round(gross + cost)}


def evaluate_proxy_walk_forward(
    rows: Iterable[Mapping[str, Any]],
    *,
    dataset_manifest_hash: str,
    reconstructed_availability_lag_ms: int,
    model_version: str,
    config: ProxyEvaluationConfig | None = None,
) -> dict[str, Any]:
    settings = config or ProxyEvaluationConfig()
    settings.validate()
    if not isinstance(dataset_manifest_hash, str) or len(dataset_manifest_hash) != 71 or not dataset_manifest_hash.startswith("sha256:"):
        raise ValueError("dataset_manifest_hash is required")
    if not isinstance(model_version, str) or not model_version.strip():
        raise ValueError("model_version is required")
    normalized = validate_proxy_rows(
        rows,
        reconstructed_availability_lag_ms=reconstructed_availability_lag_ms,
    )
    if len(normalized) <= settings.minimum_train_sessions:
        raise ValueError("proxy dataset is too small for one out-of-sample fold")

    folds: list[dict[str, Any]] = []
    candidate_predictions: list[dict[str, Any]] = []
    previous_predictions: list[dict[str, Any]] = []
    overnight_predictions: list[dict[str, Any]] = []
    for fold_number, test_start in enumerate(range(
        settings.minimum_train_sessions,
        len(normalized),
        settings.test_sessions_per_fold,
    ), start=1):
        training = normalized[:test_start]
        testing = normalized[test_start:test_start + settings.test_sessions_per_fold]
        trained_through = max(row["outcomeAvailableAtMs"] for row in training)
        if any(trained_through >= row["featureCutoffAtMs"] for row in testing):
            raise ValueError("training outcomes were not available before a test feature cutoff")
        mean_gap = fmean(row["proxyOpenCents"] - row["previousCloseCents"] for row in training)
        probability_up = fmean(1.0 if row["proxyOpenCents"] > row["previousCloseCents"] else 0.0 for row in training)
        fold_candidate = []
        fold_previous = []
        fold_overnight = []
        for row in testing:
            common = {"sessionDate": row["sessionDate"], "actualCents": row["proxyOpenCents"]}
            fold_candidate.append({**common, "predictionCents": row["previousCloseCents"] + mean_gap})
            fold_previous.append({**common, "predictionCents": row["previousCloseCents"]})
            fold_overnight.append({**common, "predictionCents": row["overnightMidpointCents"]})
        candidate_predictions.extend(fold_candidate)
        previous_predictions.extend(fold_previous)
        overnight_predictions.extend(fold_overnight)
        candidate_metrics = _metrics(fold_candidate, settings.candidate_cost_cents)
        previous_metrics = _metrics(fold_previous, settings.previous_close_cost_cents)
        overnight_metrics = _metrics(fold_overnight, settings.overnight_midpoint_cost_cents)
        folds.append({
            "fold": fold_number,
            "trainFromSession": training[0]["sessionDate"],
            "trainThroughSession": training[-1]["sessionDate"],
            "trainThroughOutcomeAvailableAtMs": trained_through,
            "testFromSession": testing[0]["sessionDate"],
            "testThroughSession": testing[-1]["sessionDate"],
            "trainingSessions": len(training),
            "testSessions": len(testing),
            "fittedMeanGapCents": _round(mean_gap),
            "fittedProbabilityUp": _round(probability_up),
            "candidate": candidate_metrics,
            "baselines": [
                {"baseline": "PREVIOUS_CLOSE", **previous_metrics,
                 "candidateImprovementCents": _round(previous_metrics["netMaeCents"] - candidate_metrics["netMaeCents"])},
                {"baseline": "OVERNIGHT_MIDPOINT", **overnight_metrics,
                 "candidateImprovementCents": _round(overnight_metrics["netMaeCents"] - candidate_metrics["netMaeCents"])},
            ],
        })

    aggregate_candidate = _metrics(candidate_predictions, settings.candidate_cost_cents)
    aggregate_previous = _metrics(previous_predictions, settings.previous_close_cost_cents)
    aggregate_overnight = _metrics(overnight_predictions, settings.overnight_midpoint_cost_cents)
    base = {
        "schemaVersion": PROXY_EVALUATION_SCHEMA,
        "labelClass": "PROXY",
        "labelSource": PROXY_LABEL_SOURCE,
        "officialOpenEquivalent": False,
        "strictGateEligible": False,
        "promotionDecision": "NOT_PERFORMED",
        "promotionReason": "Research proxy evaluation cannot promote or satisfy the Strict official-open gate.",
        "modelClass": PROXY_MODEL_CLASS,
        "modelVersion": model_version,
        "datasetManifestHash": dataset_manifest_hash,
        "configuration": {
            "minimumTrainSessions": settings.minimum_train_sessions,
            "testSessionsPerFold": settings.test_sessions_per_fold,
            "candidateCostCents": settings.candidate_cost_cents,
            "previousCloseCostCents": settings.previous_close_cost_cents,
            "overnightMidpointCostCents": settings.overnight_midpoint_cost_cents,
        },
        "folds": folds,
        "aggregate": {
            "outOfSampleSessions": len(candidate_predictions),
            "candidate": aggregate_candidate,
            "baselines": [
                {"baseline": "PREVIOUS_CLOSE", **aggregate_previous,
                 "candidateImprovementCents": _round(aggregate_previous["netMaeCents"] - aggregate_candidate["netMaeCents"])},
                {"baseline": "OVERNIGHT_MIDPOINT", **aggregate_overnight,
                 "candidateImprovementCents": _round(aggregate_overnight["netMaeCents"] - aggregate_candidate["netMaeCents"])},
            ],
        },
    }
    return {**base, "evaluationHash": content_hash(base)}
