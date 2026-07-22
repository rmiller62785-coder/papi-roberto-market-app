# Aperture NVDA Maintainer Handoff

Read this file completely before changing the application, Workers, storage contracts, model code, or hosting configuration. It records the production state and the repairs that must not be regressed. Re-check live state before relying on any dated observation below.

## Authoritative state

- Production: <https://aperture-nvda-plan.rmiller62785.chatgpt.site>
- Product: Aperture NVDA, bilingual English/Spanish market intelligence with a separate fail-closed Strict MOO workflow.
- GitHub: <https://github.com/rmiller62785-coder/papi-roberto-market-app>
- Authoritative repair branch: `codex/commission-alpaca-sip`
- Last application commit before this handoff: `95570a02b95ab13fd6e7acba0a71fd71d1e16fed`
- Last application-code release verified: Sites version 43. A later documentation-only Sites version may carry the same application build.
- Application build prepared by the current repair: `2026.07.22.7`
- Sites project: `appgprj_6a5bbe1032d48191a928da44006bb605`
- Sites bindings: D1 `DB`, private R2 `ARCHIVE`
- Sites environment revision at the verified deployment: 8
- Access: public. Do not add email-based viewer gating unless the owner explicitly requests a future access-policy change.

The current repair is developed on `codex/commission-alpaca-sip` and must be fast-forwarded to `origin/main` only after the full validation and independent reviews in this handoff pass. Never force-update or rebase over user work.

The synchronized writable clone used for this repair is:

```text
C:\Users\rmill\.codex\worktrees\15fa\Papi Roberto Market App\.authoritative
```

The parent Codex worktree at `C:\Users\rmill\.codex\worktrees\15fa\Papi Roberto Market App` contains an older, dirty intermediate state. Do not overwrite, reset, merge, or deploy from the parent. The unrelated untracked `bitcoin-intelligence/` directory is user-owned and must not be added, edited, moved, or deleted as part of Aperture work.

## Verified production snapshot

Snapshot time: 2026-07-22 08:51 ET / 12:51 UTC. This is evidence of the state at that time, not a permanent assertion.

- `/api/version`: `2026.07.22.6`
- Strict U.S. source: `LIVE`, `REALTIME`, `CONSOLIDATED_SIP`, provider `Alpaca SIP`
- Durable stream supervisor: `LIVE`
- Alpaca paper broker reference metadata: `live`
- Strict market response: 291 completed bars and 291 analysis bars; forming candles were excluded
- Correct current blockers:
  - `TRAINED_MODEL_NOT_PROMOTED`
  - `IMMUTABLE_DECISION_FREEZE_NOT_AVAILABLE`
  - `ACCOUNT_LOCATE_NOT_AVAILABLE`
- Correct visible stage when the SIP quote is fresh: `Source health READY · 1/1`, followed by `Model readiness · UNAVAILABLE`
- Correct visible blocker: `Promoted opening model required`
- Quote freshness is derived from server timestamps and displays the actual five-second policy window
- Production root returned HTTP 200 with no epoch/1970 date and no browser console warnings or errors

### Unresolved operational alert

The unattended capture system was **not yet proven healthy** at the snapshot time:

- `/api/automation/health` reported `failed`.
- The append-only last run remained the T-4H failure: `source availability exceeds the scheduled checkpoint cutoff`.
- The 08:30 ET T-1H checkpoint was reported missed.
- The next expected checkpoint at the snapshot time was T-30M at 09:00 ET.
- The deployed scheduler Worker existed and declared the one-minute cron, but the D1 checkpoint ledger had no successful receiver attempt after the earlier T-4H failure.

The current repair raises the caller timeout to 30 seconds, records an admitted `started` row before provider work, overlaps market and forecast reads, removes R2 archival from checkpoint minutes, and distinguishes running/stalled/failed/snapshot-success states. After deployment, observe the next exact checkpoint and require a new terminal snapshot-success ledger row before declaring automation healthy. Historical misses remain missed and must never be backfilled.

## Deployed services

### Sites application

- Source branch in the Sites repository: `main`
- Current application APIs:
  - `/api/market`
  - `/api/forecast`
  - `/api/library`
  - `/api/moo/status`
  - `/api/moo/broker-status`
  - `/api/automation/health`
  - `/api/internal/market-stream`
  - `/api/internal/scheduled-capture`
  - `/api/version`
