# DJ Slice — PEDE & FATIA

Event experience powered by Cloudflare Workers + D1.

## Public interfaces

- `/qr?event=PARTY2026` — event QR display. Generates a QR only after the event code is validated.
- `/guest?event=PARTY2026` — guest mobile interface. It reads the active moment from the Worker; the QR contains the event code, never a hard-coded moment/state.
- `/room?event=PARTY2026` — projector display. The join QR is shown during M1 and M2 only.
- `/admin?event=PARTY2026` — private control panel.

## Active moments

- M1 — Music suggestions / TIDAL + messages
- M2 — Style Wars poll + messages
- M3 — Midnight Slice
- M4 — Turn On The Lights
- M5 — Pizza slice request / instructions modal

The active moment is stored in `events.active_moment`. The guest and projector clients poll `/api/:event/state` and render the current moment. The legacy `moments` table is not used by the current Worker routing.

## QR routing

Both QR displays encode the canonical guest URL:
`/guest?event=<event-code>`

The guest page obtains its current state from the API. If the event code is invalid or the state endpoint fails, the QR display shows an error and does not generate a fallback QR for another event.

## Development and deployment

Requires Node.js 20+.

```sh
npm install
npx wrangler login
npm run dev
```

Deploy:

```sh
npm run deploy
```

D1 migrations:

```sh
npm run db:remote
```

Apply only migrations that have not already been applied to the production database. Do not rerun schema setup manually.

## Cloudflare configuration

- Worker: `dj-slice`
- D1 binding: `DB`
- Assets binding: `ASSETS`
- Event code: `PARTY2026`
- Public event title: `PEDE & FATIA`

Production secrets are configured in the Cloudflare Worker environment; do not commit them.
