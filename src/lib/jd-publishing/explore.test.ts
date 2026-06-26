import { exploreBossLikePublishSkill } from './explore';
import type {
  BrowserExecutor,
  BrowserStepResult,
  BrowserTargetInput,
  LocatorMatchReport,
  StructuredDomSnapshot,
  TargetDescriptor,
} from './types';

class ExploringExecutor implements BrowserExecutor {
  readonly calls: string[] = [];
  readonly resolvedTargets: TargetDescriptor[] = [];
  private formVisible = false;

  constructor(private readonly reportStatus: LocatorMatchReport['status'] = 'unique') {}

  private targetName(target: BrowserTargetInput): string {
    return typeof target === 'string' ? target : target.name;
  }

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    if (url.endsWith('/employer/jobs/new')) {
      this.formVisible = true;
    }
    return { success: true };
  }

  async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
    this.calls.push(`fill:${this.targetName(target)}:${value}`);
    return { success: true };
  }

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    this.calls.push(`click:${this.targetName(target)}`);
    return { success: true };
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForUrl:${url}`);
    return { success: true };
  }

  async check(check: { type: string; text?: string; selector?: string }): Promise<boolean> {
    this.calls.push(`check:${check.type}:${check.text ?? check.selector ?? ''}`);
    if (check.type === 'text_contains' && check.text === '职位名称') {
      return this.formVisible;
    }
    return true;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return '<form><label>职位名称</label><label>职位描述</label></form>';
  }

  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    this.calls.push('snapshotStructured');
    return {
      url: 'http://localhost:6183/employer/jobs/new',
      title: '发布职位',
      pageState: 'publish_form',
      headings: [
        {
          tag: 'h1',
          accessibleName: '发布职位',
          text: '发布职位',
          visible: true,
          enabled: true,
          editable: false,
        },
      ],
      forms: [
        {
          name: '发布职位',
          fields: ['职位名称', '公司名称', '薪资范围', '工作地点', '职位描述', '技能标签'].map(
            (label) => ({
              tag: label === '职位描述' ? 'textarea' : 'input',
              role: 'textbox',
              accessibleName: label,
              label,
              name:
                label === '职位名称'
                  ? 'title'
                  : label === '公司名称'
                    ? 'company'
                    : label === '薪资范围'
                      ? 'salary'
                      : label === '工作地点'
                        ? 'location'
                        : label === '职位描述'
                          ? 'description'
                          : 'keyword',
              visible: true,
              enabled: true,
              editable: true,
            }),
          ),
          buttons: ['添加', '发布职位'].map((label) => ({
            tag: 'button',
            role: 'button',
            accessibleName: label,
            text: label,
            visible: true,
            enabled: true,
            editable: false,
          })),
        },
      ],
      links: [],
      textBlocks: [],
    };
  }

  async resolveTarget(target: BrowserTargetInput): Promise<LocatorMatchReport> {
    const descriptor =
      typeof target === 'string' ? { kind: 'field' as const, name: target, exact: false } : target;
    this.resolvedTargets.push(descriptor);
    return {
      target: descriptor,
      status: this.reportStatus,
      strategy: 'role_name',
      candidateCount: this.reportStatus === 'not_found' ? 0 : 1,
      confidence: this.reportStatus === 'unique' ? 0.94 : 0.5,
      chosen:
        this.reportStatus === 'unique'
          ? {
              tag: descriptor.kind === 'button' ? 'button' : 'input',
              accessibleName: descriptor.name,
              visible: true,
              enabled: true,
              editable: descriptor.kind === 'field',
            }
          : undefined,
      candidates: [],
      reason: this.reportStatus === 'unique' ? undefined : 'fixture target was not unique',
    };
  }
}

describe('exploreBossLikePublishSkill', () => {
  it('uses browser operations to author an explored boss-like publish skill', async () => {
    const executor = new ExploringExecutor();

    const skill = await exploreBossLikePublishSkill({
      executor,
      context: {
        input: {},
        credentials: { username: 'admin', password: 'boss123' },
        target: {
          loginUrl: 'http://localhost:6183/employer/login',
          newJobUrl: 'http://localhost:6183/employer/jobs/new',
        },
      },
    });

    expect(executor.calls).toEqual(
      expect.arrayContaining([
        'navigate:http://localhost:6183/employer/jobs/new',
        'check:text_contains:职位名称',
        'snapshotStructured',
      ]),
    );
    expect(skill.name).toBe('publish_jd');
    expect(skill.platform).toBe('boss-like');
    expect(skill.version).toBe(1);
    expect(skill.isActive).toBe(true);
    expect(skill.meta?.created_from).toBe('explore');
    expect(skill.steps[0]).toEqual(
      expect.objectContaining({
        id: 'open_new_job',
        type: 'action',
        action: 'navigate',
      }),
    );
    expect(skill.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fill_title',
          params: expect.objectContaining({
            target: expect.objectContaining({
              kind: 'field',
              role: 'textbox',
              name: '职位名称',
              valueHint: 'title',
              scope: { kind: 'form', name: '发布职位' },
            }),
          }),
        }),
        expect.objectContaining({
          id: 'add_keywords',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '技能标签', valueHint: 'keyword' }),
            submitTarget: expect.objectContaining({ kind: 'button', name: '添加' }),
          }),
        }),
        expect.objectContaining({
          id: 'submit_job',
          params: expect.objectContaining({
            target: expect.objectContaining({ kind: 'button', name: '发布职位' }),
          }),
        }),
      ]),
    );
    expect(executor.resolvedTargets.map((target) => target.name)).toEqual(
      expect.arrayContaining([
        '职位名称',
        '公司名称',
        '薪资范围',
        '工作地点',
        '职位描述',
        '技能标签',
        '添加',
        '发布职位',
      ]),
    );
  });

  it('follows the login branch when the new job form is not visible initially', async () => {
    const executor = new ExploringExecutor();
    executor.navigate = async (url: string) => {
      executor.calls.push(`navigate:${url}`);
      return { success: true };
    };
    let checks = 0;
    executor.check = async (check: { type: string; text?: string }) => {
      executor.calls.push(`check:${check.type}:${check.text ?? ''}`);
      if (check.text === '职位名称') {
        checks += 1;
        return checks > 1;
      }
      return true;
    };

    await exploreBossLikePublishSkill({
      executor,
      context: {
        input: {},
        credentials: { username: 'hr', password: 'secret' },
        target: {
          loginUrl: 'http://localhost:6183/employer/login',
          newJobUrl: 'http://localhost:6183/employer/jobs/new',
        },
      },
    });

    expect(executor.calls.slice(0, 7)).toEqual([
      'navigate:http://localhost:6183/employer/jobs/new',
      'check:text_contains:职位名称',
      'navigate:http://localhost:6183/employer/login',
      'fill:用户名:hr',
      'fill:密码:secret',
      'click:登录',
      'waitForUrl:/employer/resumes',
    ]);
  });

  it('refuses to create a skill when target dry-run resolution is not unique', async () => {
    const executor = new ExploringExecutor('ambiguous');

    await expect(
      exploreBossLikePublishSkill({
        executor,
        context: {
          input: {},
          credentials: { username: 'admin', password: 'boss123' },
          target: {
            loginUrl: 'http://localhost:6183/employer/login',
            newJobUrl: 'http://localhost:6183/employer/jobs/new',
          },
        },
      }),
    ).rejects.toThrow(/explore_target_not_unique/);
  });
});
