import { NextResponse } from 'next/server';
import type { JDAgentRequest } from '@/types';
import { runJDAgent } from '@/lib/jd-agent/service';

function badRequest(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as JDAgentRequest;

    if (!body?.action) {
      return badRequest('action is required');
    }

    if (body.action === 'initial_generate' && !body.jobInput?.trim()) {
      return badRequest('jobInput is required for initial_generate');
    }

    if (body.action === 'continue_generate' && !body.currentJd) {
      return badRequest('currentJd is required for continue_generate');
    }

    const data = await runJDAgent(body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
