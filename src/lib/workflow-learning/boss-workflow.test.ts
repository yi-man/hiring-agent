import type { WorkflowDsl } from './dsl';
import type { WorkflowSseEvent } from './types';
import { runBossWorkflowIntent } from './boss-workflow';
import { BOSS_HOME_URL, BOSS_LOGIN_URL, BOSS_MESSAGES_URL } from './boss-config';
import { WorkflowSessionStore } from './workflow-session-store';

type WorkflowEventWithoutMetadata<T> = T extends unknown ? Omit<T, 'runId' | 'timestamp'> : never;
type WorkflowEventInput = WorkflowEventWithoutMetadata<WorkflowSseEvent>;
type BossWorkflowManager = Parameters<typeof runBossWorkflowIntent>[0]['manager'];
type FakeBossWorkflowManager = {
  [Key in keyof BossWorkflowManager]: jest.MockedFunction<BossWorkflowManager[Key]>;
};

function createManager(loggedIn: boolean, extractedText = '第一条消息'): FakeBossWorkflowManager {
  return {
    inspectLogin: jest.fn(async (input: Parameters<BossWorkflowManager['inspectLogin']>[0]) => {
      void input;

      return {
        sessionId: 's1',
        loggedIn,
        url: loggedIn ? BOSS_MESSAGES_URL : BOSS_LOGIN_URL,
        excerpt: loggedIn ? '消息列表' : '扫码登录',
      };
    }),
    openLogin: jest.fn(async (input: Parameters<BossWorkflowManager['openLogin']>[0]) => {
      void input;

      return {
        sessionId: 's1',
        loginUrl: BOSS_LOGIN_URL,
      };
    }),
    navigate: jest.fn(async ({ url }: Parameters<BossWorkflowManager['navigate']>[0]) => ({
      sessionId: 's1',
      requestedUrl: url,
      url,
      title: 'BOSS',
      excerpt: '消息列表',
      urlMatchesRequested: true,
    })),
    extractText: jest.fn(async (input: Parameters<BossWorkflowManager['extractText']>[0]) => {
      void input;

      return {
        sessionId: 's1',
        text: extractedText,
        url: BOSS_MESSAGES_URL,
      };
    }),
    waitForText: jest.fn(async (input: Parameters<BossWorkflowManager['waitForText']>[0]) => {
      void input;

      return {
        sessionId: 's1',
        found: true,
        url: BOSS_MESSAGES_URL,
        excerpt: '消息列表',
      };
    }),
  };
}

function eventSequence(events: WorkflowEventInput[]): string[] {
  return events.map((event) => {
    if (event.type === 'workflow_state_changed') {
      return `${event.type}:${event.state}`;
    }
    if (event.type === 'dsl_replay_step') {
      return `${event.type}:${event.stepId}:${event.status}`;
    }
    if (event.type === 'dsl_validation_result') {
      return `${event.type}:${event.ok}`;
    }
    return event.type;
  });
}

const replayableWorkflow: WorkflowDsl = {
  schemaVersion: '1.0',
  metadata: {
    name: 'Read first BOSS message',
    description: 'Open BOSS messages and read the first visible message.',
    domain: 'recruiting',
  },
  steps: [
    {
      id: 'check-login',
      type: 'check_login',
      target: {
        url: BOSS_MESSAGES_URL,
        detector: { loggedInTextIncludes: ['消息'], loginUrlIncludes: ['/web/user'] },
      },
    },
    {
      id: 'login',
      type: 'login',
      dependsOn: ['check-login'],
      method: 'qr_code',
      targetUrl: BOSS_LOGIN_URL,
      success: { textIncludes: ['消息'] },
    },
    {
      id: 'open-messages',
      type: 'browser_action',
      dependsOn: ['login'],
      action: 'navigate',
      target: { url: BOSS_MESSAGES_URL },
    },
    {
      id: 'extract-first-message',
      type: 'browser_action',
      dependsOn: ['open-messages'],
      action: 'extract_text',
      target: { selectorHint: 'first message item' },
      outputKey: 'firstMessage',
    },
    {
      id: 'assert-first-message',
      type: 'assertion',
      dependsOn: ['extract-first-message'],
      expect: { outputKey: 'firstMessage' },
    },
  ],
};

