"""Separate manifest contract for reconstructed Alpaca SIP opening proxies.

This module intentionally does not import or relax the official-cross row
normalizer. Proxy rows can never satisfy the Strict official-open contract.
"""

from __future__ import annotations

from datetime import date
import math
from typing import Any, Iterable, Mapping

from .manifest import content_hash

PROXY_DATASET_MANIFEST_SCHEMA = "aperture-alpaca-sip-proxy-dataset-v1"
PROXY_LABEL_SOURCE = "ALPACA_SIP_FIRST_MINUTE_OPEN_PROXY"
PROXY_AVAILABILITY_MODE = "RECONSTRUCTED_BAR_END_PLUS_DECLARED_LAG"

REQUIRED_PROXY_ROW_KEYS = (
    "sessionDate",
    "featureCutoffAtMs",
    "reconstructedAvailabilityLagMs",
    "availabilityMode",
    "latestFeatureBarEndMs",
    "latestFeatureAvailableAtMs",
    "outcomeAvailableAtMs",
    "proxyOpenSource",
    "proxyOpenBarStartMs",
    "proxyOpenBarEndMs",
    "proxyOpenCents",
    "previousCloseCents",
    "overnightMidpointCents",
    "lastPremarketCloseCents",
    "premarketHighCents",
    "premarketLowCents",
    "premarketVolume",
    "completedPremarketBars",
)


