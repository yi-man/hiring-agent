import { NextResponse } from 'next/server';
import {
  countConversations,
  createConversation,
  listConversationsPaginated,
} from '@/lib/chat/repositories/conversation-repo';

export async function POST() {
  try {
    const conversation = await createConversation(null);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;
    const [conversations, total] = await Promise.all([
      listConversationsPaginated({ limit, offset }),
      countConversations(),
    ]);
    return NextResponse.json({
      conversations,
      total,
      page,
      limit,
      hasMore: offset + conversations.length < total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
