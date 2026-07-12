import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export interface TrendSnapshot {
  userId: string;
  date: string;
  /** ISO timestamp when this snapshot was captured (used as the next window start). */
  capturedAt?: string;
  /** Listening ms in the window since the previous snapshot (0 on the first/baseline). */
  totalListeningTimeMs?: number;
  topGenres?: string[];
  genrePercentages?: Record<string, number>;
  topTracks?: string[];
}

/**
 * Resolve DynamoDB table name without requiring SST Resource links.
 * - Production Lambda / sst-linked processes: SST injects LISTENING_HABITS_TABLE
 * - Local `npm run dev`: set LISTENING_HABITS_TABLE in .env to the deployed table name
 * - Fallback: Resource.ListeningHabits when running under `sst dev` / linked Lambda
 */
function getTableName(): string {
  if (process.env.LISTENING_HABITS_TABLE) {
    return process.env.LISTENING_HABITS_TABLE;
  }

  try {
    // Lazy require so plain local Express can boot without SST links.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require('sst') as { Resource: Record<string, { name?: string }> };
    const name = Resource.ListeningHabits?.name;
    if (name) return name;
  } catch {
    // SST Resource unavailable outside sst-linked processes
  }

  throw new Error(
    'ListeningHabits DynamoDB table is not configured. ' +
      'Set LISTENING_HABITS_TABLE in .env (local) or link the table in sst.config.ts (Lambda).',
  );
}

export async function saveListeningHabitSnapshot(data: TrendSnapshot) {
  await docClient.send(
    new PutCommand({
      TableName: getTableName(),
      Item: data,
    }),
  );
}

export async function getListeningTrends(userId: string, limit = 30) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: {
        ':uid': userId,
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items ?? []) as TrendSnapshot[];
}
