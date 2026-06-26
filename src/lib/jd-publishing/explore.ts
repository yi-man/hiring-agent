import { randomUUID } from 'crypto';
import { buildBossLikeStructuredPublishSkill } from './skill-registry';
import type {
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserTargetInput,
  BrowserStepResult,
  PublishExecutionContext,
  PublishSkill,
  PublishSkillAction,
  PublishStep,
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

function actionResolveOptions(action: PublishSkillAction): BrowserResolveOptions {
  if (action === 'fill' || action === 'add_keywords') {
    return { action, requireEditable: true };
  }
  return { action };
}

function isBrowserTargetInput(value: unknown): value is BrowserTargetInput {
  if (typeof value === 'string') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.kind === 'string' && typeof record.name === 'string';
}

async function ensureTargetResolvable(params: {
  executor: BrowserExecutor;
  step: Extract<PublishStep, { type: 'action' }>;
  target: BrowserTargetInput;
  options: BrowserResolveOptions;
}): Promise<void> {
  const { executor, step, target, options } = params;
  if (!executor.resolveTarget) return;
  const report = await executor.resolveTarget(target, options);
  if (report.status !== 'unique') {
    throw new Error(
      `explore_target_not_unique: ${step.id} ${report.status} ${report.reason ?? report.target.name}`,
    );
  }
}

async function dryRunResolveSkillTargets(params: {
  executor: BrowserExecutor;
  skill: PublishSkill;
}): Promise<void> {
  const { executor, skill } = params;
  const currentPageTargetSteps = new Set([
    'fill_title',
    'fill_company',
    'fill_salary',
    'fill_location',
    'fill_description',
    'add_keywords',
    'submit_job',
  ]);
  for (const step of skill.steps) {
    if (step.type !== 'action') continue;
    if (!currentPageTargetSteps.has(step.id)) continue;
    const target = step.params.target;
    if (isBrowserTargetInput(target)) {
      await ensureTargetResolvable({
        executor,
        step,
        target,
        options: actionResolveOptions(step.action),
      });
    }
    const submitTarget = step.params.submitTarget;
    if (isBrowserTargetInput(submitTarget)) {
      await ensureTargetResolvable({
        executor,
        step,
        target: submitTarget,
        options: { action: 'click' },
      });
    }
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
  const structuredSnapshot = await executor.snapshotStructured?.();
  if (structuredSnapshot && structuredSnapshot.pageState !== 'publish_form') {
    throw new Error(`boss-like explore page is not publish_form: ${structuredSnapshot.pageState}`);
  }

  const skill = buildBossLikeStructuredPublishSkill({
    id: `boss-like-publish-jd-explore-${randomUUID()}`,
    version: 1,
    isActive: true,
    meta: {
      success_rate: 0,
      usage_count: 0,
      created_from: 'explore',
    },
  });

  await dryRunResolveSkillTargets({ executor, skill });

  return skill;
}
