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

    // 2. Define the DynamoDB table for Friends (Permanent Relationships)
    const friendsTable = new sst.aws.Dynamo("Friends", {
      fields: {
        userId: "string",
        friendId: "string",
      },
      primaryIndex: { hashKey: "userId", rangeKey: "friendId" },
    });

    // 3. Define an SQS Queue for non-blocking real-time writes
    const habitsQueue = new sst.aws.Queue("HabitsQueue");

    // 4. Define the main Express API Lambda
    const backendApi = new sst.aws.Function("MusicMixerBackend", {
      url: true, // Generate a public API endpoint
      handler: "backend/dist/lambda.handler",
      link: [listeningHabitsTable, friendsTable, habitsQueue],
      environment: {
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",
        FRONTEND_URL: process.env.FRONTEND_URL || "",
        SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
        SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",
        SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || "",
        LISTENING_HABITS_TABLE: listeningHabitsTable.name,
        FRIENDS_TABLE: friendsTable.name,
        LASTFM_API_KEY: process.env.LASTFM_API_KEY || "",
      },
    });

    // 5. Attach a background worker Lambda to process SQS events asynchronously
    habitsQueue.subscribe({
      handler: "backend/src/workers/queueProcessor.handler",
      link: [listeningHabitsTable],
      environment: {
        LISTENING_HABITS_TABLE: listeningHabitsTable.name,
      },
    });

    // 6. Define a Cron Job to fetch and store trends every 1 day
    new sst.aws.Cron("TrendHabitsSnapshot", {
      schedule: "rate(1 day)", // Run every 1 day
      job: {
        handler: "backend/src/workers/trendSnapshot.handler",
        link: [listeningHabitsTable],
        environment: {
          UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "",
          UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "",
          SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || "",
          SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || "",
          SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || "",
          LISTENING_HABITS_TABLE: listeningHabitsTable.name,
          LASTFM_API_KEY: process.env.LASTFM_API_KEY || "",
        }
      }
    });


    return {
      apiEndpoint: backendApi.url,
    };
  },
});
