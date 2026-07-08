import { ChromeExtensionBridgeServer } from '@/lib/browser/executors/chrome-extension-bridge';

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const host =
  process.env.BROWSER_CHROME_BRIDGE_HOST?.trim() ||
  process.env.JD_PUBLISHING_CHROME_BRIDGE_HOST?.trim() ||
  '127.0.0.1';
const port = readPositiveInteger(
  process.env.BROWSER_CHROME_BRIDGE_PORT ?? process.env.JD_PUBLISHING_CHROME_BRIDGE_PORT,
  4100,
  'BROWSER_CHROME_BRIDGE_PORT',
);
const commandTimeoutMs = readPositiveInteger(
  process.env.BROWSER_CHROME_BRIDGE_COMMAND_TIMEOUT_MS ??
    process.env.JD_PUBLISHING_CHROME_BRIDGE_COMMAND_TIMEOUT_MS,
  30_000,
  'BROWSER_CHROME_BRIDGE_COMMAND_TIMEOUT_MS',
);
const pollTimeoutMs = readPositiveInteger(
  process.env.BROWSER_CHROME_BRIDGE_POLL_TIMEOUT_MS ??
    process.env.JD_PUBLISHING_CHROME_BRIDGE_POLL_TIMEOUT_MS,
  25_000,
  'BROWSER_CHROME_BRIDGE_POLL_TIMEOUT_MS',
);

const bridge = new ChromeExtensionBridgeServer({
  host,
  port,
  commandTimeoutMs,
  pollTimeoutMs,
});

await bridge.listen();

console.log('Browser automation Chrome extension bridge is running');
console.log(`Command endpoint: ${bridge.commandEndpoint}`);
console.log(`Extension next:   ${bridge.nextCommandEndpoint}`);
console.log(`Extension result: ${bridge.resultEndpoint}`);
console.log('');
console.log('Set this in the app environment:');
console.log(`BROWSER_EXECUTOR=http-command`);
console.log(`BROWSER_COMMAND_ENDPOINT=${bridge.commandEndpoint}`);

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, closing bridge...`);
  await bridge.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
