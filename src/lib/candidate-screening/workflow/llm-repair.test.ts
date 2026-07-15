/** @jest-environment node */

import { invokeLlmChat } from '@/lib/llm';
import { renderManagedPrompt } from '@/lib/prompts/app-registry';
import { runCandidateScreeningWorkflowRepairAgent } from './llm-repair';

jest.mock('@/lib/llm', () => ({
  invokeLlmChat: jest.fn(),
}));

jest.mock('@/lib/prompts/app-registry', () => ({
  renderManagedPrompt: jest.fn(),
}));

const invokeLlmChatMock = invokeLlmChat as jest.MockedFunction<typeof invokeLlmChat>;
const renderManagedPromptMock = renderManagedPrompt as jest.MockedFunction<
  typeof renderManagedPrompt
>;

const snapshot = {
  url: 'http://localhost:6183/employer/resumes',
  title: 'Candidate search',
  pageState: 'list' as const,
  headings: [],
  forms: [
    {
      name: '人才搜索',
      fields: [],
      buttons: [
        {
          tag: 'button',
          role: 'button',
          accessibleName: '执行检索',
          id: 'search-now',
          visible: true,
          enabled: true,
          editable: false,
        },
      ],
    },
  ],
  links: [],
  textBlocks: [],
};

describe('candidate screening workflow repair agent', () => {
  beforeEach(() => {
    invokeLlmChatMock.mockReset();
    renderManagedPromptMock.mockReset();
    renderManagedPromptMock.mockResolvedValue({
      definition: {
        id: 'candidate-screening.workflow-repair',
        version: 'candidate-workflow-repair-v1',
      },
      messages: [{ role: 'system', content: 'repair workflow target' }],
      options: { temperature: 0, responseFormat: 'json_object' },
    } as Awaited<ReturnType<typeof renderManagedPrompt>>);
  });

  it('asks the LLM for one browser target patch and parses the constrained result', async () => {
    invokeLlmChatMock.mockResolvedValue({
      content: JSON.stringify({
        target: {
          kind: 'button',
          role: 'button',
          name: '执行检索',
          exact: true,
          stableAttrs: { id: 'search-now' },
          scope: { kind: 'form', name: '人才搜索' },
        },
        reason: '旧搜索按钮已更名，使用稳定 id 定位新按钮',
      }),
      provider: 'test',
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      meta: {
        request: { url: 'http://llm.test', headers: {}, payload: {} },
        response: { status: 200, body: {} },
      },
    });

    await expect(
      runCandidateScreeningWorkflowRepairAgent({
        skillId: 'screen-v5',
        workflowVersion: 5,
        failedStepId: 'search_submit',
        targetKey: 'searchSubmit',
        failedTarget: { kind: 'button', role: 'button', name: '搜索', exact: true },
        error: 'ambiguous_target: 搜索',
        structuredSnapshot: snapshot,
        traceSteps: [],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        target: expect.objectContaining({
          kind: 'button',
          name: '执行检索',
          stableAttrs: { id: 'search-now' },
        }),
        reason: '旧搜索按钮已更名，使用稳定 id 定位新按钮',
        promptId: 'candidate-screening.workflow-repair',
        promptVersion: 'candidate-workflow-repair-v1',
        provider: 'test',
        model: 'test-model',
      }),
    );

    expect(renderManagedPromptMock).toHaveBeenCalledWith(
      'candidate-screening.workflow-repair',
      expect.objectContaining({ payload: expect.stringContaining('search_submit') }),
    );
    expect(invokeLlmChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'candidate-screening.workflow-repair',
        responseFormat: 'json_object',
      }),
    );
  });

  it('rejects agent output that is not a supported browser target', async () => {
    invokeLlmChatMock.mockResolvedValue({
      content: JSON.stringify({
        target: { kind: 'css', name: '#search-now' },
        reason: 'use css',
      }),
      provider: 'test',
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      meta: {
        request: { url: 'http://llm.test', headers: {}, payload: {} },
        response: { status: 200, body: {} },
      },
    });

    await expect(
      runCandidateScreeningWorkflowRepairAgent({
        skillId: 'screen-v5',
        workflowVersion: 5,
        failedStepId: 'search_submit',
        targetKey: 'searchSubmit',
        failedTarget: { kind: 'button', role: 'button', name: '搜索', exact: true },
        error: 'not_found_target: 搜索',
        structuredSnapshot: snapshot,
        traceSteps: [],
      }),
    ).rejects.toThrow();
  });

  it('rejects stable attributes that do not exist in the structured snapshot', async () => {
    invokeLlmChatMock.mockResolvedValue({
      content: JSON.stringify({
        target: {
          kind: 'button',
          role: 'button',
          name: '执行检索',
          exact: true,
          stableAttrs: { id: 'hallucinated-search-button' },
        },
        reason: 'use a stable id',
      }),
      provider: 'test',
      model: 'test-model',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      meta: {
        request: { url: 'http://llm.test', headers: {}, payload: {} },
        response: { status: 200, body: {} },
      },
    });

    await expect(
      runCandidateScreeningWorkflowRepairAgent({
        skillId: 'screen-v5',
        workflowVersion: 5,
        failedStepId: 'search_submit',
        targetKey: 'searchSubmit',
        failedTarget: { kind: 'button', role: 'button', name: '搜索', exact: true },
        error: 'ambiguous_target: 搜索',
        structuredSnapshot: snapshot,
        traceSteps: [],
      }),
    ).rejects.toThrow('not grounded in the snapshot');
  });
});
