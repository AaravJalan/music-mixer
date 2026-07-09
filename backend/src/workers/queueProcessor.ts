import { SQSEvent } from "aws-lambda";
import { saveListeningHabitSnapshot, TrendSnapshot } from "../services/db";

/**
 * Worker Lambda that processes incoming SQS messages for background writes.
 * This ensures the frontend doesn't have to wait for DynamoDB.
 */
export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    try {
      const payload = JSON.parse(record.body) as TrendSnapshot;
      if (payload.userId && payload.date) {
        await saveListeningHabitSnapshot(payload);
        console.log(`Saved background snapshot for user ${payload.userId}`);
      }
    } catch (err) {
      console.error("Failed to process queue message:", err);
    }
  }
}
