# Aperture NVDA market stream

Cross-service production status, deployed version identity, non-regression rules, and the incident handoff are maintained in [`../../HANDOFF.md`](../../HANDOFF.md). Read it before changing or deploying this Worker.

Cloudflare Worker + SQLite Durable Object for one NVDA Alpaca feed. The checked-in production configuration uses SIP only after `SIP_ENTITLED=true` confirms the account upgrade and redistribution review. Events remain research-only until Alpaca acknowledges the complete live SIP subscription. REST recovery is retained for reconciliation and never independently qualifies a Strict execution quote.

## Production prerequisites

The production Wrangler configuration declares all seven values as required:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `SITES_INGESTION_URL`
- `SITES_INGESTION_SECRET`
- `SITES_ACCESS_BYPASS_TOKEN`
- `STREAM_CONTROL_SECRET`
- `BROWSER_ACCESS_SECRET`

`SITES_INGESTION_URL` must be exactly
`https://aperture-nvda-plan.rmiller62785.chatgpt.site/api/internal/market-stream`
in production. `SITES_INGESTION_SECRET`, `STREAM_CONTROL_SECRET`, and
`BROWSER_ACCESS_SECRET` must each contain at least 32 UTF-8 bytes. The deploy
command uses Wrangler's native required-secret validation. For an existing
Worker, `npm run preflight:secrets` additionally reads `wrangler secret list
--format json` and verifies these seven names; it never reads or prints their
values.

For the first deployment, the Worker does not exist yet, so `secret list`
cannot run. Bootstrap it with `wrangler deploy --config
wrangler.production.jsonc --secrets-file <external-secret-file>`; keep that
file outside the repository and remove it immediately after the command. All
later deployments use `npm run deploy`, which fails closed if a declared
required secret is missing.

The Sites receiver must verify the audience-bound HMAC with a durable atomic nonce store and return:

```json
{"ok":true,"streamId":"<stream id>","highestContiguousSequence":123}
```

It must insert emissions idempotently by `(streamId, serviceSequence)` before advancing the contiguous acknowledgement. The sender retains unacknowledged rows in its SQLite outbox and retries them in order.

`SITES_ACCESS_BYPASS_TOKEN` is the Worker-only Sites custom-access token. It only crosses the outer Sites sign-in gate; it does not replace the ingestion HMAC and must never be exposed to browser code or logs.

### Zero-downtime ingestion HMAC rotation

The Sites receiver supports optional `SITES_INGESTION_SECRET_PREVIOUS` during a
bounded rotation overlap. Rotate without interrupting delivery in this order:

1. Generate a new secret of at least 32 UTF-8 bytes. Keep the existing secret
   as the receiver's `SITES_INGESTION_SECRET_PREVIOUS`, set
   `SITES_INGESTION_SECRET_PREVIOUS_VALID_UNTIL` to a short absolute epoch-ms
   deadline, and configure the new value as its current `SITES_INGESTION_SECRET`.
2. Deploy and verify the receiver first, while it accepts signatures from both
   the current and previous secrets.
3. Replace the Worker's `SITES_INGESTION_SECRET` with the new current value and
   deploy the Worker. Confirm contiguous acknowledgements and a draining outbox.
4. Remove `SITES_INGESTION_SECRET_PREVIOUS` from the receiver and redeploy it.

Never switch the Worker before the dual-key receiver is live or log either
secret. The receiver ignores the previous key when its explicit deadline is
missing, invalid, or expired.

Browser access uses a short-lived token created by `signBrowserAccessToken`. HTTP clients send it as `Authorization: Bearer <token>`. WebSocket clients request both the `aperture` subprotocol and the token as a second subprotocol. Tokens are bound to the configured browser origin and are atomically consumed once, so clients must obtain one token per HTTP request or socket upgrade.

Provider recovery uses a durable SQLite checkpoint, 15-minute overlap, and bounded time windows. A Worker restart resumes the oldest unfinished window rather than jumping to the newest provider timestamp. Browser `/recovery` responses are page-resumable with `cursor`, `headCursor`, and `hasMore`; clients must continue from the returned page cursor until `hasMore` is false.

The supervisor subscribes to trades, quotes, bars, updated bars, corrections, and cancel errors. A correction or cancel degrades bar integrity and blocks affected minute finalization until a canonical REST bar reconciles that minute. Silence during weekends, holidays, overnight hours, and the post-5 p.m. portion of planned early-close days does not trigger reconnect loops.

## Validate and deploy

```text
npm test
npm run typecheck
npm run preflight
npm run deploy
```

`npm run deploy` always targets `wrangler.production.jsonc`; the example config is development-only. Provider `b` and `u` messages are the authoritative minute source. Raw trades are never promoted as official trade-derived bars.

Changing `ALPACA_FEED` creates a differently named Durable Object. If an alarm
later wakes an object whose stored feed no longer matches the configured feed,
that legacy object deletes its alarm and returns `410 STREAM_INSTANCE_RETIRED`;
it never rewrites its evidence or starts another provider connection.
