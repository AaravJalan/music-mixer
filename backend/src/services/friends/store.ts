import type { UserProfile } from '@music-mixer/shared';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../../config/env';

interface FriendInvite {
  fromUserId: string;
  fromUser: UserProfile;
  createdAt: number;
}

const friends = new Map<string, Set<string>>();
const friendInvites = new Map<string, FriendInvite>();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function ensureFriendSet(userId: string): Set<string> {
  let set = friends.get(userId);
  if (!set) {
    set = new Set();
    friends.set(userId, set);
  }
  return set;
}

export function createFriendInvite(fromUser: UserProfile): { code: string; inviteUrl: string } {
  const code = uuidv4().slice(0, 8);
  friendInvites.set(code, {
    fromUserId: fromUser.id,
    fromUser,
    createdAt: Date.now(),
  });
  return {
    code,
    inviteUrl: `${env.frontendUrl}/friends/add/${code}`,
  };
}

export function acceptFriendInvite(code: string, user: UserProfile): UserProfile | null {
  const invite = friendInvites.get(code);
  if (!invite) return null;
  if (Date.now() - invite.createdAt > INVITE_TTL_MS) {
    friendInvites.delete(code);
    return null;
  }
  if (invite.fromUserId === user.id) return null;

  ensureFriendSet(invite.fromUserId).add(user.id);
  ensureFriendSet(user.id).add(invite.fromUserId);
  friendInvites.delete(code);
  return invite.fromUser;
}

export function getFriends(userId: string): { userId: string; addedAt: string }[] {
  const set = friends.get(userId);
  if (!set) return [];
  return [...set].map((id) => ({ userId: id, addedAt: new Date().toISOString() }));
}

export function areFriends(userA: string, userB: string): boolean {
  return friends.get(userA)?.has(userB) ?? false;
}

export function removeFriend(userId: string, friendId: string): void {
  friends.get(userId)?.delete(friendId);
  friends.get(friendId)?.delete(userId);
}
