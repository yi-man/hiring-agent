import type {
  BrowserCommand,
  BrowserCommandResult,
  BrowserCommandTransport,
} from '@/lib/browser/types';
import type { BrowserAutomationConnectionRegistry } from './websocket-command-registry';

export type WebSocketBrowserCommandTransportOptions = {
  userId: string;
  registry?: BrowserAutomationConnectionRegistry;
  endpoint?: string;
  internalCommandToken?: string;
  timeoutMs?: number;
};

export class WebSocketBrowserCommandTransport implements BrowserCommandTransport {
  private readonly registry: BrowserAutomationConnectionRegistry | undefined;

  constructor(private readonly options: WebSocketBrowserCommandTransportOptions) {
    this.registry = options.registry;
  }

  async send(command: BrowserCommand): Promise<BrowserCommandResult> {
    const timeoutMs = this.options.timeoutMs ?? command.timeoutMs;
    if (this.registry) {
      return this.registry.sendCommand(this.options.userId, command, timeoutMs);
    }

    const endpoint =
      this.options.endpoint ?? process.env.BROWSER_AUTOMATION_INTERNAL_ENDPOINT?.trim();
    if (!endpoint) {
      return {
        commandId: command.id,
        success: false,
        error: 'browser_automation_internal_endpoint_not_configured',
      };
    }

    const internalCommandToken =
      this.options.internalCommandToken ??
      process.env.BROWSER_AUTOMATION_INTERNAL_TOKEN?.trim() ??
      '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-browser-automation-internal-token': internalCommandToken,
        },
        body: JSON.stringify({
          userId: this.options.userId,
          command,
          timeoutMs,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          commandId: command.id,
          success: false,
          error: `browser_automation_internal_command_http_${response.status}`,
        };
      }
      const result = (await response.json()) as unknown;
      if (isBrowserCommandResult(result)) {
        return result;
      }
      return {
        commandId: command.id,
        success: false,
        error: 'browser_automation_internal_command_invalid_result',
      };
    } catch (error) {
      return {
        commandId: command.id,
        success: false,
        error:
          error instanceof Error && error.name === 'AbortError'
            ? 'browser_automation_internal_command_timeout'
            : error instanceof Error
              ? error.message
              : 'browser_automation_internal_command_failed',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isBrowserCommandResult(value: unknown): value is BrowserCommandResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.commandId === 'string' && typeof record.success === 'boolean';
}