def _timestamp(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a nonnegative integer timestamp")
    return value


def _positive_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{label} must be a positive integer")
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


def normalize_proxy_row(row: Mapping[str, Any], *, reconstructed_availability_lag_ms: int) -> dict[str, Any]:
    missing = [key for key in REQUIRED_PROXY_ROW_KEYS if key not in row]
    if missing:
        raise ValueError(f"proxy row is missing: {','.join(missing)}")
    lag = _positive_integer(reconstructed_availability_lag_ms, "reconstructed_availability_lag_ms")
    if row["reconstructedAvailabilityLagMs"] != lag:
        raise ValueError("proxy row availability lag does not match the dataset declaration")
    if row["availabilityMode"] != PROXY_AVAILABILITY_MODE:
        raise ValueError("proxy availability mode is invalid")
    if row["proxyOpenSource"] != PROXY_LABEL_SOURCE:
        raise ValueError("proxyOpenSource must be ALPACA_SIP_FIRST_MINUTE_OPEN_PROXY")

    feature_cutoff = _timestamp(row["featureCutoffAtMs"], "featureCutoffAtMs")
    latest_bar_end = _timestamp(row["latestFeatureBarEndMs"], "latestFeatureBarEndMs")
    latest_available = _timestamp(row["latestFeatureAvailableAtMs"], "latestFeatureAvailableAtMs")
    open_start = _timestamp(row["proxyOpenBarStartMs"], "proxyOpenBarStartMs")
    open_end = _timestamp(row["proxyOpenBarEndMs"], "proxyOpenBarEndMs")
    outcome_available = _timestamp(row["outcomeAvailableAtMs"], "outcomeAvailableAtMs")
    if latest_available != latest_bar_end + lag:
        raise ValueError("latest feature availability must equal bar end plus the declared lag")
    if latest_available > feature_cutoff:
        raise ValueError("an unfinished or unavailable bar reaches beyond the proxy feature cutoff")
    if open_end != open_start + 60_000:
        raise ValueError("proxy opening label must come from a completed one-minute bar")
    if outcome_available != open_end + lag or outcome_available <= feature_cutoff:
        raise ValueError("proxy opening outcome availability is invalid")

    high = _finite(row["premarketHighCents"], "premarketHighCents")
    low = _finite(row["premarketLowCents"], "premarketLowCents")
    if high < low:
        raise ValueError("premarket high must not be below the low")
    volume = _finite(row["premarketVolume"], "premarketVolume")
    if volume < 0:
        raise ValueError("premarketVolume must be nonnegative")
    normalized = {
        "sessionDate": _session(row["sessionDate"]),
        "featureCutoffAtMs": feature_cutoff,
        "reconstructedAvailabilityLagMs": lag,
        "availabilityMode": PROXY_AVAILABILITY_MODE,
        "latestFeatureBarEndMs": latest_bar_end,
        "latestFeatureAvailableAtMs": latest_available,
        "outcomeAvailableAtMs": outcome_available,
        "proxyOpenSource": PROXY_LABEL_SOURCE,
        "proxyOpenBarStartMs": open_start,
        "proxyOpenBarEndMs": open_end,
        "proxyOpenCents": _finite(row["proxyOpenCents"], "proxyOpenCents"),
        "previousCloseCents": _finite(row["previousCloseCents"], "previousCloseCents"),
        "overnightMidpointCents": _finite(row["overnightMidpointCents"], "overnightMidpointCents"),
        "lastPremarketCloseCents": _finite(row["lastPremarketCloseCents"], "lastPremarketCloseCents"),
        "premarketHighCents": high,
        "premarketLowCents": low,
        "premarketVolume": volume,
        "completedPremarketBars": _positive_integer(row["completedPremarketBars"], "completedPremarketBars"),
    }
    return normalized


def validate_proxy_rows(
    rows: Iterable[Mapping[str, Any]],
    *,
    reconstructed_availability_lag_ms: int,
) -> list[dict[str, Any]]:
    normalized = [
        normalize_proxy_row(row, reconstructed_availability_lag_ms=reconstructed_availability_lag_ms)
        for row in rows
    ]
    if not normalized:
        raise ValueError("proxy dataset requires at least one row")
    ordered = sorted(normalized, key=lambda row: row["sessionDate"])
    sessions = [row["sessionDate"] for row in ordered]
    if len(set(sessions)) != len(sessions):
        raise ValueError("proxy dataset sessions must be unique")
    return ordered


def _source_page(value: Mapping[str, Any]) -> dict[str, Any]:
    required = (
        "objectKey", "contentHash", "byteLength", "downloadedAtMs", "provider",
        "feed", "symbol", "timeframe", "requestStart", "requestEnd", "pageIndex",
    )
    missing = [key for key in required if key not in value]
    if missing:
        raise ValueError(f"raw source page is missing: {','.join(missing)}")
    object_key = value["objectKey"]
    digest = value["contentHash"]
    if not isinstance(object_key, str) or not object_key.startswith("raw/alpaca/sip/NVDA/") or ".." in object_key:
        raise ValueError("raw source objectKey is invalid")
    if not isinstance(digest, str) or len(digest) != 71 or not digest.startswith("sha256:"):
        raise ValueError("raw source contentHash must be a sha256 digest")
    if value["provider"] != "alpaca" or value["feed"] != "sip" or value["symbol"] != "NVDA":
        raise ValueError("raw source provenance must be Alpaca SIP NVDA")
    if value["timeframe"] not in ("1Min", "1Day"):
        raise ValueError("raw source timeframe must be 1Min or 1Day")
    return {
        "objectKey": object_key,
        "contentHash": digest,
        "byteLength": _positive_integer(value["byteLength"], "byteLength"),
        "downloadedAtMs": _timestamp(value["downloadedAtMs"], "downloadedAtMs"),
        "provider": "alpaca",
        "feed": "sip",
        "symbol": "NVDA",
        "timeframe": value["timeframe"],
        "requestStart": str(value["requestStart"]),
        "requestEnd": str(value["requestEnd"]),
        "pageIndex": _positive_integer(value["pageIndex"], "pageIndex"),
    }


def build_proxy_dataset_manifest(
    rows: Iterable[Mapping[str, Any]],
    source_pages: Iterable[Mapping[str, Any]],
    *,
    reconstructed_availability_lag_ms: int,
    feature_schema_version: str,
    created_at_ms: int,
    code_version: str,
) -> dict[str, Any]:
    lag = _positive_integer(reconstructed_availability_lag_ms, "reconstructed_availability_lag_ms")
    normalized = validate_proxy_rows(rows, reconstructed_availability_lag_ms=lag)
    pages = sorted((_source_page(page) for page in source_pages), key=lambda page: (page["timeframe"], page["pageIndex"]))
    if not pages or {page["timeframe"] for page in pages} != {"1Min", "1Day"}:
        raise ValueError("proxy manifest requires immutable 1Min and 1Day Alpaca pages")
    if len({page["objectKey"] for page in pages}) != len(pages):
        raise ValueError("raw source object keys must be unique")
    if not isinstance(feature_schema_version, str) or not feature_schema_version.strip():
        raise ValueError("feature_schema_version is required")
    if not isinstance(code_version, str) or not code_version.strip():
        raise ValueError("code_version is required")
    base = {
        "schemaVersion": PROXY_DATASET_MANIFEST_SCHEMA,
        "labelClass": "PROXY",
        "labelSource": PROXY_LABEL_SOURCE,
        "officialOpenEquivalent": False,
        "strictGateEligible": False,
        "availabilityMode": PROXY_AVAILABILITY_MODE,
        "reconstructedAvailabilityLagMs": lag,
        "featureSchemaVersion": feature_schema_version,
        "createdAtMs": _timestamp(created_at_ms, "created_at_ms"),
        "codeVersion": code_version,
        "rowCount": len(normalized),
        "firstSession": normalized[0]["sessionDate"],
        "lastSession": normalized[-1]["sessionDate"],
        "datasetHash": content_hash({"rows": normalized}),
        "sourcePages": pages,
    }
    return {**base, "manifestHash": content_hash(base)}
