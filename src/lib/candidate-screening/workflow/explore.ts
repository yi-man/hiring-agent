import { randomUUID } from 'crypto';
import type {
  BrowserAction,
  BrowserExecutor,
  BrowserResolveOptions,
  BrowserStepResult,
  BrowserTargetInput,
  DomCandidate,
  StructuredDomSnapshot,
  TargetDescriptor,
} from '@/lib/browser/types';
import type { PublishStep } from '@/lib/jd-publishing/types';
import {
  extractBossLikeCandidatesFromHtml,
  resolveBossLikeProfileUrl,
} from '../adapters/boss-like';
import type { SearchPlan } from '../types';
import { buildBossLikeScreeningSkill, defaultBossLikeScreeningTargets } from './skill-registry';
import {
  SCREENING_STEP_IDS,
  type BossLikeScreeningExploration,
  type BossLikeScreeningTargets,
  type ScreeningWorkflowSkill,
} from './types';

export type { BossLikeScreeningExploration } from './types';

type ExploreBossLikeScreeningWorkflowParams = {
  executor: BrowserExecutor;
  baseUrl: string;
  credentials: {
    username: string;
    password: string;
  };
  searchPlan: SearchPlan;
};

type CandidateRequirement = {
  key: string;
  patterns: RegExp[];
};

type ScreeningRepairKey = keyof BossLikeScreeningTargets;

const REPAIR_KEY_BY_STEP: Record<string, readonly ScreeningRepairKey[]> = {
  [SCREENING_STEP_IDS.loginFillUsername]: ['username'],
  [SCREENING_STEP_IDS.loginFillPassword]: ['password'],
  [SCREENING_STEP_IDS.loginSubmit]: ['loginButton'],
  [SCREENING_STEP_IDS.searchFill]: ['searchInput'],
  [SCREENING_STEP_IDS.searchSubmit]: ['searchSubmit'],
  [SCREENING_STEP_IDS.contactOpenGreeting]: ['greetButton'],
  [SCREENING_STEP_IDS.contactFillMessage]: ['messageInput'],
  [SCREENING_STEP_IDS.contactSend]: ['sendButton'],
  [SCREENING_STEP_IDS.collectClick]: ['collectButton'],
};

const CONTACT_REPAIR_STEP_IDS = [
  SCREENING_STEP_IDS.contactOpenGreeting,
  SCREENING_STEP_IDS.contactFillMessage,
  SCREENING_STEP_IDS.contactSend,
] as const;

const REPAIR_KEY_BY_TARGET_STEP: Record<string, ScreeningRepairKey> = {
  [SCREENING_STEP_IDS.loginFillUsername]: 'username',
  [SCREENING_STEP_IDS.loginFillPassword]: 'password',
  [SCREENING_STEP_IDS.loginSubmit]: 'loginButton',
  [SCREENING_STEP_IDS.searchFill]: 'searchInput',
  [SCREENING_STEP_IDS.searchSubmit]: 'searchSubmit',
  [SCREENING_STEP_IDS.contactOpenGreeting]: 'greetButton',
  [SCREENING_STEP_IDS.contactFillMessage]: 'messageInput',
  [SCREENING_STEP_IDS.contactSend]: 'sendButton',
  [SCREENING_STEP_IDS.collectClick]: 'collectButton',
};

const REPAIR_KEY_BY_VALUE_HINT: Partial<
  Record<NonNullable<TargetDescriptor['valueHint']>, ScreeningRepairKey>
> = {
  keyword: 'searchInput',
  message: 'messageInput',
};

