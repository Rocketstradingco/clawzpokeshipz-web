# ClawzPokeShipz Web

React/Vite frontend with a Cloudflare Worker backend for:

- public TikTok live status at `/status`
- Discord notification settings in the admin dashboard
- Cloudflare Cron TikTok live checks every 5 minutes
- external bot status updates at `/update`

## Local Development

```bash
npm install
npm run build
npm run preview
```

For local Worker secrets, copy `.env.example` to `.env` and fill in the values.

## Cloudflare Setup

The Worker needs the `STATUS_KV` binding declared in `wrangler.jsonc`.

## Free-Tier Operating Notes

This project is tuned to stay inside Cloudflare's free limits for a small live-status site:

- the Cron watcher runs every 5 minutes, which is 288 scheduled checks per day
- public live status is stored in one `status_snapshot` KV key, so a normal cron check writes once instead of writing several per-account and aggregate keys
- `/status` reads that same snapshot key when available, keeping public polling cheap
- the TikTok watch list is capped at 8 accounts to keep each cron invocation well below the Workers Free subrequest limit
- if TikTok returns a block, challenge, timeout, or ambiguous page while the account was previously live, the Worker preserves the previous status only briefly so a stale live badge cannot stay on forever
- Discord notification failures are saved in the snapshot and retried while the account remains live

Cloudflare's free KV write limit is the practical constraint for this watcher. At the current 5-minute interval, the scheduled monitor should use about 288 status writes per day before occasional admin/session/config writes.

Required production secrets:

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put WORKER_UPDATE_SECRET
```

Recommended production secrets:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SECONDARY_ADMIN_PASSWORD
```

Optional defaults can be set as Cloudflare vars or saved from the dashboard:

- `GUILD_ID`
- `DISCORD_CHANNEL_ID`
- `TIKTOK_USERNAME`
- `ADMIN_USERNAME`
- `PRIMARY_ADMIN_DISCORD_ID`
- `SECONDARY_ADMIN_USERNAME`
- `SECONDARY_ADMIN_DISCORD_ID`

The fallback first login is `Claw` / `Claw69` only when no admin password exists in KV or Cloudflare secrets. Change it immediately from the dashboard.
Any logged-in admin can use the dashboard actions. Profile updates apply to the currently logged-in admin credential.

## Deploy

```bash
npm run build
npx wrangler deploy
```

The build uses the Cloudflare Vite plugin. It creates the Worker bundle under `dist/clawzpokeshipz_web` and static assets under `dist/client`; Wrangler automatically uses the redirected generated config.

## External TikTok Bot Integration

The separate Node bot can keep the website badge in sync by posting:

```http
POST https://your-worker-url/update
Content-Type: application/json

{
  "secret": "same value as WORKER_UPDATE_SECRET",
  "live": true,
  "username": "clawzpokeshipz"
}
```

The external bot sends its own Discord webhook notification. The Cloudflare Cron watcher also sends a Discord message when it detects a transition from offline to live and a channel is configured.
