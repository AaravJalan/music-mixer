# MusicMixer

**Spotify Taste Collision Engine:** a full-stack platform that maps up to 4 listeners into a six-dimensional taste space, scores multi-user compatibility, and builds shared playlists with cultural guardrails and rate-limit-safe Spotify discovery.

## Why it exists

Spotify doesn't expose true “taste distance” or shared-playlist APIs for arbitrary friend groups. MusicMixer fills that gap: OAuth into Spotify, build ID-anchored taste profiles, collide up to four listeners (live users and/or ghost personas), and export a playlist back to Spotify.

## Quick start (local)

```bash
npm install
cp backend/.env.example .env   # fill Spotify + Upstash credentials
npm run dev                      # frontend :5173 + local Express API :3001
```

| Service | URL |
|---------|-----|
| Frontend | `http://127.0.0.1:5173` |
| Backend API | `http://127.0.0.1:3001/api` |

Use `http://127.0.0.1:5173` (not `localhost`) so Spotify OAuth cookies stay consistent. Whitelist the exact redirect URI in the Spotify Developer Dashboard.

### Build

```bash
npm run build
# Builds @music-mixer/shared → backend (tsc) → frontend (tsc + vite)
```

### Environment

Copy `backend/.env.example` to a root `.env` (or `backend/.env` — both are loaded):

| Variable | Required | Default |
|----------|----------|---------|
| `SPOTIFY_CLIENT_ID` | Yes | — |
| `SPOTIFY_CLIENT_SECRET` | Yes | — |
| `SPOTIFY_REDIRECT_URI` | Yes | — |
| `LASTFM_API_KEY` | Yes | — |
| `PORT` | No | `3001` |
| `FRONTEND_URL` | No | `http://127.0.0.1:5173` |
| `UPSTASH_REDIS_REST_URL` | Yes | — |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | — |
| `LISTENING_HABITS_TABLE` | Local habits | Deployed DynamoDB table name (when not using `sst dev`) |

### Production vs Local

| Mode | Frontend | Backend | Notes |
|------|----------|---------|-------|
| **Local** | Vite on `:5173` | Express via `backend/src/local.ts` | Vite proxies `/api` → `:3001` |
| **Production** | Vercel static SPA | SST → AWS Lambda Function URL | Vercel rewrites `/api/*` to Lambda; Redis + DynamoDB shared |

Deploy backend: `npx sst deploy --stage <your-stage>`
Deploy frontend: Vercel project with root `frontend`, build `npm run build -w @music-mixer/shared && npm run build`, and rewrites in `vercel.json`.

---

## Features

### Taste collision

- **Link Collision:** Create a session, share a URL, friend joins, run together
- **Friend Collision:** Collide with a real friend or ghost persona
- **Solo Collision:** Compare your own taste across two time ranges (e.g. all-time vs last 4 weeks)
- **Sandbox:** Authenticated user + 1–3 ghost personas, no second human required
- **Replay/Rerun:** Past collisions saved to history with adjustable weights and settings
- Up to **4 participants** (live users and/or ghosts)

### Playlist generation modes

| Mode | ID | Behavior |
|------|----|----------|
| Midpoint Blend | `midpoint` | Uses Last.fm social scrobbles for discovery (Phase A: Similar Tracks, Phase B: Similar Artists, Phase C: Centroid Tag Top Tracks) resolved to playable Spotify IDs via batch `/search` |
| Proportional Share | `equal_share` | Weighted interleave from each participant's own top tracks |
| Common Songs Only | `common_only` | Strict track-ID intersection only |

**Guardrail:** If compatibility score < 80%, midpoint is automatically switched to proportional share.

### Playlist length

- **Track count** — target number of songs (default 15)
- **Duration** — target minutes (default 60); trims to closest boundary at end

### Per-participant time ranges

| Value | Label |
|-------|-------|
| `short_term` | Last 4 weeks |
| `medium_term` | Last 6 months (default) |
| `year_to_date` | This year |
| `long_term` | All time |

### Dashboard & analytics

- Personal taste radar (6D feature vector)
- **Rule-based Lexical Genre Inference Engine** — keyword heuristics and dynamic Last.fm tag resolution when Spotify returns empty genres
- Top genres, artists, and tracks
- Narrative listening insights and sonic outlier detection
- Estimated listening hours and play counts
- **Listening Habits** — genre distribution plus cron-backed listening snapshots (DynamoDB, every 3 days)