const SEARCH_FIELD_REQUIREMENT: CandidateRequirement = {
  key: 'searchInput',
  patterns: [/搜索/, /关键词/, /人才/, /keyword/i],
};
const SEARCH_BUTTON_REQUIREMENT: CandidateRequirement = {
  key: 'searchSubmit',
  patterns: [/搜索/, /检索/, /查询/, /search/i],
};
const USERNAME_FIELD_REQUIREMENT: CandidateRequirement = {
  key: 'username',
  patterns: [/用户名/, /账号/, /username/i, /email/i],
};
const PASSWORD_FIELD_REQUIREMENT: CandidateRequirement = {
  key: 'password',
  patterns: [/密码/, /password/i],
};
const LOGIN_BUTTON_REQUIREMENT: CandidateRequirement = {
  key: 'loginButton',
  patterns: [/登录/, /login/i],
};
const DETAIL_CONTENT_REQUIREMENT: CandidateRequirement = {
  key: 'detailContent',
  patterns: [/候选人详情/, /简历详情/, /候选人/, /简历/],
};
const DETAIL_READINESS_REQUIREMENT: CandidateRequirement = {
  key: 'detailReadiness',
  patterns: [/^经验见简历(?:\s+经验见简历)?$/],
};
const GREET_BUTTON_REQUIREMENT: CandidateRequirement = {
  key: 'greetButton',
  patterns: [/打招呼/, /沟通/, /聊天/, /联系/],
};
const COLLECT_BUTTON_REQUIREMENT: CandidateRequirement = {
  key: 'collectButton',
  patterns: [/收藏/, /收集/, /保存/],
};
const MESSAGE_FIELD_REQUIREMENT: CandidateRequirement = {
  key: 'messageInput',
  patterns: [/消息/, /沟通内容/, /招呼内容/, /message/i],
};
const SEND_BUTTON_REQUIREMENT: CandidateRequirement = {
  key: 'sendButton',
  patterns: [/发送/, /确认发送/, /send/i],
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

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
  return patterns.some((pattern) => pattern.test(candidateSearchText(candidate)));
}

function candidateScore(candidate: DomCandidate, patterns: RegExp[]): number {
  let score = 0;
  if (patterns.some((pattern) => pattern.test(candidate.label ?? ''))) score += 16;
  if (patterns.some((pattern) => pattern.test(candidate.accessibleName ?? ''))) score += 14;
  if (patterns.some((pattern) => pattern.test(candidate.placeholder ?? ''))) score += 10;
  if (patterns.some((pattern) => pattern.test(candidate.name ?? ''))) score += 6;
  if (patterns.some((pattern) => pattern.test(candidateSearchText(candidate)))) score += 2;
  if (candidate.testId || candidate.id || candidate.name) score += 2;
  return score;
}

function selectCandidate(params: {
  candidates: DomCandidate[];
  requirement: CandidateRequirement;
  includeDisabled?: boolean;
}): DomCandidate {
  const matches = params.candidates
    .filter((candidate) => candidate.visible)
    .filter((candidate) => params.includeDisabled || candidate.enabled)
    .filter((candidate) => candidateMatches(candidate, params.requirement.patterns))
    .map((candidate) => ({
      candidate,
      score: candidateScore(candidate, params.requirement.patterns),
    }))
    .sort((left, right) => right.score - left.score);
  const [best, second] = matches;

  if (!best) {
    throw new Error(`screening_explore_target_missing: ${params.requirement.key}`);
  }
  if (second && best.score === second.score) {
    throw new Error(`screening_explore_target_not_unique: ${params.requirement.key}`);
  }
  return best.candidate;
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
  valueHint?: string;
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

function textTargetFromCandidate(params: {
  candidate: DomCandidate;
  fallbackName: string;
}): TargetDescriptor {
  return {
    kind: 'text',
    name: targetNameFromCandidate(params.candidate, params.fallbackName),
    exact: true,
    stableAttrs: stableAttrsFromCandidate(params.candidate),
    scope: { kind: 'page' },
  };
}

function selectForm(params: {
  snapshot: StructuredDomSnapshot;
  fieldRequirement?: CandidateRequirement;
  buttonRequirement?: CandidateRequirement;
  key: string;
}): StructuredDomSnapshot['forms'][number] {
  const matchingForms = params.snapshot.forms
    .map((form) => {
      const score =
        (params.fieldRequirement &&
        form.fields.some((field) => candidateMatches(field, params.fieldRequirement!.patterns))
          ? 1
          : 0) +
        (params.buttonRequirement &&
        form.buttons.some((button) => candidateMatches(button, params.buttonRequirement!.patterns))
          ? 1
          : 0);
      return { form, score };
    })
    .filter(
      ({ score }) =>
        score ===
        Number(Boolean(params.fieldRequirement)) + Number(Boolean(params.buttonRequirement)),
    );

  if (matchingForms.length !== 1) {
    throw new Error(`screening_explore_target_not_unique: ${params.key}`);
  }
  return matchingForms[0]!.form;
}

function formScope(form: StructuredDomSnapshot['forms'][number], fallback: string) {
  return { kind: 'form', name: form.name ?? fallback } as const;
}

function buildLoginTargets(
  snapshot: StructuredDomSnapshot,
): Pick<BossLikeScreeningTargets, 'username' | 'password' | 'loginButton'> {
  const form = selectForm({
    snapshot,
    fieldRequirement: USERNAME_FIELD_REQUIREMENT,
    buttonRequirement: LOGIN_BUTTON_REQUIREMENT,
    key: 'loginForm',
  });
  const scope = formScope(form, '登录');
  return {
    username: fieldTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.fields,
        requirement: USERNAME_FIELD_REQUIREMENT,
      }),
      fallbackName: '用户名',
      scope,
    }),
    password: fieldTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.fields,
        requirement: PASSWORD_FIELD_REQUIREMENT,
      }),
      fallbackName: '密码',
      scope,
    }),
    loginButton: buttonTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.buttons,
        requirement: LOGIN_BUTTON_REQUIREMENT,
      }),
      fallbackName: '登录',
      scope,
    }),
  };
}

