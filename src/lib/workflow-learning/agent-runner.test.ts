import {
  extractTextFromMessageContent,
  extractWorkflowDslFromText,
  resolveOpenOnlyRequest,
  runWorkflowAgentWithEvents,
  shouldAttemptWorkflowDsl,
} from './agent-runner';
import { runBossWorkflowIntent } from './boss-workflow';
import { routeWorkflowIntent } from './intent-router';

jest.mock('./boss-workflow', () => ({
  runBossWorkflowIntent: jest.fn(),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn(() => ({})),
}));

jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: jest.fn(() => ({
    streamEvents: async function* () {
      yield { event: 'on_chat_model_end', data: { output: { content: '普通聊天回复' } } };
    },
  })),
}));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function nextOrPending<T>(promise: Promise<T>): Promise<T | 'pending'> {
  return Promise.race([
    promise,
    new Promise<'pending'>((resolve) => {
      setTimeout(() => resolve('pending'), 0);
    }),
  ]);
}

describe('extractTextFromMessageContent', () => {
  it('reads string content', () => {
    expect(extractTextFromMessageContent({ content: 'hello' })).toBe('hello');
  });

  it('joins array of text parts', () => {
    expect(
      extractTextFromMessageContent({
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      }),
    ).toBe('ab');
  });
});

describe('extractWorkflowDslFromText', () => {
  it('parses a fenced JSON workflow DSL from model output', () => {
    const workflow = extractWorkflowDslFromText(`
Here is the workflow:
\`\`\`json
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "Read first message",
    "description": "Open messages and read the first item.",
    "domain": "recruiting"
  },
  "steps": [
    {
      "id": "open",
      "type": "browser_action",
      "action": "navigate",
      "target": { "url": "https://example.com/messages" }
    }
  ]
}
\`\`\`
`);

    expect(workflow?.metadata.name).toBe('Read first message');
    expect(workflow?.steps[0].type).toBe('browser_action');
  });

  it('returns null when the model output does not contain a valid workflow DSL', () => {
    expect(extractWorkflowDslFromText('普通聊天回复')).toBeNull();
  });
});

describe('workflow learning intent helpers', () => {
  it('resolves simple Boss open requests to the public Boss site', () => {
    expect(resolveOpenOnlyRequest('打开boss')).toEqual({
      label: 'Boss 直聘',
      url: 'https://www.zhipin.com/',
    });
  });

  it('does not treat multi-step Boss tasks as open-only requests', () => {
    expect(resolveOpenOnlyRequest('打开 Boss 的消息页，查看第一条信息')).toBeNull();
  });

  it('only attempts DSL generation after explicit user confirmation', () => {
    expect(shouldAttemptWorkflowDsl('打开boss')).toBe(false);
    expect(shouldAttemptWorkflowDsl('效果可以')).toBe(false);
    expect(shouldAttemptWorkflowDsl('生成 DSL')).toBe(false);
    expect(shouldAttemptWorkflowDsl('确认 DSL')).toBe(false);
    expect(shouldAttemptWorkflowDsl('可以生成')).toBe(false);
  });
});

