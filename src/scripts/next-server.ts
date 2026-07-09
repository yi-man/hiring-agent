import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import next from 'next';
import { authenticateSessionToken } from '@/lib/auth/session-token';
import {
  BROWSER_AUTOMATION_COMMAND_PATH,
  BROWSER_AUTOMATION_SOCKET_PATH,
  BrowserAutomationWebSocketServer,
} from '@/lib/browser/executors/websocket-command-server';

function readArg(names: string[]): string | undefined {
  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    for (const name of names) {
      if (arg === name) return process.argv[index + 1];
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const dev = process.argv.includes('--dev') || process.env.NODE_ENV !== 'production';
const port = readPositiveInteger(readArg(['--port', '-p']) ?? process.env.PORT, 3000, 'PORT');
const hostname = readArg(['--hostname', '-H']) ?? process.env.HOSTNAME ?? process.env.HOST;
const displayHost = hostname || 'localhost';
const internalCommandToken =
  process.env.BROWSER_AUTOMATION_INTERNAL_TOKEN?.trim() || randomBytes(32).toString('hex');
const internalCommandEndpoint =
  process.env.BROWSER_AUTOMATION_INTERNAL_ENDPOINT?.trim() ||
  `http://127.0.0.1:${port}${BROWSER_AUTOMATION_COMMAND_PATH}`;

process.env.BROWSER_AUTOMATION_INTERNAL_TOKEN = internalCommandToken;
process.env.BROWSER_AUTOMATION_INTERNAL_ENDPOINT = internalCommandEndpoint;

const app = next({
  dev,
  dir: process.cwd(),
  hostname,
  port,
  turbopack: dev,
});
const handle = app.getRequestHandler();
const browserAutomationServer = new BrowserAutomationWebSocketServer({
  authenticateSessionToken,
  internalCommandToken,
});

await app.prepare();

const upgradeHandler = app.getUpgradeHandler();

const server = createServer((request, response) => {
  if (browserAutomationServer.handleRequest(request, response)) {
    return;
  }

  handle(request, response).catch((error) => {
    console.error('Next request handler failed', error);
    if (!response.headersSent) {
      response.statusCode = 500;
    }
    response.end('Internal Server Error');
  });
});

server.on('upgrade', (request, socket, head) => {
  if (browserAutomationServer.handleUpgrade(request, socket, head)) {
    return;
  }

  void upgradeHandler(request, socket, head);
});

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, hostname, () => {
    server.off('error', reject);
    resolve();
  });
});

console.log(`Hiring Agent ready at http://${displayHost}:${port}`);
console.log(
  `Browser automation WebSocket ready at ws://${displayHost}:${port}${BROWSER_AUTOMATION_SOCKET_PATH}`,
);

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, closing Hiring Agent server...`);
  await browserAutomationServer.close();
  await app.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