- The browser uses adaptive REST polling. Browser presence never owns checkpoint capture or the Alpaca socket.

### Market-stream Worker

- Name: `aperture-nvda-market-stream`
- Production configuration: `services/market-stream/wrangler.production.jsonc`
- Latest verified deployment version: `2aebf8f5-e022-4b7e-9d00-4a3d3972666e`
- Feed: Alpaca SIP with `SIP_ENTITLED=true`
- Durable Object: `NvdaMarketStream`
- Responsibility: provider WebSocket ownership, restart recovery, completed-bar revisions, ordered delivery outbox, and stream health.
- The stream can be healthy while a Strict quote is temporarily stale. Do not label that as a disconnected socket or an entitlement failure.

### Capture-scheduler Worker

- Name: `aperture-nvda-capture-scheduler`
- Production configuration: `services/capture-scheduler/wrangler.production.jsonc`
- Verified deployment version: `b5e4de6b-377f-4d1b-a5d0-df5f38e98b6a`
- Cron: `* * * * *`
- Responsibility: send one fixed, signed trigger to the private Sites receiver. It cannot choose a date, checkpoint, or historical time.
- Operational state: deployed, but the next checkpoint delivery still required proof as described above.

### Paper-broker Worker

- Name reserved by configuration: `aperture-nvda-paper-broker`
- It is a scaffold only and is not commissioned as an application dependency. It now has a redacted read-only paper account, NVDA position, and open-NVDA-MOO health projection plus REST reconciliation.
- `PAPER_ORDER_SUBMISSION_ENABLED=false`
- `PAPER_SHORTS_ENABLED=false`
- `PAPER_MAX_SHARES=1`
- `tradeUpdates` remains `NOT_CONNECTED`. Do not enable submission until policy review, durable trade-update/fill reconciliation, a trained and frozen Strict decision artifact, and a separate explicit activation are complete.

### Research runner

- `research/` is an offline Python 3.11 plane.
- The official workflow accepts only point-in-time rows labeled `NASDAQ_OFFICIAL_CROSS`.
- The Alpaca history bootstrap uses `ALPACA_SIP_FIRST_MINUTE_OPEN_PROXY`; it is research-only, never NOII, never an official-open label, and never Strict-eligible.
- The historical proxy downloader and chronological expanding walk-forward evaluator are implemented and tested.
- A scheduled/manual GitHub Actions runner is checked in. It downloads the Alpaca SIP proxy, runs chronological evaluation, emits a content-hashed health artifact with `strictGateEligible: false`, and publishes only aggregate report/health files as a 30-day Actions artifact. Raw entitled pages and per-session proxy rows are not uploaded. Provider secrets are scoped only to the download step and all GitHub Actions are pinned to immutable commits. It never calls the application or promotes a model.
- Activation requires the workflow on the default branch and GitHub Actions secrets `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`.
- Reports always retain `promotionDecision: NOT_PERFORMED` until a separate human-reviewed promotion workflow exists.

## Architecture decisions that must remain true

1. Strict and research are separate planes. Research ranges, leans, manual weights, or paper-planner values never populate a Strict ticket.
2. Strict is fail-closed. Missing, stale, malformed, cross-session, future-skewed, or unentitled evidence produces `NO_TRADE`/blocked state.
3. Alpaca SIP is consolidated U.S. quote/trade coverage, but it is not Nasdaq Opening Cross/NOII data.
4. A live SIP entitlement and a fresh quote are different facts. Use `CONSOLIDATED_US_FEED_NOT_ENTITLED` only for an unconfirmed entitlement and `CONSOLIDATED_US_QUOTE_NOT_CURRENT` for an entitled but stale/pending quote.
5. A healthy permanent stream and a fresh Strict quote are different states. Do not collapse them into one connection badge.
6. Only completed one-minute bars may enter analysis or persisted completed-bar history. A forming bar may be displayed only with an explicit forming state and must never leak into a frozen feature snapshot.
7. Preserve provider/source time, received time, processed time, available time, checked time, and connection epoch. An API check is not a new market observation.
8. Scheduled checkpoint admission uses the Sites server clock after internal market/forecast requests. Delayed cron events cannot backfill point-in-time evidence.
9. Scheduler, ingestion, browser-access, and paper-command secrets are separate, audience-bound, replay-protected, and server-side.
10. Redirects are rejected on credential-bearing provider and scheduler requests.
11. Stream delivery is ordered and durable. Non-2xx or incomplete acknowledgements remain in the outbox and retry in order.
12. D1/R2 history is append-only or content-addressed where specified. Do not repair health by deleting a failed run or overwriting an archive.
13. Active Strict session selection follows the server clock automatically. A user-selected date is an explicit audit pin and must not silently become the active execution session.
14. Cold UI renders may temporarily have no target date. Session helpers must be non-throwing for empty or malformed input.
15. Strict quote freshness is five seconds and must be rendered from server-provided timestamps, not a duplicated UI literal.
16. Strict banner text and its aria-live text must use the first active server commissioning blocker, not a stale snapshot reason.
17. English and Spanish copy, accessibility semantics, and mobile layouts must remain equivalent.
18. No LLM, browser, scheduled Worker, or research runner may place unrestricted live trades.
19. The 45-second Strict status delivery envelope and five-second quote actionability window are separate. A retained last-good audit may display during a retry, but it cannot keep a quote live.
20. Broker metadata and paper health are outside the `/api/moo/status` critical path and cannot delay or unlock Strict readiness.

