import { randomUUID } from 'crypto';
import {
  buildBossLikeStructuredPublishSkill,
  defaultBossLikePublishTargets,
  type BossLikePublishTargets,
} from './skill-registry';
import type {
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserTargetInput,
  BrowserStepResult,
  DomCandidate,
  PublishExecutionContext,
  PublishSkill,
  PublishSkillAction,
  StructuredDomSnapshot,
  TargetDescriptor,
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

type TargetValidation = {
  stepId: string;
  action: PublishSkillAction;
  target: BrowserTargetInput;
};

type FieldRequirement = {
  key: keyof Pick<
    BossLikePublishTargets,
    'title' | 'company' | 'salary' | 'location' | 'description' | 'keyword'
  >;
  label: string;
  valueHint: NonNullable<TargetDescriptor['valueHint']>;
  patterns: RegExp[];
};

const PUBLISH_FIELD_REQUIREMENTS: FieldRequirement[] = [
  {
    key: 'title',
    label: '职位名称',
    valueHint: 'title',
    patterns: [/职位名称/, /岗位名称/, /job\s*title/i],
  },
  { key: 'company', label: '公司名称', valueHint: 'company', patterns: [/公司名称/, /company/i] },
  {
    key: 'salary',
    label: '薪资范围',
    valueHint: 'salary',
    patterns: [/薪资范围/, /薪资/, /salary/i],
  },
  {
    key: 'location',
    label: '工作地点',
    valueHint: 'location',
    patterns: [/工作地点/, /地点/, /location/i],
  },
  {
    key: 'description',
    label: '职位描述',
    valueHint: 'description',
    patterns: [/职位描述/, /岗位描述/, /description/i],
  },
  {
    key: 'keyword',
    label: '技能标签',
    valueHint: 'keyword',
    patterns: [/技能标签/, /技能/, /标签/, /keyword/i],
  },
];

function candidateSearchText(candidate: DomCandidate): string {
  return [
    candidate.accessibleName,
    candidate.label,
    candidate.placeholder,
    candidate.name,
    candidate.id,
    candidate.testId,
    candidate.text,
  ]
    .filter(Boolean)
    .join(' ');
}

function candidateMatches(candidate: DomCandidate, patterns: RegExp[]): boolean {
  const text = candidateSearchText(candidate);
  return patterns.some((pattern) => pattern.test(text));
}

function candidateScore(candidate: DomCandidate, patterns: RegExp[]): number {
  const text = candidateSearchText(candidate);
  let score = 0;
  if (patterns.some((pattern) => pattern.test(candidate.label ?? ''))) score += 16;
  if (patterns.some((pattern) => pattern.test(candidate.accessibleName ?? ''))) score += 14;
  if (patterns.some((pattern) => pattern.test(candidate.placeholder ?? ''))) score += 10;
  if (patterns.some((pattern) => pattern.test(candidate.name ?? ''))) score += 6;
  if (patterns.some((pattern) => pattern.test(text))) score += 2;
  if (candidate.testId || candidate.id || candidate.name) score += 2;
  return score;
}

function bestCandidate(candidates: DomCandidate[], patterns: RegExp[]): DomCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.visible)
    .filter((candidate) => candidate.enabled)
    .filter((candidate) => candidateMatches(candidate, patterns))
    .sort((left, right) => candidateScore(right, patterns) - candidateScore(left, patterns))[0];
}

function stableAttrsFromCandidate(candidate: DomCandidate): TargetDescriptor['stableAttrs'] {
  const stableAttrs = {
    testId: candidate.testId,
    id: candidate.id,
    name: candidate.name,
  };
  return Object.values(stableAttrs).some(Boolean) ? stableAttrs : undefined;
}

function targetNameFromCandidate(candidate: DomCandidate, fallback: string): string {
  return (
    candidate.label ??
    candidate.accessibleName ??
    candidate.placeholder ??
    candidate.text ??
    candidate.name ??
    fallback
  );
}

function fieldTargetFromCandidate(params: {
  candidate: DomCandidate;
  fallbackName: string;
  valueHint: TargetDescriptor['valueHint'];
  scope?: TargetDescriptor['scope'];
}): TargetDescriptor {
  return {
    kind: 'field',
    role: params.candidate.role === 'combobox' ? 'combobox' : 'textbox',
    name: targetNameFromCandidate(params.candidate, params.fallbackName),
    exact: true,
    valueHint: params.valueHint,
    stableAttrs: stableAttrsFromCandidate(params.candidate),
    scope: params.scope,
  };
}

function buttonTargetFromCandidate(params: {
  candidate: DomCandidate;
  fallbackName: string;
  scope?: TargetDescriptor['scope'];
}): TargetDescriptor {
  return {
    kind: 'button',
    role: 'button',
    name: targetNameFromCandidate(params.candidate, params.fallbackName),
    exact: true,
    stableAttrs: stableAttrsFromCandidate(params.candidate),
    scope: params.scope,
  };
}

function selectPublishForm(
  snapshot: StructuredDomSnapshot,
): StructuredDomSnapshot['forms'][number] {
  const [form] = [...snapshot.forms].sort((left, right) => {
    const score = (form: StructuredDomSnapshot['forms'][number]) =>
      PUBLISH_FIELD_REQUIREMENTS.filter((requirement) =>
        bestCandidate(form.fields, requirement.patterns),
      ).length + (bestCandidate(form.buttons, [/发布职位/, /发布/, /publish/i]) ? 2 : 0);
    return score(right) - score(left);
  });
  if (!form) {
    throw new Error('explore_publish_form_not_found: no form candidates in structured snapshot');
  }
  return form;
}

