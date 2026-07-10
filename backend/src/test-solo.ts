import { createSoloCollision } from './collision/store';
import { runCollisionEngine } from './collision/engine';

async function main() {
  const user = { id: 'test-user', displayName: 'Test', avatarUrl: '', platform: 'spotify' as const };
  const collision = await createSoloCollision(user, 'test-session', 'http://localhost', {});
  console.log('Created collision:', collision.id);
  
  try {
    const res = await runCollisionEngine({
      sessionIdA: 'test-session',
      sessionIdB: 'test-session',
      userA: user,
      userB: collision.userB!,
      config: collision.config,
      soloMode: true,
    });
    console.log('Success:', res.collisionId);
  } catch (e: any) {
    console.error('Error running collision:', e);
  }
}

main().catch(console.error);
