# MusicMixer

**Spotify Taste Collision Engine** — compare up to four listeners' musical taste in a six-dimensional feature space, compute compatibility scores, and assemble shared playlists through a deterministic, ID-anchored pipeline with cultural guardrails and Safe-Discovery search constraints.

## Quick start

```bash
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | `http://127.0.0.1:5173` |
| Backend API | `http://127.0.0.1:3001/api` (Local Express) or `https://<api-id>.lambda-url.<region>.on.aws` (SST Lambda) |

Use `http://127.0.0.1:5173` (not `localhost`) for Spotify OAuth cookie consistency.

### Build

```bash
npm run build
# Builds @music-mixer/shared, then backend (tsc), then frontend (tsc + vite)
```

### Environment

Create `.env` at the repo root (see `.env.example`):

| Variable | Required | Default |
|----------|----------|---------|
| `SPOTIFY_CLIENT_ID` | Yes | — |
| `SPOTIFY_CLIENT_SECRET` | Yes | — |
| `SPOTIFY_REDIRECT_URI` | Yes | — |
| `PORT` | No | `3001` (For local Express) |
| `FRONTEND_URL` | No | `http://127.0.0.1:5173` |
| `UPSTASH_REDIS_REST_URL` | Yes | — |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | — |

---

## Features

### Taste collision

- **Link collision** — create a session, share a URL, friend joins, run together
- **Friend collision** — collide with a real friend or ghost persona
- **Solo collision** — compare your own taste across two time ranges (e.g. all-time vs last 4 weeks)
- **Sandbox** — authenticated user + 1–3 ghost personas, no second human required
- **Replay / rerun** — past collisions saved to history with adjustable weights and settings
- Up to **4 participants** (live users and/or ghosts)

### Playlist generation modes

| Mode | ID | Behavior |
|------|----|----------|
| Midpoint Blend | `midpoint` | Up to 3 genre `/search` calls seeded from shared genres and centroid; searched tracks displayed first |
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
- Top genres, artists, and tracks
- Narrative listening insights and sonic outlier detection
- Estimated listening hours and play counts
- **Listening Habits** page — genre pie chart and daily listening line chart

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
│                         Frontend (React + Vite)                         │
│  Port 5173 · HTTP-only session cookie (or local proxy to API)           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ REST + credentials
┌───────────────────────────────────▼─────────────────────────────────────┐
│                      Backend API (AWS Lambda)                           │
│  SST v3 · Express via serverless-http · Collision · Spotify · Math      │
└───────────┬─────────────────────────────┬─────────────────────────────┘
            │                             │
┌───────────▼──────────┐      ┌───────────▼──────────────────────────────┐
│  @music-mixer/shared │      │  DynamoDB + SQS + Upstash Redis          │
│  Types · Constants   │      │  Sessions · History · Caches · Habits    │
└──────────────────────┘      └────────────────────────────────────────────┘
                                          │
                              ┌───────────▼──────────┐
                              │  Spotify Web API v1  │
                              └──────────────────────┘
```

### Design principles

- **ID-first matching** — track and artist intersections use Spotify entity IDs
- **Genre-estimated vectors** — 6D taste vectors derived from weighted anchor-genre profiles
- **Safe-Discovery** — capped `/search` calls per playlist build; circuit breaker on rate limits
- **Deterministic deduplication** — canonical keys collapse remix/version variants to one slot
- **Cultural guardrails** — regional genres only included when shared-safe across all participants

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.7 |
| Backend | AWS Lambda + serverless-http (deployed via SST v3) |
| Local API | Node.js, Express 4, tsx (via `local.ts`) |
| Frontend | React 18, Vite 6, Tailwind 3, Framer Motion |
| Router | React Router 7 |
| Monorepo | npm workspaces (`packages/shared`, `backend`, `frontend`) |
| Persistence| AWS DynamoDB (Habits), Upstash Redis (Sessions/Caches) |
| Auth | Spotify OAuth 2.0, HTTP-only `mm_session` cookie |

---

## Project structure

```
music-mixer/
├── package.json
├── sst.config.ts                 # Infrastructure as Code (AWS via SST v3)
├── packages/shared/              # @music-mixer/shared types & constants
├── backend/
│   ├── src/
│   │   ├── config/env.ts         # Environment + Spotify URLs/scopes
│   │   ├── lib/                  # persist, cache, fetch, cookies
│   │   ├── middleware/           # auth, rateLimiter, telemetry
│   │   ├── routes/               # 7 API routers
│   │   ├── math/                 # vectors, similarity, genres, insights
│   │   ├── collision/            # engine, store, history
│   │   ├── spotify/              # auth, client, tracks, taste, genreModel, build, veto, export
│   │   ├── services/             # session, friends, ghosts, dashboard, habits
│   │   ├── workers/              # AWS Lambda queue processors and cron jobs
│   │   ├── lambda.ts             # AWS Lambda entrypoint for Express
│   │   └── local.ts              # Local Express development entrypoint
│   └── scripts/generateGhosts.ts
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

