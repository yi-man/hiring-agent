import type { BaseMessage } from '@langchain/core/messages';
import type { ManagedPromptDefinition, ManagedPromptMessage, RenderedManagedPrompt } from './types';

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

export type PromptRegistry = {
  list(): ManagedPromptDefinition[];
  get(id: string): ManagedPromptDefinition;
  render(id: string, variables: Record<string, unknown>): Promise<RenderedManagedPrompt>;
};

export function createPromptRegistry(
  definitions: readonly ManagedPromptDefinition[],
): PromptRegistry {
  const promptsById = new Map<string, ManagedPromptDefinition>();

  for (const definition of definitions) {
    if (promptsById.has(definition.id)) {
      throw new Error(`Duplicate managed prompt id: ${definition.id}`);
    }
    promptsById.set(definition.id, definition);
  }

  return {
    list() {
      return [...promptsById.values()];
    },

    get(id: string) {
      const definition = promptsById.get(id);
      if (!definition) {
        throw new Error(`Unknown managed prompt: ${id}`);
      }
      return definition;
    },

    async render(id: string, variables: Record<string, unknown>) {
      const definition = this.get(id);
      const messages = await definition.chatPrompt.formatMessages(variables);

      return {
        definition,
        messages: messages.map((message) => ({
          role: messageRole(message),
          content: messageContentToString(message.content),
        })),
        options: definition.options,
      };
    },
  };
}