function buildSearchTargets(
  snapshot: StructuredDomSnapshot,
): Pick<BossLikeScreeningTargets, 'searchInput' | 'searchSubmit'> {
  if (snapshot.forms.length === 0) {
    const defaults = defaultBossLikeScreeningTargets();
    return {
      searchInput: defaults.searchInput,
      searchSubmit: defaults.searchSubmit,
    };
  }

  const form = selectForm({
    snapshot,
    fieldRequirement: SEARCH_FIELD_REQUIREMENT,
    buttonRequirement: SEARCH_BUTTON_REQUIREMENT,
    key: 'searchForm',
  });
  const scope = formScope(form, '人才搜索');
  return {
    searchInput: fieldTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.fields,
        requirement: SEARCH_FIELD_REQUIREMENT,
      }),
      fallbackName: '搜索候选人',
      valueHint: 'keyword',
      scope,
    }),
    searchSubmit: buttonTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.buttons,
        requirement: SEARCH_BUTTON_REQUIREMENT,
      }),
      fallbackName: '搜索',
      scope,
    }),
  };
}

function buildDetailTargets(
  snapshot: StructuredDomSnapshot,
): Pick<BossLikeScreeningTargets, 'detailContent' | 'greetButton' | 'collectButton'> {
  const defaults = defaultBossLikeScreeningTargets();
  let detailContent = defaults.detailContent;
  try {
    detailContent = textTargetFromCandidate({
      candidate: selectCandidate({
        candidates: [...snapshot.headings, ...snapshot.textBlocks],
        requirement: DETAIL_READINESS_REQUIREMENT,
      }),
      fallbackName: '经验见简历',
    });
  } catch {
    try {
      detailContent = textTargetFromCandidate({
        candidate: selectCandidate({
          candidates: [...snapshot.headings, ...snapshot.textBlocks],
          requirement: DETAIL_CONTENT_REQUIREMENT,
        }),
        fallbackName: '候选人详情',
      });
    } catch {
      // A form-less detail page can still validate the semantic default through resolveTarget.
    }
  }

  let greetButton = defaults.greetButton;
  let collectButton = defaults.collectButton;
  try {
    const form = selectForm({
      snapshot,
      buttonRequirement: GREET_BUTTON_REQUIREMENT,
      key: 'detailActions',
    });
    const scope = formScope(form, '候选人操作');
    try {
      greetButton = buttonTargetFromCandidate({
        candidate: selectCandidate({
          candidates: form.buttons,
          requirement: GREET_BUTTON_REQUIREMENT,
        }),
        fallbackName: '打招呼',
        scope,
      });
    } catch {
      // Keep the semantic default when the greeting control cannot be identified uniquely.
    }
    try {
      collectButton = buttonTargetFromCandidate({
        candidate: selectCandidate({
          candidates: form.buttons,
          requirement: COLLECT_BUTTON_REQUIREMENT,
        }),
        fallbackName: '收藏',
        scope,
      });
    } catch {
      // Keep the semantic default when the collection control cannot be identified uniquely.
    }
  } catch {
    // A form-less detail page can still validate the semantic defaults through resolveTarget.
  }

  return {
    detailContent,
    greetButton,
    collectButton,
  };
}

