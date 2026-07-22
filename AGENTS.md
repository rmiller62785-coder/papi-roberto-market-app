# NVDA Intelligence Development Rules

## Read-before-change gate

Before any repository change, read `HANDOFF.md` completely and verify the checkout is the authoritative repair branch or a descendant. The handoff records deployed services, known failures, protected fixes, regression tests, and the current commissioning roadmap.

- Do not start from an older `origin/main` when it would discard the repair sequence documented in the handoff.
- Stop on unexpected tracked changes. Never reset, rebase, or overwrite user work to make the tree appear clean.
- Do not add generated `.wrangler/`, build output, environment files, or the user-owned `bitcoin-intelligence/` directory.
- Change the smallest relevant surface and add a regression test when touching a protected behavior.
- Update `HANDOFF.md` whenever architecture, deployment identity, live blockers, secret names, or operational runbooks change materially.
- Do not declare a background path commissioned merely because it is deployed; require a successful immutable production checkpoint without browser presence.

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

After deployment, verify the production build identity, Strict status, completed-bar equality, stream state, automation health, and recent errors. A healthy stream does not prove a fresh quote, and a healthy quote does not prove scheduler capture or model readiness.
