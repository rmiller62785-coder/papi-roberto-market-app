# NVDA Intelligence Development Rules

## Objective

Build a point-in-time-correct NVDA opening and intraday decision-support application. The product may describe evidence and uncertainty, but it must not imply certainty or guaranteed trading outcomes.

## Required workflow

For work spanning three or more independent domains:

1. Begin with bounded, read-only specialist audits when architecture is unclear.
2. Publish an architecture decision and non-overlapping file-ownership map before parallel implementation.
3. Keep the root agent responsible for shared contracts, integration, validation, and deployment.
4. Use fresh reviewers for point-in-time correctness, API integrity/security, and UX/failure modes.
5. Parallel work must reduce the critical path or materially improve independent review.

## Market-data and modeling invariants

- Never use information that was unavailable at the prediction timestamp.
- Preserve provider/source time, received time, processed time, and available time when the source exposes them.
- Distinguish an API check from a new market observation.
- Distinguish market closed, stale/degraded data, and source failure.
- Never treat an unfinished one-minute candle as complete.
- Never average prices from feeds with materially different exchange coverage.
- Manual research weights are hypotheses and must be labeled as research controls.
- Never describe delayed or partial exchange data as consolidated real-time data.
- Use chronological walk-forward evaluation; never random-split market observations.
- Every future statistical forecast must identify its model version and point-in-time feature snapshot.
- Require a meaningful WAIT/NO EDGE state.
- Compare every model against simple baselines and include costs before promotion.

## Product safeguards

- Keep API keys and credentials server-side.
- Preserve the bilingual English/Spanish experience.
- Show source health and timestamp semantics next to material live calculations.
- Do not let browser presence determine whether historical checkpoints are captured.
- Do not allow an LLM to place unrestricted live trades.

## Verification

Run the production build and relevant automated tests before deployment. Changes involving time or market sessions must cover holidays, early closes, daylight-saving transitions, stale feeds, missing data, duplicate events, and out-of-order messages where applicable.
