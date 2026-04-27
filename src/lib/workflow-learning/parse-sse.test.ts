import { WorkflowSseBuffer } from './parse-sse';
import { isWorkflowSseEvent } from './types';

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('WorkflowSseBuffer', () => {
  it('parses two SSE data frames', () => {
    const buf = new WorkflowSseBuffer();
    const chunk =
      'data: {"type":"run_start","runId":"r1","timestamp":"2026-01-01T00:00:00.000Z"}\n\n' +
      'data: {"type":"run_end","runId":"r1","timestamp":"2026-01-01T00:00:01.000Z"}\n\n';
    const events = buf.push(encode(chunk));
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('run_start');
    expect(events[1].type).toBe('run_end');
  });

  it('handles split chunks', () => {
    const buf = new WorkflowSseBuffer();
    const full =
      'data: {"type":"run_start","runId":"r1","timestamp":"t"}\n\n' +
      'data: {"type":"run_end","runId":"r1","timestamp":"t2"}\n\n';
    const mid = Math.floor(full.length / 2);
    const a = full.slice(0, mid);
    const b = full.slice(mid);
    const e1 = buf.push(encode(a));
    expect(e1).toHaveLength(0);
    const e2 = buf.push(encode(b));
    expect(e2.length).toBeGreaterThanOrEqual(1);
  });

  it('parses login and workflow DSL artifact events', () => {
    const buf = new WorkflowSseBuffer();
    const chunk =
      'data: {"type":"awaiting_login","runId":"r1","timestamp":"t","sessionId":"s1","loginUrl":"https://example.com/login","message":"Please login"}\n\n' +
      'data: {"type":"login_verified","runId":"r1","timestamp":"t","sessionId":"s1"}\n\n' +
      'data: {"type":"workflow_dsl","runId":"r1","timestamp":"t","workflow":{"schemaVersion":"1.0","metadata":{"name":"Read first message","description":"Read the first message","domain":"recruiting"},"steps":[{"id":"open","type":"browser_action","action":"navigate","target":{"url":"https://example.com"}}]}}\n\n' +
      'data: {"type":"dsl_validation_result","runId":"r1","timestamp":"t","ok":true}\n\n';

    const events = buf.push(encode(chunk));

    expect(events.map((event) => event.type)).toEqual([
      'awaiting_login',
      'login_verified',
      'workflow_dsl',
      'dsl_validation_result',
    ]);
  });

  it('rejects malformed structured workflow events', () => {
    expect(
      isWorkflowSseEvent({
        type: 'awaiting_login',
        runId: 'r1',
        timestamp: 't',
        loginUrl: 'https://example.com/login',
      }),
    ).toBe(false);
  });
});
