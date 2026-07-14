/**
 * @jest-environment node
 */
import type {
  BrowserExecutor,
  BrowserStepCheck,
  BrowserStepResult,
  BrowserTargetInput,
  LocatorMatchReport,
  StructuredDomSnapshot,
} from '@/lib/browser/types';
import {
  exploreBossLikeScreeningWorkflow,
  repairBossLikeScreeningSteps,
  repairBossLikeScreeningTargetFromSnapshot,
} from './explore';
import { buildBossLikeScreeningSkill } from './skill-registry';
import type { SearchPlan } from '../types';

const baseUrl = 'http://localhost:6183';
const credentials = { username: 'admin', password: 'boss123' };
const searchPlan: SearchPlan = {
  keywords: ['Java'],
  filters: {},
  priorityTags: [],
  retrievalQuery: 'Java 后端',
};

const resumeListHtml = `
<article data-candidate-id="1" data-profile-url="/employer/resumes/1">
  <h2>王小明</h2>
  <p data-field="resume">Java Spring Boot 高并发 微服务</p>
</article>
`;

const refreshedResumeListHtml = `
<article data-candidate-id="2" data-profile-url="/employer/resumes/2">
  <h2>李小红</h2>
  <p data-field="resume">Java Spring Boot 分布式系统</p>
</article>
`;

function targetName(target: BrowserTargetInput): string {
  return typeof target === 'string' ? target : target.name;
}

function candidate(params: {
  tag: string;
  role?: string;
  name: string;
  editable?: boolean;
  stableName?: string;
  enabled?: boolean;
}) {
  return {
    tag: params.tag,
    role: params.role,
    accessibleName: params.name,
    label: params.editable ? params.name : undefined,
    text: params.editable ? undefined : params.name,
    name: params.stableName,
    visible: true,
    enabled: params.enabled ?? true,
    editable: params.editable ?? false,
  };
}

class ExploringScreeningExecutor implements BrowserExecutor {
  readonly calls: string[] = [];
  private currentPage: 'list' | 'detail' | 'composer' = 'list';

  constructor(private readonly includeCandidate = true) {}

  async navigate(url: string): Promise<BrowserStepResult> {
    this.calls.push(`navigate:${url}`);
    this.currentPage = url.includes('/employer/resumes/1') ? 'detail' : 'list';
    return { success: true };
  }

  async fill(target: BrowserTargetInput, value: string): Promise<BrowserStepResult> {
    this.calls.push(`fill:${targetName(target)}:${value}`);
    return { success: true };
  }

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    const name = targetName(target);
    this.calls.push(`click:${name}`);
    if (name === '沟通' || name === '打招呼') this.currentPage = 'composer';
    return { success: true };
  }

  async waitForUrl(url: string): Promise<BrowserStepResult> {
    this.calls.push(`waitForUrl:${url}`);
    return { success: true };
  }

  async check(check: BrowserStepCheck): Promise<boolean> {
    this.calls.push(`check:${check.id ?? check.text ?? check.selector ?? ''}`);
    return true;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return this.currentPage === 'list' && this.includeCandidate ? resumeListHtml : '<main></main>';
  }

  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    this.calls.push('snapshotStructured');
    if (this.currentPage === 'detail') {
      return {
        url: `${baseUrl}/employer/resumes/1`,
        title: '候选人详情',
        pageState: 'list',
        headings: [candidate({ tag: 'h1', name: '王小明' })],
        forms: [
          {
            name: '候选人操作',
            fields: [],
            buttons: [
              candidate({ tag: 'button', role: 'button', name: '沟通', stableName: 'greet' }),
              candidate({ tag: 'button', role: 'button', name: '收藏', stableName: 'collect' }),
            ],
          },
        ],
        links: [],
        textBlocks: [candidate({ tag: 'section', name: '候选人详情' })],
      };
    }
    if (this.currentPage === 'composer') {
      return {
        url: `${baseUrl}/employer/resumes/1`,
        title: '沟通',
        pageState: 'list',
        headings: [],
        forms: [
          {
            name: '沟通候选人',
            fields: [
              candidate({
                tag: 'textarea',
                role: 'textbox',
                name: '消息内容',
                editable: true,
                stableName: 'message',
              }),
            ],
            buttons: [
              candidate({ tag: 'button', role: 'button', name: '发送', stableName: 'send' }),
            ],
          },
        ],
        links: [],
        textBlocks: [],
      };
    }
    return {
      url: `${baseUrl}/employer/resumes`,
      title: '人才搜索',
      pageState: 'list',
      headings: [],
      forms: [
        {
          name: '人才搜索',
          fields: [
            candidate({
              tag: 'input',
              role: 'textbox',
              name: '关键词',
              editable: true,
              stableName: 'keyword',
            }),
          ],
          buttons: [
            candidate({ tag: 'button', role: 'button', name: '搜索', stableName: 'search' }),
          ],
        },
      ],
      links: [],
      textBlocks: [],
    };
  }
}

