# DJ Slice — Voting System Audit

Branch: `audit/voting-system-bugs`
Scope: Style Wars (genre poll / M2) and music voting (M1)
Audit type: static code review of the current branch. No production data or live Cloudflare runtime was changed or tested.

## Findings

### Critical — M2 silently allows repeated votes and vote switching
**Files:** `src/index.js` (`poll/vote`), `migrations/0001_schema.sql`

The `poll_votes` table has `UNIQUE(poll_id, voter_key)`, but the vote endpoint uses:

```sql
ON CONFLICT(poll_id,voter_key) DO UPDATE SET option_id=excluded.option_id
```

This means the same device can submit repeatedly and change its selection. The API always returns `{ok:true}`; there is no 5-minute cooldown, no `retry-after`, and no message telling the user when they can vote again. This matches the reported behaviour.

The endpoint also does not validate that `optionId` belongs to the active poll. A stale or forged option ID can be stored against the active poll, while the projector only counts the current poll's option IDs. Such a vote is accepted by the API but never appears in the visible results.

### High — M2 guest UI erases the vote acknowledgement every refresh
**Files:** `public/guest.js`

`draw()` runs every 3 seconds. While M2 is active it calls `renderPoll(d.poll)` on every refresh. `renderPoll()` rebuilds the complete options HTML, removing the previous button's `✓` and disabled state. The voter therefore sees the option become clickable again, even though the server has already stored a vote.

This is a direct UI feedback bug. It also makes the current ability to switch votes look like a fresh vote rather than an update.

### High — M1 repeat suggestions are reported as successful votes when they may not add one
**Files:** `src/index.js` (`tracks` POST), `public/guest.js`, `migrations/0001_schema.sql`

When a guest confirms a song, the client sends `POST /tracks`. The server creates the track if needed, then inserts a vote with `INSERT OR IGNORE` into `track_votes`. The schema has `UNIQUE(track_id, voter_key)`.

Consequences:
- The same device cannot add another vote to the same track through this route.
- If the track already exists and that device already voted for it, the API still returns `{ok:true}`.
- The guest UI then displays “Adicionada à lista ✓”, which implies success without distinguishing “new suggestion”, “new vote”, or “already voted”.

There is a separate `POST /track/:id/vote` endpoint, but the guest interface does not call it. It is also protected by the same permanent per-track uniqueness, so it does not implement a timed re-vote.

### High — M1 has no device-level cooldown or retry message
**Files:** `src/index.js`, `public/common.js`

The voter identity is a UUID stored in `localStorage` (`ee-voter`). The server uses it as a permanent uniqueness key for track votes, but there is no timestamp or cooldown state. The 5-minute rule discussed for both voting areas is not implemented.

The key is also client-controlled: clearing browser storage or using a private session creates a new identity. It is useful for ordinary duplicate prevention, not strong anti-abuse protection.

### Medium — music vote totals can disagree with the actual vote rows
**Files:** `src/index.js` (`state()`, track vote handlers), `migrations/0001_schema.sql`

The state query reports `MAX(COALESCE(t.votes,0), COUNT(track_votes))`, preserving any old aggregate stored in `tracks.votes`. The track suggestion handler also preserves that maximum. By contrast, the dedicated track vote endpoint overwrites `tracks.votes` with the count of `track_votes`.

If `tracks.votes` contains legacy/imported totals, the two paths can produce different totals or make old totals persist unexpectedly. The vote rows should be the single source of truth, with a deliberate one-off migration if legacy totals must be retained.

### Medium — Style Wars is still labelled “SONG WARS” in Admin
**File:** `public/admin.js`

The M2 moment selector currently displays `M2 · SONG WARS`, although this poll is now called Style Wars. This is a naming inconsistency, not a vote-counting defect.

## Current behaviour by area

| Area | What the code currently does | What is missing |
|---|---|---|
| Style Wars / M2 | One row per device and poll; later votes overwrite the option | 5-minute server cooldown, remaining-time response, option validation, persistent UI acknowledgement |
| Music / M1 | Suggesting a track automatically attempts one vote per device per track | Timed repeat votes, explicit vote action/feedback, accurate duplicate response |
| Projector | Sorts poll options and tracks by returned vote totals | Reliable counts depend on fixing server-side vote accounting |

## Recommended repair design

1. Add a server-side vote ledger keyed by event, voting area and device, with a timestamp. Enforce the 5-minute cooldown in the Worker, not only in JavaScript.
2. On cooldown, return HTTP 429 with a machine-readable `retryAfterSeconds`; show the Portuguese message: **“O TEU VOTO JÁ FOI REGISTADO. VOLTA A TENTAR EM XX MIN.”**
3. Validate every M2 option against the active poll before writing a vote.
4. Keep the guest's acknowledged vote visible across the 3-second refresh; do not rebuild the poll controls in a way that erases the state.
5. For M1, separate “suggest a track” from “vote for a track”, or clearly define confirmation as both actions. Return whether the suggestion was new and whether a vote was actually added.
6. Make `track_votes` and `poll_votes` the authoritative vote records; remove the conflicting aggregate-counter behaviour after deciding how to handle existing legacy totals.
7. Rename the Admin M2 label to **STYLE WARS** and use that name consistently in the guest and projector copy.

## Test cases required before merge

- Same device votes once, retries immediately: receives 429 and remaining seconds.
- Same device retries after 5 minutes: accepted.
- Same device attempts another genre before cooldown: blocked consistently.
- Different devices vote for the same genre: both counted.
- Invalid/stale option ID: rejected, no row inserted.
- M2 guest refreshes several times after voting: acknowledgement remains visible.
- Same device suggests an already-listed track: UI reports accurately whether a vote was added.
- Different devices suggest/vote for the same track: totals increase once per eligible device.
- M1 and M2 projector rankings update and sort correctly after accepted votes.
- Switch moments or create a new poll: cooldown scope behaves as explicitly defined.

## Limitations

This is a static review. No D1 production writes, live API calls, browser automation, or Cloudflare deployment were performed. Findings describe code paths visible in this branch and should be verified with automated tests before merging.
