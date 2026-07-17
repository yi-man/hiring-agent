import type { PublishPlatform, PublishSkill, TargetDescriptor } from './types';

const publishFormScope = { kind: 'form', name: '发布职位' } as const;

export type BossLikePublishTargets = {
  username: TargetDescriptor;
  password: TargetDescriptor;
  loginButton: TargetDescriptor;
  title: TargetDescriptor;
  company: TargetDescriptor;
  salary: TargetDescriptor;
  location: TargetDescriptor;
  description: TargetDescriptor;
  keyword: TargetDescriptor;
  keywordSubmit: TargetDescriptor;
  submit: TargetDescriptor;
};

function fieldTarget(params: {
  name: string;
  valueHint?: TargetDescriptor['valueHint'];
  stableName?: string;
  scope?: TargetDescriptor['scope'];
}): TargetDescriptor {
  return {
    kind: 'field',
    role: 'textbox',
    name: params.name,
    exact: true,
    valueHint: params.valueHint,
    stableAttrs: params.stableName ? { name: params.stableName } : undefined,
    scope: params.scope,
  };
}

function buttonTarget(name: string, scope?: TargetDescriptor['scope']): TargetDescriptor {
  return {
    kind: 'button',
    role: 'button',
    name,
    exact: true,
    scope,
  };
}

export function defaultBossLikePublishTargets(): BossLikePublishTargets {
  return {
    username: fieldTarget({ name: '用户名' }),
    password: fieldTarget({ name: '密码' }),
    loginButton: buttonTarget('登录'),
    title: fieldTarget({
      name: '职位名称',
      valueHint: 'title',
      stableName: 'title',
      scope: publishFormScope,
    }),
    company: fieldTarget({
      name: '公司名称',
      valueHint: 'company',
      stableName: 'company',
      scope: publishFormScope,
    }),
    salary: fieldTarget({
      name: '薪资范围',
      valueHint: 'salary',
      stableName: 'salary',
      scope: publishFormScope,
    }),
    location: fieldTarget({
      name: '工作地点',
      valueHint: 'location',
      stableName: 'location',
      scope: publishFormScope,
    }),
    description: fieldTarget({
      name: '职位描述',
      valueHint: 'description',
      stableName: 'description',
      scope: publishFormScope,
    }),
    keyword: fieldTarget({
      name: '技能标签',
      valueHint: 'keyword',
      stableName: 'keyword',
      scope: publishFormScope,
    }),
    keywordSubmit: buttonTarget('添加', publishFormScope),
    submit: buttonTarget('发布职位', publishFormScope),
  };
}

export function buildBossLikeStructuredPublishSkill(
  overrides: Partial<PublishSkill> = {},
  targetOverrides: Partial<BossLikePublishTargets> = {},
): PublishSkill {
  const targets = { ...defaultBossLikePublishTargets(), ...targetOverrides };
  return {
    id: 'boss-like-publish-jd',
    name: 'publish_jd',
    platform: 'boss-like',
    description: 'Publish a generated JD to the local boss-like employer job form.',
    version: 1,
    isActive: true,
    inputSchema: {
      title: 'string',
      company: 'string',
      salary: 'string',
      location: 'string',
      description: 'string',
      keywords: 'string[]',
    },
    variables: {},
    steps: [
      {
        id: 'open_new_job',
        type: 'action',
        action: 'navigate',
        params: { url: '{{target.newJobUrl}}' },
        next: 'check_login',
        onFail: { type: 'fallback_agent', reason: 'cannot open new job page' },
      },
      {
        id: 'check_login',
        type: 'condition',
        check: {
          id: 'new_job_form_visible',
          type: 'text_contains',
          text: '职位名称',
          timeout: 5_000,
        },
        ifTrue: { next: 'fill_title' },
        ifFalse: { next: 'fill_username' },
      },
      {
        id: 'fill_username',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.username,
          value: '{{credentials.username}}',
        },
        next: 'fill_password',
        onFail: { type: 'fallback_agent', reason: 'cannot fill username' },
      },
      {
        id: 'fill_password',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.password,
          value: '{{credentials.password}}',
        },
        next: 'submit_login',
        onFail: { type: 'fallback_agent', reason: 'cannot fill password' },
      },
      {
        id: 'submit_login',
        type: 'action',
        action: 'click',
        params: { target: targets.loginButton },
        next: 'wait_after_login',
        onFail: { type: 'fallback_agent', reason: 'cannot submit login' },
      },
      {
        id: 'wait_after_login',
        type: 'action',
        action: 'wait_for_url',
        params: { url: '{{target.loginSuccessUrl}}' },
        next: 'open_new_job_after_login',
        onFail: { type: 'fallback_agent', reason: 'login redirect did not complete' },
      },
      {
        id: 'open_new_job_after_login',
        type: 'action',
        action: 'navigate',
        params: { url: '{{target.newJobUrl}}' },
        next: 'fill_title',
        onFail: { type: 'fallback_agent', reason: 'cannot open new job page after login' },
      },
      {
        id: 'fill_title',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.title,
          value: '{{input.title}}',
        },
        next: 'fill_company',
        onFail: { type: 'fallback_agent', reason: 'cannot fill job title' },
      },
      {
        id: 'fill_company',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.company,
          value: '{{input.company}}',
        },
        next: 'fill_salary',
        onFail: { type: 'fallback_agent', reason: 'cannot fill company name' },
      },
      {
        id: 'fill_salary',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.salary,
          value: '{{input.salary}}',
        },
        next: 'fill_location',
        onFail: { type: 'fallback_agent', reason: 'cannot fill salary range' },
      },
      {
        id: 'fill_location',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.location,
          value: '{{input.location}}',
        },
        next: 'fill_description',
        onFail: { type: 'fallback_agent', reason: 'cannot fill job location' },
      },
      {
        id: 'fill_description',
        type: 'action',
        action: 'fill',
        params: {
          target: targets.description,
          value: '{{input.description}}',
        },
        next: 'add_keywords',
        onFail: { type: 'fallback_agent', reason: 'cannot fill job description' },
      },
      {
        id: 'add_keywords',
        type: 'action',
        action: 'add_keywords',
        params: {
          target: targets.keyword,
          values: '{{input.keywords}}',
          submitTarget: targets.keywordSubmit,
        },
        next: 'submit_job',
        onFail: { type: 'fallback_agent', reason: 'cannot add skill keywords' },
      },
      {
        id: 'submit_job',
        type: 'action',
        action: 'click',
        params: { target: targets.submit },
        next: 'wait_jobs_list',
        onFail: { type: 'fallback_agent', reason: 'cannot submit job publish form' },
      },
      {
        id: 'wait_jobs_list',
        type: 'action',
        action: 'wait_for_url',
        params: { url: '{{target.jobsListUrl}}' },
        next: 'verify_published',
        onFail: { type: 'fallback_agent', reason: 'jobs list redirect did not complete' },
      },
      {
        id: 'verify_published',
        type: 'condition',
        check: { id: 'job_title_visible', type: 'text_contains', text: '{{input.title}}' },
        ifTrue: { next: 'done' },
        onFail: { type: 'fallback_agent', reason: 'published job title is not visible' },
      },
      { id: 'done', type: 'end' },
      { id: 'failed', type: 'end' },
    ],
    ...overrides,
  };
}

