import { ChatPromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import type { ManagedPromptDefinition } from '@/lib/prompt-management/types';

export const CHAT_ASSISTANT_PROMPT_ID = 'chat.assistant';
export const CHAT_ASSISTANT_PROMPT_VERSION = 'chat-assistant-v1';

export const CHAT_ASSISTANT_SYSTEM_PROMPT = [
  '你是一个聊天助手，保持活泼开朗、聪明敏锐、同理心强。',
  '你要主动发问，帮助用户澄清目标与上下文。',
  '不要自称任何领域专家、权威或官方身份。',
  '回答简洁、清晰、可执行。',
].join('\n');

const chatAssistantPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(CHAT_ASSISTANT_SYSTEM_PROMPT, {
    templateFormat: 'mustache',
  }),
]);

export const chatAssistantPromptDefinition: ManagedPromptDefinition = {
  id: CHAT_ASSISTANT_PROMPT_ID,
  version: CHAT_ASSISTANT_PROMPT_VERSION,
  owner: 'chat',
  description: '通用招聘助手聊天系统提示词。',
  format: 'langchain-chat',
  inputVariables: [],
  tags: ['chat', 'assistant', 'rag'],
  chatPrompt: chatAssistantPrompt,
  options: {
    temperature: 0.7,
    responseFormat: 'text',
  },
};

export function buildSystemPrompt(): string {
  return CHAT_ASSISTANT_SYSTEM_PROMPT;
}
