"""CLI for the non-promoting Alpaca SIP proxy bootstrap."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

from .alpaca_proxy import (
    AlpacaHistoricalClient,
    build_proxy_rows,
    load_download_archive,
    write_download_archive,
)
from .manifest import canonical_json, content_hash
from .proxy_manifest import build_proxy_dataset_manifest, validate_proxy_rows
from .proxy_walk_forward import ProxyEvaluationConfig, evaluate_proxy_walk_forward


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Aperture NVDA Alpaca SIP first-minute-open proxy bootstrap",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    download = commands.add_parser("download", help="download immutable Alpaca SIP 1Min and 1Day pages")
    download.add_argument("--start-date", required=True)
    download.add_argument("--end-date", required=True)
    download.add_argument("--archive-directory", type=Path, required=True)
    download.add_argument("--manifest", type=Path, required=True)
    download.add_argument("--maximum-pages-per-timeframe", type=int, default=500)

    evaluate = commands.add_parser("evaluate", help="build proxy rows and an expanding walk-forward report")
    evaluate.add_argument("--download-manifest", type=Path, required=True)
    evaluate.add_argument("--archive-directory", type=Path)
    evaluate.add_argument("--rows-output", type=Path, required=True)
    evaluate.add_argument("--output", type=Path, required=True)
    evaluate.add_argument("--reconstructed-availability-lag-ms", type=int, required=True)
    evaluate.add_argument("--feature-schema-version", required=True)
    evaluate.add_argument("--code-version", required=True)
    evaluate.add_argument("--model-version", required=True)
    evaluate.add_argument("--created-at-ms", type=int, required=True)
    evaluate.add_argument("--minimum-train-sessions", type=int, default=60)
    evaluate.add_argument("--test-sessions-per-fold", type=int, default=10)
    evaluate.add_argument("--candidate-cost-cents", type=float, default=3.0)
    evaluate.add_argument("--previous-close-cost-cents", type=float, default=0.0)
    evaluate.add_argument("--overnight-midpoint-cost-cents", type=float, default=0.0)
    return parser


def _download(args: argparse.Namespace) -> int:
    client = AlpacaHistoricalClient.from_environment()
    pages = []
    for timeframe in ("1Day", "1Min"):
        pages.extend(client.download_bars(
            start_date=args.start_date,
            end_date=args.end_date,
            timeframe=timeframe,
            maximum_pages=args.maximum_pages_per_timeframe,
        ))
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1_000)
    write_download_archive(
        pages,
        archive_directory=args.archive_directory,
        manifest_path=args.manifest,
        created_at_ms=now_ms,
    )
    return 0


def _evaluate(args: argparse.Namespace) -> int:
    minute_payloads, daily_payloads = load_download_archive(
        args.download_manifest,
        archive_directory=args.archive_directory,
    )
    rows, exclusions = build_proxy_rows(
        minute_payloads,
        daily_payloads,
        reconstructed_availability_lag_ms=args.reconstructed_availability_lag_ms,
    )
    download_manifest = json.loads(args.download_manifest.read_text(encoding="utf-8"))
    dataset_manifest = build_proxy_dataset_manifest(
        rows,
        download_manifest["pages"],
        reconstructed_availability_lag_ms=args.reconstructed_availability_lag_ms,
        feature_schema_version=args.feature_schema_version,
        created_at_ms=args.created_at_ms,
        code_version=args.code_version,
    )
    normalized_rows = validate_proxy_rows(
        rows,
        reconstructed_availability_lag_ms=args.reconstructed_availability_lag_ms,
    )
    rows_body = "".join(canonical_json(row) + "\n" for row in normalized_rows)
    args.rows_output.parent.mkdir(parents=True, exist_ok=True)
    args.rows_output.write_text(rows_body, encoding="utf-8")
    evaluation = evaluate_proxy_walk_forward(
        normalized_rows,
        dataset_manifest_hash=dataset_manifest["manifestHash"],
        reconstructed_availability_lag_ms=args.reconstructed_availability_lag_ms,
        model_version=args.model_version,
        config=ProxyEvaluationConfig(
            minimum_train_sessions=args.minimum_train_sessions,
            test_sessions_per_fold=args.test_sessions_per_fold,
            candidate_cost_cents=args.candidate_cost_cents,
            previous_close_cost_cents=args.previous_close_cost_cents,
            overnight_midpoint_cost_cents=args.overnight_midpoint_cost_cents,
        ),
    )
    payload = {
        "datasetManifest": dataset_manifest,
        "evaluation": evaluation,
        "exclusions": exclusions,
        "rowsArtifact": {
            "path": args.rows_output.name,
            "contentHash": "sha256:" + sha256(rows_body.encode("utf-8")).hexdigest(),
            "rowCount": len(normalized_rows),
        },
        "promotionDecision": "NOT_PERFORMED",
        "strictGateEligible": False,
    }
    base = {**payload, "reportHash": content_hash(payload)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(canonical_json(base) + "\n", encoding="utf-8")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "download":
        return _download(args)
    if args.command == "evaluate":
        return _evaluate(args)
    raise AssertionError("unreachable command")


if __name__ == "__main__":
    raise SystemExit(main())
