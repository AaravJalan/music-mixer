import { config } from 'dotenv';
config();
import { createSoloCollision, getCollision } from './collision/store';
import { runCollisionEngine } from './collision/engine';

async function main() {
  const user = { id: 'test-user', displayName: 'Test', avatarUrl: '', platform: 'spotify' as const };
  const session = await createSoloCollision(user, 'test-session', 'http://localhost', {});
  const stored = await getCollision(session.id);
  if (!stored) throw new Error("not found");
  
  console.log("Created collision:", session.id);
  
  try {
    // Mock profileToParticipant to avoid spotify network calls
    const engine = require('./collision/engine');
    engine.profileToParticipant = async (sessionId: string, u: any, weight: number, timeRange: string) => {
      console.log(`Called profileToParticipant for ${u.id} with ${timeRange}`);
      return {
        user: u,
        weight,
        vector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        genres: [{ genre: 'pop', percentage: 100 }],
        tracks: [
          { id: '1', name: 'Song A', artist: 'Artist A' },
          { id: '2', name: 'Song B', artist: 'Artist B' },
          { id: '3', name: 'Song C', artist: 'Artist C' }
        ],
        artists: [{ id: '1', name: 'Artist A' }],
        timeRange,
        totalTracks: 3
      };
    };

    const res = await engine.runCollisionEngine({
      sessionIdA: stored.userASessionId,
      sessionIdB: stored.userBSessionId!,
      userA: stored.session.userA,
      userB: stored.session.userB,
      config: stored.config,
      soloMode: stored.config.mode === 'solo',
    });
    console.log("Success! Participants:", res.participants.map((p: any) => p.user.id));
  } catch (e: any) {
    console.error("Error:", e);
  }
}

main().catch(console.error);
