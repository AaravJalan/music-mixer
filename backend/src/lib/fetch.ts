import https from 'node:https';
import { URL } from 'node:url';

const RETRYABLE = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND', 'ECONNRESET']);

const REQUEST_TIMEOUT_MS = 20_000;

function errorCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  if ('code' in err) return String((err as { code: string }).code);
  const cause = err.cause;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return String((cause as { code: string }).code);
  }
  return undefined;
}

export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes('ETIMEDOUT') || err.message.includes('fetch failed')) return true;
  const code = errorCode(err);
  return code ? RETRYABLE.has(code) : false;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveBody(body: RequestInit['body']): string | undefined {
  if (!body) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Buffer) return body.toString();
  return undefined;
}

interface HttpsResult {
  status: number;
  body: string;
}

function httpsRequestOnce(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpsResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqHeaders = { ...headers };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: reqHeaders,
        family: 4,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      const err = new Error('ETIMEDOUT');
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

/** IPv4-only HTTPS with retries — used for all Spotify API traffic. */
export async function httpsRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
  attempts = 4,
): Promise<HttpsResult> {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await httpsRequestOnce(url, method, headers, body);
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || i === attempts - 1) throw err;
      await wait(500 * (i + 1));
    }
  }

  throw lastError;
}

/** Drop-in Response-like wrapper for code that expects fetch semantics. */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  attempts = 4,
): Promise<Response> {
  const method = init?.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => { headers[key] = value; });
  }
  const body = resolveBody(init?.body);

  const result = await httpsRequest(url, method, headers, body, attempts);

  return new Response(result.body, {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
