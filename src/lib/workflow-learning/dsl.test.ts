import { parseWorkflowDsl, workflowDslSchema, type WorkflowDsl } from '@/lib/workflow-learning/dsl';

describe('workflowDslSchema', () => {
  it('accepts a workflow with login check and browser action steps', () => {
    const workflow: WorkflowDsl = {
      schemaVersion: '1.0',
      metadata: {
        name: 'Read first Boss message',
        description: 'Open Boss messages and read the first visible message.',
        domain: 'recruiting',
      },
      steps: [
        {
          id: 'check-login',
          type: 'check_login',
          target: {
            url: 'https://www.zhipin.com/web/geek/chat',
            detector: {
              loginUrlIncludes: ['/web/user'],
              loggedInTextIncludes: ['消息'],
            },
          },
        },
        {
          id: 'login',
          type: 'login',
          dependsOn: ['check-login'],
          method: 'qr_code',
          targetUrl: 'https://www.zhipin.com/web/geek/chat',
          success: {
            urlNotIncludes: ['/web/user'],
            textIncludes: ['消息'],
          },
        },
        {
          id: 'read-first-message',
          type: 'browser_action',
          dependsOn: ['login'],
          action: 'extract_text',
          target: {
            url: 'https://www.zhipin.com/web/geek/chat',
            selectorHint: 'first message item',
          },
          outputKey: 'firstMessage',
        },
      ],
    };

    expect(parseWorkflowDsl(workflow)).toEqual(workflow);
    expect(workflowDslSchema.safeParse(workflow).success).toBe(true);
  });

  it('rejects workflows with duplicate step ids', () => {
    const result = workflowDslSchema.safeParse({
      schemaVersion: '1.0',
      metadata: {
        name: 'Invalid duplicate ids',
        description: 'Duplicate ids should not be accepted.',
        domain: 'recruiting',
      },
      steps: [
        {
          id: 'open',
          type: 'browser_action',
          action: 'navigate',
          target: { url: 'https://example.com' },
        },
        {
          id: 'open',
          type: 'assertion',
          expect: { textIncludes: ['Example'] },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects login steps with empty success criteria', () => {
    const result = workflowDslSchema.safeParse({
      schemaVersion: '1.0',
      metadata: {
        name: 'Invalid login',
        description: 'Login success needs evidence.',
        domain: 'recruiting',
      },
      steps: [
        {
          id: 'login',
          type: 'login',
          method: 'qr_code',
          targetUrl: 'https://example.com/login',
          success: {},
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects navigate actions without a target URL', () => {
    const result = workflowDslSchema.safeParse({
      schemaVersion: '1.0',
      metadata: {
        name: 'Invalid navigate',
        description: 'Navigate must know where to go.',
        domain: 'recruiting',
      },
      steps: [
        {
          id: 'open',
          type: 'browser_action',
          action: 'navigate',
          target: {},
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects self dependencies', () => {
    const result = workflowDslSchema.safeParse({
      schemaVersion: '1.0',
      metadata: {
        name: 'Invalid dependency',
        description: 'A step cannot depend on itself.',
        domain: 'recruiting',
      },
      steps: [
        {
          id: 'open',
          type: 'browser_action',
          dependsOn: ['open'],
          action: 'navigate',
          target: { url: 'https://example.com' },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
