export type LlmChatRole = 'system' | 'user' | 'assistant';

export type LlmChatMessage = {
  role: LlmChatRole;
  content: string;
};

export type LlmResponseFormat = 'text' | 'json_object';

export type LlmPromptRef = {
  id: string;
  version: string;
};

export type LlmTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type LlmProviderRequestMeta = {
  url: string;
  headers: Record<string, string>;
  payload: object;
};

export type LlmProviderResponseMeta = {
  status: number;
  body: unknown;
};

export type LlmProviderCallMeta = {
  request: LlmProviderRequestMeta;
  response: LlmProviderResponseMeta;
};

export type LlmProviderAttemptMeta = {
  provider: string;
  model: string;
  endpoint: string;
  status?: number;
  outcome: 'success' | 'error' | 'skipped';
  error?: string;
};

export type LlmChatResult = {
  content: string;
  provider: string;
  model: string;
  usage: LlmTokenUsage;
  meta: LlmProviderCallMeta;
  attempts?: LlmProviderAttemptMeta[];
};
