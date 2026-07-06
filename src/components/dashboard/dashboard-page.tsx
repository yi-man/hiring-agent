'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListFilter, MessageCircle, Plus, RefreshCw, Users } from 'lucide-react';
import { ActionQueue } from '@/components/dashboard/action-queue';
import { DashboardJobList } from '@/components/dashboard/job-list';
import { PlatformFilter } from '@/components/dashboard/platform-filter';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { Button } from '@/components/ui';
import { fetchDashboardOverview } from '@/lib/dashboard/client';
import type { DashboardOverviewDto } from '@/lib/dashboard/types';
import { useSearchParams } from 'next/navigation';

function DashboardLoadingShell() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto space-y-4 px-4 py-6">
        <div className="border-border border-b pb-4">
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">招聘岗位运营台</h1>
          <p className="text-muted-foreground mt-1 text-sm">正在加载工作台…</p>
        </div>
      </div>
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      role="alert"
    >
      {message}
    </div>
  );
}

function DashboardPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [overview, setOverview] = useState<DashboardOverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadOverview() {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchDashboardOverview(query);
        if (isActive) {
          setOverview(data);
        }
      } catch (e) {
        if (isActive) {
          setError(e instanceof Error ? e.message : '加载工作台失败');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      isActive = false;
    };
  }, [query]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError('');
    try {
      setOverview(await fetchDashboardOverview(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : '刷新工作台失败');
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto space-y-4 px-4 py-6">
        <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <ListFilter className="text-muted-foreground h-5 w-5" aria-hidden="true" />
              <h1 className="text-foreground text-2xl font-semibold tracking-normal">
                招聘岗位运营台
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              汇总 JD 发布、平台状态和候选人跟进，优先处理会阻塞招聘推进的岗位。
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start lg:self-auto">
            <Button
              className="gap-2"
              disableRipple
              isDisabled={isLoading || isRefreshing}
              type="button"
              variant="bordered"
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {isRefreshing ? '刷新中' : '刷新'}
            </Button>
            <Button
              as={Link}
              className="gap-2"
              disableRipple
              href="/jd-generator/candidates"
              variant="bordered"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              候选人跟踪
            </Button>
            <Button
              as={Link}
              className="gap-2"
              disableRipple
              href="/jd-generator/candidates"
              variant="bordered"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              同步沟通
            </Button>
            <Button
              as={Link}
              className="gap-2"
              color="primary"
              disableRipple
              href="/jd-generator/new"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              新建 JD
            </Button>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {isLoading && !overview ? (
          <div className="text-muted-foreground border-border rounded-lg border px-4 py-10 text-center text-sm">
            正在加载工作台…
          </div>
        ) : null}

        {overview ? (
          <>
            <SummaryCards overview={overview} />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <PlatformFilter overview={overview} />
                <DashboardJobList overview={overview} />
              </div>
              <ActionQueue overview={overview} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

export function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingShell />}>
      <DashboardPageContent />
    </Suspense>
  );
}
