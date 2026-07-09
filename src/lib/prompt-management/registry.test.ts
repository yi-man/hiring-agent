import { getManagedPrompt, listManagedPrompts, renderManagedPrompt } from './registry';
import { CANDIDATE_SCREENING_EVALUATION_PROMPT_ID } from '@/lib/candidate-screening/prompts';
import { CANDIDATE_EVALUATION_PROMPT_VERSION } from '@/lib/candidate-screening/constants';
import {
  JD_EVALUATE_PROMPT_ID,
  JD_GENERATE_PROMPT_ID,
  JD_IMPROVE_PROMPT_ID,
  PROMPT_VERSION as JD_PROMPT_VERSION,
} from '@/lib/jd-agent/prompts';
import { CHAT_ASSISTANT_PROMPT_ID, CHAT_ASSISTANT_PROMPT_VERSION } from '@/lib/chat/prompts';
import {
  CANDIDATE_COMMUNICATION_PROMPT_ID,
  CANDIDATE_COMMUNICATION_PROMPT_VERSION,
} from '@/lib/candidate-communication/prompts';
import {
  WORKFLOW_LEARNING_AGENT_PROMPT_ID,
  WORKFLOW_LEARNING_AGENT_PROMPT_VERSION,
} from '@/lib/workflow-learning/prompts';

describe('managed prompt registry', () => {
  it('lists candidate-screening evaluation as a versioned LangChain prompt', () => {
    expect(listManagedPrompts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: CANDIDATE_SCREENING_EVALUATION_PROMPT_ID,
          version: CANDIDATE_EVALUATION_PROMPT_VERSION,
          owner: 'candidate-screening',
        }),
      ]),
    );
  });

  it('renders managed chat prompts through LangChain templates', async () => {
    const rendered = await renderManagedPrompt(CANDIDATE_SCREENING_EVALUATION_PROMPT_ID, {
      payload: JSON.stringify({ jobTitle: '高级后端工程师' }),
    });

    expect(rendered.definition.id).toBe(CANDIDATE_SCREENING_EVALUATION_PROMPT_ID);
    expect(rendered.definition.version).toBe(CANDIDATE_EVALUATION_PROMPT_VERSION);
    expect(rendered.options).toMatchObject({ temperature: 0.2, responseFormat: 'json_object' });
    expect(rendered.messages).toEqual([
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('评分规约'),
      }),
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('高级后端工程师'),
      }),
    ]);
  });

  it('returns prompt metadata without rendering', () => {
    expect(getManagedPrompt(CANDIDATE_SCREENING_EVALUATION_PROMPT_ID)).toMatchObject({
      id: CANDIDATE_SCREENING_EVALUATION_PROMPT_ID,
      version: CANDIDATE_EVALUATION_PROMPT_VERSION,
      format: 'langchain-chat',
    });
  });

  it('lists all current production prompts with stable owner and version metadata', () => {
    expect(listManagedPrompts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: JD_GENERATE_PROMPT_ID,
          version: JD_PROMPT_VERSION,
          owner: 'jd-agent',
          options: { temperature: 0.4, responseFormat: 'json_object' },
        }),
        expect.objectContaining({
          id: JD_EVALUATE_PROMPT_ID,
          version: JD_PROMPT_VERSION,
          owner: 'jd-agent',
          options: { temperature: 0.4, responseFormat: 'json_object' },
        }),
        expect.objectContaining({
          id: JD_IMPROVE_PROMPT_ID,
          version: JD_PROMPT_VERSION,
          owner: 'jd-agent',
          options: { temperature: 0.4, responseFormat: 'json_object' },
        }),
        expect.objectContaining({
          id: CHAT_ASSISTANT_PROMPT_ID,
          version: CHAT_ASSISTANT_PROMPT_VERSION,
          owner: 'chat',
          options: { temperature: 0.7, responseFormat: 'text' },
        }),
        expect.objectContaining({
          id: CANDIDATE_COMMUNICATION_PROMPT_ID,
          version: CANDIDATE_COMMUNICATION_PROMPT_VERSION,
          owner: 'candidate-communication',
          options: { temperature: 0.2, responseFormat: 'json_object' },
        }),
        expect.objectContaining({
          id: WORKFLOW_LEARNING_AGENT_PROMPT_ID,
          version: WORKFLOW_LEARNING_AGENT_PROMPT_VERSION,
          owner: 'workflow-learning',
          options: { temperature: 0.2, responseFormat: 'text' },
        }),
      ]),
    );
  });

  it('renders JD generation and candidate communication prompts through the registry', async () => {
    const jdPrompt = await renderManagedPrompt(JD_GENERATE_PROMPT_ID, {
      title: '高级后端工程师',
      seniority: '5年以上',
      skills: 'Java、PostgreSQL',
      responsibilities: '负责核心交易链路',
      companyHighlights: 'AI 招聘产品',
      tone: 'tech',
      companyContextSection: '【公司上下文】\n无',
    });

    expect(jdPrompt.definition.version).toBe(JD_PROMPT_VERSION);
    expect(jdPrompt.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('高转化率'),
    });
    expect(jdPrompt.messages[1]).toMatchObject({
      role: 'user',
      content: expect.stringContaining('高级后端工程师'),
    });

    const communicationPrompt = await renderManagedPrompt(CANDIDATE_COMMUNICATION_PROMPT_ID, {
      payload: JSON.stringify({ currentStage: 'new', message: '你好' }),
    });

    expect(communicationPrompt.definition.version).toBe(CANDIDATE_COMMUNICATION_PROMPT_VERSION);
    expect(communicationPrompt.messages[0].content).toContain('recruiting communication agent');
    expect(communicationPrompt.messages[1].content).toContain('"message":"你好"');
  });
});
