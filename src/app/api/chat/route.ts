import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';

const DEFAULT_MODEL = 'gpt-4o-mini';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const { message } = (await request.json()) as { message?: string };

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const model = new ChatOpenAI({
      apiKey: requireEnv('OPENAI_API_KEY'),
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
      },
      temperature: 0.7,
    });

    const response = await model.invoke([
      new SystemMessage('你是一个招聘 AI 助手，回答时简洁、专业、可执行。'),
      new HumanMessage(message.trim()),
    ]);

    return NextResponse.json({
      reply: response.text,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
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
