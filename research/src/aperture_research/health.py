"""Public-safe health contract for the isolated research proxy plane."""

from __future__ import annotations

from typing import Any, Mapping

from .manifest import content_hash
from .proxy_manifest import PROXY_LABEL_SOURCE

RESEARCH_HEALTH_SCHEMA = "aperture-research-health-v1"


def _sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or len(value) != 71 or not value.startswith("sha256:"):
        raise ValueError(f"{label} must be a sha256 digest")
    return value


def build_proxy_research_health(
    report: Mapping[str, Any],
    *,
    checked_at_ms: int,
) -> dict[str, Any]:
    """Bind health to immutable proxy artifacts without granting execution status."""

    if isinstance(checked_at_ms, bool) or not isinstance(checked_at_ms, int) or checked_at_ms < 0:
        raise ValueError("checked_at_ms must be a nonnegative integer timestamp")
    manifest = report.get("datasetManifest")
    evaluation = report.get("evaluation")
    rows = report.get("rowsArtifact")
    if not isinstance(manifest, Mapping) or not isinstance(evaluation, Mapping) or not isinstance(rows, Mapping):
        raise ValueError("proxy report artifacts are incomplete")
    if report.get("strictGateEligible") is not False or report.get("promotionDecision") != "NOT_PERFORMED":
        raise ValueError("proxy report attempted to escape the research-only boundary")
    if manifest.get("labelSource") != PROXY_LABEL_SOURCE or evaluation.get("labelSource") != PROXY_LABEL_SOURCE:
        raise ValueError("proxy report label source is invalid")
    row_count = manifest.get("rowCount")
    if isinstance(row_count, bool) or not isinstance(row_count, int) or row_count < 1 or rows.get("rowCount") != row_count:
        raise ValueError("proxy report row count is invalid")

    base = {
        "schemaVersion": RESEARCH_HEALTH_SCHEMA,
        "state": "HEALTHY",
        "plane": "RESEARCH_ONLY",
        "checkedAtMs": checked_at_ms,
        "labelSource": PROXY_LABEL_SOURCE,
        "officialOpenEquivalent": False,
        "strictGateEligible": False,
        "promotionDecision": "NOT_PERFORMED",
        "applicationWriteAttempted": False,
        "rowCount": row_count,
        "firstSession": manifest.get("firstSession"),
        "lastSession": manifest.get("lastSession"),
        "datasetManifestHash": _sha256(manifest.get("manifestHash"), "datasetManifestHash"),
        "evaluationHash": _sha256(evaluation.get("evaluationHash"), "evaluationHash"),
        "rowsArtifactHash": _sha256(rows.get("contentHash"), "rowsArtifactHash"),
        "reportHash": _sha256(report.get("reportHash"), "reportHash"),
    }
    return {**base, "healthHash": content_hash(base)}
