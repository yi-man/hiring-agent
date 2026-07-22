import { render, screen } from '@testing-library/react';
import WorkflowsPage from './page';
import { getServerAuthSession } from '@/lib/auth/session';
import { listLatestActivePublishedWorkflows } from '@/lib/workflows/published-workflows';

jest.mock('@/lib/auth/session', () => ({
  getServerAuthSession: jest.fn(),
}));

jest.mock('@/components/auth/sign-in-button', () => ({
  SignInButton: () => <a href="/auth/signin">登录</a>,
}));

jest.mock('@/lib/workflows/published-workflows', () => ({
  listLatestActivePublishedWorkflows: jest.fn(),
}));

const getServerAuthSessionMock = getServerAuthSession as jest.MockedFunction<
  typeof getServerAuthSession
>;
const listLatestActivePublishedWorkflowsMock =
  listLatestActivePublishedWorkflows as jest.MockedFunction<
    typeof listLatestActivePublishedWorkflows
  >;

describe('Workflows page', () => {
  beforeEach(() => {
    getServerAuthSessionMock.mockReset();
    listLatestActivePublishedWorkflowsMock.mockReset();
  });

  it('renders sign-in guidance when unauthenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce(null);

    render(await WorkflowsPage());

    expect(screen.getByRole('heading', { name: /请先登录后继续/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /登录/i })).toHaveAttribute('href', '/auth/signin');
    expect(listLatestActivePublishedWorkflowsMock).not.toHaveBeenCalled();
  });

  it('renders latest active published workflows', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });
    listLatestActivePublishedWorkflowsMock.mockResolvedValueOnce([
      {
        id: 'boss-like-publish-jd-v3',
        name: 'publish_jd',
        platform: 'boss-like',
        siteFingerprint: 'site-1',
        description: 'Publish a generated JD.',
        version: 3,
        isActive: true,
        stepCount: 14,
        usageCount: 12,
        successRate: 0.75,
        meta: { usage_count: 0, success_rate: 0 },
        createdAt: '2026-07-06T08:00:00.000Z',
        updatedAt: '2026-07-07T08:00:00.000Z',
      },
    ]);

    render(await WorkflowsPage());

    expect(screen.getByRole('heading', { name: /Workflow 库/i })).toBeInTheDocument();
    expect(screen.getByText(/Agent 探索生成及已完成真实执行验证/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /publish_jd · BOSS-like/i })).toHaveAttribute(
      'href',
      '/workflows/boss-like-publish-jd-v3',
    );
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText(/14 steps/i)).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('已验证')).toBeInTheDocument();
    expect(screen.getByText('累计使用 12 次')).toBeInTheDocument();
  });

  it('shows an explored generated skill without calling it pending validation', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });
    listLatestActivePublishedWorkflowsMock.mockResolvedValueOnce([
      {
        id: 'boss-like-publish-jd-v1',
        name: 'publish_jd',
        platform: 'boss-like',
        siteFingerprint: 'site-1',
        description: 'Publish a generated JD.',
        version: 1,
        isActive: true,
        stepCount: 14,
        usageCount: 5,
        successRate: null,
        meta: { created_from: 'explore', usage_count: 0, success_rate: 0 },
        createdAt: '2026-07-06T08:00:00.000Z',
        updatedAt: '2026-07-07T08:00:00.000Z',
      },
    ]);

    render(await WorkflowsPage());

    expect(screen.getByRole('link', { name: /publish_jd · BOSS-like/i })).toBeInTheDocument();
    expect(screen.getByText('Agent 探索完成')).toBeInTheDocument();
    expect(screen.getByText('当前 Skill 尚未执行')).toBeInTheDocument();
    expect(
      screen.getByText('Agent 已完成页面探索并生成 Skill；当前 Skill 尚未完整执行。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('待验证')).not.toBeInTheDocument();
  });

  it('renders an empty state when no explored or successfully executed workflow exists', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });
    listLatestActivePublishedWorkflowsMock.mockResolvedValueOnce([]);

    render(await WorkflowsPage());

    expect(screen.getByRole('heading', { name: '暂无 workflow' })).toBeInTheDocument();
    expect(screen.getByText(/Agent 完成页面探索并生成 Skill 后/i)).toBeInTheDocument();
  });
});
