import type { BrowserCommand, BrowserCommandResult } from '@/lib/browser/types';

export type BrowserAutomationConnection = {
  sendCommand(command: BrowserCommand, timeoutMs?: number): Promise<BrowserCommandResult>;
  close(): void | Promise<void>;
};

export class BrowserAutomationConnectionRegistry {
  private readonly connections = new Map<string, BrowserAutomationConnection>();

  register(userId: string, connection: BrowserAutomationConnection): () => void {
    const previous = this.connections.get(userId);
    if (previous && previous !== connection) {
      void previous.close();
    }

    this.connections.set(userId, connection);

    return () => {
      if (this.connections.get(userId) === connection) {
        this.connections.delete(userId);
      }
    };
  }

  get(userId: string): BrowserAutomationConnection | undefined {
    return this.connections.get(userId);
  }

  async sendCommand(
    userId: string,
    command: BrowserCommand,
    timeoutMs?: number,
  ): Promise<BrowserCommandResult> {
    const connection = this.connections.get(userId);
    if (!connection) {
      return {
        commandId: command.id,
        success: false,
        error: 'browser_extension_not_connected',
      };
    }

    return connection.sendCommand(command, timeoutMs);
  }
}

export const browserAutomationConnectionRegistry = new BrowserAutomationConnectionRegistry();
