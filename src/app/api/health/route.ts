import { NextResponse } from 'next/server';

/** Fast readiness probe for Playwright webServer / load balancers (no DB). */
export async function GET() {
  return NextResponse.json({ ok: true });
}
