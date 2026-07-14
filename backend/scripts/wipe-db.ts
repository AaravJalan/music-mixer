import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

async function main() {
  const client = new DynamoDBClient({});
  const tableName = process.env.LISTENING_HABITS_TABLE;
  
  if (!tableName) {
    console.error('LISTENING_HABITS_TABLE is not set.');
    process.exit(1);
  }

  console.log(`Scanning table ${tableName}...`);
  let lastEvaluatedKey;
  let count = 0;

  do {
    const scanResponse = await client.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: 'userId, #d',
      ExpressionAttributeNames: { '#d': 'date' }
    }));

    const items = scanResponse.Items || [];
    for (const item of items) {
      await client.send(new DeleteItemCommand({
        TableName: tableName,
        Key: {
          userId: item.userId,
          date: item.date
        }
      }));
      count++;
    }

    lastEvaluatedKey = scanResponse.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`Deleted ${count} items from ${tableName}`);
}

main().catch(console.error);
