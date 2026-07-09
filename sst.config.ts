/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "music-mixer",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // 1. Define the DynamoDB table for Listening Habits (Daily Snapshots)
    const listeningHabitsTable = new sst.aws.Dynamo("ListeningHabits", {
      fields: {
        userId: "string",
        date: "string", // Format: YYYY-MM-DD
      },
      primaryIndex: { hashKey: "userId", rangeKey: "date" },
    });

    // 2. Define an SQS Queue for non-blocking real-time writes
    const habitsQueue = new sst.aws.Queue("HabitsQueue");

    // 3. Define the main Express API Lambda
    const backendApi = new sst.aws.Function("MusicMixerBackend", {
      url: true, // Generate a public API endpoint
      handler: "backend/dist/lambda.handler",
      link: [listeningHabitsTable, habitsQueue],
      environment: {
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",
        FRONTEND_URL: process.env.FRONTEND_URL || "",
        SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
        SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",
        SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || "",
      },
    });

    // 4. Attach a background worker Lambda to process SQS events asynchronously
    habitsQueue.subscribe({
      handler: "backend/src/workers/queueProcessor.handler",
      link: [listeningHabitsTable],
    });

    // 5. Define a Cron Job to fetch and store trends every 3 days
    new sst.aws.Cron("TrendHabitsSnapshot", {
      schedule: "rate(3 days)", // Run every 3 days
      job: {
        handler: "backend/src/workers/trendSnapshot.handler",
        link: [listeningHabitsTable],
        environment: {
          UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
          UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",
          SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
          SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",
          SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || "",
        }
      }
    });

    return {
      apiEndpoint: backendApi.url,
    };
  },
});
