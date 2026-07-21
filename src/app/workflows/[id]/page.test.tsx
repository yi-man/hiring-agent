import { render, screen } from '@testing-library/react';
import WorkflowDetailPage from './page';
import { getServerAuthSession } from '@/lib/auth/session';
import { getPublishedWorkflowDetail } from '@/lib/workflows/published-workflows';
import type { PublishedWorkflow } from '@/lib/workflows/published-workflows';

jest.mock('@/lib/auth/session', () => ({
  getServerAuthSession: jest.fn(),
}));

jest.mock('@/components/auth/sign-in-button', () => ({
  SignInButton: () => <a href="/auth/signin">登录</a>,
}));

jest.mock('@/lib/workflows/published-workflows', () => ({
  getPublishedWorkflowDetail: jest.fn(),
}));

jest.mock('@/components/workflows/mermaid-diagram', () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <figure aria-label="Mermaid Flow 图" data-chart={chart} data-testid="mermaid-diagram" />
  ),
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
}));

const getServerAuthSessionMock = getServerAuthSession as jest.MockedFunction<
  typeof getServerAuthSession
>;
const getPublishedWorkflowDetailMock = getPublishedWorkflowDetail as jest.MockedFunction<
  typeof getPublishedWorkflowDetail
>;

const workflow: PublishedWorkflow = {
  id: 'boss-like-publish-jd-v3',
  name: 'publish_jd',
  platform: 'boss-like',
  siteFingerprint: 'site-1',
  description: 'Publish a generated JD.',
  version: 3,
  isActive: true,
  inputSchema: { title: 'string' },
  variables: {},
  steps: [
    {
      id: 'open_new_job',
      type: 'action' as const,
      action: 'navigate' as const,
      params: { url: '{{target.newJobUrl}}' },
      next: 'done',
    },
    { id: 'done', type: 'end' as const },
  ],
  stepCount: 2,
  usageCount: 12,
  successRate: 0.75,
  meta: { usage_count: 0, success_rate: 0 },
  createdAt: '2026-07-06T08:00:00.000Z',
  updatedAt: '2026-07-07T08:00:00.000Z',
};

describe('Workflow detail page', () => {
  beforeEach(() => {
    getServerAuthSessionMock.mockReset();
    getPublishedWorkflowDetailMock.mockReset();
  });

  it('renders sign-in guidance when unauthenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce(null);

    render(
      await WorkflowDetailPage({ params: Promise.resolve({ id: 'boss-like-publish-jd-v3' }) }),
    );

    expect(screen.getByRole('heading', { name: /请先登录后继续/i })).toBeInTheDocument();
    expect(getPublishedWorkflowDetailMock).not.toHaveBeenCalled();
  });

  it('renders workflow content, a visual Mermaid flow graph, and old versions', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });
    getPublishedWorkflowDetailMock.mockResolvedValueOnce({
      workflow,
      versions: [
        workflow,
        { ...workflow, id: 'boss-like-publish-jd-v2', version: 2, isActive: false },
        { ...workflow, id: 'boss-like-publish-jd-v1', version: 1, isActive: false },
      ],
    });

    render(
      await WorkflowDetailPage({ params: Promise.resolve({ id: 'boss-like-publish-jd-v3' }) }),
    );

    expect(getPublishedWorkflowDetailMock).toHaveBeenCalledWith('boss-like-publish-jd-v3');
    expect(screen.getByRole('heading', { name: /publish_jd · BOSS-like/i })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    const mermaidDiagram = screen.getByTestId('mermaid-diagram');
    expect(mermaidDiagram).toHaveAttribute('data-chart', expect.stringContaining('flowchart TD'));
    expect(screen.queryByText(/flowchart TD/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/open_new_job.*navigate/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /v2/i })).toHaveAttribute(
      'href',
      '/workflows/boss-like-publish-jd-v2',
    );
    expect(screen.getByText(/Input Schema/i)).toBeInTheDocument();
  });

  it('marks an active 0%-successful workflow as invalid everywhere instead of in use', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });
    const invalidWorkflow = { ...workflow, successRate: 0 };
    getPublishedWorkflowDetailMock.mockResolvedValueOnce({
      workflow: invalidWorkflow,
      versions: [
        invalidWorkflow,
        { ...workflow, id: 'boss-like-publish-jd-v2', version: 2, isActive: false },
      ],
    });

    render(await WorkflowDetailPage({ params: Promise.resolve({ id: invalidWorkflow.id }) }));

    expect(screen.getAllByText('已失效')).toHaveLength(2);
    expect(screen.queryByText('使用中')).not.toBeInTheDocument();
  });

  it('returns to the originating screening page and preserves it across version navigation', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });
    getPublishedWorkflowDetailMock.mockResolvedValueOnce({
      workflow,
      versions: [
        workflow,
        { ...workflow, id: 'boss-like-publish-jd-v2', version: 2, isActive: false },
      ],
    });
    const returnTo = '/jd-generator/jd-1/screening-runs/run-1?returnTo=%2Fjd-generator%2Fjd-1';

    render(
      await WorkflowDetailPage({
        params: Promise.resolve({ id: 'boss-like-publish-jd-v3' }),
        searchParams: Promise.resolve({ returnTo, returnLabel: '返回筛选记录' }),
      }),
    );

    expect(screen.getByRole('link', { name: '返回筛选记录' })).toHaveAttribute('href', returnTo);
    expect(screen.getByRole('link', { name: /v2/i })).toHaveAttribute(
      'href',
      `/workflows/boss-like-publish-jd-v2?returnTo=${encodeURIComponent(returnTo)}&returnLabel=${encodeURIComponent('返回筛选记录')}`,
    );
  });
});
