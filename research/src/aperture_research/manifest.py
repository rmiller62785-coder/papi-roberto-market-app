"""Deterministic point-in-time dataset manifests."""

from __future__ import annotations

from datetime import date
from hashlib import sha256
import json
import math
from typing import Any, Iterable, Mapping

DATASET_MANIFEST_SCHEMA = "aperture-dataset-manifest-v1"
OFFICIAL_OPEN_SOURCE = "NASDAQ_OFFICIAL_CROSS"

REQUIRED_ROW_KEYS = (
    "sessionDate",
    "featureAsOfMs",
    "predictionGeneratedAtMs",
    "trainedThroughMs",
    "outcomeAvailableAtMs",
    "officialOpenSource",
    "officialOpenCents",
    "previousCloseCents",
    "overnightMidpointCents",
    "candidatePredictionCents",
    "probabilityUp",
)


def canonical_json(value: Any) -> str:
    """Stable JSON with finite numbers only."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def content_hash(value: Any) -> str:
    return "sha256:" + sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _timestamp(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a nonnegative integer timestamp")
    return value


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _session(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("sessionDate must be a string")
    try:
        if date.fromisoformat(value).isoformat() != value:
            raise ValueError
    except ValueError as error:
        raise ValueError("sessionDate must be a real YYYY-MM-DD date") from error
    return value


def normalize_dataset_row(row: Mapping[str, Any]) -> dict[str, Any]:
    missing = [key for key in REQUIRED_ROW_KEYS if key not in row]
    if missing:
        raise ValueError(f"dataset row is missing: {','.join(missing)}")
    session = _session(row["sessionDate"])
    feature_as_of = _timestamp(row["featureAsOfMs"], "featureAsOfMs")
    generated_at = _timestamp(row["predictionGeneratedAtMs"], "predictionGeneratedAtMs")
    trained_through = _timestamp(row["trainedThroughMs"], "trainedThroughMs")
    outcome_available = _timestamp(row["outcomeAvailableAtMs"], "outcomeAvailableAtMs")
    if generated_at < feature_as_of:
        raise ValueError("prediction was generated before its feature snapshot became available")
    if trained_through >= feature_as_of:
        raise ValueError("training cutoff reaches the prediction feature cutoff")
    if outcome_available <= feature_as_of:
        raise ValueError("official-open outcome must become available after the feature cutoff")
    if generated_at >= outcome_available:
        raise ValueError("prediction was generated after its official-open outcome became available")
    if row["officialOpenSource"] != OFFICIAL_OPEN_SOURCE:
        raise ValueError("officialOpenSource must be NASDAQ_OFFICIAL_CROSS")
    probability_up = _finite(row["probabilityUp"], "probabilityUp")
    if probability_up < 0 or probability_up > 1:
        raise ValueError("probabilityUp must be between 0 and 1")
    normalized = {
        "sessionDate": session,
        "featureAsOfMs": feature_as_of,
        "predictionGeneratedAtMs": generated_at,
        "trainedThroughMs": trained_through,
        "outcomeAvailableAtMs": outcome_available,
        "officialOpenSource": OFFICIAL_OPEN_SOURCE,
        "officialOpenCents": _finite(row["officialOpenCents"], "officialOpenCents"),
        "previousCloseCents": _finite(row["previousCloseCents"], "previousCloseCents"),
        "overnightMidpointCents": _finite(row["overnightMidpointCents"], "overnightMidpointCents"),
        "candidatePredictionCents": _finite(row["candidatePredictionCents"], "candidatePredictionCents"),
        "probabilityUp": probability_up,
    }
    return normalized


def validate_dataset_rows(rows: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    normalized = [normalize_dataset_row(row) for row in rows]
    if not normalized:
        raise ValueError("dataset requires at least one row")
    ordered = sorted(normalized, key=lambda row: row["sessionDate"])
    sessions = [row["sessionDate"] for row in ordered]
    if len(set(sessions)) != len(sessions):
        raise ValueError("dataset sessions must be unique")
    return ordered


def _source_object(value: Mapping[str, Any]) -> dict[str, Any]:
    key = value.get("objectKey")
    digest = value.get("contentHash")
    if not isinstance(key, str) or not key:
        raise ValueError("source objectKey is required")
    if not isinstance(digest, str) or len(digest) != 71 or not digest.startswith("sha256:"):
        raise ValueError("source contentHash must be a sha256 digest")
    byte_length = value.get("byteLength")
    if isinstance(byte_length, bool) or not isinstance(byte_length, int) or byte_length <= 0:
        raise ValueError("source byteLength must be positive")
    return {"objectKey": key, "contentHash": digest, "byteLength": byte_length}


def build_dataset_manifest(
    rows: Iterable[Mapping[str, Any]],
    source_objects: Iterable[Mapping[str, Any]],
    *,
    feature_schema_version: str,
    created_at_ms: int,
    code_version: str,
) -> dict[str, Any]:
    normalized_rows = validate_dataset_rows(rows)
    sources = sorted((_source_object(value) for value in source_objects), key=lambda value: value["objectKey"])
    if not sources:
        raise ValueError("dataset manifest requires immutable source objects")
    if len({source["objectKey"] for source in sources}) != len(sources):
        raise ValueError("source object keys must be unique")
    if not isinstance(feature_schema_version, str) or not feature_schema_version.strip():
        raise ValueError("feature_schema_version is required")
    if not isinstance(code_version, str) or not code_version.strip():
        raise ValueError("code_version is required")
    created_at = _timestamp(created_at_ms, "created_at_ms")
    dataset_hash = content_hash({"rows": normalized_rows})
    base = {
        "schemaVersion": DATASET_MANIFEST_SCHEMA,
        "featureSchemaVersion": feature_schema_version,
        "createdAtMs": created_at,
        "codeVersion": code_version,
        "rowCount": len(normalized_rows),
        "firstSession": normalized_rows[0]["sessionDate"],
        "lastSession": normalized_rows[-1]["sessionDate"],
        "datasetHash": dataset_hash,
        "sourceObjects": sources,
    }
    return {**base, "manifestHash": content_hash(base)}
