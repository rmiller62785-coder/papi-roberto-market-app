import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from aperture_research.alpaca_proxy import (
    AlpacaHistoricalClient,
    MAX_RESPONSE_BYTES,
    build_proxy_rows,
    load_download_archive,
    write_download_archive,
)
from aperture_research.manifest import normalize_dataset_row
from aperture_research.proxy_cli import main as proxy_main
from aperture_research.proxy_manifest import (
    PROXY_LABEL_SOURCE,
    build_proxy_dataset_manifest,
    validate_proxy_rows,
)
from aperture_research.proxy_walk_forward import ProxyEvaluationConfig, evaluate_proxy_walk_forward


FIXTURES = Path(__file__).parent / "fixtures"
MINUTE_BODY = (FIXTURES / "alpaca_minute_page.json").read_bytes()
DAILY_BODY = (FIXTURES / "alpaca_daily_page.json").read_bytes()
LAG_MS = 30_000


def fixture_payload(body):
    return json.loads(body)


def source_pages():
    digest = "sha256:" + "a" * 64
    common = {
        "contentHash": digest,
        "byteLength": 10,
        "downloadedAtMs": 1,
        "provider": "alpaca",
        "feed": "sip",
        "symbol": "NVDA",
        "requestStart": "2026-07-16T00:00:00Z",
        "requestEnd": "2026-07-23T00:00:00Z",
        "pageIndex": 1,
    }
    return [
        {**common, "timeframe": "1Day", "objectKey": "raw/alpaca/sip/NVDA/1Day/page.json"},
        {**common, "timeframe": "1Min", "objectKey": "raw/alpaca/sip/NVDA/1Min/page.json"},
    ]


