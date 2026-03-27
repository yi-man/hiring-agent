import { NextResponse } from 'next/server';
import {
  countConversations,
  createConversation,
  listConversationsPaginated,
} from '@/lib/chat/repositories/conversation-repo';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { DEPENDENCY_OUTAGE_MESSAGE, isDependencyOutageError } from '@/lib/errors/dependency-outage';

export async function POST() {
  try {
    const auth = await requireAuth();
    const conversation = await createConversation(auth.user.id);
    return NextResponse.json({ conversation }, { status: 201 });
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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;
    const [conversations, total] = await Promise.all([
      listConversationsPaginated({ limit, offset, userId: auth.user.id }),
      countConversations(auth.user.id),
    ]);
    return NextResponse.json({
      conversations,
      total,
      page,
      limit,
      hasMore: offset + conversations.length < total,
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