> **Note on Genre Percentages:** The Genre Cloud on the Dashboard calculates percentages using a raw tally of your **Top Tracks** (unweighted). In contrast, the Taste Collision profile calculates genre percentages by heavily rank-weighting your **Top Artists** first, then supplementing with tracks. This ensures the dashboard reflects pure listening volume, while the collision engine anchors on core musical identity.

### Friends & ghosts

- Friend invites via shareable code
- Five built-in ghost personas for sandbox testing
- Ghost track data statically bundled from `backend/src/mock/ghost-profiles.json`

### Spotify export

- Export collision playlist directly to your Spotify account as a private playlist

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite → Vercel)                     │
│         SPA · HTTP-only session cookie · /api rewrite to Lambda         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ REST + credentials
┌───────────────────────────────────▼─────────────────────────────────────┐
│              Backend (Express → AWS Lambda via SST / serverless-http)   │
│         Collision engine · Spotify clients · Analytics · Workers        │
└───────────┬─────────────────────────────┬───────────────────────────────┘
            │                             │
┌───────────▼──────────┐      ┌───────────▼──────────────────────────────┐
│  @music-mixer/shared │      │  DynamoDB + SQS + Upstash Redis          │
│  Types · Constants   │      │  Sessions · History · Caches · Habits    │
└──────────────────────┘      └──────────────────────────────────────────┘
                                          │
                              ┌───────────▼──────────────────────┐
                              │  Spotify Web API & Last.fm API   │
                              └──────────────────────────────────┘
```

### Design Principles

- **ID-first matching** — track and artist intersections use Spotify entity IDs
- **Genre-estimated vectors** — 6D taste vectors derived from weighted anchor-genre profiles
- **API Synergy** — Last.fm's social scrobble API (`track.getsimilar`, `artist.getsimilar`, `tag.gettoptracks`) powers high-quality discovery and genre tagging, while Spotify's API is strictly used for playback resolution (`/search`), audio metadata, and pulling top items.
- **Cache-aside** — Redis caches dashboards, Last.fm similarity queries (7-day TTL), and taste profiles; DynamoDB stores habit snapshots
- **Deterministic deduplication** — canonical keys collapse remix/version variants to one slot
- **Cultural guardrails** — regional genres only included when shared-safe across all participants

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.7 |
| Backend | AWS Lambda + serverless-http (SST v3) |
| Local API | Node.js, Express 4, tsx (`local.ts`) |
| Frontend | React 18, Vite 6, Tailwind 3, Framer Motion |
| Router | React Router 7 |
| Monorepo | npm workspaces (`shared`, `backend`, `frontend`) |
| Persistence | DynamoDB (listening habits), Upstash Redis (sessions / caches) |
| Auth | Spotify OAuth 2.0, HTTP-only `mm_session` cookie |
| Infra | SST (Lambda, DynamoDB, SQS, EventBridge cron) + Vercel (SPA) |

---

## Project structure

```
music-mixer/
├── package.json
├── sst.config.ts                 # Infrastructure as Code (AWS via SST v3)
├── shared/                       # @music-mixer/shared types & constants
├── backend/
│   ├── src/
│   │   ├── config/env.ts         # Environment + Spotify URLs/scopes
│   │   ├── lib/                  # persist, cache, fetch, cookies
│   │   ├── middleware/           # auth, rateLimiter, telemetry
│   │   ├── routes/               # 7 API routers
│   │   ├── analytics/            # vectors, similarity, genres, insights
│   │   ├── collision/            # engine, store, history
│   │   ├── engine/               # build, taste, genreModel, inference (Core Logic)
│   │   ├── spotify/              # auth, client, tracks, lastfm, resolver (API Clients)
│   │   ├── services/             # session, friends, ghosts, dashboard, habits
│   │   ├── workers/              # SQS processor + 3-day habits cron
│   │   ├── lambda.ts             # AWS Lambda entrypoint for Express
│   │   └── local.ts              # Local Express development entrypoint
│   └── scripts/                  # ghost seeding, API unlock, DB wipe
└── frontend/src/
    ├── api/client.ts
    ├── components/               # collision, dashboard, layout, ui
    ├── hooks/                    # useAuth, useCollision
    └── pages/
```

---

## Authentication

OAuth 2.0 Authorization Code flow:

1. `GET /api/auth/login` → Spotify authorize
2. User grants consent
3. `GET /api/auth/callback` → exchange code, set `mm_session` cookie
4. Automatic token refresh via `services/session.ts`

**Login scopes:** `user-read-private`, `user-read-email`, `user-top-read`, `playlist-modify-private`

---

## REST API

Base URL: `http://127.0.0.1:3001/api`

