import type { BaseMessage } from '@langchain/core/messages';
import { candidateEvaluationPromptDefinition } from '@/lib/candidate-screening/prompts';
import type { ManagedPromptDefinition, ManagedPromptMessage, RenderedManagedPrompt } from './types';

const MANAGED_PROMPTS = [
  candidateEvaluationPromptDefinition,
] as const satisfies readonly ManagedPromptDefinition[];

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        const maybeText = item as { text?: unknown };
        return typeof maybeText.text === 'string' ? maybeText.text : '';
      })
      .join('');
  }
  return String(content ?? '');
}

function messageRole(message: BaseMessage): ManagedPromptMessage['role'] {
  const type = message._getType();
  if (type === 'system') return 'system';
  if (type === 'human') return 'user';
  return 'assistant';
}

export function listManagedPrompts(): ManagedPromptDefinition[] {
  return [...MANAGED_PROMPTS];
}

export function getManagedPrompt(id: string): ManagedPromptDefinition {
  const definition = MANAGED_PROMPTS.find((prompt) => prompt.id === id);
  if (!definition) {
    throw new Error(`Unknown managed prompt: ${id}`);
  }
  return definition;
}

export async function renderManagedPrompt(
  id: string,
  variables: Record<string, unknown>,
): Promise<RenderedManagedPrompt> {
  const definition = getManagedPrompt(id);
  const messages = await definition.chatPrompt.formatMessages(variables);

  return {
    definition,
    messages: messages.map((message) => ({
      role: messageRole(message),
      content: messageContentToString(message.content),
    })),
    options: definition.options,
  };
}
