import { WorkflowSseBuffer } from './parse-sse';

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
});