class ProxyBootstrapTests(unittest.TestCase):
    def rows(self):
        rows, exclusions = build_proxy_rows(
            [fixture_payload(MINUTE_BODY)],
            [fixture_payload(DAILY_BODY)],
            reconstructed_availability_lag_ms=LAG_MS,
        )
        self.assertEqual(exclusions, [])
        return rows

    def test_completed_bar_cutoff_excludes_the_forming_0924_bar(self):
        rows = self.rows()
        first = rows[0]
        self.assertEqual(first["sessionDate"], "2026-07-17")
        self.assertEqual(first["completedPremarketBars"], 2)
        self.assertEqual(first["premarketVolume"], 300)
        self.assertEqual(first["latestFeatureBarEndMs"] + LAG_MS, first["featureCutoffAtMs"])
        self.assertEqual(first["premarketHighCents"], 20_400)
        self.assertEqual(first["proxyOpenCents"], 20_350)
        self.assertEqual(first["proxyOpenSource"], PROXY_LABEL_SOURCE)

    def test_proxy_manifest_is_separate_and_never_official_or_strict(self):
        rows = self.rows()
        manifest = build_proxy_dataset_manifest(
            rows,
            source_pages(),
            reconstructed_availability_lag_ms=LAG_MS,
            feature_schema_version="alpaca-proxy-features-v1",
            created_at_ms=1,
            code_version="abc",
        )
        self.assertEqual(manifest["labelClass"], "PROXY")
        self.assertFalse(manifest["officialOpenEquivalent"])
        self.assertFalse(manifest["strictGateEligible"])
        self.assertEqual(manifest["reconstructedAvailabilityLagMs"], LAG_MS)
        with self.assertRaisesRegex(ValueError, "NASDAQ_OFFICIAL_CROSS"):
            normalize_dataset_row({
                "sessionDate": "2026-07-17",
                "featureAsOfMs": 1,
                "predictionGeneratedAtMs": 2,
                "trainedThroughMs": 0,
                "outcomeAvailableAtMs": 3,
                "officialOpenSource": PROXY_LABEL_SOURCE,
                "officialOpenCents": 1,
                "previousCloseCents": 1,
                "overnightMidpointCents": 1,
                "candidatePredictionCents": 1,
                "probabilityUp": 0.5,
            })

    def test_proxy_row_rejects_unfinished_or_late_feature_bar(self):
        row = self.rows()[0]
        row["latestFeatureAvailableAtMs"] = row["featureCutoffAtMs"] + 1
        with self.assertRaisesRegex(ValueError, "bar end plus the declared lag|reaches beyond"):
            validate_proxy_rows([row], reconstructed_availability_lag_ms=LAG_MS)

    def test_downloader_uses_environment_credentials_and_archives_hashed_raw_pages(self):
        requests = []

        def transport(request, timeout):
            self.assertEqual(timeout, 30.0)
            requests.append(request)
            timeframe = parse_qs(urlparse(request.full_url).query)["timeframe"][0]
            return MINUTE_BODY if timeframe == "1Min" else DAILY_BODY

        client = AlpacaHistoricalClient.from_environment(
            {"APCA_API_KEY_ID": "fixture-key", "APCA_API_SECRET_KEY": "fixture-secret"},
            transport=transport,
            clock=lambda: datetime(2026, 7, 22, 20, 0, tzinfo=timezone.utc),
        )
        pages = client.download_bars(start_date="2026-07-16", end_date="2026-07-22", timeframe="1Day")
        pages += client.download_bars(start_date="2026-07-16", end_date="2026-07-22", timeframe="1Min")
        self.assertEqual(len(pages), 2)
        self.assertTrue(all("feed=sip" in request.full_url for request in requests))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = write_download_archive(
                pages,
                archive_directory=root,
                manifest_path=root / "download-manifest.json",
                created_at_ms=1,
            )
            serialized = json.dumps(manifest)
            self.assertNotIn("fixture-key", serialized)
            self.assertNotIn("fixture-secret", serialized)
            minute, daily = load_download_archive(root / "download-manifest.json")
            self.assertEqual(len(minute), 1)
            self.assertEqual(len(daily), 1)

    def test_walk_forward_is_expanding_costed_and_non_promoting(self):
        rows = self.rows()
        manifest = build_proxy_dataset_manifest(
            rows,
            source_pages(),
            reconstructed_availability_lag_ms=LAG_MS,
            feature_schema_version="alpaca-proxy-features-v1",
            created_at_ms=1,
            code_version="abc",
        )
        report = evaluate_proxy_walk_forward(
            rows,
            dataset_manifest_hash=manifest["manifestHash"],
            reconstructed_availability_lag_ms=LAG_MS,
            model_version="proxy-candidate-v1",
            config=ProxyEvaluationConfig(minimum_train_sessions=2, test_sessions_per_fold=1, candidate_cost_cents=2),
        )
        self.assertEqual(report["promotionDecision"], "NOT_PERFORMED")
        self.assertFalse(report["strictGateEligible"])
        self.assertEqual(len(report["folds"]), 2)
        self.assertEqual(report["folds"][0]["trainingSessions"], 2)
        self.assertEqual(report["folds"][1]["trainingSessions"], 3)
        self.assertEqual(report["aggregate"]["candidate"]["costCents"], 2)
        self.assertEqual([item["baseline"] for item in report["aggregate"]["baselines"]],
                         ["PREVIOUS_CLOSE", "OVERNIGHT_MIDPOINT"])

    def test_proxy_fit_is_fold_local_and_ignores_a_future_test_outcome(self):
        rows = self.rows()
        manifest = build_proxy_dataset_manifest(
            rows,
            source_pages(),
            reconstructed_availability_lag_ms=LAG_MS,
            feature_schema_version="alpaca-proxy-features-v1",
            created_at_ms=1,
            code_version="abc",
        )
        settings = ProxyEvaluationConfig(minimum_train_sessions=2, test_sessions_per_fold=1)
        original = evaluate_proxy_walk_forward(
            rows,
            dataset_manifest_hash=manifest["manifestHash"],
            reconstructed_availability_lag_ms=LAG_MS,
            model_version="proxy-candidate-v1",
            config=settings,
        )
        changed = [dict(row) for row in rows]
        changed[-1]["proxyOpenCents"] += 10_000
        changed_report = evaluate_proxy_walk_forward(
            changed,
            dataset_manifest_hash=manifest["manifestHash"],
            reconstructed_availability_lag_ms=LAG_MS,
            model_version="proxy-candidate-v1",
            config=settings,
        )
        self.assertEqual(original["folds"][0], changed_report["folds"][0])
        self.assertEqual(
            original["folds"][1]["fittedMeanGapCents"],
            changed_report["folds"][1]["fittedMeanGapCents"],
        )
        self.assertNotEqual(
            original["folds"][1]["candidate"]["grossMaeCents"],
            changed_report["folds"][1]["candidate"]["grossMaeCents"],
        )

    def test_evaluate_cli_reads_only_archived_fixtures_and_writes_hashed_output(self):
        def transport(request, _timeout):
            timeframe = parse_qs(urlparse(request.full_url).query)["timeframe"][0]
            return MINUTE_BODY if timeframe == "1Min" else DAILY_BODY

        client = AlpacaHistoricalClient.from_environment(
            {"APCA_API_KEY_ID": "fixture-key", "APCA_API_SECRET_KEY": "fixture-secret"},
            transport=transport,
            clock=lambda: datetime(2026, 7, 22, 20, 0, tzinfo=timezone.utc),
        )
        pages = client.download_bars(start_date="2026-07-16", end_date="2026-07-22", timeframe="1Day")
        pages += client.download_bars(start_date="2026-07-16", end_date="2026-07-22", timeframe="1Min")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw = root / "raw"
            manifest_path = raw / "download-manifest.json"
            write_download_archive(pages, archive_directory=raw, manifest_path=manifest_path, created_at_ms=1)
            rows_path = root / "rows.jsonl"
            report_path = root / "report.json"
            health_path = root / "health.json"
            result = proxy_main([
                "evaluate",
                "--download-manifest", str(manifest_path),
                "--archive-directory", str(raw),
                "--rows-output", str(rows_path),
                "--output", str(report_path),
                "--health-output", str(health_path),
                "--reconstructed-availability-lag-ms", str(LAG_MS),
                "--feature-schema-version", "alpaca-proxy-features-v1",
                "--code-version", "abc",
                "--model-version", "proxy-candidate-v1",
                "--created-at-ms", "1",
                "--minimum-train-sessions", "2",
                "--test-sessions-per-fold", "1",
                "--candidate-cost-cents", "2",
            ])
            self.assertEqual(result, 0)
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["promotionDecision"], "NOT_PERFORMED")
            self.assertFalse(report["strictGateEligible"])
            self.assertTrue(report["reportHash"].startswith("sha256:"))
            self.assertEqual(len(rows_path.read_text(encoding="utf-8").splitlines()), 4)
            health = json.loads(health_path.read_text(encoding="utf-8"))
            self.assertEqual(health["state"], "HEALTHY")
            self.assertEqual(health["plane"], "RESEARCH_ONLY")
            self.assertFalse(health["strictGateEligible"])
            self.assertEqual(health["promotionDecision"], "NOT_PERFORMED")
            self.assertFalse(health["applicationWriteAttempted"])
            self.assertEqual(health["reportHash"], report["reportHash"])
            self.assertTrue(health["healthHash"].startswith("sha256:"))

    def test_missing_credentials_reports_names_without_values(self):
        with self.assertRaisesRegex(Exception, "APCA_API_KEY_ID and APCA_API_SECRET_KEY"):
            AlpacaHistoricalClient.from_environment({})

    def test_downloader_rejects_oversized_transport_body(self):
        client = AlpacaHistoricalClient.from_environment(
            {"APCA_API_KEY_ID": "fixture-key", "APCA_API_SECRET_KEY": "fixture-secret"},
            transport=lambda _request, _timeout: b"x" * (MAX_RESPONSE_BYTES + 1),
        )
        with self.assertRaisesRegex(Exception, "byte limit"):
            client.download_bars(
                start_date="2026-07-22", end_date="2026-07-22", timeframe="1Day",
            )

    def test_default_transport_rejects_redirect_without_forwarding_credentials(self):
        opened = []

        class RedirectingOpener:
            def __init__(self, handler):
                self.handler = handler

            def open(self, request, timeout):
                opened.append(request)
                self.handler.redirect_request(
                    request, None, 302, "Found", {}, "https://attacker.invalid/collect",
                )
                raise AssertionError("redirect handler returned instead of rejecting")

        with patch(
            "aperture_research.alpaca_proxy.build_opener",
            side_effect=lambda handler: RedirectingOpener(handler),
        ):
            client = AlpacaHistoricalClient.from_environment({
                "APCA_API_KEY_ID": "fixture-key",
                "APCA_API_SECRET_KEY": "fixture-secret",
            })
            with self.assertRaisesRegex(Exception, "redirected"):
                client.download_bars(
                    start_date="2026-07-22", end_date="2026-07-22", timeframe="1Day",
                )

        self.assertEqual(len(opened), 1, "no redirected request may be opened")
        self.assertEqual(opened[0].host, "data.alpaca.markets")
        self.assertEqual(opened[0].get_header("Apca-api-key-id"), "fixture-key")


if __name__ == "__main__":
    unittest.main()
