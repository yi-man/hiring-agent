import {
  appendRunEvent,
  createRun,
  getRun,
  markRunStatus,
  setRunApprovalToken,
  upsertRun,
} from '@/lib/chat/patterns/run-store';

describe('run-store', () => {
  it('creates and updates a run lifecycle', () => {
    const run = createRun({
      runId: 'run-store-1',
      conversationId: 'conv-1',
      patternId: 'tool_calling',
    });
    expect(run.status).toBe('running');
    expect(getRun('run-store-1')?.conversationId).toBe('conv-1');

    appendRunEvent('run-store-1', {
      type: 'run_start',
      runId: 'run-store-1',
      patternId: 'tool_calling',
      startedAt: new Date().toISOString(),
      seq: 0,
    });
    markRunStatus('run-store-1', 'paused_for_approval');
    setRunApprovalToken('run-store-1', 'token-1');
    const updated = getRun('run-store-1');
    expect(updated?.events).toHaveLength(1);
    expect(updated?.status).toBe('paused_for_approval');
    expect(updated?.pendingApprovalToken).toBe('token-1');
  });

  it('upserts a run record', () => {
    const stored = upsertRun({
      runId: 'run-store-2',
      conversationId: 'conv-2',
      patternId: 'basic_streaming_chat',
      status: 'completed',
      events: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(stored.status).toBe('completed');
    expect(getRun('run-store-2')?.patternId).toBe('basic_streaming_chat');
  });
});
