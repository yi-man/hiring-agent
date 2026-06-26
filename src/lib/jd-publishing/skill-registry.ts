import type { PublishPlatform, PublishSkill } from './types';

export const bossLikePublishSkill: PublishSkill = {
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
      params: { locator: '用户名', value: '{{credentials.username}}' },
      next: 'fill_password',
    },
    {
      id: 'fill_password',
      type: 'action',
      action: 'fill',
      params: { locator: '密码', value: '{{credentials.password}}' },
      next: 'submit_login',
    },
    {
      id: 'submit_login',
      type: 'action',
      action: 'click',
      params: { locator: '登录' },
      next: 'wait_after_login',
    },
    {
      id: 'wait_after_login',
      type: 'action',
      action: 'wait_for_url',
      params: { url: '/employer/resumes' },
      next: 'open_new_job_after_login',
    },
    {
      id: 'open_new_job_after_login',
      type: 'action',
      action: 'navigate',
      params: { url: '{{target.newJobUrl}}' },
      next: 'fill_title',
    },
    {
      id: 'fill_title',
      type: 'action',
      action: 'fill',
      params: { locator: '职位名称', value: '{{input.title}}' },
      next: 'fill_company',
    },
    {
      id: 'fill_company',
      type: 'action',
      action: 'fill',
      params: { locator: '公司名称', value: '{{input.company}}' },
      next: 'fill_salary',
    },
    {
      id: 'fill_salary',
      type: 'action',
      action: 'fill',
      params: { locator: '薪资范围', value: '{{input.salary}}' },
      next: 'fill_location',
    },
    {
      id: 'fill_location',
      type: 'action',
      action: 'fill',
      params: { locator: '工作地点', value: '{{input.location}}' },
      next: 'fill_description',
    },
    {
      id: 'fill_description',
      type: 'action',
      action: 'fill',
      params: { locator: '职位描述', value: '{{input.description}}' },
      next: 'add_keywords',
    },
    {
      id: 'add_keywords',
      type: 'action',
      action: 'add_keywords',
      params: {
        locator: '技能标签',
        values: '{{input.keywords}}',
        submitLocator: '添加',
      },
      next: 'submit_job',
    },
    {
      id: 'submit_job',
      type: 'action',
      action: 'click',
      params: { locator: '发布职位' },
      next: 'wait_jobs_list',
    },
    {
      id: 'wait_jobs_list',
      type: 'action',
      action: 'wait_for_url',
      params: { url: '/employer/jobs' },
      next: 'verify_published',
    },
    {
      id: 'verify_published',
      type: 'condition',
      check: { id: 'job_title_visible', type: 'text_contains', text: '{{input.title}}' },
      ifTrue: { next: 'done' },
      ifFalse: { next: 'failed' },
    },
    { id: 'done', type: 'end' },
    { id: 'failed', type: 'end' },
  ],
};

const activeSkills: Record<PublishPlatform, PublishSkill> = {
  'boss-like': bossLikePublishSkill,
};

export function getActivePublishSkill(platform: PublishPlatform): PublishSkill {
  return activeSkills[platform];
}
