import { readdirSync, readFileSync, statSync } from 'node:fs';
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

function productionFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return productionFilesUnder(fullPath);
    }
    if (
      (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) ||
      entry.endsWith('.test.ts') ||
      entry.endsWith('.test.tsx')
    ) {
      return [];
    }
    return [fullPath];
  });
}

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

  it('keeps prompt-management independent from business prompt modules', () => {
    const promptManagementFiles = productionFilesUnder(__dirname);

    for (const file of promptManagementFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/@\/lib\/(jd-agent|chat|candidate-|workflow-learning)\//);
    }
  });
});