describe('workflow deterministic routing', () => {
  const mockedRunBossWorkflowIntent = jest.mocked(runBossWorkflowIntent);

  beforeEach(() => {
    mockedRunBossWorkflowIntent.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('routes BOSS workflow prompts to the deterministic workflow and yields full events', async () => {
    mockedRunBossWorkflowIntent.mockImplementationOnce(async ({ emit }) => {
      emit({
        type: 'workflow_state_changed',
        state: 'success',
        message: 'BOSS home opened',
      });
      emit({ type: 'assistant_final', text: '已打开 BOSS 首页。' });
    });

    const events = [];
    for await (const event of runWorkflowAgentWithEvents({
      runId: 'r1',
      sessionId: 's1',
      userText: '打开 BOSS 首页',
    })) {
      events.push(event);
    }

    expect(mockedRunBossWorkflowIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: { type: 'boss_open_home' },
        runId: 'r1',
        sessionId: 's1',
      }),
    );
    expect(events).toEqual([
      { type: 'run_start', runId: 'r1', timestamp: expect.any(String) },
      {
        type: 'workflow_state_changed',
        runId: 'r1',
        timestamp: expect.any(String),
        state: 'success',
        message: 'BOSS home opened',
      },
      {
        type: 'assistant_final',
        runId: 'r1',
        timestamp: expect.any(String),
        text: '已打开 BOSS 首页。',
      },
      { type: 'run_end', runId: 'r1', timestamp: expect.any(String) },
    ]);
    expect(events.filter((event) => event.type === 'run_end')).toHaveLength(1);
  });

  it('does not route ordinary chat to the deterministic BOSS workflow', () => {
    expect(routeWorkflowIntent('你好，介绍一下你自己')).toEqual({ type: 'chat' });
  });

  it('yields deterministic events before the BOSS workflow finishes', async () => {
    const gate = deferred();
    mockedRunBossWorkflowIntent.mockImplementationOnce(async ({ emit }) => {
      emit({
        type: 'workflow_state_changed',
        state: 'check_login',
        message: 'Checking login',
      });
      await gate.promise;
      emit({ type: 'assistant_final', text: 'done' });
    });
    const generator = runWorkflowAgentWithEvents({
      runId: 'r-stream',
      sessionId: 's-stream',
      userText: '打开 BOSS 首页',
    });

    await expect(generator.next()).resolves.toMatchObject({
      value: { type: 'run_start' },
      done: false,
    });
    const stateEvent = generator.next();

    await expect(nextOrPending(stateEvent)).resolves.toMatchObject({
      value: {
        type: 'workflow_state_changed',
        runId: 'r-stream',
        timestamp: expect.any(String),
        state: 'check_login',
        message: 'Checking login',
      },
      done: false,
    });

    gate.resolve();
    await expect(generator.next()).resolves.toMatchObject({
      value: { type: 'assistant_final', text: 'done' },
      done: false,
    });
    await expect(generator.next()).resolves.toMatchObject({
      value: { type: 'run_end' },
      done: false,
    });
    await expect(generator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('yields an error and one run_end when the deterministic workflow throws before emitting', async () => {
    mockedRunBossWorkflowIntent.mockRejectedValueOnce(new Error('BOSS exploded'));

    const events = [];
    for await (const event of runWorkflowAgentWithEvents({
      runId: 'r-throw',
      sessionId: 's-throw',
      userText: '打开 BOSS 首页',
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'run_start', runId: 'r-throw', timestamp: expect.any(String) },
      {
        type: 'error',
        runId: 'r-throw',
        timestamp: expect.any(String),
        message: 'BOSS exploded',
      },
      { type: 'run_end', runId: 'r-throw', timestamp: expect.any(String) },
    ]);
    expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'run_end')).toHaveLength(1);
  });

  it('preserves emitted events then yields one error and run_end when the deterministic workflow throws later', async () => {
    mockedRunBossWorkflowIntent.mockImplementationOnce(async ({ emit }) => {
      emit({
        type: 'workflow_state_changed',
        state: 'check_login',
        message: 'Checking login',
      });
      throw new Error('late failure');
    });

    const events = [];
    for await (const event of runWorkflowAgentWithEvents({
      runId: 'r-late',
      sessionId: 's-late',
      userText: '打开 BOSS 首页',
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'run_start', runId: 'r-late', timestamp: expect.any(String) },
      {
        type: 'workflow_state_changed',
        runId: 'r-late',
        timestamp: expect.any(String),
        state: 'check_login',
        message: 'Checking login',
      },
      {
        type: 'error',
        runId: 'r-late',
        timestamp: expect.any(String),
        message: 'late failure',
      },
      { type: 'run_end', runId: 'r-late', timestamp: expect.any(String) },
    ]);
    expect(events.filter((event) => event.type === 'error')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'run_end')).toHaveLength(1);
  });

  it('does not add a duplicate error when the deterministic workflow emits an error event', async () => {
    mockedRunBossWorkflowIntent.mockImplementationOnce(async ({ emit }) => {
      emit({ type: 'error', message: 'handled by workflow' });
      emit({ type: 'assistant_final', text: '执行失败：handled by workflow' });
    });

    const events = [];
    for await (const event of runWorkflowAgentWithEvents({
      runId: 'r-error',
      sessionId: 's-error',
      userText: '打开 BOSS 首页',
    })) {
      events.push(event);
    }

    expect(events.filter((event) => event.type === 'error')).toEqual([
      {
        type: 'error',
        runId: 'r-error',
        timestamp: expect.any(String),
        message: 'handled by workflow',
      },
    ]);
    expect(events.filter((event) => event.type === 'run_end')).toHaveLength(1);
  });

  it('uses runId as the default session id for deterministic workflows', async () => {
    mockedRunBossWorkflowIntent.mockImplementationOnce(async ({ emit }) => {
      emit({ type: 'assistant_final', text: 'done' });
    });

    for await (const event of runWorkflowAgentWithEvents({
      runId: 'r-default-session',
      userText: '打开 BOSS 首页',
    })) {
      void event;
      // Exhaust the generator.
    }

    expect(mockedRunBossWorkflowIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'r-default-session',
        sessionId: 'r-default-session',
      }),
    );
  });

  it('preserves fallback routing for ordinary chat and unknown workflows', async () => {
    const ordinaryEvents = [];
    for await (const event of runWorkflowAgentWithEvents({
      runId: 'r-chat',
      sessionId: 's-chat',
      userText: '你好，介绍一下你自己',
    })) {
      ordinaryEvents.push(event);
    }

    expect(mockedRunBossWorkflowIntent).not.toHaveBeenCalled();
    expect(ordinaryEvents.map((event) => event.type)).toEqual([
      'run_start',
      'assistant_final',
      'run_end',
    ]);
    expect(routeWorkflowIntent('打开淘宝首页')).toEqual({ type: 'unknown_workflow' });
  });
});
