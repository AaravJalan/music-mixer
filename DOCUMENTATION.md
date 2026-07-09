# MusicMixer — Technical Documentation

**Spotify Taste Collision Engine** — a monorepo web application that compares up to four listeners' musical taste in a six-dimensional feature space, computes compatibility scores, and assembles shared playlists through a deterministic, ID-anchored recommendation pipeline with Safe-Discovery constraints for Spotify's February 2026 API limits.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Authentication & Session Management](#4-authentication--session-management)
5. [REST API Reference](#5-rest-api-reference)
6. [Shared Type System](#6-shared-type-system)
7. [Mathematical Models](#7-mathematical-models)
8. [Taste Profile Ingestion](#8-taste-profile-ingestion)
9. [Collision Engine](#9-collision-engine)
10. [Recommendation Pipeline (Safe-Discovery)](#10-recommendation-pipeline-safe-discovery)
11. [Cultural & Linguistic Guardrails](#11-cultural--linguistic-guardrails)
12. [Dashboard & Listening Habits Analytics](#12-dashboard--listening-habits-analytics)
13. [Frontend Application](#13-frontend-application)
14. [Data Persistence](#14-data-persistence)
15. [Spotify API Integration](#15-spotify-api-integration)
16. [Ghost Profiles & Sandbox Mode](#16-ghost-profiles--sandbox-mode)
17. [Scripts & Tooling](#17-scripts--tooling)
18. [Configuration & Environment](#18-configuration--environment)
19. [Security Model](#19-security-model)
20. [Known Limitations & Future Work](#20-known-limitations--future-work)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend (React + Vite)                         │
│  Port 5173 · Proxy /api → 127.0.0.1:3001 · HTTP-only session cookie     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ REST + credentials
┌───────────────────────────────────▼─────────────────────────────────────┐
│                      Backend (Express + TypeScript)                     │
│  Port 3001 · Routes · Middleware · Services · Math · Spotify client     │
└───────────┬─────────────────────────────┬─────────────────────────────┘
            │                             │
┌───────────▼──────────┐      ┌───────────▼──────────────────────────────┐
│  @music-mixer/shared │      │  File persistence (backend/.data/*.json)   │
│  Types · Constants   │      │  Sessions · History · Ghosts · Caches      │
└──────────────────────┘      └────────────────────────────────────────────┘
                                          │
                              ┌───────────▼──────────┐
                              │  Spotify Web API v1  │
                              └──────────────────────┘
```

### Core user flows

| Flow | Description |
|------|-------------|
| **Link collision** | User A creates a session, shares URL; User B joins; either runs collision |
| **Friend collision** | User selects a friend (real or ghost) from friends list |
| **Solo collision** | User collides their own taste across two time ranges (e.g. long_term vs short_term) |
| **Sandbox** | Authenticated user + 1–3 ghost personas, no second human required |
| **Replay / rerun** | Past collisions stored in history; weights and settings adjustable on replay |

### Design principles

- **ID-first matching**: Track and artist intersections use Spotify entity IDs, not display names.
- **Genre-estimated vectors**: `/audio-features` is blocked in Spotify Development Mode; 6D taste vectors are derived from weighted anchor-genre profiles.
- **Safe-Discovery**: Playlist assembly minimizes Spotify API calls; circuit breaker on 403/429; no retry loops.
- **Deterministic deduplication**: Canonical keys collapse remix/version variants to one playlist slot.

---

## 2. Technology Stack

### Runtime & languages

| Layer | Technology | Version (approx.) |
|-------|------------|-------------------|
| Language | TypeScript | 5.7.x |
| Backend runtime | Node.js | (LTS) |
| Backend framework | Express | 4.21.x |
| Frontend framework | React | 18.3.x |
| Frontend router | React Router | 7.1.x |
| Build (frontend) | Vite | 6.0.x |
| Styling | Tailwind CSS | 3.4.x |
| Animation | Framer Motion | 11.18.x |
| Dev orchestration | concurrently | 9.1.x |
| Backend hot reload | tsx watch | 4.19.x |

### Key backend dependencies

- `cookie-parser` — HTTP-only session cookie parsing
- `cors` — cross-origin with credentials for `127.0.0.1:5173`
- `dotenv` — environment variable loading
- `uuid` — collision/session ID generation

### Key frontend dependencies

- `@music-mixer/shared` — shared types and constants (workspace package)
- Custom SVG charts (no charting library) — radar, pie, line, genre bars

### Not currently in use (planned / README references)

- PostgreSQL / Supabase
- Redis
- Docker / docker-compose
- AWS DynamoDB (skeleton TODOs in listening habits)

---

## 3. Monorepo Structure

```
music-mixer/
├── package.json                 # Workspace root; dev/build scripts
├── scripts/
│   └── kill-dev-ports.mjs       # Frees ports 3001, 5173, 5174 before dev
├── packages/
│   └── shared/                  # @music-mixer/shared
│       └── src/
│           ├── constants/       # AUDIO_FEATURE_KEYS, SPOTIFY_* limits
│           ├── types/           # api, audio, session, social
│           └── utils/           # normalizeSpotifyId
├── backend/
│   ├── src/
│   │   ├── app.ts               # Express factory
│   │   ├── index.ts             # Server bind 127.0.0.1
│   │   ├── config/              # env, spotify URLs/scopes
│   │   ├── middleware/          # auth, rateLimiter, telemetry
│   │   ├── routes/              # API route handlers
│   │   ├── math/                # Pure math (vectors, similarity, genres)
│   │   └── services/
│   │       ├── analytics/       # dashboard, listeningHabits
│   │       ├── cache/           # artist, dashboard, related-artists caches
│   │       ├── collision/       # engine, store, history
│   │       ├── friends/         # store, ghostFriends
│   │       ├── sandbox/         # ghostProfiles
│   │       ├── session/         # manager, persist
│   │       └── spotify/         # auth, client, recommendations, vectorEngine, ...
│   ├── scripts/
│   │   └── generateGhosts.ts    # One-time ghost hydration
│   ├── dump/
│   │   └── search_logic_deprecated.ts  # Reference only; not imported
│   └── .data/                   # JSON persistence (gitignored contents)
└── frontend/
    └── src/
        ├── api/client.ts        # Typed API client
        ├── components/          # UI + collision + dashboard
        ├── hooks/               # useAuth, useCollision
        ├── pages/               # Route pages
        └── constants/           # tasteTimeRanges, feature info
```

### Build order

```bash
npm run build
# 1. @music-mixer/shared (tsc)
# 2. backend (tsc)
# 3. frontend (tsc -b && vite build)
```

### Development

```bash
npm run dev
# predev: kill-dev-ports.mjs
# concurrently: backend tsx watch + frontend vite
# Backend: http://127.0.0.1:3001
# Frontend: http://127.0.0.1:5173 (proxies /api → backend)
```

**Important:** Use `http://127.0.0.1:5173` (not `localhost`) for OAuth cookie consistency.

---

## 4. Authentication & Session Management

### OAuth 2.0 Authorization Code flow

| Step | Endpoint / action |
|------|-------------------|
| 1 | `GET /api/auth/login` → redirect to Spotify authorize URL |
| 2 | User grants consent on Spotify |
| 3 | `GET /api/auth/callback?code=&state=` → exchange code for tokens |
| 4 | Set `mm_session` HTTP-only cookie; redirect to frontend |

### Scopes

**Requested at login** (`backend/src/services/spotify/auth.ts`):

```
user-read-private user-read-email user-top-read playlist-modify-private
```

**Declared in config** (`backend/src/config/spotify.ts`) but not all used at login:

```
user-read-private user-read-email user-top-read user-read-recently-played
```

| Scope | Used for |
|-------|----------|
| `user-read-private` | Profile |
| `user-read-email` | Profile |
| `user-top-read` | Top tracks & top artists |
| `playlist-modify-private` | Export playlist to Spotify |
| `user-read-recently-played` | Year-to-date track derivation (may fail if not in login scopes) |

### Session storage

- Cookie name: `mm_session`
- Session data: `backend/.data/sessions.json`
- Refresh tokens: `backend/.data/refresh-tokens.json`
- OAuth CSRF states: `backend/.data/oauth-states.json` (15-minute TTL)
- Token refresh: automatic via `getValidAccessToken(sessionId)` in `client.ts`

### Middleware

`requireAuth` (`backend/src/middleware/auth.ts`):
- Reads `mm_session` cookie
- Attaches `req.user` and `req.sessionId`
- Returns 401 if invalid/expired

---

## 5. REST API Reference

Base URL: `http://127.0.0.1:3001/api`

Global middleware on all routes except exempt paths:
- `telemetryMiddleware` — response time header, recommendation latency tracking
- `rateLimiter` — token bucket: 60 capacity, 10 tokens/second refill per IP

**Rate limiter exemptions:** `/api/auth/login`, `/api/auth/callback`, `/api/health`

---

### 5.1 Health & Metrics

#### `GET /api/health`

| | |
|---|---|
| **Auth** | None |
| **Response** | `{ status, service, cache }` — includes `audioFeatureCache.getStats()` |

#### `GET /api/health/metrics`

| | |
|---|---|
| **Auth** | None |
| **Response** | `MetricsSnapshot` — telemetry snapshot |

---

### 5.2 Authentication

#### `GET /api/auth/me`

| | |
|---|---|
| **Auth** | Optional (cookie) |
| **Response** | `AuthMeResponse`: `{ authenticated: boolean, user: UserProfile \| null }` |

#### `GET /api/auth/login`

| | |
|---|---|
| **Auth** | None |
| **Query** | `redirect?` — post-login path; `consent=1` or `force=1` — force re-consent |
| **Response** | 302 redirect to Spotify, or 503 `{ error, code: 'SPOTIFY_NOT_CONFIGURED' }` |

#### `GET /api/auth/callback`

| | |
|---|---|
| **Auth** | None |
| **Query** | `code`, `state`, `error?` |
| **Response** | 302 redirect; sets `mm_session` cookie on success |

#### `POST /api/auth/logout`

| | |
|---|---|
| **Auth** | Optional |
| **Response** | `{ ok: true }` — clears session cookie |

---

### 5.3 Collision

#### `POST /api/collision/create`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `CreateCollisionRequest` |

```typescript
{
  mode?: 'link' | 'friend' | 'solo' | 'sandbox';
  friendId?: string;
  userAWeight?: number;      // deprecated; use participantWeights
  userBWeight?: number;
  playlistLength?: number;
  playlistLengthMode?: 'tracks' | 'duration';
  playlistDurationMinutes?: number;
  participantTimeRanges?: TasteTimeRange[];
}
```

| **Response** | `{ collision: CollisionSession }` |

#### `POST /api/collision/create-solo`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `userAWeight?`, `userBWeight?`, `playlistLength?` |
| **Behavior** | Solo mode: user vs self (`long_term` vs `short_term`), `equal_share` |
| **Response** | `{ collision }` |

#### `GET /api/collision/:id`

| | |
|---|---|
| **Auth** | None |
| **Response** | `{ collision: CollisionSession }` |

#### `PATCH /api/collision/:id/config`

| | |
|---|---|
| **Auth** | Required (participant) |
| **Body** | Partial `RunCollisionRequest` / `CollisionConfig` fields |
| **Response** | `{ config: CollisionConfig }` |

#### `POST /api/collision/:id/join`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `{ collision }` |

#### `POST /api/collision/:id/run`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `RunCollisionRequest` |

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

| **Response** | `{ result: CollisionResult, metrics: MetricsSnapshot }` |

#### `GET /api/collision/:id/result`

| | |
|---|---|
| **Auth** | None |
| **Response** | `{ result: CollisionResult }` |

#### `POST /api/collision/:id/regenerate-playlist`

| | |
|---|---|
| **Auth** | Required (participant) |
| **Behavior** | Rebuilds playlist with new `randomOffset`; increments `regenerateCount` |
| **Response** | `RegeneratePlaylistResponse` |

#### `GET /api/collision/history`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `CollisionHistoryResponse`: `{ collisions: CollisionHistoryEntry[] }` |

#### `GET /api/collision/history/:id`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `CollisionHistoryDetailResponse`: `{ snapshot }` |

#### `POST /api/collision/history/:id/rerun`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `RerunCollisionRequest` — updated weights, length, mode |
| **Response** | `{ result, metrics }` |

#### `DELETE /api/collision/history`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `{ ok: true, cleared: number }` |

#### `DELETE /api/collision/history/:id`

| | |
|---|---|
| **Auth** | Required |
| **Query** | `completedAt` (required) |
| **Response** | `{ ok: true }` |

---

### 5.4 Friends

#### `GET /api/friends`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `{ friends: Friend[], pendingCollisions?: CollisionSession[] }` |

Merges real friends (in-memory store) with default ghost friends.

#### `POST /api/friends/invite`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `FriendInviteResponse`: `{ code, inviteUrl }` |

#### `POST /api/friends/accept/:code`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `{ friend: UserProfile }` |

#### `DELETE /api/friends/:friendId`

| | |
|---|---|
| **Auth** | Required |
| **Response** | `{ ok: true }` |

---

### 5.5 Dashboard

#### `GET /api/dashboard`

| | |
|---|---|
| **Auth** | Required |
| **Query** | `term`: `short_term` \| `medium_term` \| `year_to_date` \| `long_term` |
| **Response** | `DashboardResponse` |

#### `GET /api/dashboard/habits`

| | |
|---|---|
| **Auth** | Required |
| **Query** | `term` (same as above) |
| **Response** | `ListeningHabitsResponse` |

---

### 5.6 Playlist Export

#### `POST /api/playlist/export`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `ExportPlaylistRequest` |

```typescript
{
  collisionId: string;
  name?: string;
  public?: boolean;
}
```

| **Response** | `ExportPlaylistResponse`: `{ playlistUrl, playlistId }` |

Creates playlist via `POST /me/playlists`, adds tracks via `POST /playlists/{id}/items`.

---

### 5.7 Sandbox

#### `GET /api/sandbox/ghosts`

| | |
|---|---|
| **Auth** | None |
| **Response** | `GhostProfilesResponse`: `{ ghosts: GhostProfile[] }` |

#### `POST /api/sandbox/collision`

| | |
|---|---|
| **Auth** | Required |
| **Body** | `SandboxCollisionRequest` |

```typescript
{
  ghostIds: string[];           // 1–3 ghost IDs
  participantWeights?: number[];
  playlistLength?: number;
  playlistLengthMode?: 'tracks' | 'duration';
  playlistDurationMinutes?: number;
  playlistGenerationMode?: 'midpoint' | 'equal_share' | 'common_only';
  randomOffset?: number;
}
```

| **Response** | `SandboxCollisionResponse`: `{ result, metrics }` |

---

## 6. Shared Type System

Package: `@music-mixer/shared` — exported from `packages/shared/src/index.ts`

### 6.1 Audio types (`types/audio.ts`)

```typescript
interface AudioFeatureVector {
  danceability: number;      // [0, 1]
  energy: number;
  acousticness: number;
  valence: number;
  instrumentalness: number;
  liveness: number;
}

const AUDIO_FEATURE_KEYS = [
  'danceability', 'energy', 'acousticness',
  'valence', 'instrumentalness', 'liveness'
] as const;
```

Helpers: `vectorToTuple()`, `tupleToVector()`

### 6.2 Session types (`types/session.ts`)

- `UserProfile` — `{ id, displayName, avatarUrl, platform? }`
- `CollisionStatus` — `'waiting' | 'ready' | 'complete' | 'expired'`
- `CollisionSession` — full session state with `config`, `participants[]`, `regenerateCount`

### 6.3 Social types (`types/social.ts`)

| Type | Values / purpose |
|------|------------------|
| `CollisionMode` | `'link' \| 'friend' \| 'solo' \| 'sandbox'` |
| `PlaylistGenerationMode` | `'midpoint' \| 'equal_share' \| 'common_only'` |
| `PlaylistLengthMode` | `'tracks' \| 'duration'` |
| `TasteTimeRange` | `'short_term' \| 'medium_term' \| 'year_to_date' \| 'long_term'` |
| `PLAYLIST_MATCH_THRESHOLD` | `0.8` — below this, midpoint forced to equal_share |
| `GenreStat` | `{ genre, count, percentage }` |
| `GhostProfile` | Static persona with vector, genres, tracks, topArtists |
| `CollisionConfig` | Weights, time ranges, playlist settings |

### 6.4 API types (`types/api.ts`)

Key response shapes:

- `CollisionResult` — similarity score, participants, centroid, playlist, shared genres/artists
- `RecommendationTrack` — track metadata + `isCommon?`, `sourceParticipantIndex?`
- `DashboardResponse` — taste vector, top genres/artists/tracks, insights, sonic outlier
- `ListeningHabitsResponse` — genre distribution, daily listening, total hours
- `CollisionHistoryEntry` / `CollisionHistorySnapshot` — persisted replay data

### 6.5 Constants

| Constant | Value | File |
|----------|-------|------|
| `VECTOR_DIMENSION` | 6 | `constants/audioFeatures.ts` |
| `SPOTIFY_TOP_TRACKS_LIMIT` | 50 | `constants/spotify.ts` |
| `SPOTIFY_SEARCH_LIMIT` | 10 | `constants/spotify.ts` (overridden to 50 in Safe-Discovery search) |
| `SPOTIFY_AUDIO_FEATURES_BATCH_SIZE` | 100 | deprecated endpoint |

### 6.6 Utilities

`normalizeSpotifyId(id)` — strips `spotify:track:` / `spotify:artist:` URI prefixes for deterministic ID matching.

---

## 7. Mathematical Models

All pure math lives in `backend/src/math/` and `backend/src/services/spotify/featureEstimate.ts`.

### 7.1 Vector operations (`math/vector.ts`)

| Function | Formula / behavior |
|----------|-------------------|
| `toDenseVector(v)` | `AudioFeatureVector` → `number[6]` |
| `averageVectors(vectors)` | Component-wise arithmetic mean |
| `weightedBlend(a, b, wA, wB)` | `(wA·a + wB·b) / (wA + wB)` per dimension |
| `weightedCentroid(vectors, weights)` | `Σ(wᵢ·vᵢ) / Σ(wᵢ)` — used for multi-user centroid |
| `midpoint(a, b)` | `(a + b) / 2` per dimension |

### 7.2 Cosine similarity (`math/similarity.ts`)

**Implementation:** Mean-centered Pearson-like correlation mapped to [0, 1].

For each dimension `i`:

```
centeredA[i] = a[i] - 0.5
centeredB[i] = b[i] - 0.5
dot = Σ(centeredA[i] × centeredB[i])
normA = Σ(centeredA[i]²)
normB = Σ(centeredB[i]²)
correlation = dot / (√normA × √normB)
similarity = (correlation + 1) / 2
```

**Rationale:** Spotify audio features are ∈ [0, 1]. Centering at 0.5 converts uncentered cosine similarity into a correlation measure that better captures relative shape than raw magnitude.

| Function | Purpose |
|----------|---------|
| `cosineSimilarity(a, b)` | Pairwise score ∈ [0, 1] |
| `averagePairwiseSimilarity(vectors)` | Mean over all unique pairs (multi-user) |
| `compatibilityLabel(score)` | Human label thresholds |

**Compatibility labels:**

| Score range | Label |
|-------------|-------|
| ≥ 0.95 | Soulmates |
| ≥ 0.85 | Perfect Harmony |
| ≥ 0.75 | Great Match |
| ≥ 0.60 | Solid Vibe |
| ≥ 0.45 | Interesting Mix |
| ≥ 0.30 | Opposites Attract |
| < 0.30 | Chaotic Energy |

### 7.3 Genre aggregation (`math/genres.ts`)

| Function | Behavior |
|----------|----------|
| `aggregateGenres(artists, limit)` | Frequency count from artist genre arrays |
| `aggregateWeightedGenres(weighted, limit)` | Rank-weighted genre statistics |
| `sharedGenresMulti(allGenres)` | Set intersection across all participants |
| `sharedGenres(a, b)` | Two-user intersection wrapper |

### 7.4 Shared artists (`math/sharedArtists.ts`)

| Function | Behavior |
|----------|----------|
| `normalizeArtistName(name)` | Lowercase trim |
| `findSharedTopArtists(artistLists, limit)` | **ID-only intersection** — artists must share exact Spotify artist ID |

### 7.5 Listening time estimation (`math/listening.ts`)

Spotify does not expose true play counts. Model uses geometric decay by rank within each time window:

```typescript
TIME_RANGE_PLAY_MODEL = {
  short_term:    { topPlays: 28,  decay: 0.90 },
  medium_term:   { topPlays: 90,  decay: 0.93 },
  year_to_date:  { topPlays: 120, decay: 0.93 },
  long_term:     { topPlays: 320, decay: 0.955 },
}

plays(rank) = topPlays × decay^rankIndex
totalMs = Σ(plays(i) × durationMs[i])
hours = totalMs / 3_600_000
```

| Function | Output |
|----------|--------|
| `estimateTotalPlays(term, trackCount)` | Modeled play count |
| `estimateListeningHours(term, durationsMs)` | Rank-weighted hours |
| `estimateListeningHoursFromTopTracks(tracks, term)` | Wrapper using track durations |

### 7.6 Dashboard insights (`math/insights.ts`)

| Metric | Function | Description |
|--------|----------|-------------|
| Niche score | `computeNicheScore(weightedGenres)` | Share of non-broad anchor genres |
| Mood consistency | `computeMoodConsistencyIndex(tracks, artistGenreMap)` | `1 - 3×avg(stdDev)` across 6D dimensions |
| Narrative | `buildDashboardInsights(...)` | Headline, summaries, profile labels |

### 7.7 Sonic outlier (`math/outlier.ts`)

`findSonicOutlier(tracks, baselineVector)` — track whose estimated feature vector has highest population standard deviation from the user's baseline centroid.

### 7.8 Anchor genre → 6D vector model (`featureEstimate.ts`)

Because `/audio-features` returns 403 in Development Mode, taste vectors are **estimated** from genre weights:

1. Each Spotify artist genre maps to an **anchor genre** via `resolveAnchorGenre()` and `SUB_GENRE_RULES`.
2. Each anchor has a fixed 6D profile in `ANCHOR_GENRE_PROFILES` (pop, rock, bollywood, k-pop, etc.).
3. User vector = weighted average of anchor profiles:

```
v_user = Σ(w_g × profile(g)) / Σ(w_g)
```

where `w_g` comes from rank-weighted artist genre frequency.

### 7.9 Macro-category penalty (`featureEstimate.ts`, `macroPenalty.ts`)

Genres are grouped into five macro-categories:

| Macro | Example anchors |
|-------|-----------------|
| `Macro_Electronic` | electronic, edm, techno, house |
| `Macro_Rock` | metal, rock, alternative, punk |
| `Macro_HipHop` | hip hop, rap, trap, r&b, soul |
| `Macro_Regional` | bollywood, k-pop, latin, reggaeton |
| `Macro_Acoustic` | folk, acoustic, country |

**Distance multipliers** (`MACRO_MULTIPLIERS`):

| Relationship | Multiplier |
|--------------|------------|
| Same macro | 1.0 |
| Adjacent macro | 0.85 |
| Distant macro | 0.65 |

Applied in collision engine:

```
finalSimilarity = basePairwiseSimilarity × macroPenaltyMultiplier
```

Logged as: `[macroPenalty] UserA=Regional, UserB=Electronic → 0.65x`

### 7.10 BFS artist graph penalty (`artistGraph.ts`) — implemented, not wired

| Constant | Value |
|----------|-------|
| `TOP_SEED_COUNT` | 3 artists per user |
| `MAX_HOPS` | 2 (related-artists BFS) |
| `GRAPH_MULTIPLIERS` | direct=1.12, 1st=1.08, 2nd=0.92, disconnected=0.72 |

Functions: `buildNeighborhood()`, `analyzeArtistGraph()`, `applyGraphPenalty()`

**Status:** Code exists and caches to `related-artists-cache.json`, but **`analyzeArtistGraph` is not called** from `engine.ts`. Live similarity uses macro penalty only.

### 7.11 Genre dampening for search (`recommendations.ts`)

Prevents dominant genres (>10% share) from hijacking midpoint search queries:

```
if percentage > 10:
  factor = 1 / (1 + log(percentage / 10))
  dampenedPercentage = percentage × factor
// re-normalize to sum to 100
```

Function: `dampenGenreStatsForSearch(pool)`

### 7.12 Proportional slot allocation

`allocateWeightedSlots(total, weights)` — distributes integer playlist slots by normalized weights with remainder given to highest-weight participants.

### 7.13 Chunked interleave

`chunkInterleave(pools, weights, limit, state)` — organic flow: 2–3 tracks per participant per round (3 if weight ≥ 55%, else 2), rotating until limit reached. Tags `sourceParticipantIndex` for UI color dots.

### 7.14 Track deduplication

`getCanonicalKey(track)`:
1. `normalizeTrackTitle(name)` — strips parenthetical suffixes `(Remix)`, `(feat. X)`, hyphen suffixes
2. Pairs with primary artist (lowercase): `"title_primaryartist"`

`normalizeSpotifyId(id)` — strips `spotify:track:` prefix for ID intersection.

---

## 8. Taste Profile Ingestion

Entry: `buildUserTasteProfile(sessionId, timeRange, genreDisplayLimit)` in `vectorEngine.ts`

### Pipeline

```
GET /me/top/tracks (limit 50, time_range)
GET /me/top/artists (limit 50)     [skipped for year_to_date]
        ↓
enrichArtistGenres()               [max 8 artists, batched 3, 250ms delay]
  → name-based inference (genreInference.ts)
  → GET /artists?ids= batch fetch
  → artist-genre-cache.json
        ↓
collectWeightedGenres()
supplementFromTracks()             [title keyword rules]
        ↓
computeWeightedTasteVector()       [anchor genre model]
aggregateWeightedGenres()          [top N for display]
```

### Year-to-date special case

`fetchYearToDateTracks()` uses `GET /me/player/recently-played` (requires scope; may 403). Falls back to `medium_term` top tracks. Artists derived from track artist IDs, not `/me/top/artists`.

### Output: `UserTasteProfile`

```typescript
{
  vector: AudioFeatureVector;
  genres: GenreStat[];
  tracks: TopTrack[];
  artists: ProfileArtist[];
  weightedGenres: WeightedGenre[];
  artistGenreMap: Map<string, string[]>;
  totalArtists: number;
  totalTracks: number;
  usedEstimatedFeatures: true;
}
```

---

## 9. Collision Engine

Entry: `backend/src/services/collision/engine.ts`

### 9.1 Multi-user collision (`runMultiUserCollision`)

Supports 1–4 participants (live users and/or ghosts).

```
1. profileToParticipant() / ghostToParticipant() for each
2. buildUserTasteProfile() or read ghost static data
3. vectors[] → weightedCentroid(vectors, weights) → centroidVector
4. averagePairwiseSimilarity(vectors) → base similarity
5. computeMacroAdjustedSimilarity() per pair → averaged multiplier
6. findSharedTopArtists() — ID intersection
7. buildMultiCollisionPlaylist() — Safe-Discovery pipeline
8. recordCollisionHistory() — persist snapshot
9. logCollisionInsights() — terminal debug output
```

### 9.2 Legacy two-user engine (`runCollisionEngine`)

Handles `link`, `friend`, `solo` modes. Delegates to `runMultiUserCollision` for execution.

### 9.3 Sandbox (`runSandboxCollision`)

Real authenticated user + 1–3 ghosts from `ghost-profiles.json`. No waiting room.

### 9.4 Regeneration (`regenerateCollisionPlaylist`)

Re-runs playlist pipeline only with incremented `randomOffset` for discovery variety. Does not re-fetch Spotify profiles.

### 9.5 Playlist mode guardrail

`resolveEffectiveMode(mode, compatibilityScore)` in `recommendations.ts`:

| Requested mode | Condition | Effective mode |
|----------------|-----------|----------------|
| `common_only` | always | `common_only` |
| `midpoint` | score < 0.8 | `equal_share` (guardrail) |
| `midpoint` | score ≥ 0.8 | `midpoint` |
| `equal_share` | any | `equal_share` |

Frontend displays `Equal Share (auto)` when `playlistGuardrailApplied === true`.

### 9.6 Collision result shape

```typescript
interface CollisionResult {
  collisionId: string;
  similarityScore: number;              // [0, 1]
  participants: CollisionParticipantResult[];
  centroidVector: AudioFeatureVector;
  playlist: RecommendationTrack[];
  sharedGenres: string[];
  sharedArtists?: SharedArtist[];
  participantWeights: number[];           // sums to 100
  effectivePlaylistGenerationMode?: PlaylistGenerationMode;
  playlistGuardrailApplied?: boolean;
  usedFallbackPlaylist?: boolean;
  usedEstimatedFeatures?: boolean;
  exportedPlaylistUrl?: string;
  // deprecated 2-user fields: userA, userB, blendWeights, etc.
}
```

---

## 10. Recommendation Pipeline (Safe-Discovery)

Entry: `buildMultiCollisionPlaylist(input)` in `recommendations.ts`

Designed for Spotify Development Mode (February 2026): minimal API calls, circuit breaker on 403/429, no retry loops.

### 10.1 Input: `PlaylistBuildInput`

```typescript
{
  sessionId: string;
  centroidVector: AudioFeatureVector;
  trackPools: TopTrack[][];              // per-participant top tracks
  artistPools: { id, name, genres? }[][];
  genrePools: string[][];
  genreStatPools: GenreStat[][];
  sharedArtists: { id, name }[];
  genreHints: string[];
  targetLength: number;
  playlistLengthMode?: 'tracks' | 'duration';
  targetDurationMs?: number;
  blendWeights: number[];
  compatibilityScore: number;
  generationMode: PlaylistGenerationMode;
  randomOffset?: number;
}
```

### 10.2 Length resolution

`resolvePlaylistBuildTargets(config)`:

| Mode | Behavior |
|------|----------|
| `tracks` | `targetLength = playlistLength` (user setting) |
| `duration` | `targetLength = ceil(durationMs / 180s) + 12` buffer; `trimPlaylistToDuration()` at end |

`trimPlaylistToDuration()` — keeps boundary closest to target (overshoot vs undershoot).

### 10.3 Pipeline stages (current Safe-Discovery)

#### Stage 1 — Common favorites (all modes)

```
exactOverlap = overlappingTracksMulti(trackPools)  // strict ID intersection
mark isCommon = true
dedupe via getCanonicalKey()
```

#### Mode: `common_only`

Returns intersection only. No discovery. Trims to `targetLength` or duration.

#### Tier 1 — Mode-dependent fill

**Midpoint (`midpoint`):**
- Up to **3** `/search` calls (hard cap)
- Query seeds (deduped, max 3):
  1. Shared genres (intersection-first, dampened) — non-regional preferred
  2. Top non-regional genres per participant
  3. Centroid-derived genres (`buildSearchGenres`)
  4. Fallback: `'pop'`
- Regional genres **excluded** unless shared-safe across all participants
- Results stored in `searched[]` bucket (displayed first)
- Per search: up to 50 results (Spotify max), filtered by cultural guardrail + superstar collab filter

**Equal share (`equal_share`):**
- Local only: `chunkInterleave()` from each participant's own top tracks
- Tags `sourceParticipantIndex` for UI color dots
- No Spotify API calls

#### Tier 2 — Search fallback (non-midpoint only)

Exactly **one** `/search` if still short after Tier 1.
- Picks first non-regional searchable genre
- Regional only if shared-safe
- Midpoint: **skipped** (search budget spent in Tier 1)

#### Tier 3 — Emergency baseline

`emergencyBaselineTracksForTarget(trackPools, limit, seed)` — rotates through all participants' top tracks until target reached.

**Midpoint Tier 3:** two-pass fill:
1. Prefer tracks with known non-regional metadata
2. Allow unknown-genre tracks only if still short

#### Final assembly order

```
tracks = sanitizePlaylistUniqueness([...searched, ...results])
// searched tracks displayed FIRST, then local/common
```

Hard cap: `tracks.slice(0, targetLength)` in track-count mode.

### 10.4 Discovery circuit breaker

```typescript
discoveryDisabledUntil: number  // timestamp

tripDiscoveryBreakerIfBlocked(err):
  if status === 403 or 429:
    cooldown = 429 ? min(Retry-After, 15min) : 60s
    discoveryDisabledUntil = now + cooldown
    log warning
    return true

discoveryAvailable(): Date.now() >= discoveryDisabledUntil
```

All `searchTracks()` calls check `discoveryAvailable()` first; return `[]` if locked.

### 10.5 Blocked endpoints (stubbed)

| Endpoint | Status in pipeline |
|----------|-------------------|
| `GET /artists/{id}/top-tracks` | `fetchArtistTopTracks()` returns `[]` |
| `GET /audio-features` | Not used |
| `GET /recommendations` | Not used |

Reference: `backend/dump/search_logic_deprecated.ts`

### 10.6 Discovery cache

In-memory TTL cache + in-flight deduplication for `/search` responses. Prevents duplicate API calls within a single collision run.

### 10.7 Trusted artist scoring

`buildTrustedArtists(artistPools, sharedArtists)` — sets of artist IDs and normalized names from all participants.

`refineDiscoveredTracks(tracks, trusted)`:
- Filters `shouldDiscardSuperstarCollab()` — global superstars (Drake, Taylor Swift, etc.) unless in trusted set
- Sorts by `scoreTrackAffinity()` — ID-first match to participant artists

### 10.8 Legacy hierarchical pipeline (superseded by Safe-Discovery)

The following stages existed before Safe-Discovery refactor and are **no longer the primary path** but functions remain in file:

- Stage 2: `fillSharedArtistSlots()` — artist top-tracks per shared artist
- Stage 3: `fillGenreIntersectionSlots()` — multi-genre search loop
- Stage 4: `fillProportionalDiscoverySlots()` / `buildMidpointProportionalTail()`
- Backfill: `backfillUniqueTracks()` — up to 8 genre search attempts
- Cultural relax: re-run genre search with veto disabled

---

## 11. Cultural & Linguistic Guardrails

### 11.1 Regional genre list

`REGIONAL_GENRES` in `recommendations.ts`:

```
bollywood, desi, filmi, punjabi, indian, k-pop, k-r&b, k-hip hop,
mandopop, cantopop, c-pop, latin, reggaeton, bachata, ...
```

`isRegionalGenre(genre)` — substring match against list.

### 11.2 Linguistic veto (`linguisticVeto.ts`)

`applyLinguisticVetoToGenreStats(genreStatPools, sharedArtists, blendWeights)`:

- If one participant's dominant genre bucket is fully regional and the other has zero regional presence → strip regional genres from search pools
- **Overrides (skip veto):**
  - Shared regional artists exist (cultural override)
  - Any participant blend weight > 80%

### 11.3 Per-song cultural guardrail

`buildCulturalGuardrail(artistPools, genreStatPools)`:

1. Build artist ID/name → genres map
2. Compute `sharedRegionalTokens` — regional token must appear in **every** participant's genre stats
3. `isBanned(track)` — if track's artist genres contain a regional token not in `sharedRegionalTokens` → exclude

Applied at every `tryAddTrack()` call and in emergency fill.

### 11.4 High-affinity shared genres

`identifyHighAffinitySharedGenres(genreStatPools)`:
- Genre must appear in all participants' pools
- Each participant must have ≥ `MIN_AFFINITY_THRESHOLD` (20%) affinity

`resolveSearchableGenres()` — cultural safety layer deciding which genres are valid for search.

### 11.5 Intersection-first midpoint queries

`sharedGenresForMidpointQuery()`:
1. Dampen genre stats
2. Intersect genre sets across participants
3. Prefer non-regional shared genres
4. Regional only if shared-safe

`isSharedSafeRegionalGenre(genre, sharedRegionalTokens)` — gate for any query seed.

---

## 12. Dashboard & Listening Habits Analytics

### 12.1 Dashboard (`getDashboardAnalytics`)

| Field | Source |
|-------|--------|
| `tasteVector` | `buildUserTasteProfile().vector` |
| `topGenres` | Weighted genre stats |
| `topArtists` | Rank, image, primary genre, track count |
| `topTracks` | Rank, album art, play score |
| `estimatedListeningHours` | `estimateListeningHoursFromTopTracks()` |
| `estimatedTotalPlays` | Geometric decay model |
| `uniqueGenreCount` | Distinct genres across artist map |
| `avgTrackLengthMin` | Mean track duration |
| `insights` | `buildDashboardInsights()` narrative |
| `sonicOutlier` | `findSonicOutlier()` |
| `featureLabels` | 6D dimension display names |
| `usedEstimatedFeatures` | always `true` |

Cached per user+term in `dashboard-cache.json` (TTL).

### 12.2 Listening Habits (`getListeningHabits`)

| Field | Computation |
|-------|-------------|
| `genreDistribution` | Per-track genre hits across artist map; top 8 + "Other"; percentages |
| `totalListeningMs` | `estimateListeningHours('long_term', durations)` × 3_600_000 |
| `totalListeningHours` | Accumulated modeled hours |
| `dailyListening` | **Estimated** — 30-day series with weekend/wobble variance |
| `dailyIsEstimated` | `true` until DynamoDB tracking Lambda wired |

TODO markers in `listeningHabits.ts` for future DynamoDB `ListeningEvents` table:
- PK: `USER#<userId>`, SK: `DAY#<yyyy-mm-dd>`, attribute: `listeningMs`

### 12.3 Frontend dashboard components

| Component | Visualization |
|-----------|---------------|
| `GenreCloud` | Tag cloud sized by genre weight |
| `PersonalRadar` | 6D taste shape radar chart (SVG) |
| `GenreChart` | Horizontal bar chart with highlight for shared genres |
| `StatBubbles` | Listening hours, plays, genre count, avg length |
| `WrappedList` | Top artists/tracks ranked lists |
| `ListeningStory` | Narrative insight paragraphs |
| `GenrePie` | Pie chart for listening habits genre distribution |
| `ListeningLineChart` | Line chart for daily hours |

---

## 13. Frontend Application

### 13.1 Routes

| Path | Component | Auth |
|------|-----------|------|
| `/` | `Home` | Public |
| `/dashboard` | `Dashboard` | Required |
| `/habits` | `ListeningHabitsPage` | Required |
| `/friends` | `FriendsPage` | Required |
| `/collisions` | `PastCollisionsPage` | Required |
| `/collisions/:id` | `CollisionReplayPage` | Required |
| `/collision/:id` | `CollisionPage` | Public (login for actions) |
| `/join/:id` | `JoinPage` | Public |
| `/friends/add/:code` | `FriendAddPage` | Public |

### 13.2 Navigation (`SidePanel.tsx`)

- Dashboard
- Listening Habits
- Taste Collision
- Friends
- Past Collisions

Mobile: bottom tab bar. Desktop: fixed left sidebar.

### 13.3 Collision UI flow

```
Home → create collision (link/friend/solo/sandbox)
  → CollisionPage / JoinPage
    → WaitingRoom (until all joined)
    → CollisionSettings (weights, length, mode, time range)
    → Run collision
    → Results (score, radar, playlist, export)
```

### 13.4 Playlist generation mode UI

`CollisionSettings.tsx` / `SandboxPanel.tsx`:

| Mode | Label | Behavior |
|------|-------|----------|
| `midpoint` | Midpoint Blend | Centroid genre bridge search |
| `equal_share` | Proportional Share | Weighted interleave from each user |
| `common_only` | Common Songs Only | Strict intersection only |

Midpoint disabled in UI when `compatibilityScore < PLAYLIST_MATCH_THRESHOLD` (0.8).

### 13.5 Playlist length UI

`PlaylistLengthControl`:
- **Tracks** — slider/count (default 15)
- **Duration** — minutes target (default 60)

### 13.6 Taste time ranges

Per-participant selector (`TASTE_TIME_RANGE_OPTIONS`):

| Value | Label | Spotify API mapping |
|-------|-------|---------------------|
| `short_term` | 4 weeks | `time_range=short_term` |
| `medium_term` | 6 months | `time_range=medium_term` |
| `year_to_date` | This year | recently-played derived |
| `long_term` | All time | `time_range=long_term` |

Default collision period: `medium_term` (6 months).

### 13.7 Results display

`Results.tsx`:
- `ScoreRing` — compatibility percentage + label
- `FeatureRadar` — 6D centroid vs participants
- `GenreChart` — per-participant genres with shared highlight (cyan + ✦)
- `SharedArtistsList` — ID-intersected artists
- `Playlist` — track list; cyan star for `isCommon`; colored dot for `sourceParticipantIndex`
- Export to Spotify button
- Regenerate playlist button
- Effective mode label (with guardrail auto indicator)

### 13.8 API client

`frontend/src/api/client.ts` — typed fetch wrapper:
- `credentials: 'include'` for session cookie
- Base path `/api`
- Methods for all endpoints listed in Section 5

### 13.9 State management

- `useAuth()` — session check via `GET /api/auth/me`
- `useCollision(collisionId)` — polling, config debounce, run/join/regenerate
- No Redux/Zustand — React `useState` + `useEffect`
- No localStorage — auth is cookie-only

---

## 14. Data Persistence

### 14.1 File-based persistence (`backend/.data/`)

| File | Service | Contents |
|------|---------|----------|
| `sessions.json` | `session/manager.ts` | Active sessions, access tokens, expiry |
| `oauth-states.json` | `session/manager.ts` | OAuth CSRF states (15min TTL) |
| `refresh-tokens.json` | `session/manager.ts` | Per-user Spotify refresh tokens |
| `profiles.json` | `session/manager.ts` | Cached `UserProfile` by Spotify ID |
| `ghost-profiles.json` | `generateGhosts.ts` | Pre-computed ghost track/artist data |
| `collision-history.json` | `collision/history.ts` | Per-user history index (max 50) |
| `collision-snapshots.json` | `collision/history.ts` | Full result + config snapshots |
| `artist-genre-cache.json` | `cache/artistCache.ts` | Artist ID → genres |
| `related-artists-cache.json` | `cache/relatedArtistsCache.ts` | BFS related-artists cache |
| `dashboard-cache.json` | `cache/dashboardCache.ts` | Dashboard response cache |

Helpers: `loadJsonFile<T>()`, `saveJsonFile()` in `session/persist.ts`

### 14.2 In-memory only (lost on restart)

| Store | File | Contents |
|-------|------|----------|
| Active collisions | `collision/store.ts` | `CollisionSession` objects |
| Friends graph | `friends/store.ts` | Friends list, invites |
| Rate limiter buckets | `middleware/rateLimiter.ts` | Per-IP token buckets |
| Telemetry | `middleware/telemetry.ts` | Recommendation latencies |
| Discovery breaker | `recommendations.ts` | `discoveryDisabledUntil` timestamp |
| Discovery cache | `recommendations.ts` | In-memory search response cache |
| Listening habits cache | `listeningHabits.ts` | 10-minute TTL |

---

## 15. Spotify API Integration

### 15.1 Client (`spotify/client.ts`)

`spotifyFetch<T>(sessionId, path, params?)`:
- Attaches Bearer token from session
- Retries on 429 only if `Retry-After ≤ 5 seconds`
- Fails fast on large `Retry-After` (penalty box)
- Throws `SpotifyApiError` with `status` and optional `retryAfterSeconds`

### 15.2 Endpoints used at runtime

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /me` | User profile | ✅ Works |
| `GET /me/top/tracks` | Taste profiles | ✅ Works |
| `GET /me/top/artists` | Taste profiles | ✅ Works |
| `GET /me/player/recently-played` | YTD tracks | ⚠️ Scope may be missing |
| `GET /artists?ids=` | Batch artist genres | ⚠️ Often 403 in Dev Mode |
| `GET /artists/{id}` | Single artist | ⚠️ Often 403 |
| `GET /search?type=track` | Safe-Discovery | ✅ Works (rate limited) |
| `POST /me/playlists` | Export | ✅ Works |
| `POST /playlists/{id}/items` | Export tracks | ✅ Works |
| `GET /artists/{id}/related-artists` | BFS graph | ⚠️ Unused in live flow |
| `GET /artists/{id}/top-tracks` | Discovery | ❌ 403 Dev Mode — stubbed |
| `GET /audio-features` | Real 6D vectors | ❌ 403 — genre estimation used |
| `GET /recommendations` | Spotify recs | ❌ 403 — not used |

### 15.3 Development Mode constraints (Feb 2026)

- New Spotify apps in Development Mode have restricted access to discovery/catalog endpoints
- Extended Quota Mode required for production-scale API access
- Rate limits: hammering `/search` triggers 429 with multi-hour `Retry-After`
- 25-user allowlist for Development Mode apps

### 15.4 Safe-Discovery call budget per collision

| Mode | Max `/search` calls |
|------|---------------------|
| `midpoint` | 3 (Tier 1 only) |
| `equal_share` | 1 (Tier 2 only, if Tier 1 local fill insufficient) |
| `common_only` | 0 |

---

## 16. Ghost Profiles & Sandbox Mode

### 16.1 Ghost personas

| ID | Display name | Tagline |
|----|--------------|---------|
| `ghost-thrasher` | The Thrasher | Metal & hard rock |
| `ghost-hype-beast` | The Hype Beast | Hip-hop & trap |
| `ghost-study-buddy` | The Study Buddy | Lo-fi & chill |
| `ghost-pop-princess` | The Pop Princess | Pop & dance |
| `ghost-bollywood-buff` | The Bollywood Buff | Bollywood & desi |

### 16.2 Data source

- **Embedded metadata:** `GHOST_DEFINITIONS` in `ghostProfiles.ts` (displayName, tagline, avatarUrl, vector)
- **Track data:** `backend/.data/ghost-profiles.json` (hydrated by `generateGhosts.ts`)
- **No runtime Spotify fetch** for ghosts during collisions

### 16.3 Ghost profile shape

```typescript
interface GhostProfile {
  id: string;
  displayName: string;
  tagline: string;
  avatarUrl: string;
  vector: AudioFeatureVector;
  genres: GenreStat[];
  tracks: TopTrack[];           // ~50–100 real Spotify tracks
  topArtists: { id, name, imageUrl, genres? }[];
}
```

### 16.4 Hydration script

`npm run generate:ghosts -w backend`

Fetches user's own Spotify playlists (first 100 tracks embedded in `GET /playlists/{id}` response). Uses `SPOTIFY_BEARER_TOKEN` env override or session token from `sessions.json`.

### 16.5 Sandbox collision

`POST /api/sandbox/collision` — 1 real user + 1–3 ghosts, up to 4 participants total. Supports all three playlist generation modes and all length settings.

---

## 17. Scripts & Tooling

### 17.1 `scripts/kill-dev-ports.mjs`

Kills processes on ports 3001, 5173, 5174 via `lsof` + `kill -9`. Runs automatically before `npm run dev`.

### 17.2 `backend/scripts/generateGhosts.ts`

One-time hydration of `ghost-profiles.json` from user's Spotify playlists.

### 17.3 Dev test scripts (manual probing)

- `backend/test-artists.ts`
- `backend/test-tracks.ts`
- `backend/test-artists-raw.ts`
- `backend/test-tracks-raw.ts`

Read `sessions.json` for token; probe Spotify endpoint availability.

---

## 18. Configuration & Environment

### 18.1 Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SPOTIFY_CLIENT_ID` | Yes | — | OAuth app ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | — | OAuth secret |
| `SPOTIFY_REDIRECT_URI` | Yes | — | OAuth callback URL |
| `PORT` | No | `3001` | Backend port |
| `FRONTEND_URL` | No | `http://127.0.0.1:5173` | CORS + redirect |
| `NODE_ENV` | No | `development` | Environment |
| `SPOTIFY_BEARER_TOKEN` | No | — | Script-only token override |

### 18.2 Vite proxy (`frontend/vite.config.ts`)

```typescript
proxy: {
  '/api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
  }
}
```

Redirects `localhost` → `127.0.0.1` for cookie domain consistency.

---

## 19. Security Model

| Concern | Implementation |
|---------|----------------|
| Token storage | Refresh tokens in `refresh-tokens.json`; access tokens in `sessions.json` |
| Frontend token exposure | Never sent to frontend; HTTP-only `mm_session` cookie |
| XSS | No localStorage tokens; cookie is `httpOnly` |
| CSRF (OAuth) | `state` parameter validated in callback |
| Rate limiting | Per-IP token bucket on API (exempt auth/health) |
| Spotify rate limits | Circuit breaker; fail-fast on long Retry-After |
| Input validation | Ghost IDs capped at 3; playlist length bounded; term enum validated |

---

## 20. Known Limitations & Future Work

| Item | Status |
|------|--------|
| BFS artist graph penalty | Implemented in `artistGraph.ts`, **not wired** to live similarity |
| `/audio-features` | Blocked; genre-estimated vectors used instead |
| `/artists/{id}/top-tracks` | Blocked; stubbed to `[]` |
| Friends store | In-memory only; lost on restart |
| Active collisions | In-memory only; lost on restart |
| `user-read-recently-played` scope | Declared in config but not requested at login |
| Listening habits daily series | Estimated; DynamoDB tracking TODO |
| Extended Quota Mode | Required for unrestricted Spotify API in production |
| PostgreSQL / Redis | Referenced in README; not implemented |
| Docker | Not configured |

---

## Appendix A: File Index (Key Modules)

| Path | Responsibility |
|------|----------------|
| `backend/src/services/collision/engine.ts` | Collision orchestration |
| `backend/src/services/spotify/recommendations.ts` | Safe-Discovery playlist pipeline |
| `backend/src/services/spotify/vectorEngine.ts` | Taste profile builder |
| `backend/src/services/spotify/featureEstimate.ts` | Anchor genre → 6D vector |
| `backend/src/services/spotify/macroPenalty.ts` | Macro-category similarity adjustment |
| `backend/src/services/spotify/artistGraph.ts` | BFS graph penalty (unused) |
| `backend/src/services/spotify/linguisticVeto.ts` | Regional genre veto |
| `backend/src/services/spotify/client.ts` | Spotify HTTP client |
| `backend/src/services/spotify/auth.ts` | OAuth flow |
| `backend/src/services/sandbox/ghostProfiles.ts` | Static ghost reader |
| `backend/src/math/vector.ts` | Vector math |
| `backend/src/math/similarity.ts` | Cosine similarity |
| `backend/src/math/listening.ts` | Play/time estimation |
| `backend/src/math/insights.ts` | Dashboard narratives |
| `backend/src/math/outlier.ts` | Sonic outlier detection |
| `frontend/src/hooks/useCollision.ts` | Collision state machine |
| `frontend/src/components/collision/Results.tsx` | Results display |
| `frontend/src/api/client.ts` | API client |

---

## Appendix B: Collision Pipeline Diagram (Current)

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
                        (searched[])     (results[])
              │               │               │
              │               ▼               ▼
              │          Tier 2: SKIP    Tier 2: 1× /search
              │          (midpoint)      (if still short)
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    Tier 3: Emergency baseline
                    (local top tracks)
                              │
                              ▼
              tracks = [...searched, ...results]
              (searched displayed FIRST)
                              │
                              ▼
                    trim to targetLength / duration
```

---

*Generated for MusicMixer repository. Reflects codebase state including Safe-Discovery pipeline, cultural guardrails, genre dampening, and February 2026 Spotify API constraints.*