### Vector operations (`math/vector.ts`)

- `weightedCentroid(vectors, weights)` — multi-user taste centroid
- `weightedBlend`, `midpoint`, `averageVectors`

### Cosine similarity (`math/similarity.ts`)

Mean-centered Pearson-like correlation mapped to [0, 1]:

```
centeredA[i] = a[i] - 0.5
similarity = (correlation + 1) / 2
```

**Compatibility labels:**

| Score | Label |
|-------|-------|
| ≥ 0.95 | Soulmates |
| ≥ 0.85 | Perfect Harmony |
| ≥ 0.75 | Great Match |
| ≥ 0.60 | Solid Vibe |
| ≥ 0.45 | Interesting Mix |
| ≥ 0.30 | Opposites Attract |
| < 0.30 | Chaotic Energy |

### Genre model (`spotify/genreModel.ts`)

1. Each artist genre maps to an **anchor genre** (pop, rock, bollywood, k-pop, etc.)
2. Each anchor has a fixed 6D profile in `ANCHOR_GENRE_PROFILES`
3. User vector = weighted average: `v = Σ(w_g × profile(g)) / Σ(w_g)`

**Macro-category penalty** — genres grouped into Electronic, Rock, Hip-Hop, Regional, Acoustic. Culturally distant macro pairs reduce similarity (multipliers: same 1.0, adjacent 0.85, distant 0.65).

### Listening time estimation (`math/listening.ts`)

Geometric decay by rank within each time window (Spotify does not expose true play counts):

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

### Tier 1 — Mode-dependent fill

**Midpoint:**
- Up to 3 `/search` calls
- Query seeds: shared genres (dampened) → top non-regional genres → centroid genres → `pop`
- Regional genres excluded unless shared-safe across all participants
- Results in `searched[]` bucket (displayed first)

**Equal share:**
- `chunkInterleave()` from each participant's own top tracks (2–3 per round by weight)
- Tags `sourceParticipantIndex` for UI color dots
- No API calls

### Tier 2 — Search fallback (equal share only)

One `/search` if Tier 1 local fill is still short. Midpoint skips Tier 2 (budget spent in Tier 1).

### Tier 3 — Emergency baseline

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
                    │ Stage 1: Common    │
                    │ (ID intersection)  │
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

| ID | Name | Tagline |
|----|------|---------|
| `ghost-thrasher` | The Thrasher | Heavy Metal |
| `ghost-hype-beast` | The Hype Beast | US Hip-Hop |
| `ghost-study-buddy` | The Study Buddy | Lo-Fi Ambient |
| `ghost-pop-princess` | The Pop Princess | Dance Pop |
| `ghost-bollywood-buff` | The Bollywood Buff | Filmi & Desi Pop |

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
| Token storage | Server-side JSON files; never sent to frontend |
| Session cookie | HTTP-only `mm_session` |
| OAuth CSRF | `state` parameter validated in callback |
| Rate limiting | Per-IP token bucket (exempt auth/health) |
| Spotify rate limits | Circuit breaker with cooldown |
| Input validation | Ghost IDs capped at 3; bounded playlist length |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `npx sst dev` | Start local backend infrastructure via SST + Express |
| `npm run dev --workspace=frontend` | Start local Vite server for frontend |
| `npm run build` | Build all workspaces |
| `npm run generate:ghosts -w backend` | Hydrate ghost profiles from Spotify playlists |

---

## Deploying to Vercel

The backend API is designed to be deployed to AWS Lambda via **SST** (`npx sst deploy --stage production`).
The frontend is a Vite SPA that can easily be hosted on Vercel.

1. **Connect Repository:** Link your GitHub repo to a new Vercel project.
2. **Framework Preset:** Select **Vite**.
3. **Root Directory:** Set to `frontend`.
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Environment Variables:**
   - Add `VITE_API_URL` and set it to your production SST Lambda API URL (e.g. `https://<api-id>.lambda-url.<region>.on.aws/api`).

Vercel will handle the rest, building the `frontend` workspace and serving your static assets globally!

---

## Key modules

| Path | Responsibility |
|------|----------------|
| `collision/engine.ts` | Collision orchestration |
| `spotify/build.ts` | Safe-Discovery playlist pipeline |
| `spotify/taste.ts` | Taste profile builder |
| `spotify/genreModel.ts` | Anchor genre vectors + macro penalty |
| `spotify/veto.ts` | Regional genre veto |
| `services/ghosts.ts` | Ghost persona reader |
| `services/session.ts` | OAuth session management |
| `lib/persist.ts` | JSON file I/O |
| `math/similarity.ts` | Cosine similarity + labels |
| `frontend/src/hooks/useCollision.ts` | Collision state machine |
