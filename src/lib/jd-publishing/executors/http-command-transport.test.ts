import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { HttpBrowserCommandTransport } from './http-command-transport';
import type { BrowserCommand } from '@/lib/jd-publishing/types';

async function withCommandServer(
  handler: (command: BrowserCommand) => Record<string, unknown>,
  run: (endpoint: string, received: BrowserCommand[]) => Promise<void>,
): Promise<void> {
  const received: BrowserCommand[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const command = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BrowserCommand;
      received.push(command);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(handler(command)));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}/browser-command`, received);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('HttpBrowserCommandTransport', () => {
  it('posts browser commands to a configured endpoint and returns command results', async () => {
    await withCommandServer(
      (command) => ({
        commandId: command.id,
        success: true,
        match: command.target
          ? {
              target: command.target,
              status: 'unique',
              strategy: 'role_name',
              candidateCount: 1,
              confidence: 0.95,
              candidates: [],
            }
          : undefined,
      }),
      async (endpoint, received) => {
        const transport = new HttpBrowserCommandTransport({ endpoint });
        const command: BrowserCommand = {
          id: 'cmd-1',
          taskId: 'task-1',
          stepId: 'fill_title',
          action: 'fill',
          target: { kind: 'field', role: 'textbox', name: '职位名称', exact: true },
          params: { value: '高级前端工程师' },
          timeoutMs: 5_000,
        };

        await expect(transport.send(command)).resolves.toEqual(
          expect.objectContaining({
            commandId: 'cmd-1',
            success: true,
            match: expect.objectContaining({
              status: 'unique',
              target: command.target,
            }),
          }),
        );
        expect(received).toEqual([command]);
      },
    );
  });

  it('rejects invalid command result envelopes', async () => {
    await withCommandServer(
      () => ({ ok: true }),
      async (endpoint) => {
        const transport = new HttpBrowserCommandTransport({ endpoint });

        await expect(
          transport.send({
            id: 'cmd-1',
            taskId: 'task-1',
            stepId: 'fill_title',
            action: 'fill',
            params: {},
            timeoutMs: 5_000,
          }),
        ).rejects.toThrow(/invalid browser command result/);
      },
    );
  });
});