function buildComposerTargets(
  snapshot: StructuredDomSnapshot,
): Pick<BossLikeScreeningTargets, 'messageInput' | 'sendButton'> {
  const form = selectForm({
    snapshot,
    fieldRequirement: MESSAGE_FIELD_REQUIREMENT,
    buttonRequirement: SEND_BUTTON_REQUIREMENT,
    key: 'chatComposer',
  });
  // The fallback form name is often the candidate heading, so persisting it would make this
  // reusable workflow fail for every other candidate. The composer is unique on the detail page.
  const scope = { kind: 'form' } as const;
  return {
    messageInput: fieldTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.fields,
        requirement: MESSAGE_FIELD_REQUIREMENT,
      }),
      fallbackName: '消息',
      valueHint: 'message',
      scope,
    }),
    sendButton: buttonTargetFromCandidate({
      candidate: selectCandidate({
        candidates: form.buttons,
        requirement: SEND_BUTTON_REQUIREMENT,
        includeDisabled: true,
      }),
      fallbackName: '发送',
      scope,
    }),
  };
}

function repairKeyFromFailedTarget(params: {
  failedStepId: string;
  targetKey: string;
  failedTarget: BrowserTargetInput;
}): ScreeningRepairKey | undefined {
  const stepKeys = REPAIR_KEY_BY_STEP[params.failedStepId];
  if (stepKeys?.includes(params.targetKey as ScreeningRepairKey)) {
    return params.targetKey as ScreeningRepairKey;
  }
  if (typeof params.failedTarget === 'string') return undefined;
  return params.failedTarget.valueHint
    ? REPAIR_KEY_BY_VALUE_HINT[params.failedTarget.valueHint]
    : undefined;
}

export function repairBossLikeScreeningTargetFromSnapshot(params: {
  snapshot: StructuredDomSnapshot;
  failedStepId: string;
  targetKey: string;
  failedTarget: BrowserTargetInput;
}): TargetDescriptor | undefined {
  const repairKey = repairKeyFromFailedTarget(params);
  if (!repairKey) return undefined;

  try {
    if (repairKey === 'username' || repairKey === 'password' || repairKey === 'loginButton') {
      return buildLoginTargets(params.snapshot)[repairKey];
    }
    if (repairKey === 'searchInput' || repairKey === 'searchSubmit') {
      return buildSearchTargets(params.snapshot)[repairKey];
    }
    if (
      repairKey === 'detailContent' ||
      repairKey === 'greetButton' ||
      repairKey === 'collectButton'
    ) {
      return buildDetailTargets(params.snapshot)[repairKey];
    }
    return buildComposerTargets(params.snapshot)[repairKey];
  } catch {
    return undefined;
  }
}

export function repairBossLikeScreeningSteps(params: {
  steps: PublishStep[];
  failedStepId: string;
  targets: Partial<BossLikeScreeningTargets>;
}): PublishStep[] | null {
  const stepIds = CONTACT_REPAIR_STEP_IDS.includes(
    params.failedStepId as (typeof CONTACT_REPAIR_STEP_IDS)[number],
  )
    ? CONTACT_REPAIR_STEP_IDS
    : [params.failedStepId];

  const repairedTargets = stepIds.map((stepId) => {
    const targetKey = REPAIR_KEY_BY_TARGET_STEP[stepId];
    const target = targetKey ? params.targets[targetKey] : undefined;
    return { stepId, target };
  });
  if (repairedTargets.some(({ target }) => !target)) return null;

  const targetByStepId = new Map(
    repairedTargets.map(({ stepId, target }) => [stepId, target] as const),
  );
  return params.steps.map((step) => {
    const target = targetByStepId.get(step.id);
    if (!target || step.type !== 'action') return step;
    return { ...step, params: { ...step.params, target } };
  });
}

function ensureSuccess(label: string, result: BrowserStepResult): void {
  if (!result.success) {
    throw new Error(`${label} failed: ${result.error ?? 'unknown browser error'}`);
  }
}

