import type { ElementType, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { DashboardPage } from './dashboard-page';
import { fetchDashboardOverview } from '@/lib/dashboard/client';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}));

jest.mock('@/lib/dashboard/client', () => ({
  fetchDashboardOverview: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  AlertTriangle: () => <svg aria-hidden="true" />,
  Clock3: () => <svg aria-hidden="true" />,
  Eye: () => <svg aria-hidden="true" />,
  FileText: () => <svg aria-hidden="true" />,
  History: () => <svg aria-hidden="true" />,
  ListFilter: () => <svg aria-hidden="true" />,
  MessageCircle: () => <svg aria-hidden="true" />,
  Plus: () => <svg aria-hidden="true" />,
  RefreshCw: () => <svg aria-hidden="true" />,
  Send: () => <svg aria-hidden="true" />,
  Users: () => <svg aria-hidden="true" />,
  Workflow: () => <svg aria-hidden="true" />,
}));

jest.mock('@/components/ui', () => ({
  Button: ({
    as: Component = 'button',
    children,
    className,
    href,
    isDisabled,
    onClick,
    type,
  }: {
    as?: ElementType;
    children: ReactNode;
    className?: string;
    href?: string;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    [key: string]: unknown;
  }) => {
    const componentProps =
      Component === 'button' ? { disabled: isDisabled, onClick, type } : { href, onClick };
    return (
      <Component className={className} {...componentProps}>
        {children}
      </Component>
    );
  },
  Chip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const now = '2026-07-06T09:30:00.000Z';

const overview: DashboardOverviewDto = {
  summary: {
    recruitingJobs: 12,
    readyToPublishJobs: 4,
    publishingJobs: 3,
    publishFailedJobs: 2,
    activeCandidates: 9,
  },
  statusCounts: [
    { status: 'created', label: '已创建', count: 0 },
    { status: 'ready_to_publish', label: '待发布', count: 4 },
    { status: 'publishing', label: '发布中', count: 3 },
    { status: 'published', label: '招聘中', count: 12 },
    { status: 'publish_failed', label: '发布异常', count: 2 },
    { status: 'offline', label: '已下线', count: 0 },
    { status: 'archived', label: '已归档', count: 0 },
  ],
  platforms: [
    { platform: 'all', label: '全部平台', recruitingJobs: 12, failedJobs: 2 },
    { platform: 'boss-like', label: 'BOSS-like', recruitingJobs: 8, failedJobs: 1 },
    { platform: 'untracked', label: '未记录平台', recruitingJobs: 4, failedJobs: 0 },
  ],
  jobs: [
    {
      id: 'jd-1',
      department: '技术部',
      position: '前端工程师',
      title: '高级前端工程师',
      status: 'published',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      updatedAt: now,
      platform: {
        platform: 'boss-like',
        label: 'BOSS-like',
        recruitingJobs: 8,
        failedJobs: 1,
      },
      candidateStats: {
        totalCandidates: 5,
        activeCandidates: 3,
        interviewingCandidates: 1,
        highPriorityCandidates: 2,
        followUpCandidates: 1,
      },
      latestTask: {
        id: 'task-1',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        status: 'success',
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      },
    },
  ],
  recentTasks: [
    {
      id: 'task-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      status: 'success',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  filters: {
    status: 'published',
    platform: 'boss-like',
    limit: 25,
  },
};

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchParams as jest.Mock).mockReturnValue({
      toString: () => 'status=published&platform=boss-like',
    });
  });

  it('fetches the filtered dashboard and renders clickable drill-downs', async () => {
    (fetchDashboardOverview as jest.Mock).mockResolvedValueOnce(overview);

    render(<DashboardPage />);

    expect(screen.getByText('正在加载工作台…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /5 候选人/ })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1/candidates',
    );
    expect(fetchDashboardOverview).toHaveBeenCalledWith('status=published&platform=boss-like');

    expect(
      screen
        .getAllByRole('link', { name: '招聘中 12' })
        .some((link) => link.getAttribute('href') === '/?status=published'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: /BOSS-like 8 异常 1/ })).toHaveAttribute(
      'href',
      '/?status=published&platform=boss-like',
    );
    expect(
      screen
        .getAllByRole('link', { name: /发布异常 2/ })
        .some((link) => link.getAttribute('href') === '/?status=publish_failed&platform=boss-like'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: /发布失败/ })).toHaveAttribute(
      'href',
      '/?status=publish_failed',
    );
  });

  it('renders an error banner when the dashboard request fails', async () => {
    (fetchDashboardOverview as jest.Mock).mockRejectedValueOnce(new Error('请求失败'));

    render(<DashboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('请求失败');
    await waitFor(() => {
      expect(screen.queryByText('正在加载工作台…')).not.toBeInTheDocument();
    });
  });
});
