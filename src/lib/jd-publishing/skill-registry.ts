import type { PublishPlatform, PublishSkill, TargetDescriptor } from './types';

const publishFormScope = { kind: 'form', name: '发布职位' } as const;

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

export function buildBossLikeStructuredPublishSkill(
  overrides: Partial<PublishSkill> = {},
): PublishSkill {
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
          target: fieldTarget({ name: '用户名' }),
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
          target: fieldTarget({ name: '密码' }),
          value: '{{credentials.password}}',
        },
        next: 'submit_login',
        onFail: { type: 'fallback_agent', reason: 'cannot fill password' },
      },
      {
        id: 'submit_login',
        type: 'action',
        action: 'click',
        params: { target: buttonTarget('登录') },
        next: 'wait_after_login',
        onFail: { type: 'fallback_agent', reason: 'cannot submit login' },
      },
      {
        id: 'wait_after_login',
        type: 'action',
        action: 'wait_for_url',
        params: { url: '/employer/resumes' },
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
          target: fieldTarget({
            name: '职位名称',
            valueHint: 'title',
            stableName: 'title',
            scope: publishFormScope,
          }),
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
          target: fieldTarget({
            name: '公司名称',
            valueHint: 'company',
            stableName: 'company',
            scope: publishFormScope,
          }),
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
          target: fieldTarget({
            name: '薪资范围',
            valueHint: 'salary',
            stableName: 'salary',
            scope: publishFormScope,
          }),
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
          target: fieldTarget({
            name: '工作地点',
            valueHint: 'location',
            stableName: 'location',
            scope: publishFormScope,
          }),
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
          target: fieldTarget({
            name: '职位描述',
            valueHint: 'description',
            stableName: 'description',
            scope: publishFormScope,
          }),
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
          target: fieldTarget({
            name: '技能标签',
            valueHint: 'keyword',
            stableName: 'keyword',
            scope: publishFormScope,
          }),
          values: '{{input.keywords}}',
          submitTarget: buttonTarget('添加', publishFormScope),
        },
        next: 'submit_job',
        onFail: { type: 'fallback_agent', reason: 'cannot add skill keywords' },
      },
      {
        id: 'submit_job',
        type: 'action',
        action: 'click',
        params: { target: buttonTarget('发布职位', publishFormScope) },
        next: 'wait_jobs_list',
        onFail: { type: 'fallback_agent', reason: 'cannot submit job publish form' },
      },
      {
        id: 'wait_jobs_list',
        type: 'action',
        action: 'wait_for_url',
        params: { url: '/employer/jobs' },
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

const activeSkills: Record<PublishPlatform, PublishSkill> = {
  'boss-like': bossLikePublishSkill,
};

export function getActivePublishSkill(platform: PublishPlatform): PublishSkill {
  return activeSkills[platform];
}