function actionResolveOptions(action: BrowserAction | 'check'): BrowserResolveOptions {
  return action === 'fill' ? { action, requireEditable: true } : { action };
}

async function requireUniqueTarget(params: {
  executor: BrowserExecutor;
  key: string;
  target: TargetDescriptor;
  action: BrowserAction | 'check';
}): Promise<void> {
  if (!params.executor.resolveTarget) return;
  const report = await params.executor.resolveTarget(
    params.target,
    actionResolveOptions(params.action),
  );
  if (report.status !== 'unique') {
    throw new Error(
      `screening_explore_target_not_unique: ${params.key} ${report.status} ${report.reason ?? params.target.name}`,
    );
  }
}

async function requireStructuredSnapshot(
  executor: BrowserExecutor,
  stage: string,
): Promise<StructuredDomSnapshot> {
  if (!executor.snapshotStructured) {
    throw new Error('screening_explore_structured_snapshot_required');
  }
  const snapshot = await executor.snapshotStructured();
  if (!snapshot) {
    throw new Error(`screening_explore_structured_snapshot_missing: ${stage}`);
  }
  return snapshot;
}

async function requireRawSnapshot(executor: BrowserExecutor): Promise<string> {
  if (!executor.snapshot) {
    throw new Error('screening_explore_raw_snapshot_required');
  }
  const html = await executor.snapshot();
  if (!html.trim()) {
    throw new Error('screening_explore_empty_list_snapshot');
  }
  return html;
}

function isLoginSnapshot(snapshot: StructuredDomSnapshot): boolean {
  return snapshot.pageState === 'login' || /\/login(?:\/|$)/.test(snapshot.url);
}

function firstSearchKeyword(plan: SearchPlan): string | null {
  const keyword = plan.keywords.find((value) => value.trim());
  return keyword?.trim() || plan.retrievalQuery.trim() || null;
}

const SEARCH_RESULT_SNAPSHOT_CHANGE_MAX_ATTEMPTS = 5;

function isExplicitEmptySearchResultSnapshot(html: string): boolean {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, '');
  return /暂无(?:符合条件的)?(?:简历|候选人|人才|数据)/.test(text);
}

async function waitForCandidateSearchResults(
  executor: BrowserExecutor,
  previousSnapshot: string,
  previousUrl: string,
): Promise<string> {
  if (executor.waitForSnapshotChange) {
    let snapshot = previousSnapshot;
    for (let attempt = 0; attempt < SEARCH_RESULT_SNAPSHOT_CHANGE_MAX_ATTEMPTS; attempt += 1) {
      ensureSuccess(
        'wait for candidate search result change',
        await executor.waitForSnapshotChange(snapshot, attempt === 0 ? previousUrl : undefined),
      );
      snapshot = await requireRawSnapshot(executor);
      if (
        extractBossLikeCandidatesFromHtml(snapshot).length > 0 ||
        isExplicitEmptySearchResultSnapshot(snapshot)
      ) {
        return snapshot;
      }
    }
    throw new Error('screening_explore_candidate_results_not_ready');
  }

  const hasCandidateCards = await executor.check({
    type: 'dom_exists',
    selector: 'article[data-candidate-id]',
    timeout: 5_000,
  });
  if (hasCandidateCards) return requireRawSnapshot(executor);

  const hasEmptyState = await executor.check({
    type: 'text_contains',
    text: '暂无',
    timeout: 5_000,
  });
  if (hasEmptyState) return requireRawSnapshot(executor);
  throw new Error('screening_explore_candidate_results_not_ready');
}

