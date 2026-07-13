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
  repairBossLikeScreeningTargetFromSnapshot,
} from './explore';
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

function targetName(target: BrowserTargetInput): string {
  return typeof target === 'string' ? target : target.name;
}

function candidate(params: {
  tag: string;
  role?: string;
  name: string;
  editable?: boolean;
  stableName?: string;
}) {
  return {
    tag: params.tag,
    role: params.role,
    accessibleName: params.name,
    label: params.editable ? params.name : undefined,
    text: params.editable ? undefined : params.name,
    name: params.stableName,
    visible: true,
    enabled: true,
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

describe('exploreBossLikeScreeningWorkflow', () => {
  it('explores list and detail targets without sending or collecting', async () => {
    const executor = new ExploringScreeningExecutor();

    const skill = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });

    expect(skill.id).toMatch(/^boss-like-screen-candidates-explore-/);
    expect(skill.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'search_candidates',
          params: expect.objectContaining({
            targets: expect.objectContaining({
              searchSubmit: expect.objectContaining({ name: '搜索' }),
            }),
          }),
        }),
        expect.objectContaining({
          id: 'chat_candidate',
          params: expect.objectContaining({
            targets: expect.objectContaining({
              sendButton: expect.objectContaining({ name: '发送' }),
            }),
          }),
        }),
      ]),
    );
    expect(executor.calls).not.toEqual(expect.arrayContaining(['click:发送', 'click:收藏']));
  });

  it('rejects exploration when the list has no candidate detail to inspect', async () => {
    const executor = new ExploringScreeningExecutor(false);

    await expect(
      exploreBossLikeScreeningWorkflow({ executor, baseUrl, credentials, searchPlan }),
    ).rejects.toThrow('screening_explore_no_candidate_detail');
  });

  it('explores a form-less search page through unique semantic global targets', async () => {
    const executor = new FormlessSearchExploringExecutor();

    const skill = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });

    const searchStep = skill.steps.find((step) => step.id === 'search_candidates');
    expect(searchStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          targets: expect.objectContaining({
            searchInput: expect.objectContaining({ name: '搜索候选人', role: 'textbox' }),
            searchSubmit: expect.objectContaining({ name: '搜索', role: 'button' }),
          }),
        }),
      }),
    );
    expect(executor.calls).toEqual(expect.arrayContaining(['resolve:搜索候选人', 'resolve:搜索']));
  });

  it('explores an ambiguous form-less detail page through unique semantic global targets', async () => {
    const executor = new AmbiguousFormlessDetailExploringExecutor();

    const skill = await exploreBossLikeScreeningWorkflow({
      executor,
      baseUrl,
      credentials,
      searchPlan,
    });

    const enrichStep = skill.steps.find((step) => step.id === 'enrich_candidate');
    const chatStep = skill.steps.find((step) => step.id === 'chat_candidate');
    const collectStep = skill.steps.find((step) => step.id === 'collect_candidate');
    expect(enrichStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          targets: expect.objectContaining({
            detailContent: {
              kind: 'text',
              name: '候选人详情',
              exact: true,
              scope: { kind: 'page' },
            },
          }),
        }),
      }),
    );
    expect(chatStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          targets: expect.objectContaining({
            greetButton: expect.objectContaining({ name: '打招呼' }),
            messageInput: expect.objectContaining({
              name: '消息内容',
              scope: { kind: 'form', name: '沟通候选人' },
            }),
          }),
        }),
      }),
    );
    expect(collectStep).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          targets: expect.objectContaining({
            collectButton: expect.objectContaining({ name: '收藏' }),
          }),
        }),
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
        failedStepId: 'search_candidates',
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
});
