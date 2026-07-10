import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';
import {
  buildSystemPrompt,
  CHAT_ASSISTANT_PROMPT_ID,
  CHAT_ASSISTANT_PROMPT_VERSION,
  chatAssistantPromptDefinition,
} from '@/lib/chat/prompts';
import { invokeLlmChat } from '@/lib/llm';

export async function POST(request: Request) {
  try {
    await requireAuth();
    const { message } = (await request.json()) as { message?: string };

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const response = await invokeLlmChat({
      operation: CHAT_ASSISTANT_PROMPT_ID,
      prompt: {
        id: CHAT_ASSISTANT_PROMPT_ID,
        version: CHAT_ASSISTANT_PROMPT_VERSION,
      },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: message.trim() },
      ],
      temperature: chatAssistantPromptDefinition.options.temperature,
      responseFormat: chatAssistantPromptDefinition.options.responseFormat,
    });

    return NextResponse.json({
      reply: response.content,
      model: response.model,
    });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error && error.name === 'UnauthorizedError')
    ) {
      const status = error instanceof UnauthorizedError ? error.status : 401;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (isDependencyOutageError(error)) {
      return NextResponse.json({ error: DEPENDENCY_OUTAGE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
