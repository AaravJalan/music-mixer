import type { Friend, UserProfile } from '@music-mixer/shared';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { ghostToUserProfile, isGhostUserId, listGhostProfiles } from './ghosts';

import { PutCommand, QueryCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getFriendsTableName } from './db';
import { redis } from './redis/client';

interface FriendInvite {
  fromUserId: string;
  fromUser: UserProfile;
  createdAt: number;
}

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const inviteKey = (code: string) => `friend_invite:${code}`;

export async function createFriendInvite(fromUser: UserProfile): Promise<{ code: string; inviteUrl: string }> {
  const code = uuidv4().slice(0, 8);
  const invite: FriendInvite = {
    fromUserId: fromUser.id,
    fromUser,
    createdAt: Date.now(),
  };
  await redis.set(inviteKey(code), JSON.stringify(invite), { ex: INVITE_TTL_SECONDS });
  return {
    code,
    inviteUrl: `${env.frontendUrl}/friends/add/${code}`,
  };
}

export async function acceptFriendInvite(code: string, user: UserProfile): Promise<UserProfile | null> {
  const raw = await redis.getdel<string>(inviteKey(code));
  if (!raw) return null;
  let invite: FriendInvite;
  try {
    invite = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  
  if (invite.fromUserId === user.id) return null;

  const now = new Date().toISOString();
  await Promise.all([
    docClient.send(new PutCommand({
      TableName: getFriendsTableName(),
      Item: { userId: invite.fromUserId, friendId: user.id, addedAt: now },
    })),
    docClient.send(new PutCommand({
      TableName: getFriendsTableName(),
      Item: { userId: user.id, friendId: invite.fromUserId, addedAt: now },
    })),
  ]);
  
  return invite.fromUser;
}

export async function getFriends(userId: string): Promise<{ userId: string; addedAt: string }[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getFriendsTableName(),
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    })
  );
  return (result.Items ?? []).map(item => ({
    userId: item.friendId,
    addedAt: item.addedAt || new Date().toISOString(),
  }));
}

export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getFriendsTableName(),
      Key: { userId: userA, friendId: userB },
    })
  );
  return !!result.Item;
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await Promise.all([
    docClient.send(new DeleteCommand({
      TableName: getFriendsTableName(),
      Key: { userId, friendId },
    })),
    docClient.send(new DeleteCommand({
      TableName: getFriendsTableName(),
      Key: { userId: friendId, friendId: userId },
    })),
  ]);
}

export async function getDefaultGhostFriends(): Promise<Friend[]> {
  const ghosts = await listGhostProfiles();
  return ghosts.map((ghost) => ({
    user: ghostToUserProfile(ghost),
    addedAt: '1970-01-01T00:00:00.000Z',
    isGhost: true,
  }));
}

export async function resolveFriendProfile(userId: string): Promise<UserProfile | null> {
  if (!isGhostUserId(userId)) return null;
  const ghosts = await listGhostProfiles();
  const ghost = ghosts.find((g) => g.id === userId);
  return ghost ? ghostToUserProfile(ghost) : null;
}
