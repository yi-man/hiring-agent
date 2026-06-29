import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type {
  BrowserCommand,
  BrowserCommandResult,
  BrowserCommandTransport,
} from '@/lib/jd-publishing/types';

type FetchLike = typeof fetch;

const DEFAULT_TIMEOUT_MS = 30_000;

function isBrowserCommandResult(value: unknown): value is BrowserCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.commandId === 'string' && typeof record.success === 'boolean';
}

function postJsonWithNode(params: {
  endpoint: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<{ ok: boolean; status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(params.endpoint);
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const clientRequest = request(
      url,
      {
        method: 'POST',
        headers: {
          ...params.headers,
          'content-length': Buffer.byteLength(params.body).toString(),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({
              ok: Boolean(
                response.statusCode && response.statusCode >= 200 && response.statusCode < 300,
              ),
              status: response.statusCode ?? 0,
              json: JSON.parse(body),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    clientRequest.setTimeout(params.timeoutMs, () => {
      clientRequest.destroy(
        new Error(`browser command endpoint timed out after ${params.timeoutMs}ms`),
      );
    });
    clientRequest.on('error', reject);
    clientRequest.write(params.body);
    clientRequest.end();
  });
}

export class HttpBrowserCommandTransport implements BrowserCommandTransport {
  constructor(
    private readonly options: {
      endpoint: string;
      timeoutMs?: number;
      headers?: Record<string, string>;
      fetchImpl?: FetchLike;
    },
  ) {
    if (!options.endpoint.trim()) {
      throw new Error('browser command endpoint is required');
    }
  }

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private get fetchImpl(): FetchLike | undefined {
    return this.options.fetchImpl ?? globalThis.fetch;
  }

  async send(command: BrowserCommand): Promise<BrowserCommandResult> {
    const body = JSON.stringify(command);
    const headers = {
      'content-type': 'application/json',
      ...(this.options.headers ?? {}),
    };
    const fetchImpl = this.fetchImpl;
    if (fetchImpl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetchImpl(this.options.endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`browser command endpoint returned HTTP ${response.status}`);
        }
        const result = (await response.json()) as unknown;
        if (!isBrowserCommandResult(result)) {
          throw new Error('invalid browser command result envelope');
        }
        return result;
      } finally {
        clearTimeout(timeout);
      }
    }

    const response = await postJsonWithNode({
      endpoint: this.options.endpoint,
      body,
      headers,
      timeoutMs: this.timeoutMs,
    });
    if (!response.ok) {
      throw new Error(`browser command endpoint returned HTTP ${response.status}`);
    }
    if (!isBrowserCommandResult(response.json)) {
      throw new Error('invalid browser command result envelope');
    }
    return response.json;
  }
}