class FormlessSearchExploringExecutor extends ExploringScreeningExecutor {
  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    const snapshot = await super.snapshotStructured();
    return snapshot.url.endsWith('/employer/resumes') ? { ...snapshot, forms: [] } : snapshot;
  }

  async resolveTarget(target: BrowserTargetInput): Promise<LocatorMatchReport> {
    if (typeof target === 'string') {
      throw new Error('expected a semantic browser target');
    }
    this.calls.push(`resolve:${target.name}`);
    return {
      target,
      status: 'unique',
      strategy: 'fixture',
      candidateCount: 1,
      confidence: 1,
      candidates: [],
    };
  }
}

class AmbiguousFormlessDetailExploringExecutor extends FormlessSearchExploringExecutor {
  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    const snapshot = await super.snapshotStructured();
    return snapshot.url.endsWith('/employer/resumes/1') && snapshot.title === '候选人详情'
      ? {
          ...snapshot,
          forms: [],
          textBlocks: [
            candidate({ tag: 'section', name: '候选人详情' }),
            candidate({ tag: 'article', name: '候选人简历详情' }),
          ],
        }
      : snapshot;
  }

  async resolveTarget(target: BrowserTargetInput): Promise<LocatorMatchReport> {
    if (typeof target !== 'string' && target.name === '消息内容' && target.scope?.kind !== 'form') {
      return {
        target,
        status: 'not_found',
        strategy: 'fixture',
        candidateCount: 0,
        confidence: 0,
        candidates: [],
      };
    }
    return super.resolveTarget(target);
  }
}

class DelayedSearchResultsExploringExecutor extends ExploringScreeningExecutor {
  private candidatesReady = false;

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    const result = await super.click(target);
    if (targetName(target) === '搜索') {
      this.candidatesReady = false;
    }
    return result;
  }

  async check(check: BrowserStepCheck): Promise<boolean> {
    const result = await super.check(check);
    if (check.type === 'dom_exists' && check.selector === 'article[data-candidate-id]') {
      this.candidatesReady = true;
    }
    return result;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return this.candidatesReady ? resumeListHtml : '<main>正在加载候选人</main>';
  }
}

class RefreshedSearchResultsExploringExecutor extends ExploringScreeningExecutor {
  private searchSubmitted = false;
  private resultsRefreshed = false;

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    const result = await super.click(target);
    if (targetName(target) === '搜索') {
      this.searchSubmitted = true;
    }
    return result;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return this.searchSubmitted && !this.resultsRefreshed
      ? resumeListHtml
      : refreshedResumeListHtml;
  }

  async waitForSnapshotChange(): Promise<BrowserStepResult> {
    this.calls.push('waitForSnapshotChange');
    this.resultsRefreshed = true;
    return { success: true };
  }
}

class UrlThenResultsExploringExecutor extends ExploringScreeningExecutor {
  private searchSubmitted = false;
  private urlChanged = false;
  private resultsRefreshed = false;

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    const result = await super.click(target);
    if (targetName(target) === '搜索') {
      this.searchSubmitted = true;
    }
    return result;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    if (!this.searchSubmitted) return resumeListHtml;
    if (!this.urlChanged) return resumeListHtml;
    return this.resultsRefreshed ? refreshedResumeListHtml : '<main>正在加载候选人</main>';
  }

  async waitForSnapshotChange(
    _previousSnapshot: string,
    previousUrl?: string,
  ): Promise<BrowserStepResult> {
    this.calls.push(`waitForSnapshotChange:${previousUrl ? 'url' : 'snapshot'}`);
    if (previousUrl) {
      this.urlChanged = true;
      return { success: true };
    }
    this.resultsRefreshed = true;
    return { success: true };
  }
}

