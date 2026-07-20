import { NextResponse } from 'next/server';
import { requireAuth, UnauthorizedError } from '@/lib/auth/session';
import { parseJobDescriptionLifecyclePayload } from '@/lib/jd/api';
import {
  applyJobDescriptionLifecycle,
  type ApplyJobDescriptionLifecycleResult,
} from '@/lib/jd/job-description-repo';

function lifecycleFailureResponse(
  result: Extract<ApplyJobDescriptionLifecycleResult, { ok: false }>,
) {
  if (result.reason === 'not_found') {
    return NextResponse.json({ error: '未找到该 JD' }, { status: 404 });
  }

  const messages = {
    invalid_transition: '当前 JD 状态不允许执行此操作',
    hiring_target_required: '重新开放招聘前请先设置招聘人数',
    hiring_target_reached: '招聘人数必须大于已入职人数',
    concurrent_update: 'JD 状态已变化，请刷新后重试',
  } as const;
  return NextResponse.json({ error: messages[result.reason] }, { status: 409 });
}

function lifecycleValidationMessage(message: string): string {
  const messages: Record<string, string> = {
    'invalid JSON body': '请求内容不是有效的 JSON',
    'hiringTarget must be an integer between 1 and 999': '招聘人数必须是 1 到 999 的整数',
    'action is invalid': '生命周期操作无效',
  };
  return messages[message] ?? message;
}

function serverErrorResponse(error: unknown) {
  if (
    error instanceof UnauthorizedError ||
    (error instanceof Error && error.name === 'UnauthorizedError')
  ) {
    const status = error instanceof UnauthorizedError ? error.status : 401;
    return NextResponse.json({ error: error.message }, { status });
  }
  const message = error instanceof Error ? error.message : 'Unknown server error';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: 'JD ID 不能为空' }, { status: 400 });
    }

    const parsed = parseJobDescriptionLifecyclePayload(await request.json().catch(() => undefined));
    if (!parsed.ok) {
      return NextResponse.json(
        { error: lifecycleValidationMessage(parsed.error) },
        { status: 400 },
      );
    }

    const result = await applyJobDescriptionLifecycle({
      userId: auth.user.id,
      id,
      request: parsed.value,
    });
    if (!result.ok) {
      return lifecycleFailureResponse(result);
    }
    return NextResponse.json({ jobDescription: result.jobDescription });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
