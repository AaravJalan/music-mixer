import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { listGhostProfiles, ghostGenresToStats } from "../src/services/ghosts";

// The script can be run with SST passing the resource bindings:
// npx sst shell -- npx tsx scripts/seed-ghosts.ts
// Or we can just import from Resource
import { Resource } from "sst";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

async function seedGhosts() {
  const ghosts = listGhostProfiles();
  console.log(`Found ${ghosts.length} ghost profiles.`);

  const tableName = (Resource as any).ListeningHabits.name;
  if (!tableName) throw new Error("ListeningHabits table name not found in Resource binding.");

  for (const ghost of ghosts) {
    console.log(`Seeding data for ${ghost.displayName} (${ghost.id})...`);
    
    const stats = ghostGenresToStats(ghost.genres || []);
    const genrePercentages: Record<string, number> = {};
    for (const s of stats) {
      genrePercentages[s.genre] = s.percentage;
    }

    // Create 5 historical snapshots for the last 15 days (every 3 days)
    for (let i = 0; i < 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 3));
      
      // Slight randomization of percentages to make the graph look alive
      const randomShift = (Math.random() - 0.5) * 5; 
      const shiftedPercentages = { ...genrePercentages };
      if (stats.length > 0) {
        shiftedPercentages[stats[0].genre] = Math.max(0, shiftedPercentages[stats[0].genre] + randomShift);
      }

      const snapshot = {
        userId: ghost.id,
        date: date.toISOString().split("T")[0],
        totalListeningTimeMs: 14 * 3600 * 1000 + (Math.random() * 5 * 3600 * 1000), // ~14-19 hours per snapshot
        topGenres: ghost.genres?.slice(0, 5) || [],
        genrePercentages: shiftedPercentages,
        topTracks: ghost.tracks?.slice(0, 5).map(t => t.id) || []
      };

      await docClient.send(new PutCommand({
        TableName: tableName,
        Item: snapshot,
      }));
    }
    console.log(`✅ Seeded ${ghost.id}`);
  }
}

seedGhosts().catch(console.error);