Global middleware: telemetry (`X-Response-Time` header), rate limiter (60 burst / 10 req/s per IP). Auth and health routes are exempt.

### Health

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/health` | None | `{ status, service }` |
| GET | `/health/metrics` | None | `MetricsSnapshot` |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/me` | Optional | `{ authenticated, user }` |
| GET | `/auth/login` | None | Redirect to Spotify |
| GET | `/auth/callback` | None | OAuth callback |
| POST | `/auth/logout` | Optional | Clear session |

### Collision

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/collision/create` | Required | Create collision session |
| POST | `/collision/create-solo` | Required | Solo time-range collision |
| GET | `/collision/:id` | None | Get session state |
| PATCH | `/collision/:id/config` | Required | Update weights/settings |
| POST | `/collision/:id/join` | Required | Join waiting room |
| POST | `/collision/:id/run` | Required | Execute collision |
| GET | `/collision/:id/result` | None | Get result |
| POST | `/collision/:id/regenerate-playlist` | Required | Rebuild playlist |
| GET | `/collision/history` | Required | List past collisions |
| GET | `/collision/history/:id` | Required | Get snapshot |
| POST | `/collision/history/:id/rerun` | Required | Rerun with new settings |
| DELETE | `/collision/history` | Required | Clear all history |
| DELETE | `/collision/history/:id` | Required | Delete one entry |

**Run collision body:**

```typescript
{
  participantWeights?: number[];
  playlistLength?: number;
  playlistLengthMode?: 'tracks' | 'duration';
  playlistDurationMinutes?: number;
  playlistGenerationMode?: 'midpoint' | 'equal_share' | 'common_only';
  participantTimeRanges?: TasteTimeRange[];
  randomOffset?: number;
}
```

### Friends

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/friends` | Required | List friends + ghosts |
| POST | `/friends/invite` | Required | Create invite code |
| POST | `/friends/accept/:code` | Required | Accept invite |
| DELETE | `/friends/:friendId` | Required | Remove friend |

### Dashboard

| Method | Path | Auth | Query |
|--------|------|------|-------|
| GET | `/dashboard` | Required | `term=short_term\|medium_term\|year_to_date\|long_term` |
| GET | `/dashboard/habits` | Required | same |

### Playlist export

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/playlist/export` | Required | `{ collisionId, name?, public? }` |

### Sandbox

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/sandbox/ghosts` | None | List ghost personas |
| POST | `/sandbox/collision` | Required | Run sandbox collision (1–3 ghost IDs) |

---

## Shared types (`@music-mixer/shared`)

### Audio feature vector (6D)

`danceability`, `energy`, `acousticness`, `valence`, `instrumentalness`, `liveness` — each ∈ [0, 1].

### Key types

| Type | Purpose |
|------|---------|
| `UserProfile` | Spotify user identity |
| `CollisionSession` | Waiting room state + config |
| `CollisionResult` | Score, participants, centroid, playlist, shared genres/artists |
| `RecommendationTrack` | Track + `isCommon?`, `sourceParticipantIndex?` |
| `GhostProfile` | Static persona with vector, genres, tracks |
| `DashboardResponse` | Taste vector, top lists, insights, outlier |
| `ListeningHabitsResponse` | Genre distribution, daily hours |

### Constants

| Constant | Value |
|----------|-------|
| `PLAYLIST_MATCH_THRESHOLD` | `0.8` |
| `SPOTIFY_TOP_TRACKS_LIMIT` | `50` |
| `VECTOR_DIMENSION` | `6` |

---

## Mathematical models

### Vector operations (`analytics/vector.ts`)

- `weightedCentroid(vectors, weights)` — multi-user taste centroid
- `weightedBlend`, `midpoint`, `averageVectors`

### Cosine similarity (`analytics/similarity.ts`)

Mean-centered Pearson-like correlation mapped to [0, 1]:

```
centeredA[i] = a[i] - 0.5
similarity = (correlation + 1) / 2
```

### Genre model (`spotify/genreModel.ts`)

1. Each artist genre maps to an **anchor genre** (pop, rock, bollywood, k-pop, etc.)
2. Each anchor has a fixed 6D profile in `ANCHOR_GENRE_PROFILES`
3. User vector = weighted average: `v = Σ(w_g × profile(g)) / Σ(w_g)`

