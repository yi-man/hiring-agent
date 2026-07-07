import type { ElementType, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { DashboardJobList } from './job-list';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';

jest.mock('lucide-react', () => ({
  AlertTriangle: () => <svg aria-hidden="true" />,
  Eye: () => <svg aria-hidden="true" />,
  FileText: () => <svg aria-hidden="true" />,
  Users: () => <svg aria-hidden="true" />,
}));

jest.mock('@/components/ui', () => ({
  Button: ({
    as: Component = 'button',
    children,
    href,
  }: {
    as?: ElementType;
    children: ReactNode;
    href?: string;
  }) => {
    const props = Component === 'button' ? {} : { href };
    return <Component {...props}>{children}</Component>;
  },
  Chip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const now = '2026-07-06T09:30:00.000Z';

const overview: DashboardOverviewDto = {
  summary: {
    recruitingJobs: 0,
    readyToPublishJobs: 0,
    publishingJobs: 0,
    publishFailedJobs: 1,
    activeCandidates: 3,
  },
  statusCounts: [
    { status: 'created', label: '已创建', count: 0 },
    { status: 'ready_to_publish', label: '待发布', count: 0 },
    { status: 'publishing', label: '发布中', count: 0 },
    { status: 'published', label: '招聘中', count: 0 },
    { status: 'publish_failed', label: '发布异常', count: 1 },
    { status: 'offline', label: '已下线', count: 0 },
    { status: 'archived', label: '已归档', count: 0 },
  ],
  platforms: [
    { platform: 'all', label: '全部平台', recruitingJobs: 0, failedJobs: 1 },
    { platform: 'boss-like', label: 'BOSS-like', recruitingJobs: 0, failedJobs: 1 },
    { platform: 'untracked', label: '未记录平台', recruitingJobs: 0, failedJobs: 0 },
  ],
  jobs: [
    {
      id: 'jd-1',
      department: '技术部',
      position: '前端工程师',
      title: '高级前端工程师',
      status: 'publish_failed',
      salaryRange: '25-40K',
      workLocations: ['上海'],
      updatedAt: now,
      platform: {
        platform: 'boss-like',
        label: 'BOSS-like',
        recruitingJobs: 0,
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
        status: 'failed',
        errorMessage: 'BOSS 平台定位失败',
        createdAt: now,
        updatedAt: now,
      },
    },
  ],
  recentTasks: [],
  filters: {
    status: 'publish_failed',
    platform: 'boss-like',
    limit: 25,
  },
};

function parsedHref(href: string) {
  return new URL(href, 'http://localhost');
}

function expectReturnContext(href: string, returnTo: string, returnLabel: string) {
  const url = parsedHref(href);
  expect(url.searchParams.get('returnTo')).toBe(returnTo);
  expect(url.searchParams.get('returnLabel')).toBe(returnLabel);
}

describe('DashboardJobList', () => {
  it('renders publish failed warning and job links', () => {
    render(<DashboardJobList overview={overview} />);

    expect(screen.getByText('发布失败：BOSS 平台定位失败')).toBeInTheDocument();
    const detailHref =
      screen.getByRole('link', { name: '高级前端工程师' }).getAttribute('href') ?? '';
    expect(parsedHref(detailHref).pathname).toBe('/jd-generator/jd-1');
    expectReturnContext(detailHref, '/?status=publish_failed&platform=boss-like', '返回工作台');
    const candidatesHref =
      screen.getByRole('link', { name: /5 候选人/ }).getAttribute('href') ?? '';
    expect(parsedHref(candidatesHref).pathname).toBe('/jd-generator/jd-1/candidates');
    expectReturnContext(candidatesHref, '/?status=publish_failed&platform=boss-like', '返回工作台');
  });

  it('links row status and platform to filtered dashboard views', () => {
    render(<DashboardJobList overview={overview} />);

    expect(screen.getByRole('link', { name: '发布异常' })).toHaveAttribute(
      'href',
      '/?status=publish_failed&platform=boss-like',
    );
    expect(screen.getByRole('link', { name: 'BOSS-like' })).toHaveAttribute(
      'href',
      '/?status=publish_failed&platform=boss-like',
    );
  });
});