describe('runBossWorkflowIntent', () => {
  it('stores pending read-first-message task and emits login-required events when logged out', async () => {
    const store = new WorkflowSessionStore();
    const manager = createManager(false);
    const events: WorkflowEventInput[] = [];

    await runBossWorkflowIntent({
      intent: { type: 'boss_read_first_message' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(store.get('s1')).toMatchObject({
      pendingTask: 'boss_read_first_message',
      loginStatus: 'logged_out',
    });
    expect(manager.openLogin).toHaveBeenCalledWith({
      sessionId: 's1',
      loginUrl: BOSS_LOGIN_URL,
    });
    expect(eventSequence(events)).toEqual([
      'workflow_state_changed:check_login',
      'workflow_state_changed:login_required',
      'awaiting_login',
      'assistant_final',
    ]);
    expect(events[2]).toMatchObject({ type: 'awaiting_login', loginUrl: BOSS_LOGIN_URL });
    expect(events[3]).toMatchObject({
      type: 'assistant_final',
      text: expect.stringContaining('已登录'),
    });
  });

  it('resumes pending read-first-message task after login completion and stores output', async () => {
    const store = new WorkflowSessionStore();
    store.setPendingTask('s1', 'boss_read_first_message');
    const manager = createManager(true, '候选人：你好');
    const events: WorkflowEventInput[] = [];

    await runBossWorkflowIntent({
      intent: { type: 'login_completed' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(store.get('s1')).toMatchObject({
      pendingTask: undefined,
      loginStatus: 'logged_in',
      outputs: { firstMessage: '候选人：你好' },
    });
    expect(manager.navigate).toHaveBeenCalledWith({ sessionId: 's1', url: BOSS_MESSAGES_URL });
    expect(eventSequence(events)).toEqual([
      'workflow_state_changed:resume_after_login',
      'login_verified',
      'workflow_state_changed:check_login',
      'workflow_state_changed:explore_target_page',
      'workflow_state_changed:extract_result',
      'workflow_state_changed:success',
      'assistant_final',
    ]);
    expect(events[1]).toMatchObject({ type: 'login_verified', sessionId: 's1' });
    expect(events[6]).toEqual({ type: 'assistant_final', text: '候选人：你好' });
  });

  it('opens BOSS home when logged in and records the successful page URL', async () => {
    const store = new WorkflowSessionStore();
    const manager = createManager(true);
    const events: WorkflowEventInput[] = [];

    await runBossWorkflowIntent({
      intent: { type: 'boss_open_home' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(manager.navigate).toHaveBeenCalledWith({ sessionId: 's1', url: BOSS_HOME_URL });
    expect(store.get('s1')).toMatchObject({
      pendingTask: undefined,
      lastSuccessfulTask: 'boss_open_home',
      outputs: { pageUrl: BOSS_HOME_URL },
    });
    expect(eventSequence(events)).toEqual([
      'workflow_state_changed:check_login',
      'workflow_state_changed:explore_target_page',
      'workflow_state_changed:success',
      'assistant_final',
    ]);
    expect(events[3]).toMatchObject({
      type: 'assistant_final',
      text: expect.stringContaining('页面会保持打开'),
    });
  });

  it('fails logged-in read-first-message workflows when extraction is empty', async () => {
    const store = new WorkflowSessionStore();
    const manager = createManager(true, '   ');
    const events: WorkflowEventInput[] = [];

    await runBossWorkflowIntent({
      intent: { type: 'boss_read_first_message' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(eventSequence(events)).toEqual([
      'workflow_state_changed:check_login',
      'workflow_state_changed:explore_target_page',
      'workflow_state_changed:extract_result',
      'workflow_state_changed:failed',
      'error',
      'assistant_final',
    ]);
    expect(events[4]).toEqual({ type: 'error', message: 'No first BOSS message text extracted' });
    expect(events[5]).toEqual({
      type: 'assistant_final',
      text: '执行失败：未读取到第一条消息内容。',
    });
    expect(store.get('s1')).toMatchObject({
      loginStatus: 'logged_in',
      lastSuccessfulTask: undefined,
      outputs: {},
      lastSuccessfulTrace: [],
    });
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'workflow_state_changed', state: 'success' }),
    );
  });

  it('emits structured failure events when home navigation unexpectedly fails', async () => {
    const store = new WorkflowSessionStore();
    const manager = createManager(true);
    manager.navigate.mockRejectedValueOnce(new Error('Navigation crashed'));
    const events: WorkflowEventInput[] = [];

    await runBossWorkflowIntent({
      intent: { type: 'boss_open_home' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(eventSequence(events)).toEqual([
      'workflow_state_changed:check_login',
      'workflow_state_changed:explore_target_page',
      'workflow_state_changed:failed',
      'error',
      'assistant_final',
    ]);
    expect(events[3]).toEqual({ type: 'error', message: 'Navigation crashed' });
    expect(events[4]).toMatchObject({
      type: 'assistant_final',
      text: expect.stringContaining('执行失败'),
    });
  });

  it('asks user to complete a workflow before generating DSL when no successful trace exists', async () => {
    const store = new WorkflowSessionStore();
    const manager = createManager(true);
    const events: WorkflowEventInput[] = [];
    const generateDsl = jest.fn();

    await runBossWorkflowIntent({
      intent: { type: 'generate_dsl' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl,
    });

    expect(generateDsl).not.toHaveBeenCalled();
    expect(events).toEqual([
      expect.objectContaining({ type: 'assistant_final', text: expect.stringContaining('先完成') }),
    ]);
  });

  it('emits validation success and workflow DSL after successful replay', async () => {
    const store = new WorkflowSessionStore();
    store.recordSuccess('s1', {
      task: 'boss_read_first_message',
      trace: [{ step: 'extract_text', result: '第一条消息' }],
      outputs: { firstMessage: '第一条消息' },
    });
    const manager = createManager(true, '第一条消息');
    const events: WorkflowEventInput[] = [];

    await runBossWorkflowIntent({
      intent: { type: 'generate_dsl' },
      runId: 'r1',
      sessionId: 's1',
      manager,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(async () => replayableWorkflow),
    });

    expect(eventSequence(events)).toEqual([
      'workflow_state_changed:generate_dsl',
      'workflow_state_changed:replay_dsl',
      'dsl_replay_step:check-login:running',
      'dsl_replay_step:check-login:success',
      'dsl_replay_step:login:running',
      'dsl_replay_step:login:skipped',
      'dsl_replay_step:open-messages:running',
      'dsl_replay_step:open-messages:success',
      'dsl_replay_step:extract-first-message:running',
      'dsl_replay_step:extract-first-message:success',
      'dsl_replay_step:assert-first-message:running',
      'dsl_replay_step:assert-first-message:success',
      'dsl_validation_result:true',
      'workflow_dsl',
      'assistant_final',
    ]);
    expect(events[13]).toEqual({ type: 'workflow_dsl', workflow: replayableWorkflow });
    expect(events[14]).toMatchObject({
      type: 'assistant_final',
      text: expect.stringContaining('成功'),
    });
  });
});