class NestedEmptySearchResultsExploringExecutor extends ExploringScreeningExecutor {
  private searchSubmitted = false;

  async click(target: BrowserTargetInput): Promise<BrowserStepResult> {
    const result = await super.click(target);
    if (targetName(target) === '搜索') {
      this.searchSubmitted = true;
    }
    return result;
  }

  async snapshot(): Promise<string> {
    this.calls.push('snapshot');
    return this.searchSubmitted
      ? '<main><section><span>暂无</span><b>符合条件的候选人</b></section></main>'
      : resumeListHtml;
  }

  async waitForSnapshotChange(): Promise<BrowserStepResult> {
    this.calls.push('waitForSnapshotChange');
    return { success: true };
  }
}

class DelayedArticleDetailExploringExecutor extends ExploringScreeningExecutor {
  private detailReady = false;

  async navigate(url: string): Promise<BrowserStepResult> {
    const result = await super.navigate(url);
    if (url === `${baseUrl}/employer/resumes/1`) this.detailReady = false;
    return result;
  }

  async check(check: BrowserStepCheck): Promise<boolean> {
    const result = await super.check(check);
    if (check.type === 'dom_exists' && check.selector === 'main article') {
      this.detailReady = true;
    }
    return result;
  }

  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    const detailVisited = this.calls.includes(`navigate:${baseUrl}/employer/resumes/1`);
    const composerOpened = this.calls.includes('click:打招呼');
    if (detailVisited && !composerOpened && !this.detailReady) {
      return {
        url: `${baseUrl}/employer/resumes/1`,
        title: 'Boss Like - 招聘平台',
        pageState: 'list',
        headings: [],
        forms: [],
        links: [],
        textBlocks: [candidate({ tag: 'div', name: '加载中...' })],
      };
    }
    if (detailVisited && !composerOpened) {
      return {
        url: `${baseUrl}/employer/resumes/1`,
        title: 'Boss Like - 招聘平台',
        pageState: 'list',
        headings: [candidate({ tag: 'h2', name: '本地验收候选人' })],
        forms: [],
        links: [],
        textBlocks: [
          candidate({ tag: 'article', name: '候选人档案' }),
          candidate({ tag: 'p', name: '候选人' }),
          candidate({ tag: 'p', name: '经验见简历' }),
        ],
      };
    }
    return super.snapshotStructured();
  }

  async resolveTarget(target: BrowserTargetInput): Promise<LocatorMatchReport> {
    const name = targetName(target);
    this.calls.push(`resolve:${name}`);
    return {
      target: typeof target === 'string' ? { kind: 'text', name: target, exact: false } : target,
      status: name === '候选人详情' ? 'not_found' : 'unique',
      strategy: 'fixture',
      candidateCount: name === '候选人详情' ? 0 : 1,
      confidence: name === '候选人详情' ? 0 : 1,
      candidates: [],
    };
  }
}

class DisabledSendButtonExploringExecutor extends ExploringScreeningExecutor {
  async snapshotStructured(): Promise<StructuredDomSnapshot> {
    if (this.calls.includes('click:打招呼') || this.calls.includes('click:沟通')) {
      return {
        url: `${baseUrl}/employer/resumes/1`,
        title: '沟通',
        pageState: 'list',
        headings: [],
        forms: [
          {
            name: '沟通候选人',
            fields: [
              candidate({
                tag: 'textarea',
                role: 'textbox',
                name: '消息',
                editable: true,
                stableName: 'message',
              }),
            ],
            buttons: [
              candidate({
                tag: 'button',
                role: 'button',
                name: '发送',
                stableName: 'send',
                enabled: false,
              }),
            ],
          },
        ],
        links: [],
        textBlocks: [],
      };
    }
    return super.snapshotStructured();
  }

  async resolveTarget(target: BrowserTargetInput): Promise<LocatorMatchReport> {
    const name = targetName(target);
    this.calls.push(`resolve:${name}`);
    return {
      target: typeof target === 'string' ? { kind: 'text', name: target, exact: false } : target,
      status: name === '发送' ? 'not_found' : 'unique',
      strategy: 'fixture',
      candidateCount: name === '发送' ? 0 : 1,
      confidence: name === '发送' ? 0 : 1,
      candidates: [],
    };
  }
}