**Macro-category penalty** — genres grouped into Electronic, Rock, Hip-Hop, Regional, Acoustic. Culturally distant macro pairs reduce similarity (multipliers: same 1.0, adjacent 0.85, distant 0.65).

### Listening time estimation (`analytics/insights.ts`)

Geometric decay by rank within each time window for dashboard estimates (Spotify does not expose true play counts). Cron habit snapshots instead sum **recently-played** durations between captures:

```
plays(rank) = topPlays × decay^rankIndex
hours = Σ(plays × durationMs) / 3_600_000
```

### Track deduplication

`getCanonicalKey(track)` normalizes titles (strips `(Remix)`, `(feat. X)`, hyphen suffixes) and pairs with primary artist name. `normalizeSpotifyId()` strips `spotify:track:` URI prefixes.

---

## Taste profile ingestion

Entry: `buildUserTasteProfile()` in `spotify/taste.ts`

```
GET /me/top/tracks + GET /me/top/artists
  → enrichArtistGenres() (batch fetch + name inference + cache)
  → computeWeightedTasteVector() via anchor genre model
  → aggregateWeightedGenres() for display
```

Year-to-date uses recently-played data when available, otherwise falls back to medium-term top tracks.

---

## Collision engine

Entry: `collision/engine.ts` → `runMultiUserCollision()`

```
1. Build taste profile per participant (Spotify or ghost data)
2. Weighted centroid vector across all participants
3. Pairwise cosine similarity + macro-category adjustment
4. Shared artist intersection (ID-only)
5. buildMultiCollisionPlaylist() — Safe-Discovery pipeline
6. Persist to collision history
```

Supports regeneration with a new `randomOffset` for playlist variety without re-fetching profiles.

---

## Playlist pipeline (Safe-Discovery)

Entry: `buildMultiCollisionPlaylist()` in `spotify/build.ts`

### Stage 1 — Common favorites (all modes)

Strict Spotify track-ID intersection across all participants. Matching tracks marked `isCommon: true`.

### Mode: `common_only`

Returns intersection only. No discovery.

### Tier 1: Mode-dependent fill

**Midpoint:**
- Up to 3 `/search` calls
- Query seeds: shared genres (dampened) → top non-regional genres → centroid genres → `pop`
- Regional genres excluded unless shared-safe across all participants
- Results in `searched[]` bucket (displayed first)

**Equal share:**
- `chunkInterleave()` from each participant's own top tracks (2–3 per round by weight)
- Tags `sourceParticipantIndex` for UI color dots
- No API calls

### Tier 2: Search fallback (equal share only)

One `/search` if Tier 1 local fill is still short. Midpoint skips Tier 2 (budget spent in Tier 1).

### Tier 3: Emergency baseline

Rotates through all participants' local top tracks to reach target length. Midpoint prefers non-regional tracks first.

### Final order

```
tracks = [...searched, ...results]   // search results displayed first
```

### Discovery circuit breaker

On 403/429 from Spotify, discovery calls short-circuit for a cooldown period. Collisions finish from local pools.

### Cultural guardrails

- **Linguistic veto** (`spotify/veto.ts`) — strips regional genres when only one participant has regional taste
- **Per-song guardrail** — bans regional tracks not shared-safe across all participants
- **Superstar collab filter** — drops global superstars unless in a participant's trusted artist set
- **Genre dampening** — reduces gravitational pull of genres above 10% share in search queries

### Search call budget per collision

| Mode | Max `/search` calls |
|------|---------------------|
| `midpoint` | 3 |
| `equal_share` | 1 |
| `common_only` | 0 |

### Pipeline diagram

```
                    buildMultiCollisionPlaylist
                              │
                    ┌─────────▼─────────┐
                    │ Stage 1: Common   │
                    │ (ID intersection) │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        common_only      midpoint        equal_share
              │               │               │
              ▼               ▼               ▼
         return only    Tier 1: up to    Tier 1: local
                        3× /search       chunkInterleave
              │               │               │
              │               ▼               ▼
              │          Tier 2: SKIP    Tier 2: 1× /search
              │          (midpoint)      (if still short)
              └───────────────┼───────────────┘
                              ▼
                    Tier 3: Emergency baseline
                              │
                              ▼
              tracks = [...searched, ...results]
                              │
                              ▼
                    trim to targetLength / duration
```

---

## Frontend

### Routes

