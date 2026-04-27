import type { WorkflowDsl } from '@/lib/workflow-learning/dsl';
import {
  runWorkflowDsl,
  type DslRunnerEvent,
  type DslRunnerManager,
} from '@/lib/workflow-learning/dsl-runner';

function createManager(input: {
  loggedIn: boolean;
  extractedText?: string;
  textFound?: boolean;
  waitExcerpt?: string;
}) {
  const extractedText = input.extractedText ?? '第一条消息';
  const textFound = input.textFound ?? true;

  return {
    inspectLogin: jest.fn(async () => ({
      sessionId: 's1',
      loggedIn: input.loggedIn,
      url: input.loggedIn
        ? 'https://www.zhipin.com/web/geek/chat'
        : 'https://www.zhipin.com/web/user/',
      excerpt: input.loggedIn ? '消息列表' : '扫码登录',
    })),
    openLogin: jest.fn(async () => ({
      sessionId: 's1',
      loginUrl: 'https://www.zhipin.com/web/user/',
    })),
    navigate: jest.fn(async ({ url }: { url: string }) => ({
      sessionId: 's1',
      requestedUrl: url,
      url,
      title: 'BOSS',
      excerpt: '消息列表 第一条消息',
      urlMatchesRequested: true,
    })),
    waitForText: jest.fn(async () => ({
      sessionId: 's1',
      found: textFound,
      url: 'https://www.zhipin.com/web/geek/chat',
      excerpt: input.waitExcerpt ?? (textFound ? '消息列表' : '加载中'),
    })),
    extractText: jest.fn(async () => ({
      sessionId: 's1',
      text: extractedText,
      url: 'https://www.zhipin.com/web/geek/chat',
    })),
  } satisfies DslRunnerManager;
}

const workflow: WorkflowDsl = {
  schemaVersion: '1.0',
  metadata: {
    name: 'Read first BOSS message',
    description: 'Read the first visible BOSS message.',
    domain: 'recruiting',
  },
  steps: [
    {
      id: 'assert-first-message',
      type: 'assertion',
      dependsOn: ['extract-first-message'],
      expect: { outputKey: 'firstMessage' },
    },
    {
      id: 'extract-first-message',
      type: 'browser_action',
      dependsOn: ['wait-for-messages'],
      action: 'extract_text',
      target: { selectorHint: 'first message item' },
      outputKey: 'firstMessage',
    },
    {
      id: 'login',
      type: 'login',
      dependsOn: ['check-login'],
      method: 'qr_code',
      targetUrl: 'https://www.zhipin.com/web/user/',
      success: { urlNotIncludes: ['/web/user'], textIncludes: ['消息'] },
    },
    {
      id: 'wait-for-messages',
      type: 'browser_action',
      dependsOn: ['open-messages'],
      action: 'wait_for_text',
      target: { text: '消息' },
    },
    {
      id: 'open-messages',
      type: 'browser_action',
      dependsOn: ['login'],
      action: 'navigate',
      target: { url: 'https://www.zhipin.com/web/geek/chat' },
    },
    {
      id: 'check-login',
      type: 'check_login',
      target: {
        url: 'https://www.zhipin.com/web/geek/chat',
        detector: {
          loginUrlIncludes: ['/web/user'],
          loggedInUrlIncludes: ['/web/geek/chat'],
          loggedInTextIncludes: ['消息'],
        },
      },
    },
  ],
};

