import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { AIMessageChunk, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '@/lib/env';
import { RedisChatMessageHistory } from '@/lib/chat/history/redis-chat-history';
import { buildSystemPrompt } from '@/lib/chat/prompts';

const DEFAULT_MODEL = 'gpt-4o-mini';

function createModel(): ChatOpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY for chat streaming');
  }
  return new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || DEFAULT_MODEL,
    configuration: {
      baseURL: env.OPENAI_BASE_URL,
    },
    temperature: 0.7,
    streaming: true,
  });
}

export function buildChatChain() {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '{systemPrompt}'],
    new MessagesPlaceholder('history'),
    ['human', '{input}'],
  ]);
  const chain = prompt.pipe(createModel());
  return new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: async (sessionId: string) => {
      const history = new RedisChatMessageHistory(sessionId);
      await history.rehydrateFromMySql();
      return history;
    },
    inputMessagesKey: 'input',
    historyMessagesKey: 'history',
  });
}

export async function streamChatReply(
  conversationId: string,
  input: string,
): Promise<{ chunks: AsyncGenerator<string>; collect: () => Promise<string> }> {
  const runnable = buildChatChain();
  const stream = await runnable.stream(
    { systemPrompt: buildSystemPrompt(), input },
    { configurable: { sessionId: conversationId } },
  );

  let full = '';
  async function* chunks() {
    for await (const chunk of stream) {
      if (chunk instanceof AIMessageChunk && chunk.content) {
        const text = String(chunk.content);
        full += text;
        yield text;
      }
    }
  }

  return {
    chunks: chunks(),
    collect: async () => full,
  };
}

export function buildStandaloneMessages(input: string) {
  return [new SystemMessage(buildSystemPrompt()), new HumanMessage(input)];
}
