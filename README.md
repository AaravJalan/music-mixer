# MusicMixer

Spotify Taste Collision Engine — blend profiles, generate shared playlists, export to Spotify.

## Recommendation Engine

### Hierarchical Recommendation Pipeline

Architected a hierarchical playlist assembly pipeline that prioritizes verified user-overlap (Exact Matches > Shared Affinity > Proportional Discovery), ensuring genre-purity and reducing algorithmic drift in high-compatibility scenarios.

**Slot priority:**

1. **Exact Favorites** — intersection of participants' top tracks
2. **Shared Affinity Artists** — exact-entity `GET /artists/{id}/top-tracks` per shared artist ID (5 tracks each)
3. **Cultural/Genre Intersection** — high-affinity shared genres (≥20% for all participants)
4. **Proportional Discovery** — ID-anchored artist top-tracks + genre-only search, weighted per participant (catalog depth offset 0–50)

### Deterministic Data Mapping

Refactored the recommendation pipeline to use Spotify's unique entity URIs (artist IDs) for cross-user intersection logic, effectively eliminating search-result collisions and ensuring 100% identity-accuracy in high-affinity matches.

Artist intersection, trusted-artist scoring, and superstar-collab filtering all key on Spotify artist IDs (name matching only as a fallback for ID-less sources). Because the Spotify Search API has no artist-ID filter, ID-based artist sourcing is performed via the exact-entity `top-tracks` endpoint rather than an `artist:"[Name]"` query string — this queries the precise entity and removes any risk of pulling the "wrong Pritam."

### Context-Aware Content Policy

Engineered a context-aware playlist curation service that enforces strict cultural intersection policies, preventing cross-language content drift by dynamically categorizing genres into **Regional** (strict intersection) and **Global** (proportional) buckets.

Regional genres (Bollywood, K-Pop, Latin, etc.) are included in search only when every participant has ≥20% affinity. When a fully regional profile collides with a fully global profile with zero valid intersection, the pipeline defaults to the global participant's dominant genre.

### Deduplication

`getCanonicalKey()` normalizes track titles (parenthetical and hyphen suffixes) so variants like "WE PRAY (Remix)" and "WE PRAY" collapse to one playlist entry.

### Elastic Pipeline

Implemented an 'Elastic Pipeline' for recommendation assembly, adding fallback logic that strips query specificity (e.g., dropping genre tags) if initial high-fidelity searches return zero results.

When the Hierarchical Assembly Pipeline encounters **Pipeline Starvation** (a stage returning zero results due to overly rigid intersection logic), it automatically relaxes constraints:

- **Case-insensitive ID matching**: Track and artist ID intersections are normalized (lowercase + trimmed) to prevent hidden whitespace or casing differences from breaking matches.
- **Genre → Artist fallback**: If genre-specific queries in Stage 3 return 0 results, the pipeline automatically retries with broader artist-only queries (dropping the genre restriction).
- **Continuity guarantee**: The pipeline never terminates early — each stage unconditionally passes its results to the next, and Stage 4 (Proportional Discovery) always runs if the playlist is under target length.

## Development

```bash
npm install
npm run dev
```

Use `http://127.0.0.1:5173` for Spotify OAuth.
