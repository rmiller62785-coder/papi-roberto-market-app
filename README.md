# Aperture NVDA

A bilingual NVDA market-intelligence dashboard deployed on OpenAI Sites. It combines dated market observations, opening-range research, event evidence, historical sessions, technical context, and a separate fail-closed Strict MOO readiness workflow.

Production: <https://aperture-nvda-plan.rmiller62785.chatgpt.site>

## Maintainer start here

Before changing or deploying this repository, read [`HANDOFF.md`](HANDOFF.md). It records the authoritative branch, current production build, deployed Workers, non-regression invariants, known scheduler alert, secret-name inventory, validation matrix, and remaining commissioning work. `AGENTS.md` makes this a required gate for future Codex work.

## Product boundaries

- The Full Dashboard is non-actionable research and paper decision support.
- Strict MOO execution status is evaluated by the server at `/api/moo/status`; the browser does not manufacture a strict prediction or entitlement state.
- Alpaca IEX is real-time single-exchange reference data and never satisfies Strict MOO. The commissioned durable stream uses the paid Alpaca SIP feed, but SIP transport health alone is not a fresh execution quote and does not provide Nasdaq NOII.
- Alpaca asset metadata is indicative. `shortable` or `easy_to_borrow` is not an account-specific locate guarantee.
- Strict execution remains `NO_TRADE` and `NOT_COMMISSIONED` until a promoted point-in-time model, immutable decision freeze, licensed consolidated feed, complete risk policy, and required broker controls exist.
- No route submits an order, and no LLM is allowed to place unrestricted live trades.

## Runtime architecture

- `app/api/market`: normalized NVDA quote, source health, completed-session history, and minute context.
- `app/api/forecast`: explicitly non-actionable research evidence and stored research checkpoints.
- `app/api/moo/status`: server-owned Strict MOO commissioning/readiness snapshot plus a public-safe paper broker reference.
- `services/capture-scheduler` + `app/api/internal/scheduled-capture`: the deployed, browser-independent one-minute control plane for research checkpoints, outcomes, and R2 archival. The standalone Worker signs a fixed trigger; Sites derives the admitted minute from its own clock and rejects replay, skew, redirects, and caller-selected dates. Checkpoint capture is admitted and recorded before provider work, market and forecast reads overlap, and R2 archive maintenance is deferred to a non-checkpoint minute so it cannot consume the decision-freeze latency budget.
- `worker/index.ts` retains the same scheduled handler for hosting platforms that attach its declared cron, but Aperture production does not depend on that implicit path. Public GET routes only verify the readiness marker and never run bootstrap DDL; market capture exits before provider calls outside its named Eastern windows.
- D1: research weights, checkpoints, scheduler-owned freezes, automation health, immutable provider observations, completed-minute revisions, session archives, ingestion replay nonces, and contiguous stream acknowledgements. Public GET routes remain read-only.
- `app/api/internal/market-stream`: audience-bound HMAC receiver for the separate durable stream service. Raw requests are replay-protected, runtime-validated, recorded idempotently by stream/sequence, and acknowledged only after the immutable prefix is durable. An independent bounded current-state projection keeps live SIP status current without advancing or rewriting the raw cursor.
- `services/market-stream`: independently deployable Cloudflare Worker + SQLite Durable Object. It owns provider WebSockets, restart recovery, authoritative provider-bar versions, an ordered delivery outbox, a fail-closed priority current-state lane, and browser fanout. Its production configuration selects paid Alpaca SIP, but execution eligibility still requires the provider-confirmed current connection and exact same-epoch proof.
- `app/r2-market-archive.ts` + `app/d1-market-archive.ts`: deterministic contiguous JSONL archive segments. R2 objects are write-once and independently verified by metadata before D1 records them as verified; hot ledger data is not automatically pruned.
- `research/`: offline Python 3.11 walk-forward evaluation plane. It accepts only timestamped point-in-time rows and official Nasdaq Opening Cross labels, recomputes fold-local baselines and costs, and emits candidate reports with `promotionDecision: NOT_PERFORMED`. The scheduled GitHub workflow can collect an immutable Alpaca SIP opening proxy and publish hashed research artifacts, but the proxy is explicitly non-NOII and `strictGateEligible: false`.
- `services/paper-broker`: separate paper-only Cloudflare Worker scaffold. It is NVDA/MOO-shaped, replay-protected, pinned to Alpaca's paper host, and can expose a redacted read-only account/position/open-MOO health view. Order submission and shorts remain disabled, the share cap remains one, and the service is not an application dependency.
- Browser transport: visibility/session-aware REST polling with request timeouts and last-good research preservation. The complete Strict status audit has a 45-second delivery envelope while the execution quote expires independently after five seconds. A failed status poll retains the still-valid prior audit as `RETRYING`; it never extends quote actionability. The durable service is optional until separately commissioned; REST remains the safe fallback.

