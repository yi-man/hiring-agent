import { exploreBossLikePublishSkill } from './explore';
import type { BrowserExecutor, BrowserStepResult } from './types';

class ExploringExecutor implements BrowserExecutor {
  readonly calls: string[] = [];
  private formVisible = false;

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    if (url.endsWith('/employer/jobs/new')) {
      this.formVisible = true;
    }
    return { success: true };
  }

  async fill(locator: string, value: string): Promise<BrowserStepResult> {
    this.calls.push(`fill:${locator}:${value}`);
    return { success: true };
  }

  async click(locator: string): Promise<BrowserStepResult> {
    this.calls.push(`click:${locator}`);
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

    expect(executor.calls).toEqual([
      'navigate:http://localhost:6183/employer/jobs/new',
      'check:text_contains:职位名称',
      'check:text_contains:职位名称',
      'check:text_contains:公司名称',
      'check:text_contains:薪资范围',
      'check:text_contains:工作地点',
      'check:text_contains:职位描述',
      'check:text_contains:技能标签',
      'check:text_contains:发布职位',
      'snapshot',
    ]);
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
});
