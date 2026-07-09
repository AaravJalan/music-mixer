import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

// Initialize the DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export interface TrendSnapshot {
  userId: string;
  date: string;
  totalListeningTimeMs?: number;
  topGenres?: string[];
  genrePercentages?: Record<string, number>;
  topTracks?: string[];
}

export async function saveListeningHabitSnapshot(data: TrendSnapshot) {
  await docClient.send(new PutCommand({
    // We use Resource.ListeningHabits.name which is injected by SST
    TableName: (Resource as any).ListeningHabits.name,
    Item: data,
  }));
}

export async function getListeningTrends(userId: string, limit: number = 30) {
  const result = await docClient.send(new QueryCommand({
    TableName: (Resource as any).ListeningHabits.name,
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: {
      ":uid": userId,
    },
    ScanIndexForward: false, // get newest records first
    Limit: limit,
  }));
  return result.Items as TrendSnapshot[];
}