export async function exploreBossLikeScreeningWorkflow(
  params: ExploreBossLikeScreeningWorkflowParams,
): Promise<(BossLikeScreeningExploration & ScreeningWorkflowSkill) | null> {
  const { executor, credentials, searchPlan } = params;
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const resumeListUrl = `${baseUrl}/employer/resumes`;
  const defaults = defaultBossLikeScreeningTargets();

  ensureSuccess('open resume list', await executor.navigate(resumeListUrl));
  let listSnapshot = await requireStructuredSnapshot(executor, 'resume_list');
  let loginTargets: Pick<BossLikeScreeningTargets, 'username' | 'password' | 'loginButton'> = {
    username: defaults.username,
    password: defaults.password,
    loginButton: defaults.loginButton,
  };

  if (isLoginSnapshot(listSnapshot)) {
    loginTargets = buildLoginTargets(listSnapshot);
    await requireUniqueTarget({
      executor,
      key: 'username',
      target: loginTargets.username,
      action: 'fill',
    });
    await requireUniqueTarget({
      executor,
      key: 'password',
      target: loginTargets.password,
      action: 'fill',
    });
    await requireUniqueTarget({
      executor,
      key: 'loginButton',
      target: loginTargets.loginButton,
      action: 'click',
    });
    ensureSuccess(
      'fill username',
      await executor.fill(loginTargets.username, credentials.username),
    );
    ensureSuccess(
      'fill password',
      await executor.fill(loginTargets.password, credentials.password),
    );
    ensureSuccess('submit login', await executor.click(loginTargets.loginButton));
    ensureSuccess('wait for resume list', await executor.waitForUrl(resumeListUrl));
    listSnapshot = await requireStructuredSnapshot(executor, 'resume_list_after_login');
  }

  const searchTargets = buildSearchTargets(listSnapshot);
  await requireUniqueTarget({
    executor,
    key: 'searchInput',
    target: searchTargets.searchInput,
    action: 'fill',
  });
  await requireUniqueTarget({
    executor,
    key: 'searchSubmit',
    target: searchTargets.searchSubmit,
    action: 'click',
  });
  const keyword = firstSearchKeyword(searchPlan);
  if (!keyword) {
    throw new Error('screening_explore_search_keyword_required');
  }
  ensureSuccess('fill search keyword', await executor.fill(searchTargets.searchInput, keyword));
  const previousSearchSnapshot = await requireRawSnapshot(executor);
  ensureSuccess('submit candidate search', await executor.click(searchTargets.searchSubmit));
  const candidateSearchSnapshot = await waitForCandidateSearchResults(
    executor,
    previousSearchSnapshot,
    listSnapshot.url,
  );

  const candidates = extractBossLikeCandidatesFromHtml(candidateSearchSnapshot);
  const profileUrl = candidates
    .map((candidate) => resolveBossLikeProfileUrl(candidate.profileUrl, baseUrl).profileUrl)
    .find((candidateUrl): candidateUrl is string => Boolean(candidateUrl));
  if (!profileUrl) {
    return null;
  }

  ensureSuccess('open candidate detail', await executor.navigate(profileUrl));
  if (
    !(await executor.check({
      type: 'dom_exists',
      selector: 'main article',
      timeout: 5_000,
    }))
  ) {
    throw new Error('screening_explore_candidate_detail_not_ready');
  }
  const detailTargets = buildDetailTargets(
    await requireStructuredSnapshot(executor, 'candidate_detail'),
  );
  await requireUniqueTarget({
    executor,
    key: 'detailContent',
    target: detailTargets.detailContent,
    action: 'check',
  });
  await requireUniqueTarget({
    executor,
    key: 'greetButton',
    target: detailTargets.greetButton,
    action: 'click',
  });
  await requireUniqueTarget({
    executor,
    key: 'collectButton',
    target: detailTargets.collectButton,
    action: 'click',
  });

  ensureSuccess('open chat composer', await executor.click(detailTargets.greetButton));
  const composerTargets = buildComposerTargets(
    await requireStructuredSnapshot(executor, 'chat_composer'),
  );
  await requireUniqueTarget({
    executor,
    key: 'messageInput',
    target: composerTargets.messageInput,
    action: 'fill',
  });
  // The real composer keeps Send disabled until messageInput is filled. Runtime execution fills it
  // before clicking Send, so discovery records the button without validating its disabled state.

  const skill = buildBossLikeScreeningSkill(
    {
      id: `boss-like-screen-candidates-explore-${randomUUID()}`,
      version: 1,
      isActive: true,
      meta: {
        success_rate: 0,
        usage_count: 0,
        created_from: 'explore',
      },
    },
    {
      ...loginTargets,
      ...searchTargets,
      ...detailTargets,
      ...composerTargets,
    },
  );
  return {
    ...skill,
    skill,
    firstKeyword: keyword,
    firstListHtml: candidateSearchSnapshot,
  };
}
