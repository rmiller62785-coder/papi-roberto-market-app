# Aperture NVDA

A bilingual NVDA market-intelligence dashboard deployed on OpenAI Sites. It combines dated market observations, opening-range research, event evidence, historical sessions, technical context, and a separate fail-closed Strict MOO readiness workflow.

Production: <https://aperture-nvda-plan.rmiller62785.chatgpt.site>

## Product boundaries

- The Full Dashboard is non-actionable research and paper decision support.
- Strict MOO execution status is evaluated by the server at `/api/moo/status`; the browser does not manufacture a strict prediction or entitlement state.
- Alpaca IEX is real-time single-exchange reference data. It is not consolidated SIP or Nasdaq NOII.
- Alpaca asset metadata is indicative. `shortable` or `easy_to_borrow` is not an account-specific locate guarantee.
- Strict execution remains `NO_TRADE` and `NOT_COMMISSIONED` until a promoted point-in-time model, immutable decision freeze, licensed consolidated feed, complete risk policy, and required broker controls exist.
- No route submits an order, and no LLM is allowed to place unrestricted live trades.

## Runtime architecture

- `app/api/market`: normalized NVDA quote, source health, completed-session history, and minute context.
- `app/api/forecast`: explicitly non-actionable research evidence and stored research checkpoints.
- `app/api/moo/status`: server-owned Strict MOO commissioning/readiness snapshot plus a public-safe paper broker reference.
- `worker/index.ts` + `app/scheduled-capture.ts`: browser-independent scheduled research capture.
- The Sites Worker minute heartbeat also completes the idempotent historical-schema bootstrap after deploy, including weekends. Public GET routes only verify the readiness marker and never run bootstrap DDL; market capture still exits before provider calls outside its named Eastern windows.
- D1: research weights, checkpoints, scheduler-owned freezes, automation health, immutable provider observations, completed-minute revisions, session archives, ingestion replay nonces, and contiguous stream acknowledgements. Public GET routes remain read-only.
- `app/api/internal/market-stream`: audience-bound HMAC receiver for the separate durable stream service. Requests are replay-protected, runtime-validated, recorded idempotently by stream/sequence, and acknowledged only after the immutable prefix is durable.
- `services/market-stream`: independently deployable Cloudflare Worker + SQLite Durable Object. It owns provider WebSockets, restart recovery, authoritative provider-bar versions, an ordered delivery outbox, and browser fanout. Its production configuration defaults to research-only Alpaca IEX; SIP cannot be treated as execution-grade without explicit entitlement confirmation.
- Browser transport: visibility/session-aware REST polling with request timeouts and last-good research preservation. Strict status has a short server validity lease and is withheld on offline, expired, or lifecycle-mismatched evaluations. The durable service is optional until separately commissioned; REST remains the safe fallback.

Execution-grade streaming must use the server-owned durable ingestion service, never a direct browser/provider credential. Candidate permanent connections are consolidated U.S. quotes/trades, broker order/fill updates, account locate/borrow, and optional NOII monitoring. SEC, BLS, news, earnings, Polymarket, and other slow evidence remain scheduled or TTL-polled.

## Configuration

Copy `.env.example` for local development. Secrets stay server-side.

- `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`: Alpaca IEX reference quote, SIP completed daily history, and paper asset metadata.
- `FINNHUB_API_KEY`: fallback quote, company/news, earnings, and cross-market research.
- `WEIGHTS_ADMIN_EMAILS`: comma-separated allowlist for authenticated production-weight writes.
- `SITES_INGESTION_AUDIENCE` / `SITES_INGESTION_SECRET`: shared receiver identity and HMAC secret for the durable stream service. Configure these only in Sites and the Worker secret managers.
- `DB`: D1 binding declared in `.openai/hosting.json`.

The Worker has its own configuration and commissioning checklist in `services/market-stream/README.md`. Do not paste credentials into issues, commits, logs, or chat.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
npm run build
npm test
npm run lint
```

Tests cover market calendars and DST, stale/future-skewed data, unfinished candles, strict freeze boundaries, source entitlements, broker metadata safety, adaptive polling, server-owned Strict status, risk math, immutable artifacts, D1 as-of persistence, stream authentication/contracts, research isolation, and scheduled capture.

## Deployment

Hosting configuration lives in `.openai/hosting.json`. Deploy only a tested, committed source revision. Keep Sites secrets in the hosting environment and never commit credentials.

Repository-specific development and market-data invariants are in `AGENTS.md`.