The dashboard renders research, unattended automation, and Strict execution as three independent operational planes. Paper-planner risk inputs receive conservative automatic defaults and remain preview-only; advanced overrides are optional and never submit an order.

The live priority lane solves current quote/state freshness while the ordered raw audit ledger drains. The UI exposes the current projection sequence and a minimum raw backlog lower bound. That visibility must not be removed, and long-term raw throughput/archival remains a separate operational commissioning task.

Execution-grade streaming must use the server-owned durable ingestion service, never a direct browser/provider credential. Candidate permanent connections are consolidated U.S. quotes/trades, broker order/fill updates, account locate/borrow, and optional NOII monitoring. SEC, BLS, news, earnings, Polymarket, and other slow evidence remain scheduled or TTL-polled.

## Configuration

Copy `.env.example` for local development. Secrets stay server-side.

- `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`: server-side Alpaca market-data and paper asset metadata. Feed coverage is always labeled from the actual endpoint/entitlement and never inferred from the presence of credentials.
- `FINNHUB_API_KEY`: fallback quote, company/news, earnings, and cross-market research.
- `WEIGHTS_ADMIN_EMAILS`: comma-separated allowlist for authenticated production-weight writes.
- `SITES_INGESTION_AUDIENCE` / `SITES_INGESTION_SECRET`: shared receiver identity and HMAC secret for the durable stream service. Configure these only in Sites and the Worker secret managers.
- `CAPTURE_SCHEDULER_AUDIENCE` / `CAPTURE_SCHEDULER_SECRET`: shared identity and HMAC secret for the standalone one-minute scheduler and its private Sites receiver. The scheduler also holds the Sites access-bypass token server-side.
- `DB`: D1 binding declared in `.openai/hosting.json`.
- `ARCHIVE`: private R2 binding declared in `.openai/hosting.json` for verified immutable market-stream segments.

The stream Worker has its commissioning checklist in `services/market-stream/README.md`. The paper-only service has an independent safety checklist in `services/paper-broker/README.md`; do not deploy or enable it until the owner-confirmation route, risk policy, and fill reconciliation are approved. Do not paste credentials into issues, commits, logs, or chat.

The nightly research workflow requires repository Actions secrets named `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`. It becomes scheduled only from the default branch. Its artifacts are research evidence, not a promoted Strict model.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
npm run build
npm test
npm run lint
```

Tests cover market calendars and DST, stale/future-skewed data, unfinished candles, strict freeze boundaries, source entitlements, broker metadata safety, adaptive polling, server-owned Strict status, risk math, immutable artifacts, D1 as-of persistence, stream authentication/contracts, research isolation, signed scheduler replay/skew controls, and scheduled capture.

## Deployment

Hosting configuration lives in `.openai/hosting.json`. Deploy only a tested, committed source revision. Keep Sites secrets in the hosting environment and never commit credentials.

Repository-specific development and market-data invariants are in `AGENTS.md`. Current production state and the non-regression handoff are in `HANDOFF.md`.
