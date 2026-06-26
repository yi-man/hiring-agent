import { randomUUID } from 'crypto';
import { bossLikePublishSkill } from './skill-registry';
import type {
  BrowserExecutor,
  BrowserStepResult,
  PublishExecutionContext,
  PublishSkill,
} from './types';

const REQUIRED_BOSS_LIKE_FORM_TEXT = [
  '职位名称',
  '公司名称',
  '薪资范围',
  '工作地点',
  '职位描述',
  '技能标签',
  '发布职位',
];

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function ensureSuccess(label: string, result: BrowserStepResult): void {
  if (!result.success) {
    throw new Error(`${label} failed: ${result.error ?? 'unknown browser error'}`);
  }
}

async function ensureBossLikeFormVisible(params: {
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<void> {
  const { executor, context } = params;
  const target = context.target;
  const credentials = context.credentials;
  const newJobUrl = readString(target, 'newJobUrl');
  const loginUrl = readString(target, 'loginUrl');

  ensureSuccess('open new job page', await executor.navigate(newJobUrl));

  const formVisible = await executor.check({
    id: 'explore_new_job_form_visible',
    type: 'text_contains',
    text: '职位名称',
    timeout: 5_000,
  });
  if (formVisible) return;

  ensureSuccess('open login page', await executor.navigate(loginUrl));
  ensureSuccess(
    'fill username',
    await executor.fill('用户名', readString(credentials, 'username')),
  );
  ensureSuccess('fill password', await executor.fill('密码', readString(credentials, 'password')));
  ensureSuccess('submit login', await executor.click('登录'));
  ensureSuccess('wait after login', await executor.waitForUrl('/employer/resumes'));
  ensureSuccess('open new job page after login', await executor.navigate(newJobUrl));
}

export async function exploreBossLikePublishSkill(params: {
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<PublishSkill> {
  const { executor, context } = params;
  await ensureBossLikeFormVisible({ executor, context });

  for (const text of REQUIRED_BOSS_LIKE_FORM_TEXT) {
    const exists = await executor.check({
      id: `explore_text_${text}`,
      type: 'text_contains',
      text,
      timeout: 5_000,
    });
    if (!exists) {
      const snapshot = await executor.snapshot?.();
      throw new Error(
        `boss-like publish form is missing text: ${text}${snapshot ? `\n${snapshot}` : ''}`,
      );
    }
  }

  await executor.snapshot?.();

  return {
    ...bossLikePublishSkill,
    id: `boss-like-publish-jd-explore-${randomUUID()}`,
    version: 1,
    isActive: true,
    meta: {
      success_rate: 0,
      usage_count: 0,
      created_from: 'explore',
    },
  };
}
