# Event Engine — Cloudflare MVP scaffold

Implements the three interfaces from the supplied diagram:
- SCREEN: M1 TIDAL music moment, M2 Song Wars poll, M3 Midnight Slice, M4 Turn On The Lights.
- GUEST: message submission (moderated) and M2 poll voting.
- ADMIN: switch active moment, create poll, approve public messages.
- Cloudflare Workers + D1. No Supabase and no always-on server.

## Deploy
1. Node.js 20+, then `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create event-engine-db`
4. Put returned database_id in wrangler.toml
5. `npm run db:remote`
6. `npx wrangler secret put ADMIN_PIN`
7. `npx wrangler secret put ADMIN_TOKEN` (use a long random token)
8. `npm run deploy`

URLs: `/screen.html?event=PARTY2026`, `/guest.html?event=PARTY2026`, `/admin.html?event=PARTY2026`.

## Not yet production-complete
TIDAL catalogue search is deliberately not faked; the exact API endpoint and access entitlement must be confirmed for the registered TIDAL app. Guest-side track search therefore reports that the integration is pending. This scaffold uses polling for screen refresh rather than WebSockets. Timers are not yet wired to the admin UI. Harden admin authentication, rate limits, message abuse controls, and event provisioning before a public event.
--- and good night to y'all
