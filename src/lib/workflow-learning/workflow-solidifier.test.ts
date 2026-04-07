import {
  buildSolidifyPrompt,
  extractEventLines,
} from '@/lib/workflow-learning/workflow-solidifier';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';

describe('workflow-solidifier helpers', () => {
  it('extracts meaningful lines from workflow events', () => {
    const events: WorkflowSseEvent[] = [
      { type: 'run_start', runId: 'r1', timestamp: new Date().toISOString() },
      {
        type: 'tool_call_start',
        runId: 'r1',
        timestamp: new Date().toISOString(),
        toolCallId: 't1',
        toolName: 'browser_snapshot',
        argsPreview: '{"url":"http://127.0.0.1:3100/api/health"}',
      },
      {
        type: 'tool_call_result',
        runId: 'r1',
        timestamp: new Date().toISOString(),
        toolCallId: 't1',
        ok: true,
        resultPreview: '{"ok":true}',
      },
      {
        type: 'assistant_final',
        runId: 'r1',
        timestamp: new Date().toISOString(),
        text: 'ok is present',
      },
      { type: 'run_end', runId: 'r1', timestamp: new Date().toISOString() },
    ];

    const lines = extractEventLines(events);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringContaining('browser_snapshot'),
        expect.stringContaining('ok=true'),
        expect.stringContaining('assistant_final'),
      ]),
    );
  });

  it('builds prompt containing goal and events', () => {
    const prompt = buildSolidifyPrompt('检查健康接口', ['[start] browser_snapshot']);
    expect(prompt).toContain('检查健康接口');
    expect(prompt).toContain('[start] browser_snapshot');
    expect(prompt).toContain('Workflow JSON');
  });
});
