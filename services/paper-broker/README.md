# Aperture NVDA paper broker

Cross-service commissioning status and the rule that this scaffold remains disabled are maintained in [`../../HANDOFF.md`](../../HANDOFF.md). Read it before changing or deploying this Worker.

This independent Cloudflare Worker is a fail-closed scaffold for explicit, owner-confirmed **Alpaca paper** NVDA MOO commands. It cannot target Alpaca's live-trading host, cannot accept arbitrary symbols or order shapes, has no scheduled handler, and never submits automatically.

## Safety boundary

- `PAPER_ORDER_SUBMISSION_ENABLED=false` is checked in for both development and production.
- `PAPER_SHORTS_ENABLED=false` and `PAPER_MAX_SHARES=1` are the checked-in staging limits.
- Only whole-share `NVDA` `market` + `opg` requests with `extended_hours=false` are valid.
- Commands require an allowlisted owner email, an exact human-confirmation phrase, a current 09:24:30-09:25:00 ET confirmation, and an audience-bound replay-protected HMAC.
- The browser never receives Alpaca credentials or connects to this Worker directly.
- The Worker owns no cron or alarm that can create an order.
- A timed-out request becomes `AMBIGUOUS`. A later explicit retry first reconciles by deterministic `client_order_id` and observes a cooldown before another submission attempt.

The service is paper-only and does not commission or unlock the application's Strict MOO gate.

## Required secrets

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `PAPER_COMMAND_SECRET` (at least 32 bytes; separate from market-ingestion secrets)

The Alpaca credentials must belong to the paper environment. The client pins every request to `https://paper-api.alpaca.markets`, disables redirects, bounds response sizes, and never returns credentials.

## Command contract

The Sites server—not the browser—creates and signs `paper-moo-command-v1`. The command binds the owner, target session, calendar proof, exact order, explicit phrase, confirmation expiry, intent, and idempotency identity. Repeating the same identity and payload returns the existing result. Reusing an idempotency key with different content returns a conflict.

The Durable Object serializes commands for the single paper account. It stores commands, immutable REST order observations, future trade-update fills, replay nonces, and conflicting event identities in SQLite. REST order snapshots are not treated as individual executions; `paper_fill_executions` is reserved for provider execution IDs from the future authenticated `trade_updates` receiver.

## Health

`GET /health` uses the same signed request protocol. It reports activation
flags, fixed paper scope, durable command counts, and read-only Alpaca paper
references for account status, buying power, cash, equity, the current NVDA
position, and open NVDA MOO orders. Provider account IDs, account numbers,
order IDs, and client-order IDs are never returned. Every provider request is
pinned to `https://paper-api.alpaca.markets`, rejects redirects, and is bounded
by the same response and timeout limits as order reconciliation.

The health response describes reconciliation as
`REST_BY_CLIENT_ORDER_ID_BEFORE_RETRY`: an ambiguous command is looked up by
its deterministic client-order ID before the service may submit again. Health
does not create an order and `automaticSubmission` remains false.

The response continues to state `tradeUpdates: NOT_CONNECTED`. A permanent
Alpaca `trade_updates` supervisor and Sites ingestion mirror are intentionally
a later integration step; the REST account/order snapshot must not be described
as fill streaming.

## Local verification

Run `npm test`, `npm run typecheck`, and `npm run preflight` from this directory. Do not deploy or change the submission flag until the application-side owner-confirmation route, paper policy approval, trade-update reconciliation, and operational review are complete.
