import Link from 'next/link';
import { ListFilter } from 'lucide-react';
import {
  DASHBOARD_PLATFORM_ALL,
  type DashboardOverviewDto,
  type DashboardPlatformFilter,
} from '@/lib/dashboard/types';
import type { JDStatus } from '@/types';

type PlatformFilterProps = {
  overview: DashboardOverviewDto;
};

function dashboardHref(params: { status?: JDStatus; platform?: DashboardPlatformFilter }): string {
  const query = new URLSearchParams();

  if (params.status) {
    query.set('status', params.status);
  }

  if (params.platform && params.platform !== DASHBOARD_PLATFORM_ALL) {
    query.set('platform', params.platform);
  }

  const queryString = query.toString();
  return queryString ? `/?${queryString}` : '/';
}

function filterLinkClass(isActive: boolean) {
  return [
    'inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors',
    'focus-visible:ring-ring outline-none focus-visible:ring-2',
    isActive
      ? 'border-primary/50 bg-primary/10 text-primary'
      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
  ].join(' ');
}

export function PlatformFilter({ overview }: PlatformFilterProps) {
  const currentStatus = overview.filters.status;
  const currentPlatform = overview.filters.platform ?? DASHBOARD_PLATFORM_ALL;

  return (
    <section className="border-border rounded-lg border p-4" aria-label="工作台筛选">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          筛选
        </div>
        <Link
          className="text-muted-foreground hover:text-foreground text-xs hover:underline"
          href="/"
        >
          清除
        </Link>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-muted-foreground mb-2 text-xs">平台</div>
          <div className="flex flex-wrap gap-2">
            {overview.platforms.map((item) => {
              const isAll = item.platform === DASHBOARD_PLATFORM_ALL;
              return (
                <Link
                  key={item.platform}
                  className={filterLinkClass(currentPlatform === item.platform)}
                  href={dashboardHref({
                    status: currentStatus,
                    platform: isAll ? DASHBOARD_PLATFORM_ALL : item.platform,
                  })}
                >
                  <span>{item.label}</span>
                  <span className="font-mono tabular-nums">{item.recruitingJobs}</span>
                  {item.failedJobs > 0 ? (
                    <span className="text-rose-600 dark:text-rose-300">异常 {item.failedJobs}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-2 text-xs">状态</div>
          <div className="flex flex-wrap gap-2">
            <Link
              className={filterLinkClass(!currentStatus)}
              href={dashboardHref({ platform: currentPlatform })}
            >
              全部状态
            </Link>
            {overview.statusCounts.map((item) => (
              <Link
                key={item.status}
                className={filterLinkClass(currentStatus === item.status)}
                href={dashboardHref({ status: item.status, platform: currentPlatform })}
              >
                <span>{item.label}</span>
                <span className="font-mono tabular-nums">{item.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