describe('exploreBossLikeScreeningWorkflow', () => {
  it('returns the first actual search observation without sending or collecting', async () => {
    const executor = new ExploringScreeningExecutor();

    const explored = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });
    if (!explored) throw new Error('expected workflow exploration to find a candidate detail');
    const { skill } = explored;

    expect(skill.id).toMatch(/^boss-like-screen-candidates-explore-/);
    expect(explored.firstKeyword).toBe('Java');
    expect(explored.firstListHtml).toContain('data-candidate-id');
    expect(skill.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'search_submit',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '搜索' }),
          }),
        }),
        expect.objectContaining({
          id: 'contact_send',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '发送' }),
          }),
        }),
      ]),
    );
    expect(executor.calls.filter((call) => call === 'click:搜索')).toHaveLength(1);
    expect(executor.calls).not.toEqual(expect.arrayContaining(['click:发送', 'click:收藏']));
  });

  it('keeps chat composer targets scoped to any composer form instead of one candidate name', async () => {
    const executor = new ExploringScreeningExecutor();

    const explored = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });
    if (!explored) throw new Error('expected workflow exploration to find a candidate detail');

    const messageStep = explored.skill.steps.find((step) => step.id === 'contact_fill_message');
    const sendStep = explored.skill.steps.find((step) => step.id === 'contact_send');
    expect(messageStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ scope: { kind: 'form' } }),
        }),
      }),
    );
    expect(sendStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ scope: { kind: 'form' } }),
        }),
      }),
    );
  });

  it('returns no workflow when the first search has no candidate detail to inspect', async () => {
    const executor = new ExploringScreeningExecutor(false);

    await expect(
      exploreBossLikeScreeningWorkflow({ executor, baseUrl, credentials, searchPlan }),
    ).resolves.toBeNull();
  });

  it('waits for search candidates before reading the first exploration snapshot', async () => {
    const executor = new DelayedSearchResultsExploringExecutor();

    await expect(
      exploreBossLikeScreeningWorkflow({ executor, baseUrl, credentials, searchPlan }),
    ).resolves.toEqual(
      expect.objectContaining({ skill: expect.objectContaining({ name: 'screen_candidates' }) }),
    );

    expect(executor.calls).toContain('check:article[data-candidate-id]');
  });

  it('waits for a new search-result snapshot instead of learning the previous candidate list', async () => {
    const executor = new RefreshedSearchResultsExploringExecutor();

    await expect(
      exploreBossLikeScreeningWorkflow({ executor, baseUrl, credentials, searchPlan }),
    ).resolves.toEqual(
      expect.objectContaining({ skill: expect.objectContaining({ name: 'screen_candidates' }) }),
    );

    expect(executor.calls).toContain('waitForSnapshotChange');
    expect(executor.calls).toContain(`navigate:${baseUrl}/employer/resumes/2`);
  });

  it('keeps waiting for a result snapshot after the search URL changes', async () => {
    const executor = new UrlThenResultsExploringExecutor();

    await expect(
      exploreBossLikeScreeningWorkflow({ executor, baseUrl, credentials, searchPlan }),
    ).resolves.toEqual(
      expect.objectContaining({ skill: expect.objectContaining({ name: 'screen_candidates' }) }),
    );

    expect(executor.calls).toEqual(
      expect.arrayContaining([
        'waitForSnapshotChange:url',
        'waitForSnapshotChange:snapshot',
        `navigate:${baseUrl}/employer/resumes/2`,
      ]),
    );
  });

  it('accepts a nested explicit empty-state message after the result page changes', async () => {
    const executor = new NestedEmptySearchResultsExploringExecutor();

    await expect(
      exploreBossLikeScreeningWorkflow({ executor, baseUrl, credentials, searchPlan }),
    ).resolves.toBeNull();
  });

  it('waits for a rendered candidate article before learning its detail readiness target', async () => {
    const executor = new DelayedArticleDetailExploringExecutor();

    const explored = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });
    if (!explored) throw new Error('expected workflow exploration to find a candidate detail');

    const detailWait = explored.skill.steps.find((step) => step.id === 'detail_wait');
    expect(detailWait).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          text: '经验见简历',
        }),
      }),
    );
    expect(executor.calls).toContain('check:main article');
  });

  it('records a disabled composer send button without validating it before the message is filled', async () => {
    const executor = new DisabledSendButtonExploringExecutor();

    const explored = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });
    if (!explored) throw new Error('expected workflow exploration to find a candidate detail');

    const messageStep = explored.skill.steps.find((step) => step.id === 'contact_fill_message');
    const sendStep = explored.skill.steps.find((step) => step.id === 'contact_send');
    expect(messageStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ name: '消息' }),
        }),
      }),
    );
    expect(sendStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({ target: expect.objectContaining({ name: '发送' }) }),
      }),
    );
    expect(executor.calls).not.toEqual(expect.arrayContaining(['resolve:发送', 'click:发送']));
  });

  it('explores a form-less search page through unique semantic global targets', async () => {
    const executor = new FormlessSearchExploringExecutor();

    const explored = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });
    if (!explored) throw new Error('expected workflow exploration to find a candidate detail');

    const searchFill = explored.skill.steps.find((step) => step.id === 'search_fill');
    const searchSubmit = explored.skill.steps.find((step) => step.id === 'search_submit');
    expect(searchFill).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ name: '搜索候选人', role: 'textbox' }),
        }),
      }),
    );
    expect(searchSubmit).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ name: '搜索', role: 'button' }),
        }),
      }),
    );
    expect(executor.calls).toEqual(expect.arrayContaining(['resolve:搜索候选人', 'resolve:搜索']));
  });

  it('explores an ambiguous form-less detail page through unique semantic global targets', async () => {
    const executor = new AmbiguousFormlessDetailExploringExecutor();

    const explored = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });
    if (!explored) throw new Error('expected workflow exploration to find a candidate detail');

    const detailWait = explored.skill.steps.find((step) => step.id === 'detail_wait');
    const greeting = explored.skill.steps.find((step) => step.id === 'contact_open_greeting');
    const message = explored.skill.steps.find((step) => step.id === 'contact_fill_message');
    const collect = explored.skill.steps.find((step) => step.id === 'collect_click');
    expect(detailWait).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          text: '候选人详情',
        }),
      }),
    );
    expect(greeting).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ name: '打招呼' }),
        }),
      }),
    );
    expect(message).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          target: expect.objectContaining({ name: '消息内容', scope: { kind: 'form' } }),
        }),
      }),
    );
    expect(collect).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({ target: expect.objectContaining({ name: '收藏' }) }),
      }),
    );
    expect(executor.calls).toEqual(
      expect.arrayContaining(['resolve:候选人详情', 'resolve:打招呼', 'resolve:收藏']),
    );
  });

  it('derives a renamed search target from the failed screening step snapshot', async () => {
    const executor = new ExploringScreeningExecutor();
    const snapshot = await executor.snapshotStructured();
    const renamedSnapshot: StructuredDomSnapshot = {
      ...snapshot,
      forms: snapshot.forms.map((form) => ({
        ...form,
        buttons: form.buttons.map((button) => ({
          ...button,
          accessibleName: '开始检索',
          name: 'candidate-search-submit',
          testId: 'candidate-search-submit',
        })),
      })),
    };

    expect(
      repairBossLikeScreeningTargetFromSnapshot({
        snapshot: renamedSnapshot,
        failedStepId: 'search_submit',
        targetKey: 'searchSubmit',
        failedTarget: {
          kind: 'button',
          role: 'button',
          name: '搜索',
          exact: true,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        name: '开始检索',
        stableAttrs: expect.objectContaining({ testId: 'candidate-search-submit' }),
      }),
    );
  });

  it('patches all contact targets from one relearned composer context', () => {
    const repaired = repairBossLikeScreeningSteps({
      steps: buildBossLikeScreeningSkill().steps,
      failedStepId: 'contact_send',
      targets: {
        greetButton: { kind: 'button', role: 'button', name: '开始沟通', exact: true },
        messageInput: { kind: 'field', role: 'textbox', name: '沟通内容', exact: true },
        sendButton: { kind: 'button', role: 'button', name: '确认发送', exact: true },
      },
    });

    expect(repaired).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'contact_open_greeting',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '开始沟通' }),
          }),
        }),
        expect.objectContaining({
          id: 'contact_fill_message',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '沟通内容' }),
          }),
        }),
        expect.objectContaining({
          id: 'contact_send',
          params: expect.objectContaining({
            target: expect.objectContaining({ name: '确认发送' }),
          }),
        }),
      ]),
    );
  });
});
