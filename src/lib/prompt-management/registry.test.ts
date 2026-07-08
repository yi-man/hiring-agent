import { getManagedPrompt, listManagedPrompts, renderManagedPrompt } from './registry';
import { CANDIDATE_SCREENING_EVALUATION_PROMPT_ID } from '@/lib/candidate-screening/prompts';
import { CANDIDATE_EVALUATION_PROMPT_VERSION } from '@/lib/candidate-screening/constants';

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
});
