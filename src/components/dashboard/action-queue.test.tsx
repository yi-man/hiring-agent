import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { ActionQueue } from './action-queue';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';

jest.mock('lucide-react', () => ({
  AlertTriangle: () => <svg aria-hidden="true" />,
  Clock3: () => <svg aria-hidden="true" />,
  History: () => <svg aria-hidden="true" />,
  Send: () => <svg aria-hidden="true" />,
}));

jest.mock('@/components/ui', () => ({
  Chip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

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
  platforms: [],
  jobs: [],
  recentTasks: [],
  filters: {
    limit: 25,
  },
};

describe('ActionQueue', () => {
  it('uses overview summary counts instead of the current job slice', () => {
    render(<ActionQueue overview={overview} />);

    const failed = screen.getByRole('link', { name: /发布失败/ });
    const ready = screen.getByRole('link', { name: /待发布/ });
    const publishing = screen.getByRole('link', { name: /发布中任务/ });

    expect(failed).toHaveAttribute('href', '/?status=publish_failed');
    expect(within(failed).getByText('2')).toBeInTheDocument();
    expect(ready).toHaveAttribute('href', '/?status=ready_to_publish');
    expect(within(ready).getByText('4')).toBeInTheDocument();
    expect(publishing).toHaveAttribute('href', '/?status=publishing');
    expect(within(publishing).getByText('3')).toBeInTheDocument();
  });
});
