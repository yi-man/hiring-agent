import {
  type WorkflowSessionRecord,
  type WorkflowTraceEntry,
  WorkflowSessionStore,
} from './workflow-session-store';

describe('WorkflowSessionStore', () => {
  it('stores and resumes pending tasks by session id', () => {
    const store = new WorkflowSessionStore();

    store.setPendingTask('s1', 'boss_read_first_message');

    expect(store.get('s1')).toMatchObject({
      pendingTask: 'boss_read_first_message',
      loginStatus: 'unknown',
    });
  });

  it('records successful traces and clears pending tasks', () => {
    const store = new WorkflowSessionStore();
    store.setPendingTask('s1', 'boss_open_home');
    store.recordSuccess('s1', {
      task: 'boss_open_home',
      trace: [{ step: 'open', result: 'ok' }],
      outputs: { page: 'home' },
    });

    expect(store.get('s1')).toMatchObject({
      pendingTask: undefined,
      lastSuccessfulTrace: [{ step: 'open', result: 'ok' }],
      outputs: { page: 'home' },
      loginStatus: 'logged_in',
    });
  });

  it('keeps records isolated by session id', () => {
    const store = new WorkflowSessionStore();

    store.setPendingTask('s1', 'boss_open_home');
    store.setPendingTask('s2', 'boss_read_first_message');

    expect(store.get('s1')).toMatchObject({
      pendingTask: 'boss_open_home',
      loginStatus: 'unknown',
    });
    expect(store.get('s2')).toMatchObject({
      pendingTask: 'boss_read_first_message',
      loginStatus: 'unknown',
    });
  });

  it('does not let get snapshots mutate stored records', () => {
    const store = new WorkflowSessionStore();
    store.setPendingTask('s1', 'boss_read_first_message');

    const snapshot = store.get('s1') as WorkflowSessionRecord;
    snapshot.pendingTask = 'boss_open_home';
    snapshot.outputs.page = 'mutated';
    snapshot.lastSuccessfulTrace.push({ step: 'mutate', result: 'bad' });

    expect(store.get('s1')).toMatchObject({
      pendingTask: 'boss_read_first_message',
      outputs: {},
      lastSuccessfulTrace: [],
    });
  });

  it('does not let recordSuccess inputs mutate stored records', () => {
    const store = new WorkflowSessionStore();
    const trace: WorkflowTraceEntry[] = [{ step: 'open', result: 'ok' }];
    const outputs = { page: 'home' };

    store.recordSuccess('s1', {
      task: 'boss_open_home',
      trace,
      outputs,
    });
    trace[0].result = 'mutated';
    trace.push({ step: 'extra', result: 'bad' });
    outputs.page = 'mutated';

    expect(store.get('s1')).toMatchObject({
      lastSuccessfulTrace: [{ step: 'open', result: 'ok' }],
      outputs: { page: 'home' },
    });
  });

  it('does not let nested recordSuccess result inputs mutate stored records', () => {
    const store = new WorkflowSessionStore();
    const trace: WorkflowTraceEntry[] = [{ step: 'x', result: { nested: { value: 'before' } } }];

    store.recordSuccess('s1', {
      task: 'boss_open_home',
      trace,
    });
    (trace[0].result as { nested: { value: string } }).nested.value = 'after';

    expect(store.get('s1').lastSuccessfulTrace[0].result).toEqual({
      nested: { value: 'before' },
    });
  });

  it('does not let nested get snapshot results mutate stored records', () => {
    const store = new WorkflowSessionStore();
    store.recordSuccess('s1', {
      task: 'boss_open_home',
      trace: [{ step: 'x', result: { nested: { value: 'before' } } }],
    });

    const result = store.get('s1').lastSuccessfulTrace[0].result as {
      nested: { value: string };
    };
    result.nested.value = 'after';

    expect(store.get('s1').lastSuccessfulTrace[0].result).toEqual({
      nested: { value: 'before' },
    });
  });
});