export const bossLikePublishSkill: PublishSkill = buildBossLikeStructuredPublishSkill();

export const bossPublishSkill: PublishSkill = buildBossLikeStructuredPublishSkill(
  {
    id: 'boss-publish-jd',
    platform: 'boss',
    description: 'Publish a JD through the BOSS enterprise job workflow.',
  },
  {
    username: fieldTarget({ name: '手机号' }),
    title: fieldTarget({ name: '职位名称', valueHint: 'title' }),
    company: fieldTarget({ name: '招聘企业', valueHint: 'company' }),
    salary: fieldTarget({ name: '薪资范围', valueHint: 'salary' }),
    location: fieldTarget({ name: '工作城市', valueHint: 'location' }),
    description: fieldTarget({ name: '职位描述', valueHint: 'description' }),
    keyword: fieldTarget({ name: '职位关键词', valueHint: 'keyword' }),
    keywordSubmit: buttonTarget('确认'),
    submit: buttonTarget('发布'),
  },
);

export const liepinPublishSkill: PublishSkill = buildBossLikeStructuredPublishSkill(
  {
    id: 'liepin-publish-jd',
    platform: 'liepin',
    description: 'Publish a JD through the Liepin enterprise job workflow.',
  },
  {
    username: fieldTarget({ name: '账号/手机号' }),
    title: fieldTarget({ name: '职位名称', valueHint: 'title' }),
    company: fieldTarget({ name: '所属公司', valueHint: 'company' }),
    salary: fieldTarget({ name: '职位年薪', valueHint: 'salary' }),
    location: fieldTarget({ name: '工作地点', valueHint: 'location' }),
    description: fieldTarget({ name: '职位描述', valueHint: 'description' }),
    keyword: fieldTarget({ name: '职位标签', valueHint: 'keyword' }),
    keywordSubmit: buttonTarget('添加标签'),
    submit: buttonTarget('发布职位'),
  },
);

export const zhilianPublishSkill: PublishSkill = buildBossLikeStructuredPublishSkill(
  {
    id: 'zhilian-publish-jd',
    platform: 'zhilian',
    description: 'Publish a JD through the Zhilian enterprise job workflow.',
  },
  {
    username: fieldTarget({ name: '用户名/手机号' }),
    title: fieldTarget({ name: '职位名称', valueHint: 'title' }),
    company: fieldTarget({ name: '公司', valueHint: 'company' }),
    salary: fieldTarget({ name: '月薪', valueHint: 'salary' }),
    location: fieldTarget({ name: '工作地址', valueHint: 'location' }),
    description: fieldTarget({ name: '职位详情', valueHint: 'description' }),
    keyword: fieldTarget({ name: '技能要求', valueHint: 'keyword' }),
    keywordSubmit: buttonTarget('添加'),
    submit: buttonTarget('立即发布'),
  },
);

const activeSkills: Record<PublishPlatform, PublishSkill> = {
  boss: bossPublishSkill,
  liepin: liepinPublishSkill,
  zhilian: zhilianPublishSkill,
  'boss-like': bossLikePublishSkill,
};

export function getActivePublishSkill(platform: PublishPlatform): PublishSkill {
  return activeSkills[platform];
}
