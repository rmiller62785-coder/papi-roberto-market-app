# Aperture NVDA market stream

Cloudflare Worker + SQLite Durable Object for one NVDA Alpaca feed. The checked-in production configuration defaults to IEX and labels it research-only. SIP is enabled only by changing `ALPACA_FEED` to `sip` and setting `SIP_ENTITLED=true` after entitlement and redistribution review; it remains research-only until Alpaca successfully acknowledges the complete SIP subscription (or a SIP-pinned REST recovery succeeds).

## Production prerequisites

Run `wrangler secret put` for all six values before deployment:

- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `SITES_INGESTION_URL`
- `SITES_INGESTION_SECRET`
- `STREAM_CONTROL_SECRET`
- `BROWSER_ACCESS_SECRET`

The Sites receiver must verify the audience-bound HMAC with a durable atomic nonce store and return:

```json
{"ok":true,"streamId":"<stream id>","highestContiguousSequence":123}
```

It must insert emissions idempotently by `(streamId, serviceSequence)` before advancing the contiguous acknowledgement. The sender retains unacknowledged rows in its SQLite outbox and retries them in order.

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
