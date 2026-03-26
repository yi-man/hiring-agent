import { NextResponse } from 'next/server';
import { listMessages } from '@/lib/chat/repositories/message-repo';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'conversation id is required' }, { status: 400 });
    }
    const messages = await listMessages(id);
    return NextResponse.json({ messages, total: messages.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
