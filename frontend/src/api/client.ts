import type {
  AuthMeResponse,
  CollisionResult,
  CollisionSession,
  CreateCollisionRequest,
  CreateCollisionResponse,
  DashboardResponse,
  ListeningHabitsResponse,
  ExportPlaylistResponse,
  FriendsListResponse,
  FriendInviteResponse,
  GetCollisionResponse,
  GhostProfilesResponse,
  JoinCollisionResponse,
  MetricsSnapshot,
  CollisionHistoryResponse,
  CollisionHistoryDetailResponse,
  RerunCollisionRequest,
  RerunCollisionResponse,
  RegeneratePlaylistResponse,
  RunCollisionRequest,
  SandboxCollisionRequest,
  SandboxCollisionResponse,
} from '@music-mixer/shared';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = err.details ?? err.error ?? res.statusText;
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  getMe: () => request<AuthMeResponse>('/auth/me'),
  login: (redirect?: string, options?: { forceConsent?: boolean }) => {
    const params = new URLSearchParams();
    if (redirect) params.set('redirect', redirect);
    if (options?.forceConsent) params.set('consent', '1');
    const qs = params.toString();
    window.location.href = `${BASE}/auth/login${qs ? `?${qs}` : ''}`;
  },
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  getDashboard: (term: import('@music-mixer/shared').TasteTimeRange = 'medium_term') =>
    request<DashboardResponse>(`/dashboard?term=${term}`),
  getListeningHabits: (term: import('@music-mixer/shared').TasteTimeRange = 'medium_term') =>
    request<ListeningHabitsResponse>(`/dashboard/habits?term=${term}`),
  getFriends: () => request<FriendsListResponse & { pendingCollisions?: CollisionSession[] }>('/friends'),
  createFriendInvite: () => request<FriendInviteResponse>('/friends/invite', { method: 'POST' }),
  acceptFriendInvite: (code: string) =>
    request<{ friend: import('@music-mixer/shared').UserProfile }>(`/friends/accept/${code}`, { method: 'POST' }),
  removeFriend: (friendId: string) => request<{ ok: boolean }>(`/friends/${friendId}`, { method: 'DELETE' }),

  createCollision: (body?: CreateCollisionRequest) =>
    request<CreateCollisionResponse>('/collision/create', { method: 'POST', body: JSON.stringify(body ?? {}) }),
  createSoloCollision: (body?: CreateCollisionRequest) =>
    request<CreateCollisionResponse>('/collision/create-solo', { method: 'POST', body: JSON.stringify(body ?? {}) }),
  getCollision: (id: string) => request<GetCollisionResponse>(`/collision/${id}`),
  joinCollision: (id: string) => request<JoinCollisionResponse>(`/collision/${id}/join`, { method: 'POST' }),
  updateCollisionConfig: (id: string, config: RunCollisionRequest) =>
    request<{ config: CollisionSession['config'] }>(`/collision/${id}/config`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),
  runCollision: (id: string, options?: RunCollisionRequest) =>
    request<{ result: CollisionResult; metrics: MetricsSnapshot }>(`/collision/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    }),
  getResult: (id: string) => request<{ result: CollisionResult }>(`/collision/${id}/result`),
  exportPlaylist: (collisionId: string, name?: string) =>
    request<ExportPlaylistResponse>('/playlist/export', {
      method: 'POST',
      body: JSON.stringify({ collisionId, name }),
    }),
  regeneratePlaylist: (collisionId: string) =>
    request<RegeneratePlaylistResponse>(`/collision/${collisionId}/regenerate-playlist`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getGhostProfiles: () => request<GhostProfilesResponse>('/sandbox/ghosts'),
  runSandboxCollision: (body: SandboxCollisionRequest) =>
    request<SandboxCollisionResponse>('/sandbox/collision', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getCollisionHistory: () => request<CollisionHistoryResponse>('/collision/history'),
  getCollisionSnapshot: (id: string) =>
    request<CollisionHistoryDetailResponse>(`/collision/history/${id}`),
  rerunCollision: (id: string, body?: RerunCollisionRequest) =>
    request<RerunCollisionResponse>(`/collision/history/${id}/rerun`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  deleteCollisionHistory: (id: string, completedAt: string) =>
    request<{ ok: boolean }>(`/collision/history/${id}?completedAt=${encodeURIComponent(completedAt)}`, {
      method: 'DELETE',
    }),
  clearCollisionHistory: () =>
    request<{ ok: boolean; cleared: number }>('/collision/history', {
      method: 'DELETE',
    }),
};
