# DJ Slice — PEDE & FATIA

Event experience powered by Cloudflare Workers + D1.

## Public interfaces

- `/qr?event=PARTY2026` — event QR display. Generates a QR only after the event code is validated.
- `/guest?event=PARTY2026` — guest mobile interface. It reads the active moment from the Worker; the QR contains the event code, never a hard-coded moment/state.
- `/room?event=PARTY2026` — projector display. The join QR is shown during M1 and M2 only.
- `/admin?event=PARTY2026` — private control panel (Controlo, moderation, ban, *Abrir janelas*).
- `/dj?event=PARTY2026` — DJ screen: top 15 most voted, **▶ A TOCAR** (shown on the projector) and **TOCADA** (removes from the ranking), *Tocadas* list with **DEVOLVER**. Login with `DJ_PIN`; the admin PIN also works.

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
npm run db:local
npm run dev
```

For the admin panel locally, create `.dev.vars` (not committed) with test values:

```
ADMIN_PIN="1234"
ADMIN_TOKEN="local-test-token"
```

### Deploy

Deploys are automatic: **every merge to `main` is built and deployed to production by Cloudflare Workers Builds** (`npx wrangler deploy`). Work on a branch and open a pull request; do not merge during a live event unless you intend to publish.

Non-production branch builds (`wrangler preview`) are not configured for this project and fail by design; they do not affect production.

### D1 migrations

Apply new migrations to production **before** merging the code that needs them:

```sh
npx wrangler d1 migrations list dj-slice-db --remote
npm run db:remote
```

The production database tracks applied migrations in `d1_migrations` (0001–0004 are recorded), so `db:remote` only applies new files.

## Cloudflare configuration

- Worker: `dj-slice`
- D1 binding: `DB`
- Assets binding: `ASSETS`
- Rate limiting bindings: `SEARCH_LIMITER` (15/min per device), `MESSAGE_LIMITER` (3/min per device)
- Event code: `PARTY2026`
- Public event title: `PEDE & FATIA`

Secrets (set in the Cloudflare Worker, never committed): `ADMIN_PIN`, `ADMIN_TOKEN`, `DJ_PIN`, `DJ_TOKEN` (optional; without them the DJ uses the admin PIN), `TIDAL_CLIENT_ID`, `TIDAL_CLIENT_SECRET`, and optionally `TIDAL_CLIENT_ID_2`/`TIDAL_CLIENT_SECRET_2` (up to `_5`) for extra TIDAL credentials.

## Guest mechanics

- **M1 music:** search TIDAL, suggest a track or vote on the projector top 5. Suggesting or voting starts a 5-minute per-device cooldown that also locks search.
- **Farmador de Aura (messages, M1/M2):** messages are moderated in Admin. While a guest's message is pending their input is locked; they then see whether it was rejected or published. Admin can ban a device from sending messages (BANIR / DESBANIR).
- Devices are identified by a random key stored in the browser (`ee-voter`); a private window counts as a new device.

## Custom domain: `pede-e-fatia.criativa.org`

`criativa.org` DNS is managed in **cPanel**, and a Worker custom domain needs the zone on Cloudflare. So a minimal **Cloudflare Pages** project, `pede-e-fatia` (folder `edge/`), sits in front of the Worker and forwards every request through a service binding (`APP` → `dj-slice`). The app itself is unchanged.

- cPanel › Zone Editor: **CNAME** `pede-e-fatia` → `pede-e-fatia.pages.dev` (no A record or hosted subdomain with the same name).
- The domain is attached to the Pages project; Cloudflare validates it and issues HTTPS once the CNAME resolves.
- `https://pede-e-fatia.pages.dev` already serves the app; the `…workers.dev` URL keeps working.
- The proxy rarely changes. It uses advanced mode (`edge/public/_worker.js`) with the `APP` service binding configured on the Pages project.
