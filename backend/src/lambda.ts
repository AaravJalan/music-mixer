/**
 * AWS Lambda entry point.
 *
 * `serverless-http` wraps the Express app and translates between AWS API Gateway
 * events (v1/v2) and standard Node.js HTTP IncomingMessage/ServerResponse objects,
 * so Express routing works without any changes.
 *
 * This file is compiled to `dist/lambda.js` and is the handler you specify in
 * your Lambda function configuration:
 *
 *   Handler: dist/lambda.handler
 */
import serverlessHttp from 'serverless-http';
import { createApp } from './app';

const app = createApp();

/**
 * The named export `handler` is what AWS Lambda invokes.
 * serverless-http handles both API Gateway REST (v1) and HTTP API (v2) payloads.
 */
export const handler = serverlessHttp(app, {
  /**
   * Binary media types — pass through image/font/audio bytes unchanged.
   * Add more MIME types here if you serve binary assets from this function.
   */
  binary: ['image/*', 'audio/*', 'font/*', 'application/octet-stream'],
});
