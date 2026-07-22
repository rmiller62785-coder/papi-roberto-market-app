# Aperture NVDA capture scheduler

This standalone Cloudflare Worker provides the production one-minute cron that
Sites currently does not provision. It can only POST a fixed, audience-bound
HMAC trigger to `/api/internal/scheduled-capture`. The trigger contains no date,
checkpoint, or scheduled timestamp; the Sites receiver derives the current
minute from its own clock and retains all existing point-in-time and 09:24:30 ET
freeze admission rules.

## Required configuration

Install the same random `CAPTURE_SCHEDULER_SECRET` (at least 32 UTF-8 bytes) in:

- the Sites application as `CAPTURE_SCHEDULER_SECRET`; and
- this Worker as the `CAPTURE_SCHEDULER_SECRET` Wrangler secret.

Configure the Sites application value `CAPTURE_SCHEDULER_AUDIENCE` and the
Worker variable of the same name as `aperture-sites-capture-scheduler`.

The Worker also requires `SITES_ACCESS_BYPASS_TOKEN`. It crosses the outer Sites
access gate only; it does not replace the HMAC. Never expose either secret to
browser code, source control, responses, or logs.

Worker secret names:

- `CAPTURE_SCHEDULER_SECRET`
- `SITES_ACCESS_BYPASS_TOKEN`

Sites secret/value names:

- `CAPTURE_SCHEDULER_SECRET`
- `CAPTURE_SCHEDULER_AUDIENCE`

The checked-in production URL is exactly
`https://aperture-nvda-plan.rmiller62785.chatgpt.site/api/internal/scheduled-capture`
and the cron is `* * * * *`.

## Safety properties

- HMAC binds audience, authority, method, path, body, timestamp, and nonce.
- The receiver admits at most 30 seconds of clock skew and atomically consumes
  each audience-scoped nonce in D1.
- Redirects are rejected so credentials cannot be forwarded.
- The request body is fixed and capped at 256 bytes.
- The receiver calls the existing market and forecast routes in-process through
  `https://nvda-scheduler.internal`; no browser or caller-controlled host gains
  freeze-write authority.
- Capture and up to four existing 5,000-row R2 archive segments reuse the
  current application implementations. This service adds no model promotion or
  order execution path.

## Validate

From this directory:

```text
npm test
npm run typecheck
npm run preflight
```

For an existing Worker, `npm run preflight:secrets` verifies secret names only;
it never reads or prints values. Deployment remains a separate, explicit step.

For an existing Worker, install or rotate its two secrets and deploy with:

```text
npx wrangler secret put CAPTURE_SCHEDULER_SECRET --config wrangler.production.jsonc
npx wrangler secret put SITES_ACCESS_BYPASS_TOKEN --config wrangler.production.jsonc
npm run deploy
```

For the first deployment, keep both values in an external Wrangler secrets file
and use `npx wrangler deploy --config wrangler.production.jsonc --secrets-file
<external-secret-file>`. Do not commit that file. Configure the matching Sites
secret/value before deploying the scheduler so the receiver fails closed during
commissioning rather than accepting an unmatched sender.
