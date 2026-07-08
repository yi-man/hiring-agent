import { CommandTransportBrowserExecutor } from './command-transport-executor';
import type {
  BrowserCommand,
  BrowserCommandResult,
  BrowserCommandTransport,
  LocatorMatchReport,
  TargetDescriptor,
} from '@/lib/browser/types';

class RecordingTransport implements BrowserCommandTransport {
  readonly commands: BrowserCommand[] = [];

  constructor(private readonly resultFor: (command: BrowserCommand) => BrowserCommandResult) {}

  async send(command: BrowserCommand): Promise<BrowserCommandResult> {
    this.commands.push(command);
    return this.resultFor(command);
  }
}

function uniqueReport(target: TargetDescriptor): LocatorMatchReport {
  return {
    target,
    status: 'unique',
    strategy: 'role_name',
    candidateCount: 1,
    confidence: 0.9,
    chosen: {
      tag: target.kind === 'button' ? 'button' : 'input',
      accessibleName: target.name,
      visible: true,
      enabled: true,
      editable: target.kind === 'field',
    },
    candidates: [],
    strategiesTried: ['role_name'],
  };
}

describe('CommandTransportBrowserExecutor', () => {
  it('sends browser commands and normalizes command results', async () => {
    const target: TargetDescriptor = {
      kind: 'field',
      role: 'textbox',
      name: '职位名称',
      exact: true,
    };
    const transport = new RecordingTransport((command) => ({
      commandId: command.id,
      success: true,
      match: command.target ? uniqueReport(command.target) : undefined,
    }));
    const executor = new CommandTransportBrowserExecutor({
      transport,
      taskId: 'task-1',
      stepId: () => 'fill_title',
      idGenerator: () => `cmd-${transport.commands.length + 1}`,
      timeoutMs: 5_000,
    });

    const result = await executor.fill(target, '高级前端工程师');

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        match: expect.objectContaining({ target }),
      }),
    );
    expect(transport.commands).toEqual([
      expect.objectContaining({
        id: 'cmd-1',
        taskId: 'task-1',
        stepId: 'fill_title',
        action: 'fill',
        target,
        params: { value: '高级前端工程师' },
        timeoutMs: 5_000,
      }),
    ]);
  });

  it('supports async resolver and snapshot commands for extension adapters', async () => {
    const target: TargetDescriptor = {
      kind: 'button',
      role: 'button',
      name: '发布职位',
      exact: true,
    };
    const htmlSnapshot = '<article data-candidate-id="candidate-1"></article>';
    const snapshot = {
      url: 'https://boss.example.com/employer/jobs/new',
      title: '发布职位',
      pageState: 'publish_form' as const,
      headings: [],
      forms: [],
      links: [],
      textBlocks: [],
    };
    const transport = new RecordingTransport((command) => {
      if (command.action === 'snapshot') {
        return { commandId: command.id, success: true, htmlSnapshot };
      }
      if (command.action === 'snapshot_structured') {
        return { commandId: command.id, success: true, domSnapshot: snapshot };
      }
      return {
        commandId: command.id,
        success: true,
        match: command.target ? uniqueReport(command.target) : undefined,
      };
    });
    const executor = new CommandTransportBrowserExecutor({
      transport,
      taskId: 'task-1',
      stepId: () => 'submit_job',
    });

    await expect(executor.resolveTarget?.(target, { action: 'click' })).resolves.toEqual(
      expect.objectContaining({ target, status: 'unique' }),
    );
    await expect(executor.snapshot?.()).resolves.toBe(htmlSnapshot);
    await expect(executor.snapshotStructured?.()).resolves.toBe(snapshot);
    expect(transport.commands.map((command) => command.action)).toEqual([
      'resolve_target',
      'snapshot',
      'snapshot_structured',
    ]);
  });

  it('uses command context supplied by the publishing graph', async () => {
    const target: TargetDescriptor = {
      kind: 'field',
      role: 'textbox',
      name: '职位名称',
      exact: true,
    };
    const transport = new RecordingTransport((command) => ({
      commandId: command.id,
      success: true,
      match: command.target ? uniqueReport(command.target) : undefined,
    }));
    const executor = new CommandTransportBrowserExecutor({
      transport,
      idGenerator: () => `cmd-${transport.commands.length + 1}`,
    });

    executor.setCommandContext?.({ taskId: 'task-42', stepId: 'fill_title' });
    await executor.fill(target, '高级前端工程师');

    expect(transport.commands[0]).toEqual(
      expect.objectContaining({
        taskId: 'task-42',
        stepId: 'fill_title',
      }),
    );
  });
});