describe('runWorkflowDsl', () => {
  it('skips login when check_login is already successful', async () => {
    const manager = createManager({ loggedIn: true });
    const events: DslRunnerEvent[] = [];

    const result = await runWorkflowDsl({
      workflow,
      sessionId: 's1',
      manager,
      emit: (event) => events.push(event),
    });

    expect(result).toEqual({ ok: true, outputs: { firstMessage: '第一条消息' } });
    expect(manager.inspectLogin).toHaveBeenCalledWith({
      sessionId: 's1',
      success: {
        urlIncludes: ['/web/geek/chat'],
        urlNotIncludes: ['/web/user'],
        textIncludes: ['消息'],
      },
    });
    expect(manager.openLogin).not.toHaveBeenCalled();
    expect(manager.navigate).toHaveBeenCalledWith({
      sessionId: 's1',
      url: 'https://www.zhipin.com/web/geek/chat',
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'dsl_replay_step',
          stepId: 'login',
          stepType: 'login',
          status: 'skipped',
        }),
      ]),
    );
  });

  it('opens login and returns awaitingLogin when check_login fails', async () => {
    const manager = createManager({ loggedIn: false });

    const result = await runWorkflowDsl({
      workflow,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result).toEqual({
      ok: false,
      outputs: {},
      awaitingLogin: { loginUrl: 'https://www.zhipin.com/web/user/' },
    });
    expect(manager.openLogin).toHaveBeenCalledWith({
      sessionId: 's1',
      loginUrl: 'https://www.zhipin.com/web/user/',
    });
    expect(manager.navigate).not.toHaveBeenCalled();
  });

  it('fails replay when wait_for_text cannot find the requested text', async () => {
    const manager = createManager({ loggedIn: true, textFound: false });
    const emit = jest.fn();

    const result = await runWorkflowDsl({
      workflow,
      sessionId: 's1',
      manager,
      emit,
    });

    expect(result).toEqual({
      ok: false,
      outputs: {},
      error: 'Text not found: 消息',
    });
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dsl_replay_step',
        stepId: 'wait-for-messages',
        status: 'failed',
        error: 'Text not found: 消息',
      }),
    );
  });

  it('fails assertion when the expected output is empty', async () => {
    const manager = createManager({ loggedIn: true, extractedText: '   ' });

    const result = await runWorkflowDsl({
      workflow,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result).toEqual({
      ok: false,
      outputs: { firstMessage: '   ' },
      error: 'Missing output for firstMessage',
    });
  });

  it('passes assertion when the latest browser URL includes expected text', async () => {
    const manager = createManager({ loggedIn: true });
    const workflowWithUrlAssertion: WorkflowDsl = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === 'assert-first-message'
          ? {
              id: 'assert-first-message',
              type: 'assertion',
              dependsOn: ['open-messages'],
              expect: { urlIncludes: ['chat'] },
            }
          : step,
      ),
    };

    const result = await runWorkflowDsl({
      workflow: workflowWithUrlAssertion,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result).toEqual({ ok: true, outputs: { firstMessage: '第一条消息' } });
  });

  it('passes assertion when the latest browser excerpt includes expected text', async () => {
    const manager = createManager({ loggedIn: true, waitExcerpt: '消息列表' });
    const workflowWithTextAssertion: WorkflowDsl = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === 'assert-first-message'
          ? {
              id: 'assert-first-message',
              type: 'assertion',
              dependsOn: ['wait-for-messages'],
              expect: { textIncludes: ['消息'] },
            }
          : step,
      ),
    };

    const result = await runWorkflowDsl({
      workflow: workflowWithTextAssertion,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result).toEqual({ ok: true, outputs: { firstMessage: '第一条消息' } });
  });

  it('fails assertion when expected text is absent from the latest browser excerpt', async () => {
    const manager = createManager({ loggedIn: true, waitExcerpt: '加载中' });
    const workflowWithMissingTextAssertion: WorkflowDsl = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === 'assert-first-message'
          ? {
              id: 'assert-first-message',
              type: 'assertion',
              dependsOn: ['wait-for-messages'],
              expect: { textIncludes: ['消息'] },
            }
          : step,
      ),
    };

    const result = await runWorkflowDsl({
      workflow: workflowWithMissingTextAssertion,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result).toEqual({
      ok: false,
      outputs: {},
      error: 'Expected text not found: 消息',
    });
  });

  it('maps loginUrlIncludes detector to urlNotIncludes for check_login', async () => {
    const manager = createManager({ loggedIn: true });
    const workflowWithLoginUrlDetector: WorkflowDsl = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === 'check-login'
          ? {
              id: 'check-login',
              type: 'check_login',
              target: {
                url: 'https://www.zhipin.com/web/geek/chat',
                detector: { loginUrlIncludes: ['/web/user'] },
              },
            }
          : step,
      ),
    };

    const result = await runWorkflowDsl({
      workflow: workflowWithLoginUrlDetector,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result.ok).toBe(true);
    expect(manager.inspectLogin).toHaveBeenCalledWith({
      sessionId: 's1',
      success: { urlNotIncludes: ['/web/user'] },
    });
    expect(manager.openLogin).not.toHaveBeenCalled();
  });

  it('maps loginTextIncludes detector to textNotIncludes for check_login', async () => {
    const pageText = '消息列表';
    const manager = {
      ...createManager({ loggedIn: false }),
      inspectLogin: jest.fn(async ({ success }) => {
        const textNotIncludes = success.textNotIncludes ?? [];

        return {
          sessionId: 's1',
          loggedIn:
            textNotIncludes.length > 0 && textNotIncludes.every((text) => !pageText.includes(text)),
          url: 'https://www.zhipin.com/web/geek/chat',
          excerpt: pageText,
        };
      }),
    } satisfies DslRunnerManager;
    const workflowWithLoginTextDetector: WorkflowDsl = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === 'check-login'
          ? {
              id: 'check-login',
              type: 'check_login',
              target: {
                url: 'https://www.zhipin.com/web/geek/chat',
                detector: { loginTextIncludes: ['扫码登录'] },
              },
            }
          : step,
      ),
    };

    const result = await runWorkflowDsl({
      workflow: workflowWithLoginTextDetector,
      sessionId: 's1',
      manager,
      emit: jest.fn(),
    });

    expect(result.ok).toBe(true);
    expect(manager.inspectLogin).toHaveBeenCalledWith({
      sessionId: 's1',
      success: { textNotIncludes: ['扫码登录'] },
    });
    expect(manager.openLogin).not.toHaveBeenCalled();
  });

  it('returns a failed result when dependency sorting fails', async () => {
    const manager = createManager({ loggedIn: true });
    const emit = jest.fn();
    const workflowWithUnknownDependency: WorkflowDsl = {
      ...workflow,
      steps: workflow.steps.map((step) =>
        step.id === 'check-login'
          ? {
              ...step,
              dependsOn: ['missing-step'],
            }
          : step,
      ),
    };

    await expect(
      runWorkflowDsl({
        workflow: workflowWithUnknownDependency,
        sessionId: 's1',
        manager,
        emit,
      }),
    ).resolves.toEqual({
      ok: false,
      outputs: {},
      error: 'Unknown dependency: missing-step',
    });
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dsl_replay_step',
        stepId: 'check-login',
        status: 'failed',
        error: 'Unknown dependency: missing-step',
      }),
    );
  });
});