## Regression map

| Area | Protected behavior | Primary files | Regression coverage |
| --- | --- | --- | --- |
| Cold session selection | Empty/malformed target dates do not crash SSR; active session rolls automatically | `app/target-session.ts`, `app/page.tsx` | `tests/target-session.test.mjs`, `tests/rendered-html.test.mjs`, `tests/moo-planning-integration.test.mjs` |
| Strict SIP semantics | Entitlement, freshness, stream health, and blockers remain distinct | `app/moo-system-status.ts`, `app/moo-status-guard.ts`, `app/strict-moo-presentation.ts` | `tests/moo-system-status.test.mjs`, `tests/moo-status-guard.test.mjs`, `tests/strict-moo-presentation.test.mjs` |
| Strict presentation | Five-second quote expiry, 45-second audit envelope, retry state, and current blocker are consistent visually and for screen readers | `app/components/StrictMooJourney.tsx`, `app/page.tsx` | `tests/rendered-html.test.mjs`, `tests/strict-moo-presentation.test.mjs` |
| Operational planes | Research, unattended automation, and Strict health remain independently visible and bilingual | `app/page.tsx`, `app/globals.css` | `tests/rendered-html.test.mjs`, `tests/polling-policy.test.mjs` |
| Completed-bar integrity | Strict bars equal analysis bars and exclude forming candles | `app/api/market/route.ts`, `app/market-reducer.ts`, `app/selected-market-research.ts` | `tests/market-route-durable-stream.test.mjs`, `tests/selected-market-research.test.mjs` |
| Durable ingestion | Immutable ordered events, replay protection, contiguous acknowledgements | `app/api/internal/market-stream/route.ts`, `app/market-stream-receiver.ts`, `services/market-stream/` | stream receiver and service test suites |
| Scheduled capture | Exact-minute signed trigger, server-derived time, no backfill | `app/api/internal/scheduled-capture/route.ts`, `app/scheduled-capture.ts`, `services/capture-scheduler/` | scheduler auth, route, bridge, and scheduled-capture tests |
| Immutable artifacts | Freeze/model/risk/locate contracts remain validated and fail-closed | `app/moo-artifact-store.ts`, `app/moo-feature-snapshot.ts`, `app/moo-model-registry.ts`, `app/moo-risk-policy.ts` | corresponding MOO artifact/model/risk tests |
| Historical research | Proxy and official datasets remain explicitly separate and chronological | `research/src/aperture_research/` | `research/tests/` |
| Credential safety | No redirect forwarding, browser secret exposure, or committed values | provider adapters and Worker auth modules | scheduler, stream, broker, and redirect regression tests |

When changing a protected area, add or update a regression test in the same commit. Do not weaken a guard simply to make a card populate.

## Secret inventory: names only

Never write values into this file, Git, issues, screenshots, logs, or browser code.

Sites application:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `FINNHUB_API_KEY`
- `WEIGHTS_ADMIN_EMAILS`
- `SITES_INGESTION_AUDIENCE`
- `SITES_INGESTION_SECRET`
- optional bounded-rotation ingestion variables
- `CAPTURE_SCHEDULER_AUDIENCE`
- `CAPTURE_SCHEDULER_SECRET`

