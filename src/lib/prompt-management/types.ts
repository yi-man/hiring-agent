import type { ChatPromptTemplate } from '@langchain/core/prompts';

export type ManagedPromptFormat = 'langchain-chat';
export type ManagedPromptResponseFormat = 'json_object' | 'text';

export type ManagedPromptDefinition = {
  id: string;
  version: string;
  owner: string;
  description: string;
  format: ManagedPromptFormat;
  inputVariables: string[];
  tags: string[];
  chatPrompt: ChatPromptTemplate;
  options: {
    temperature: number;
    responseFormat: ManagedPromptResponseFormat;
  };
};

export type ManagedPromptMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type RenderedManagedPrompt = {
  definition: ManagedPromptDefinition;
  messages: ManagedPromptMessage[];
  options: ManagedPromptDefinition['options'];
};