| Path | Page | Auth |
|------|------|------|
| `/` | Home | Public |
| `/dashboard` | Dashboard | Required |
| `/habits` | Listening Habits | Required |
| `/friends` | Friends | Required |
| `/collisions` | Past Collisions | Required |
| `/collisions/:id` | Collision Replay | Required |
| `/collision/:id` | Live Collision | Public |
| `/join/:id` | Join Collision | Public |
| `/friends/add/:code` | Accept Invite | Public |

### Collision UI flow

```
Home → create collision → WaitingRoom → CollisionSettings → Run → Results
                                                              ↓
                                                    Export / Regenerate
```

### Results display

- Compatibility score ring + label
- 6D feature radar (centroid vs participants)
- Genre chart with shared-genre highlights
- Shared artists list
- Playlist with common-track stars and per-participant color dots
- Export to Spotify and regenerate buttons

### State management

- `useAuth()` — session via `GET /api/auth/me`
- `useCollision()` — polling, config updates, run/join/regenerate
- Cookie-only auth (no localStorage tokens)

---

## Ghost personas

Track data lives in `backend/src/mock/ghost-profiles.json`, updated via:

```bash
npm run generate:ghosts -w backend
```

---

## Data persistence

### Cloud Infrastructure (AWS + Upstash)

| Store | Purpose |
|------|----------|
| **Upstash Redis** | Active sessions, OAuth states, refresh tokens, cached user profiles |
| **AWS DynamoDB** | `ListeningHabits` table for daily snapshots + SQS for non-blocking writes |
| **Memory** | Active collisions, rate limiter buckets, discovery cache |


---

## Spotify integration

### Client (`spotify/client.ts`)

Authenticated `spotifyFetch()` with automatic token refresh. Retries 429 only when `Retry-After ≤ 5s`.

### Endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET /me` | User profile |
| `GET /me/top/tracks` | Taste profiles |
| `GET /me/top/artists` | Taste profiles |
| `GET /me/player/recently-played` | Year-to-date tracks |
| `GET /artists?ids=` | Batch artist genres |
| `GET /search?type=track` | Playlist discovery |
| `POST /me/playlists` | Export playlist |
| `POST /playlists/{id}/items` | Add tracks to playlist |

---

## Security

| Concern | Implementation |
|---------|----------------|
| Token storage | Upstash Redis; never sent to frontend |
| Session cookie | HTTP-only `mm_session` |
| OAuth CSRF | `state` parameter validated in callback |
| Rate limiting | Per-IP token bucket (exempt auth/health) |
| Spotify rate limits | Circuit breaker with cooldown |
| Input validation | Ghost IDs capped at 3; bounded playlist length |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local frontend + Express API |
| `npx sst deploy --stage <name>` | Deploy Lambda, DynamoDB, SQS, cron |
| `npm run build` | Build all workspaces |
| `npm run generate:ghosts -w backend` | Hydrate ghost profiles from Spotify |
| `npm run unlock -w backend` | Clear Spotify API circuit-breaker lock in Redis |

---

## Deploying to Vercel

Backend: `npx sst deploy --stage production` (or your stage).
Frontend: Vite SPA on Vercel; `/api/*` rewrites to the Lambda Function URL (`vercel.json`).

1. **Import Project:** select the **`frontend`** workspace / set Root Directory to `frontend` if needed.
2. **Framework Preset:** Vite (auto-detected).
3. **Build Command:** `npm run build -w @music-mixer/shared && npm run build` (from monorepo root) — or configure Vercel so installs/build run from the repo root with that command.
4. **Environment Variables:** optional `VITE_API_URL` if not using rewrites; otherwise rewrites alone are enough for same-origin `/api`.
5. **SPA Routing:** `frontend/vercel.json` rewrites app routes to `/index.html`.

---

## Key modules

| Path | Responsibility |
|------|----------------|
| `collision/engine.ts` | Collision orchestration |
| `engine/build.ts` | Safe-Discovery playlist pipeline |
| `engine/taste.ts` | Taste profile builder |
| `engine/genreModel.ts` | Anchor genre vectors + macro penalty |
| `engine/inference.ts` | Lexical / known-artist genre fallback |
| `engine/veto.ts` | Regional genre veto |
| `services/ghosts.ts` | Ghost persona reader |
| `services/session.ts` | OAuth session management |
| `analytics/insights.ts` | Listening estimates, outliers, dashboard narrative |
| `analytics/similarity.ts` | Cosine similarity + labels |
| `frontend/src/hooks/useCollision.ts` | Collision state machine |
