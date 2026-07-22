# Aperture NVDA research runner

The production/research boundary, current commissioning status, and non-regression handoff are maintained in [`../HANDOFF.md`](../HANDOFF.md). Read it before changing this runner or publishing artifacts.

This directory is a stdlib-first, offline research plane. It does not connect
to a broker, place orders, write production model state, or promote a model.

The runner consumes rows whose prediction inputs have explicit availability
timestamps and whose official-open label is separately identified as
`NASDAQ_OFFICIAL_CROSS`. It rejects rows when:

- a prediction or input became available after its feature cutoff;
- a training cutoff reaches into the prediction timestamp;
- an outcome appears before the prediction cutoff;
- sessions are duplicated or not chronological; or
- the label is not explicitly sourced from the official opening cross.

Evaluation uses expanding chronological folds. Candidate metrics and the
previous-close and overnight-midpoint baselines are recomputed from fold rows,
with explicit cost assumptions. Directional confidence receives a separate
out-of-sample calibration report. Reports always say
`promotionDecision: NOT_PERFORMED`; a production promotion gate must verify and
approve the resulting immutable artifacts.

## Row contract

Input JSONL rows contain:

- `sessionDate`
- `featureAsOfMs`
- `predictionGeneratedAtMs`
- `trainedThroughMs`
- `outcomeAvailableAtMs`
- `officialOpenSource` (`NASDAQ_OFFICIAL_CROSS` only)
- `officialOpenCents`
- `previousCloseCents`
- `overnightMidpointCents`
- `candidatePredictionCents`
- `probabilityUp` (0 through 1)

Every input feature must already have passed the application-side immutable
feature-snapshot contract. Historical REST downloads without original
availability timestamps must not be relabeled as captured point-in-time rows.

## Run tests

```bash
cd research
python -m unittest discover -s tests -v
```

The package has no runtime dependencies beyond Python 3.11 or newer.

## Produce a report

`sources.json` is an array of verified private-archive objects with
`objectKey`, `contentHash`, and `byteLength`. Run from this directory:

```bash
PYTHONPATH=src python -m aperture_research.cli \
  --rows input/session-rows.jsonl \
  --sources input/sources.json \
  --output output/candidate-report.json \
  --feature-schema-version nvda-open-features-v1 \
  --code-version <git-commit> \
  --model-version candidate-v1 \
  --created-at-ms <unix-epoch-milliseconds> \
  --minimum-train-sessions 60 \
  --test-sessions-per-fold 10 \
  --candidate-cost-cents 3
```

The output contains exactly two immutable, content-hashed research records:

- `datasetManifest`: source-object hashes, feature schema, code version,
  session range, row count, and dataset hash;
- `evaluation`: fold boundaries, recomputed candidate and baseline MAE after
  configured costs, and an out-of-sample directional calibration report.

It does **not** emit model bytes, a promoted model registry entry, a Strict
decision artifact, an order, or a fill. Those require separate production
ingestion, artifact verification, human promotion, inference, and freeze
hooks.

## Alpaca SIP historical proxy bootstrap

The proxy bootstrap is a separate research contract. It does not modify or
relax the official-cross manifest above. Its label is exactly
`ALPACA_SIP_FIRST_MINUTE_OPEN_PROXY`, meaning the `open` of Alpaca's completed
09:30 one-minute SIP bar. It is not the Nasdaq Official Opening Cross, is not an
NOII substitute, and always reports `strictGateEligible: false` and
`promotionDecision: NOT_PERFORMED`.

Historical REST pages do not contain their original point-in-time availability.
The proxy therefore declares a conservative reconstructed lag and admits a
feature bar only when:

```text
bar end + reconstructed availability lag <= 09:24:30 ET feature cutoff
```

The lag is stored on every row and in the dataset manifest. Download time is
retained separately as archive provenance and is never relabeled as provider
availability. Both exact raw response bytes and their metadata are SHA-256
bound. Existing content-addressed raw paths cannot be overwritten with
different bytes.

The downloader is Python-stdlib only, fixed to NVDA and Alpaca SIP, limited to
3,660 calendar days and 500 pages per timeframe, and reads credentials only
from these environment variables:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`

It never prints or serializes either value. From `research/`, download bounded
1Day and 1Min archives with:

```bash
export APCA_API_KEY_ID='<injected by the runner>'
export APCA_API_SECRET_KEY='<injected by the runner>'
PYTHONPATH=src python -m aperture_research.proxy_cli download \
  --start-date 2021-01-01 \
  --end-date 2026-07-22 \
  --archive-directory private-proxy-archive \
  --manifest private-proxy-archive/download-manifest.json
```

Build rows and a chronological expanding walk-forward report without network
access:

```bash
PYTHONPATH=src python -m aperture_research.proxy_cli evaluate \
  --download-manifest private-proxy-archive/download-manifest.json \
  --archive-directory private-proxy-archive \
  --rows-output output/alpaca-proxy-rows.jsonl \
  --output output/alpaca-proxy-report.json \
  --reconstructed-availability-lag-ms 30000 \
  --feature-schema-version alpaca-sip-proxy-features-v1 \
  --code-version <git-commit> \
  --model-version alpaca-proxy-mean-gap-v1 \
  --created-at-ms <unix-epoch-milliseconds> \
  --minimum-train-sessions 60 \
  --test-sessions-per-fold 10 \
  --candidate-cost-cents 3
```

The deterministic candidate is fit independently in each fold as the expanding
mean prior-close-to-proxy-open gap. Reports compare its cost-adjusted MAE with
previous-close and premarket-range-midpoint baselines. A fold is rejected if
any training outcome was unavailable at its test cutoff.

### Intended nightly external runner

Run this workflow after the prior session's 09:31 bar is complete in an
external user-owned Python runner, not in a browser request and not in the
Strict application path. The runner should inject credentials through its
secret manager, archive new raw pages and the download manifest to private R2
without overwriting an existing content hash, run `evaluate`, and retain the
rows/report as research artifacts. It may publish health and shadow metrics,
but it must not write the production model registry, promote a candidate,
change a frozen decision, or place an order.

Future live point-in-time snapshots and licensed official-cross/NOII outcomes
remain separate datasets. A later human-reviewed promotion workflow may compare
the proxy candidate against those artifacts, but must never silently relabel
this bootstrap as an official or execution-grade model.