function buildPublishTargetsFromSnapshot(
  snapshot: StructuredDomSnapshot,
): Partial<BossLikePublishTargets> {
  const form = selectPublishForm(snapshot);
  const scope = { kind: 'form', name: form.name ?? '发布职位' } as const;
  const targets: Partial<BossLikePublishTargets> = {};

  for (const requirement of PUBLISH_FIELD_REQUIREMENTS) {
    const candidate = bestCandidate(form.fields, requirement.patterns);
    if (!candidate) {
      throw new Error(`explore_target_missing: ${requirement.key} ${requirement.label}`);
    }
    targets[requirement.key] = fieldTargetFromCandidate({
      candidate,
      fallbackName: requirement.label,
      valueHint: requirement.valueHint,
      scope,
    });
  }

  const keywordSubmit = bestCandidate(form.buttons, [/添加/, /add/i]);
  if (!keywordSubmit) {
    throw new Error('explore_target_missing: keywordSubmit 添加');
  }
  targets.keywordSubmit = buttonTargetFromCandidate({
    candidate: keywordSubmit,
    fallbackName: '添加',
    scope,
  });

  const submit = bestCandidate(form.buttons, [/发布职位/, /发布/, /publish/i]);
  if (!submit) {
    throw new Error('explore_target_missing: submit 发布职位');
  }
  targets.submit = buttonTargetFromCandidate({
    candidate: submit,
    fallbackName: '发布职位',
    scope,
  });

  return targets;
}

function buildLoginTargetsFromSnapshot(
  snapshot?: StructuredDomSnapshot,
): Pick<BossLikePublishTargets, 'username' | 'password' | 'loginButton'> {
  const defaults = defaultBossLikePublishTargets();
  const form = snapshot?.forms[0];
  if (!form) {
    return {
      username: defaults.username,
      password: defaults.password,
      loginButton: defaults.loginButton,
    };
  }
  const username = bestCandidate(form.fields, [/用户名/, /账号/, /username/i, /email/i]);
  const password = bestCandidate(form.fields, [/密码/, /password/i]);
  const loginButton = bestCandidate(form.buttons, [/登录/, /login/i]);
  return {
    username: username
      ? fieldTargetFromCandidate({
          candidate: username,
          fallbackName: '用户名',
          valueHint: undefined,
        })
      : defaults.username,
    password: password
      ? fieldTargetFromCandidate({
          candidate: password,
          fallbackName: '密码',
          valueHint: undefined,
        })
      : defaults.password,
    loginButton: loginButton
      ? buttonTargetFromCandidate({ candidate: loginButton, fallbackName: '登录' })
      : defaults.loginButton,
  };
}

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
  stepId: string;
  target: BrowserTargetInput;
  options: BrowserResolveOptions;
}): Promise<void> {
  const { executor, stepId, target, options } = params;
  if (!executor.resolveTarget) return;
  const report = await executor.resolveTarget(target, options);
  if (report.status !== 'unique') {
    throw new Error(
      `explore_target_not_unique: ${stepId} ${report.status} ${report.reason ?? report.target.name}`,
    );
  }
}

async function dryRunTargets(params: {
  executor: BrowserExecutor;
  targets: TargetValidation[];
}): Promise<void> {
  for (const target of params.targets) {
    await ensureTargetResolvable({
      executor: params.executor,
      stepId: target.stepId,
      target: target.target,
      options: actionResolveOptions(target.action),
    });
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
        stepId: step.id,
        target,
        options: actionResolveOptions(step.action),
      });
    }
    const submitTarget = step.params.submitTarget;
    if (isBrowserTargetInput(submitTarget)) {
      await ensureTargetResolvable({
        executor,
        stepId: step.id,
        target: submitTarget,
        options: { action: 'click' },
      });
    }
  }
}

async function ensureBossLikeFormVisible(params: {
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<Partial<BossLikePublishTargets>> {
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
  if (formVisible) return {};

  ensureSuccess('open login page', await executor.navigate(loginUrl));
  const loginSnapshot = await executor.snapshotStructured?.();
  const loginTargets = buildLoginTargetsFromSnapshot(loginSnapshot);
  await dryRunTargets({
    executor,
    targets: [
      { stepId: 'fill_username', action: 'fill', target: loginTargets.username },
      { stepId: 'fill_password', action: 'fill', target: loginTargets.password },
      { stepId: 'submit_login', action: 'click', target: loginTargets.loginButton },
    ],
  });
  ensureSuccess(
    'fill username',
    await executor.fill(loginTargets.username, readString(credentials, 'username')),
  );
  ensureSuccess(
    'fill password',
    await executor.fill(loginTargets.password, readString(credentials, 'password')),
  );
  ensureSuccess('submit login', await executor.click(loginTargets.loginButton));
  ensureSuccess('wait after login', await executor.waitForUrl('/employer/resumes'));
  ensureSuccess('open new job page after login', await executor.navigate(newJobUrl));
  return loginTargets;
}

export async function exploreBossLikePublishSkill(params: {
  executor: BrowserExecutor;
  context: PublishExecutionContext;
}): Promise<PublishSkill> {
  const { executor, context } = params;
  const loginTargets = await ensureBossLikeFormVisible({ executor, context });

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
  if (!structuredSnapshot) {
    throw new Error('boss-like explore requires structured DOM snapshot support');
  }

  const skill = buildBossLikeStructuredPublishSkill(
    {
      id: `boss-like-publish-jd-explore-${randomUUID()}`,
      version: 1,
      isActive: true,
      meta: {
        success_rate: 0,
        usage_count: 0,
        created_from: 'explore',
      },
    },
    {
      ...buildPublishTargetsFromSnapshot(structuredSnapshot),
      ...loginTargets,
    },
  );

  await dryRunResolveSkillTargets({ executor, skill });

  return skill;
}
