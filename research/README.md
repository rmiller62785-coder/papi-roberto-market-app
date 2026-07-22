# Aperture NVDA research runner

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
