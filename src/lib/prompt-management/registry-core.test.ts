import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createPromptRegistry } from './registry';
import type { ManagedPromptDefinition } from './types';

const testPromptDefinition: ManagedPromptDefinition = {
  id: 'test.echo',
  version: 'test-v1',
  owner: 'test',
  description: 'Test-only prompt definition for registry core behavior.',
  format: 'langchain-chat',
  inputVariables: ['name'],
  tags: ['test'],
  chatPrompt: ChatPromptTemplate.fromMessages([
    ['system', 'You are a test assistant.'],
    ['human', 'Hello {name}'],
  ]),
  options: {
    temperature: 0,
    responseFormat: 'text',
  },
};

describe('prompt registry core', () => {
  it('creates an isolated registry from injected prompt definitions', async () => {
    const registry = createPromptRegistry([testPromptDefinition]);

    expect(registry.list()).toEqual([testPromptDefinition]);
    expect(registry.get('test.echo')).toBe(testPromptDefinition);

    const rendered = await registry.render('test.echo', { name: 'Ada' });

    expect(rendered.definition).toBe(testPromptDefinition);
    expect(rendered.options).toEqual({ temperature: 0, responseFormat: 'text' });
    expect(rendered.messages).toEqual([
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Hello Ada' },
    ]);
  });

  it('keeps the core registry independent from business prompt modules', () => {
    const source = readFileSync(path.join(__dirname, 'registry.ts'), 'utf8');

    expect(source).not.toMatch(/@\/lib\/(jd-agent|chat|candidate-|workflow-learning)\//);
  });
});
