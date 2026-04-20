import { runPattern } from '@/lib/chat/patterns/pattern-runner';
import { CHAT_PATTERN_IDS } from '@/lib/chat/patterns/types';

async function collectEvents(patternId: (typeof CHAT_PATTERN_IDS)[number], approvalToken?: string) {
  const events: Array<Record<string, unknown>> = [];
  for await (const event of runPattern({
    runId: 'run-test',
    patternId,
    userInput: 'hello fail',
    approvalToken,
  })) {
    events.push(event as Record<string, unknown>);
  }
  return events;
}

describe('pattern-runner', () => {
  it('emits start and end for non-error patterns', async () => {
    const nonErrorPatterns = CHAT_PATTERN_IDS.filter((id) => id !== 'human_approval_gate');
    for (const patternId of nonErrorPatterns) {
      const events = await collectEvents(patternId, 'approved-token');
      expect(events[0]?.type).toBe('run_start');
      if (patternId === 'error_recovery_retry') {
        expect(events.some((event) => event.type === 'error')).toBe(true);
      } else {
        expect(events.some((event) => event.type === 'run_end')).toBe(true);
      }
    }
  });

  it('requests approval when token is missing', async () => {
    const events = await collectEvents('human_approval_gate');
    expect(events.some((event) => event.type === 'approval_required')).toBe(true);
    expect(events.some((event) => event.type === 'run_end')).toBe(false);
  });

  it('continues human approval flow with token', async () => {
    const events = await collectEvents('human_approval_gate', 'approved-token');
    expect(events.some((event) => event.type === 'approval_resolved')).toBe(true);
    expect(events.some((event) => event.type === 'assistant_final')).toBe(true);
  });
});
