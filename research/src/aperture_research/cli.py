"""Command-line entry point for deterministic research reports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .manifest import build_dataset_manifest, canonical_json
from .walk_forward import EvaluationConfig, evaluate_expanding_walk_forward


def _jsonl(path: Path) -> list[dict]:
    rows = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"JSONL line {number} must be an object")
        rows.append(value)
    return rows


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Aperture NVDA offline walk-forward evaluator")
    value.add_argument("--rows", type=Path, required=True)
    value.add_argument("--sources", type=Path, required=True)
    value.add_argument("--output", type=Path, required=True)
    value.add_argument("--feature-schema-version", required=True)
    value.add_argument("--code-version", required=True)
    value.add_argument("--model-version", required=True)
    value.add_argument("--created-at-ms", type=int, required=True)
    value.add_argument("--minimum-train-sessions", type=int, default=20)
    value.add_argument("--test-sessions-per-fold", type=int, default=5)
    value.add_argument("--candidate-cost-cents", type=float, default=3.0)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    rows = _jsonl(args.rows)
    sources = json.loads(args.sources.read_text(encoding="utf-8"))
    if not isinstance(sources, list):
        raise ValueError("sources JSON must be an array")
    manifest = build_dataset_manifest(
        rows,
        sources,
        feature_schema_version=args.feature_schema_version,
        created_at_ms=args.created_at_ms,
        code_version=args.code_version,
    )
    report = evaluate_expanding_walk_forward(
        rows,
        dataset_manifest_hash=manifest["manifestHash"],
        model_version=args.model_version,
        config=EvaluationConfig(
            minimum_train_sessions=args.minimum_train_sessions,
            test_sessions_per_fold=args.test_sessions_per_fold,
            candidate_cost_cents=args.candidate_cost_cents,
        ),
    )
    payload = {"datasetManifest": manifest, "evaluation": report}
    args.output.write_text(canonical_json(payload) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