Market-stream Worker:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `SITES_INGESTION_URL`
- `SITES_INGESTION_SECRET`
- `SITES_ACCESS_BYPASS_TOKEN`
- `STREAM_CONTROL_SECRET`
- `BROWSER_ACCESS_SECRET`

Capture-scheduler Worker:

- `CAPTURE_SCHEDULER_SECRET`
- `SITES_ACCESS_BYPASS_TOKEN`

Paper-broker scaffold:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `PAPER_COMMAND_SECRET`

GitHub Actions research workflow:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`

Rotate using the documented dual-key order where supported. Never rotate only one side of a shared HMAC contract.

## Required workflow for future changes

### Before editing

1. Read `AGENTS.md`, this handoff, and the relevant service/research README.
2. Confirm the checkout is the authoritative repair branch or a descendant of it.
3. Run `git status --short --branch`. Stop if tracked changes are unexpected.
4. Fetch GitHub and compare ancestry. Never reset, rebase, or overwrite user changes to synchronize.
5. Query `/api/version`, `/api/moo/status`, `/api/market?view=STRICT`, and `/api/automation/health` before diagnosing production.
6. Treat transient quote staleness separately from permanent stream health.

### While editing

- Make the smallest systemic change that resolves the observed failure.
- Preserve public contracts unless a versioned migration and compatibility path are included.
- Keep credentials server-side and redact provider errors.
- Do not edit generated `.wrangler/`, `.next/`, `.vinext/`, `dist/`, or user-owned unrelated directories.
- Update this handoff when production architecture, deployments, blockers, or runbooks change materially.

### Validation

Application:

```text
npm run build
node --test
npm run lint
```

Research:

```text
cd research
PYTHONPATH=src python -m unittest discover -s tests -v
```

Changed Worker:

```text
npm test
npm run typecheck
npm run preflight
```

For time/session changes, cover holidays, early closes, DST boundaries, stale/missing data, duplicates, replay, and out-of-order delivery. Use fresh independent reviews for point-in-time correctness, API/security, and UX/failure modes before production deployment.

### Publishing

1. Commit only the reviewed files.
2. Push the GitHub branch.
3. Push that exact commit to the Sites source repository.
4. Save and deploy a Sites version from the exact commit.
5. Deploy a standalone Worker only when its service files/configuration changed.
6. Verify the production root, build identity, Strict status, bar equality, stream health, broker reference, automation health, browser console, and recent Worker errors.
7. Never declare automation healthy until an admitted checkpoint and its immutable ledger records succeed without browser presence.

## Recent repair sequence

- `317a08c` — repair Strict MOO data and automate captures
- `5232189` — timestamp scheduled capture after internal requests complete
- `2345533` — distinguish SIP entitlement from quote freshness
- `b2962c7` — guard Strict MOO cold-start session
- `e0e7a12` — make prior-session resolution non-throwing
- `95570a0` — align the Strict banner and freshness presentation with server state

The current repair passed the production build, 457 application tests, 16 Python research tests, 13 capture-scheduler tests plus typecheck/preflight, 30 paper-broker tests plus typecheck/preflight, and ESLint on every changed JS/TS file. The broad repository ESLint invocation can be slow on this Windows junction-backed clone; the changed-file lint is the authoritative current result. Production API/browser checks and independent point-in-time, security, and UX reviews must also pass before release.

## Remaining commissioning roadmap

1. Deploy the scheduler repair and prove it at an exact future checkpoint; do not backfill missed evidence.
2. Put the Alpaca research workflow on the default branch, configure its two GitHub secrets, and collect immutable nightly proxy artifacts as a separate research plane.
3. Obtain licensed historical Nasdaq Official Opening Cross/NOII data for a genuine official-open model; Alpaca SIP cannot substitute for it.
4. Accumulate live point-in-time features and outcomes, compare against simple baselines with costs, calibrate, and pass chronological walk-forward promotion gates.
5. Add a human-reviewed immutable model promotion workflow and exact-session inference/freeze artifact.
6. Commission an account-specific risk policy and locate proof.
7. Keep paper order submission disabled until the explicit paper-broker safety prerequisites are satisfied.

Until those steps are complete, Strict correctly remains `NO_TRADE` and `NOT_COMMISSIONED`. Populating research fields is not equivalent to commissioning execution.
