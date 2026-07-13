'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  ListFilter,
  MessageCircle,
  Plus,
  RefreshCw,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { startCandidateCommunicationRun } from '@/lib/candidate-communication/client';
import { createCandidateScreeningRun } from '@/lib/candidate-screening/client';
import type { CandidateScreeningRunDto } from '@/lib/candidate-screening/repo';
import { fetchCompanyProfile } from '@/lib/company-profile/client';
import type { CompanyProfileDto } from '@/lib/company-profile/types';
import {
  fetchJobDescriptionCreateRuns,
  fetchJobDescription,
  fetchJobDescriptionPublishTasks,
  fetchJobDescriptionRegenerateRuns,
  fetchJobDescriptions,
  startJobDescriptionCreateRun,
  startJobDescriptionPublishRun,
  startJobDescriptionRegenerateRun,
  updateJobDescriptionResource,
} from '@/lib/jd/client';
import type { JobDescriptionCreateRunDto } from '@/lib/jd/create-run-repo';
import { getJobDescriptionDisplayTitle } from '@/lib/jd/display';
import type { JobDescriptionRegenerateRunDto } from '@/lib/jd/regenerate-run-repo';
import type { PublishTaskDto, PublishTaskResult } from '@/lib/jd-publishing/types';
import { JD_STATUSES } from '@/types';
import {
  currentPathWithSearch,
  getReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';
import type {
  JD,
  JDScreeningStatus,
  JDScreeningSummary,
  JDStatus,
  JDTone,
  JobDescriptionDto,
} from '@/types';

const DEPARTMENT_OPTIONS = [
  {
    name: '技术部',
    positions: ['前端工程师', '后端工程师', '全栈工程师', 'AI 应用工程师', '测试工程师'],
  },
  {
    name: '产品部',
    positions: ['产品经理', '增长产品经理', 'AI 产品经理'],
  },
  {
    name: '设计部',
    positions: ['产品设计师', '用户体验设计师'],
  },
  {
    name: '运营部',
    positions: ['用户运营', '内容运营', '招聘运营'],
  },
  {
    name: '市场销售部',
    positions: ['市场经理', '客户成功经理', '销售经理'],
  },
] as const;

const toneOptions: Array<{ value: JDTone; label: string }> = [
  { value: 'tech', label: '技术务实' },
  { value: 'startup', label: '创业吸引力' },
  { value: 'formal', label: '正式稳健' },
];

const salaryRangeOptions = [
  '10-15K',
  '15-25K',
  '20-30K',
  '25-40K',
  '30-50K',
  '40-60K',
  '60K以上',
  '面议',
] as const;

const statusMeta: Record<JDStatus, { label: string; className: string }> = {
  created: {
    label: 'created',
    className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40',
  },
  ready_to_publish: {
    label: 'ready_to_publish',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
  },
  publishing: {
    label: 'publishing',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
  },
  published: {
    label: 'published',
    className:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40',
  },
  publish_failed: {
    label: 'publish_failed',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
  },
  offline: {
    label: 'offline',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60',
  },
  archived: {
    label: 'archived',
    className:
      'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-800 dark:bg-stone-900/60',
  },
};

type JDStatusFilter = JDStatus | 'all';

const statusFilterOptions: Array<{ value: JDStatusFilter; label: string }> = [
  { value: 'published', label: 'published' },
  { value: 'created', label: 'created' },
  { value: 'ready_to_publish', label: 'ready_to_publish' },
  { value: 'publishing', label: 'publishing' },
  { value: 'publish_failed', label: 'publish_failed' },
  { value: 'offline', label: 'offline' },
  { value: 'archived', label: 'archived' },
  { value: 'all', label: '全部状态' },
];

const defaultScreeningSummary: JDScreeningSummary = {
  status: 'not_started',
  totalCandidateCount: 0,
  qualifiedCandidateCount: 0,
  latestRunId: null,
  latestRunStatus: null,
  latestRunUpdatedAt: null,
};

const screeningStatusMeta: Record<JDScreeningStatus, { label: string; className: string }> = {
  not_started: {
    label: '未筛选',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60',
  },
  running: {
    label: '筛选中',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
  },
  screened: {
    label: '已筛选',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
  },
  failed: {
    label: '筛选失败',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
  },
};

const createRunStatusMeta: Record<
  JobDescriptionCreateRunDto['status'],
  { label: string; className: string }
> = {
  pending: {
    label: '排队中',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60',
  },
  running: {
    label: '生成中',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40',
  },
  success: {
    label: '已完成',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40',
  },
  failed: {
    label: '失败',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40',
  },
};

type JDForm = {
  title: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  bonus: string;
  highlights: string;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更新时间未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function StatusChip({ status }: { status: JDStatus }) {
  const meta = statusMeta[status] ?? statusMeta.created;
  return (
    <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
      {meta.label}
    </Chip>
  );
}

function CreateRunStatusChip({ status }: { status: JobDescriptionCreateRunDto['status'] }) {
  const meta = createRunStatusMeta[status];
  return (
    <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
      {meta.label}
    </Chip>
  );
}

function ScreeningSummaryChip({ summary }: { summary: JDScreeningSummary }) {
  const meta = screeningStatusMeta[summary.status] ?? screeningStatusMeta.not_started;
  return (
    <Chip className={`border text-xs ${meta.className}`} size="sm" variant="flat">
      {meta.label}
    </Chip>
  );
}

function getScreeningSummary(jobDescription: JobDescriptionDto): JDScreeningSummary {
  return jobDescription.screeningSummary ?? defaultScreeningSummary;
}

function getScreeningActionLabel(summary: JDScreeningSummary): string {
  if (summary.status === 'failed') {
    return '重新筛选';
  }
  return summary.status === 'screened' || summary.totalCandidateCount > 0
    ? '继续筛选'
    : '筛选并执行';
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

function jdToForm(jd: JD): JDForm {
  return {
    title: jd.title,
    summary: jd.summary,
    responsibilities: jd.responsibilities.join('\n'),
    requirements: jd.requirements.join('\n'),
    bonus: jd.bonus.join('\n'),
    highlights: jd.highlights.join('\n'),
  };
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function formToJd(form: JDForm): JD {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    responsibilities: linesToList(form.responsibilities),
    requirements: linesToList(form.requirements),
    bonus: linesToList(form.bonus),
    highlights: linesToList(form.highlights),
  };
}

function parseKeywordInput(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground text-sm font-medium">{children}</span>;
}

export function JDListView() {
  const router = useRouter();
  const listReturnTarget = { href: '/jd-generator', label: '返回列表' };
  const workbenchReturnTarget = { href: '/jd-generator', label: '返回 JD 工作台' };
  const [items, setItems] = useState<JobDescriptionDto[]>([]);
  const [createRuns, setCreateRuns] = useState<JobDescriptionCreateRunDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<JDStatusFilter>('published');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startingScreeningId, setStartingScreeningId] = useState<string | null>(null);
  const [isSyncingCommunication, setIsSyncingCommunication] = useState(false);
  const [error, setError] = useState('');

  async function loadJds(options?: { silent?: boolean }) {
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');
    try {
      const [nextItems, nextCreateRuns] = await Promise.all([
        fetchJobDescriptions(statusFilter),
        fetchJobDescriptionCreateRuns({ limit: 5 }).catch(() => []),
      ]);
      setItems(nextItems);
      setCreateRuns(nextCreateRuns);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载 JD 列表失败');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadJds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleStartScreeningFromList(item: JobDescriptionDto) {
    setStartingScreeningId(item.id);
    setError('');
    try {
      const run = await createCandidateScreeningRun(item.id, {
        platform: 'boss-like',
        mode: 'execution',
      });
      router.push(
        withReturnTarget(`/jd-generator/${item.id}/screening-runs/${run.id}`, listReturnTarget),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动候选人筛选失败');
    } finally {
      setStartingScreeningId(null);
    }
  }

  async function handleSyncCommunication() {
    setIsSyncingCommunication(true);
    setError('');
    try {
      const run = await startCandidateCommunicationRun({
        mode: 'batch',
        platform: 'boss-like',
        maxPasses: 10,
      });
      router.push(
        withReturnTarget(`/jd-generator/communication-runs/${run.id}`, workbenchReturnTarget),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动候选人沟通失败');
    } finally {
      setIsSyncingCommunication(false);
    }
  }

  function renderPublishedActions(item: JobDescriptionDto) {
    const summary = getScreeningSummary(item);
    const runHref = summary.latestRunId
      ? withReturnTarget(
          `/jd-generator/${item.id}/screening-runs/${summary.latestRunId}`,
          listReturnTarget,
        )
      : null;

    return (
      <>
        {renderDetailAction(item)}
        {summary.status === 'running' && runHref ? (
          <Button
            as={Link}
            className="gap-2"
            disableRipple
            href={runHref}
            size="sm"
            variant="bordered"
          >
            <Eye className="h-4 w-4" aria-hidden />
            查看进度
          </Button>
        ) : (
          <Button
            className="gap-2"
            color={summary.status === 'not_started' ? 'primary' : 'default'}
            disableRipple
            isDisabled={startingScreeningId === item.id}
            size="sm"
            type="button"
            variant={summary.status === 'not_started' ? 'solid' : 'bordered'}
            onClick={() => void handleStartScreeningFromList(item)}
          >
            <ListFilter className="h-4 w-4" aria-hidden />
            {startingScreeningId === item.id ? '启动中' : getScreeningActionLabel(summary)}
          </Button>
        )}
        {runHref ? (
          <Link
            className="text-primary hover:text-primary/80 inline-flex h-8 items-center gap-1 text-sm font-medium hover:underline"
            href={runHref}
          >
            <Eye className="h-4 w-4" aria-hidden />
            筛选记录
          </Link>
        ) : null}
        <Link
          className="text-primary hover:text-primary/80 inline-flex h-8 items-center gap-1 text-sm font-medium hover:underline"
          href={withReturnTarget(`/jd-generator/${item.id}/candidates`, listReturnTarget)}
        >
          <ListFilter className="h-4 w-4" aria-hidden />
          候选人
        </Link>
      </>
    );
  }

  function renderDetailAction(item: JobDescriptionDto) {
    return (
      <Button
        as={Link}
        className="gap-2"
        disableRipple
        href={withReturnTarget(`/jd-generator/${item.id}`, listReturnTarget)}
        size="sm"
        variant="light"
      >
        <Eye className="h-4 w-4" aria-hidden />
        详情
      </Button>
    );
  }

  function renderRowActions(item: JobDescriptionDto) {
    if (item.status === 'published') {
      return renderPublishedActions(item);
    }

    const actionMeta: Record<
      Exclude<JDStatus, 'published'>,
      { label: string; icon: React.ReactNode; variant?: 'light' | 'bordered' | 'solid' }
    > = {
      created: { label: '编辑', icon: <FileText className="h-4 w-4" aria-hidden /> },
      ready_to_publish: { label: '发布', icon: <Rocket className="h-4 w-4" aria-hidden /> },
      publishing: { label: '发布记录', icon: <Eye className="h-4 w-4" aria-hidden /> },
      publish_failed: { label: '重试发布', icon: <RefreshCw className="h-4 w-4" aria-hidden /> },
      offline: { label: '查看', icon: <Eye className="h-4 w-4" aria-hidden /> },
      archived: { label: '查看', icon: <Eye className="h-4 w-4" aria-hidden /> },
    };
    const meta = actionMeta[item.status];

    return (
      <>
        {renderDetailAction(item)}
        <Button
          as={Link}
          className="gap-2"
          disableRipple
          href={withReturnTarget(`/jd-generator/${item.id}`, listReturnTarget)}
          size="sm"
          variant={meta.variant ?? 'light'}
        >
          {meta.icon}
          {meta.label}
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">JD 管理</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            从公司知识库生成职位描述，并跟踪发布前后的状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            disableRipple
            isDisabled={isLoading || isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadJds({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新
          </Button>
          <Button
            as={Link}
            className="gap-2"
            disableRipple
            href={withReturnTarget('/candidates', workbenchReturnTarget)}
            variant="bordered"
          >
            <ListFilter className="h-4 w-4" aria-hidden />
            候选人跟踪
          </Button>
          <Button
            className="gap-2"
            disableRipple
            isDisabled={isSyncingCommunication}
            type="button"
            variant="bordered"
            onClick={() => void handleSyncCommunication()}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {isSyncingCommunication ? '启动中' : '批量沟通'}
          </Button>
          <Button
            as={Link}
            className="gap-2"
            color="primary"
            disableRipple
            href="/jd-generator/new"
          >
            <Plus className="h-4 w-4" aria-hidden />
            新建 JD
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      {createRuns.length > 0 ? (
        <section className="border-border overflow-hidden rounded-lg border">
          <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock3 className="text-muted-foreground h-4 w-4" aria-hidden />
              最近创建执行
            </div>
            <span className="text-muted-foreground text-xs">{createRuns.length} 条</span>
          </div>
          <div className="divide-border divide-y">
            {createRuns.map((run) => (
              <article
                key={run.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_104px_150px_120px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="text-foreground truncate text-sm font-medium">{run.position}</div>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{run.department}</span>
                    <span>{run.currentStage ?? 'queued'}</span>
                    {run.errorMessage ? (
                      <span className="text-destructive min-w-0 truncate">{run.errorMessage}</span>
                    ) : null}
                  </div>
                </div>
                <CreateRunStatusChip status={run.status} />
                <div className="text-muted-foreground text-xs">
                  {formatUpdatedAt(run.updatedAt)}
                </div>
                <div className="flex justify-start md:justify-end">
                  <Button
                    as={Link}
                    className="gap-2"
                    disableRipple
                    href={withReturnTarget(`/jd-generator/create-runs/${run.id}`, listReturnTarget)}
                    size="sm"
                    variant={
                      run.status === 'running' || run.status === 'pending' ? 'bordered' : 'light'
                    }
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                    执行页
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            JD 列表
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">发布状态</span>
              <select
                aria-label="JD 状态筛选"
                className="border-input bg-background text-foreground h-8 rounded-md border px-2 text-xs"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as JDStatusFilter)}
              >
                {statusFilterOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-muted-foreground text-xs">
              {isLoading ? '加载中' : `${items.length} 条`}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">正在加载 JD…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="border-border mx-auto flex h-10 w-10 items-center justify-center rounded-md border">
              <FileText className="text-muted-foreground h-5 w-5" aria-hidden />
            </div>
            <div className="text-foreground mt-3 text-sm font-medium">还没有 JD</div>
            <p className="text-muted-foreground mt-1 text-sm">选择部门和职位后即可生成第一份。</p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_128px_170px_170px_360px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="text-foreground min-w-0 truncate text-sm font-medium">
                    {getJobDescriptionDisplayTitle(item)}
                  </div>
                  <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{item.department}</span>
                    <span className="min-w-0 truncate">{item.position}</span>
                  </div>
                </div>
                <StatusChip status={item.status} />
                <div className="flex flex-wrap items-center gap-2">
                  <ScreeningSummaryChip summary={getScreeningSummary(item)} />
                  <span className="text-muted-foreground text-xs">
                    合格 {getScreeningSummary(item).qualifiedCandidateCount} / 全部{' '}
                    {getScreeningSummary(item).totalCandidateCount}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatUpdatedAt(item.updatedAt)}
                </div>
                <div
                  aria-label="JD 操作"
                  className="flex w-full flex-wrap gap-2 justify-self-start md:w-[360px] md:justify-end md:justify-self-end"
                >
                  {renderRowActions(item)}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function JDCreateView() {
  const router = useRouter();
  const [department, setDepartment] = useState<string>(DEPARTMENT_OPTIONS[0].name);
  const positions: readonly string[] = useMemo(
    () =>
      DEPARTMENT_OPTIONS.find((item) => item.name === department)?.positions ??
      DEPARTMENT_OPTIONS[0].positions,
    [department],
  );
  const [position, setPosition] = useState<string>(positions[0]);
  const [positionDescription, setPositionDescription] = useState('');
  const [salaryRange, setSalaryRange] = useState('');
  const [selectedWorkLocations, setSelectedWorkLocations] = useState<string[]>([]);
  const [tone, setTone] = useState<JDTone>('tech');
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!positions.includes(position)) {
      setPosition(positions[0]);
    }
  }, [position, positions]);

  useEffect(() => {
    let isActive = true;

    async function loadCompanyProfile() {
      try {
        const profile = await fetchCompanyProfile();
        if (isActive) {
          setCompanyProfile(profile);
          setSelectedWorkLocations((current) =>
            current.length > 0 || !profile?.locations[0]?.label
              ? current
              : [profile.locations[0].label],
          );
        }
      } catch {
        if (isActive) {
          setCompanyProfile(null);
        }
      }
    }

    void loadCompanyProfile();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const run = await startJobDescriptionCreateRun({
        department,
        position,
        positionDescription: positionDescription.trim(),
        salaryRange,
        workLocations: selectedWorkLocations,
        tone,
      });
      router.push(
        withReturnTarget(`/jd-generator/create-runs/${run.id}`, {
          href: '/jd-generator/new',
          label: '返回新建 JD',
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建 JD 失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  const canCreateWithCompanyProfile = Boolean(
    companyProfile?.name.trim() && companyProfile.locations.length > 0,
  );

  function toggleWorkLocation(label: string) {
    setSelectedWorkLocations((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button
            as={Link}
            className="mb-3 gap-2 px-0"
            disableRipple
            href="/jd-generator"
            variant="light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回列表
          </Button>
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">新建 JD</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            选择组织位置，补充岗位说明后生成带公司上下文的 JD。
          </p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <form
        className="grid gap-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(280px,0.38fr)]"
        onSubmit={handleSubmit}
      >
        <section className="border-border space-y-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <FieldLabel>部门</FieldLabel>
              <select
                aria-label="部门"
                className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                {DEPARTMENT_OPTIONS.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <FieldLabel>职位</FieldLabel>
              <select
                aria-label="职位"
                className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                value={position}
                onChange={(event) => setPosition(event.target.value)}
              >
                {positions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-2">
            <FieldLabel>职位说明</FieldLabel>
            <textarea
              aria-label="职位说明"
              className="border-input bg-background text-foreground min-h-40 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="补充职责范围、团队背景、业务目标、必须能力或你希望强调的招聘口径。"
              value={positionDescription}
              onChange={(event) => setPositionDescription(event.target.value)}
            />
          </label>
        </section>

        <aside className="border-border space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Building2 className="text-muted-foreground h-4 w-4" aria-hidden />
            <div className="text-foreground text-sm font-medium">生成设置</div>
          </div>
          <label className="block space-y-2">
            <FieldLabel>公司名称</FieldLabel>
            <input
              aria-label="公司名称"
              className="border-input bg-muted/40 text-foreground h-10 w-full rounded-md border px-3 text-sm"
              readOnly
              value={companyProfile?.name ?? '未设置公司信息'}
            />
          </label>
          <label className="block space-y-2">
            <FieldLabel>薪资范围</FieldLabel>
            <select
              aria-label="薪资范围"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={salaryRange}
              onChange={(event) => setSalaryRange(event.target.value)}
            >
              <option value="">请选择薪资范围</option>
              {salaryRangeOptions.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2">
            <FieldLabel>工作地点</FieldLabel>
            <div
              aria-label="工作地点"
              className="border-border grid min-h-10 gap-2 rounded-md border px-3 py-2"
              role="group"
            >
              {companyProfile?.locations.map((location) => (
                <label key={location.id} className="flex items-center gap-2 text-sm leading-6">
                  <input
                    checked={selectedWorkLocations.includes(location.label)}
                    className="h-4 w-4"
                    type="checkbox"
                    onChange={() => toggleWorkLocation(location.label)}
                  />
                  <span>{location.label}</span>
                </label>
              ))}
            </div>
          </div>
          {!canCreateWithCompanyProfile ? (
            <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs">
              <span className="text-muted-foreground">创建前请先维护公司名称和工作地点。</span>
              <Link className="text-primary ml-2 hover:underline" href="/settings/company">
                去公司设置
              </Link>
            </div>
          ) : null}
          <label className="block space-y-2">
            <FieldLabel>语气</FieldLabel>
            <select
              aria-label="语气"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={tone}
              onChange={(event) => setTone(event.target.value as JDTone)}
            >
              {toneOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="w-full gap-2"
            color="primary"
            disableRipple
            isDisabled={
              isSubmitting ||
              !canCreateWithCompanyProfile ||
              !positionDescription.trim() ||
              !salaryRange ||
              selectedWorkLocations.length === 0
            }
            type="submit"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {isSubmitting ? '创建任务中' : '生成并创建'}
          </Button>
        </aside>
      </form>
    </div>
  );
}

export function JDDetailView({ jobDescriptionId }: { jobDescriptionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: '/jd-generator',
    label: '返回列表',
  });
  const detailReturnTarget = {
    href: currentPathWithSearch(`/jd-generator/${jobDescriptionId}`, searchParams),
    label: '返回 JD',
  };
  const [jobDescription, setJobDescription] = useState<JobDescriptionDto | null>(null);
  const [form, setForm] = useState<JDForm | null>(null);
  const [status, setStatus] = useState<JDStatus>('created');
  const [extraInstruction, setExtraInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isScreening, setIsScreening] = useState(false);
  const [latestScreeningRun, setLatestScreeningRun] = useState<CandidateScreeningRunDto | null>(
    null,
  );
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileDto | null>(null);
  const [publishCompany, setPublishCompany] = useState('');
  const [publishSalary, setPublishSalary] = useState('');
  const [selectedPublishLocations, setSelectedPublishLocations] = useState<string[]>([]);
  const [publishKeywords, setPublishKeywords] = useState('TypeScript, React');
  const [publishTasks, setPublishTasks] = useState<PublishTaskDto[]>([]);
  const [publishTrace, setPublishTrace] = useState<PublishTaskResult['trace'] | null>(null);
  const [createRuns, setCreateRuns] = useState<JobDescriptionCreateRunDto[]>([]);
  const [regenerateRuns, setRegenerateRuns] = useState<JobDescriptionRegenerateRunDto[]>([]);
  const [error, setError] = useState('');

  async function loadJobDescription() {
    setIsLoading(true);
    setError('');
    try {
      const [data, tasks, profile, creationRuns, regenerationRuns] = await Promise.all([
        fetchJobDescription(jobDescriptionId),
        fetchJobDescriptionPublishTasks(jobDescriptionId).catch(() => []),
        fetchCompanyProfile().catch(() => null),
        fetchJobDescriptionCreateRuns({ jobDescriptionId, limit: 3 }).catch(() => []),
        fetchJobDescriptionRegenerateRuns(jobDescriptionId, { limit: 3 }).catch(() => []),
      ]);
      setJobDescription(data);
      setForm(jdToForm(data.content));
      setStatus(data.status);
      setPublishTasks(tasks);
      setPublishTrace(tasks.find((task) => task.trace)?.trace ?? null);
      setCreateRuns(creationRuns);
      setRegenerateRuns(regenerationRuns);
      setCompanyProfile(profile);
      setPublishCompany(profile?.name ?? '');
      setPublishSalary(data.salaryRange ?? '');
      setSelectedPublishLocations(
        data.workLocations.length > 0
          ? data.workLocations
          : profile?.locations[0]?.label
            ? [profile.locations[0].label]
            : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载 JD 失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadJobDescription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDescriptionId]);

  async function handleRegenerate() {
    if (!jobDescription || !form) return;
    if (status === 'published') return;
    setIsRegenerating(true);
    setError('');
    try {
      const run = await startJobDescriptionRegenerateRun(jobDescription.id, {
        currentJd: formToJd(form),
        extraInstruction: extraInstruction.trim(),
      });
      router.push(
        withReturnTarget(`/jd-generator/${jobDescription.id}/regenerate-runs/${run.id}`, {
          href: currentPathWithSearch(`/jd-generator/${jobDescription.id}`, searchParams),
          label: '返回 JD',
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新生成 JD 失败');
      setIsRegenerating(false);
    }
  }

  async function handlePublish() {
    if (!jobDescription || !form) return;
    if (status === 'published') return;
    const trimmedCompany = publishCompany.trim();
    const trimmedSalary = publishSalary.trim();
    const publishLocation = selectedPublishLocations.join('、');
    if (!canPublishWithCompanyProfile || !trimmedCompany || !trimmedSalary || !publishLocation) {
      setError('发布前请完善公司名称、薪资范围和工作地点。');
      return;
    }
    setIsPublishing(true);
    setError('');
    try {
      const saved = await updateJobDescriptionResource(jobDescription.id, {
        status: 'ready_to_publish',
        salaryRange: publishSalary,
        workLocations: selectedPublishLocations,
        content: formToJd(form),
      });
      setJobDescription(saved);
      setForm(jdToForm(saved.content));
      setStatus(saved.status);

      const run = await startJobDescriptionPublishRun(saved.id, {
        platform: 'boss-like',
        company: trimmedCompany,
        salary: trimmedSalary,
        location: publishLocation,
        keywords: parseKeywordInput(publishKeywords),
      });

      router.push(
        withReturnTarget(`/jd-generator/publish-runs/${run.id}`, {
          href: `/jd-generator/${saved.id}`,
          label: '返回详情',
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建发布任务失败');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleStartScreening() {
    if (!jobDescription) return;
    setIsScreening(true);
    setError('');
    try {
      const run = await createCandidateScreeningRun(jobDescription.id, {
        platform: 'boss-like',
        mode: 'execution',
      });
      setLatestScreeningRun(run);
      router.push(
        withReturnTarget(
          `/jd-generator/${jobDescription.id}/screening-runs/${run.id}`,
          detailReturnTarget,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动候选人筛选失败');
    } finally {
      setIsScreening(false);
    }
  }

  const context = jobDescription?.generationMeta?.context ?? null;
  const canScreenCandidates = status === 'published' || status === 'ready_to_publish';
  const isPublished = status === 'published';
  const isEditable = !isPublished;
  const screeningSummary = jobDescription
    ? getScreeningSummary(jobDescription)
    : defaultScreeningSummary;
  const screeningActionLabel = getScreeningActionLabel(screeningSummary);
  const latestRunId = latestScreeningRun?.id ?? screeningSummary.latestRunId;
  const latestCreateRun = createRuns[0] ?? null;
  const canPublishWithCompanyProfile = Boolean(
    companyProfile?.name.trim() && companyProfile.locations.length > 0,
  );

  function togglePublishLocation(label: string) {
    setSelectedPublishLocations((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载 JD…</div>;
  }

  if (!jobDescription || !form) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2" disableRipple href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        {error ? <ErrorBanner message={error} /> : <ErrorBanner message="JD 不存在" />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button
            as={Link}
            className="mb-3 gap-2 px-0"
            disableRipple
            href={returnTarget.href}
            variant="light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              {jobDescription.position}
            </h1>
            <StatusChip status={status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {jobDescription.department} · {formatUpdatedAt(jobDescription.updatedAt)}
          </p>
        </div>
        <div aria-label="JD 详情主操作" className="flex flex-wrap gap-2">
          {isEditable ? (
            <>
              <Button
                className="gap-2"
                color="primary"
                disableRipple
                isDisabled={isPublishing}
                type="button"
                onClick={() => void handlePublish()}
              >
                <Rocket className="h-4 w-4" aria-hidden />
                {isPublishing ? '发布中' : '发布'}
              </Button>
            </>
          ) : null}
          {canScreenCandidates ? (
            <>
              <Button
                className="gap-2"
                color={isEditable ? 'default' : 'primary'}
                disableRipple
                isDisabled={isScreening}
                type="button"
                variant={isEditable ? 'bordered' : 'solid'}
                onClick={() => void handleStartScreening()}
              >
                <ListFilter className="h-4 w-4" aria-hidden />
                {isScreening ? '启动中' : screeningActionLabel}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(340px,0.32fr)]">
        <section className="border-border space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <FileText className="text-muted-foreground h-4 w-4" aria-hidden />
            <div className="text-foreground text-sm font-medium">JD 内容</div>
          </div>

          <label className="block space-y-2">
            <FieldLabel>JD 标题</FieldLabel>
            <input
              aria-label="JD 标题"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              readOnly={!isEditable}
              value={form.title}
              onChange={(event) =>
                isEditable ? setForm({ ...form, title: event.target.value }) : undefined
              }
            />
          </label>

          <label className="block space-y-2">
            <FieldLabel>岗位摘要</FieldLabel>
            <textarea
              aria-label="岗位摘要"
              className="border-input bg-background text-foreground min-h-24 w-full rounded-md border px-3 py-2 text-sm"
              readOnly={!isEditable}
              value={form.summary}
              onChange={(event) =>
                isEditable ? setForm({ ...form, summary: event.target.value }) : undefined
              }
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block space-y-2">
              <FieldLabel>岗位职责</FieldLabel>
              <textarea
                aria-label="岗位职责"
                className="border-input bg-background text-foreground min-h-48 w-full rounded-md border px-3 py-2 text-sm"
                readOnly={!isEditable}
                value={form.responsibilities}
                onChange={(event) =>
                  isEditable
                    ? setForm({ ...form, responsibilities: event.target.value })
                    : undefined
                }
              />
            </label>
            <label className="block space-y-2">
              <FieldLabel>任职要求</FieldLabel>
              <textarea
                aria-label="任职要求"
                className="border-input bg-background text-foreground min-h-48 w-full rounded-md border px-3 py-2 text-sm"
                readOnly={!isEditable}
                value={form.requirements}
                onChange={(event) =>
                  isEditable ? setForm({ ...form, requirements: event.target.value }) : undefined
                }
              />
            </label>
            <label className="block space-y-2">
              <FieldLabel>加分项</FieldLabel>
              <textarea
                aria-label="加分项"
                className="border-input bg-background text-foreground min-h-32 w-full rounded-md border px-3 py-2 text-sm"
                readOnly={!isEditable}
                value={form.bonus}
                onChange={(event) =>
                  isEditable ? setForm({ ...form, bonus: event.target.value }) : undefined
                }
              />
            </label>
            <label className="block space-y-2">
              <FieldLabel>岗位亮点</FieldLabel>
              <textarea
                aria-label="岗位亮点"
                className="border-input bg-background text-foreground min-h-32 w-full rounded-md border px-3 py-2 text-sm"
                readOnly={!isEditable}
                value={form.highlights}
                onChange={(event) =>
                  isEditable ? setForm({ ...form, highlights: event.target.value }) : undefined
                }
              />
            </label>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="border-border space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <BadgeCheck className="text-muted-foreground h-4 w-4" aria-hidden />
              <div className="text-foreground text-sm font-medium">状态</div>
            </div>
            <label className="block space-y-2">
              <FieldLabel>发布状态</FieldLabel>
              <select
                aria-label="发布状态"
                className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                disabled={!isEditable}
                value={status}
                onChange={(event) =>
                  isEditable ? setStatus(event.target.value as JDStatus) : undefined
                }
              >
                {JD_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            {latestCreateRun ? (
              <div className="border-border space-y-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="text-muted-foreground h-4 w-4" aria-hidden />
                  <div className="text-foreground text-sm font-medium">创建记录</div>
                </div>
                <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-medium">
                      {formatUpdatedAt(latestCreateRun.updatedAt)}
                    </span>
                    <CreateRunStatusChip status={latestCreateRun.status} />
                  </div>
                  {latestCreateRun.errorMessage ? (
                    <p className="text-destructive mt-1 break-words">
                      {latestCreateRun.errorMessage}
                    </p>
                  ) : null}
                  <Link
                    className="text-primary mt-2 inline-flex items-center gap-1 font-medium hover:underline"
                    href={withReturnTarget(
                      `/jd-generator/create-runs/${latestCreateRun.id}`,
                      detailReturnTarget,
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    查看执行页
                  </Link>
                </div>
              </div>
            ) : null}

            {regenerateRuns.length > 0 ? (
              <div className="border-border space-y-2 border-t pt-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="text-muted-foreground h-4 w-4" aria-hidden />
                  <div className="text-foreground text-sm font-medium">重新生成记录</div>
                </div>
                <div className="space-y-2">
                  {regenerateRuns.map((run) => (
                    <div
                      key={run.id}
                      className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-foreground font-medium">
                          {formatUpdatedAt(run.updatedAt)}
                        </span>
                        <CreateRunStatusChip status={run.status} />
                      </div>
                      {run.errorMessage ? (
                        <p className="text-destructive mt-1 break-words">{run.errorMessage}</p>
                      ) : null}
                      <Link
                        className="text-primary mt-2 inline-flex items-center gap-1 font-medium hover:underline"
                        href={withReturnTarget(
                          `/jd-generator/${jobDescription.id}/regenerate-runs/${run.id}`,
                          detailReturnTarget,
                        )}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        查看执行页
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-border space-y-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Rocket className="text-muted-foreground h-4 w-4" aria-hidden />
                <div className="text-foreground text-sm font-medium">发布设置</div>
              </div>
              <label className="block space-y-2">
                <FieldLabel>公司名称</FieldLabel>
                <input
                  aria-label="发布公司名称"
                  className="border-input bg-muted/40 text-foreground h-10 w-full rounded-md border px-3 text-sm"
                  readOnly
                  value={publishCompany}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <FieldLabel>薪资范围</FieldLabel>
                  <select
                    aria-label="发布薪资范围"
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    disabled={!isEditable}
                    value={publishSalary}
                    onChange={(event) =>
                      isEditable ? setPublishSalary(event.target.value) : undefined
                    }
                  >
                    <option value="">请选择薪资范围</option>
                    {salaryRangeOptions.map((range) => (
                      <option key={range} value={range}>
                        {range}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-2">
                  <FieldLabel>工作地点</FieldLabel>
                  <div
                    aria-label="发布工作地点"
                    className="border-border grid min-h-10 gap-2 rounded-md border px-3 py-2"
                    role="group"
                  >
                    {companyProfile?.locations.map((location) => (
                      <label
                        key={location.id}
                        className="flex items-center gap-2 text-sm leading-6"
                      >
                        <input
                          checked={selectedPublishLocations.includes(location.label)}
                          className="h-4 w-4"
                          disabled={!isEditable}
                          type="checkbox"
                          onChange={() => {
                            if (isEditable) {
                              togglePublishLocation(location.label);
                            }
                          }}
                        />
                        <span>{location.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {!canPublishWithCompanyProfile ? (
                <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs">
                  <span className="text-muted-foreground">发布前请先维护公司名称和工作地点。</span>
                  <Link className="text-primary ml-2 hover:underline" href="/settings/company">
                    去公司设置
                  </Link>
                </div>
              ) : null}
              <label className="block space-y-2">
                <FieldLabel>技能标签</FieldLabel>
                <input
                  aria-label="发布技能标签"
                  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                  readOnly={!isEditable}
                  value={publishKeywords}
                  onChange={(event) =>
                    isEditable ? setPublishKeywords(event.target.value) : undefined
                  }
                />
              </label>
              {publishTrace ? (
                <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs">
                  <div className="text-foreground flex items-center justify-between gap-2 font-medium">
                    <span>执行结果：{publishTrace.status}</span>
                    <span className="text-muted-foreground">{publishTrace.steps.length} steps</span>
                  </div>
                  {publishTrace.steps.at(-1)?.result.error ? (
                    <p className="text-destructive mt-1 break-words">
                      {publishTrace.steps.at(-1)?.result.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {publishTasks.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs">最近发布记录</div>
                  <div className="space-y-1">
                    {publishTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        className="border-border hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-xs"
                        type="button"
                        onClick={() => setPublishTrace(task.trace)}
                      >
                        <span className="text-foreground">{task.status}</span>
                        <span className="text-muted-foreground">
                          {new Date(task.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {canScreenCandidates ? (
              <div className="border-border space-y-3 border-t pt-3">
                <div className="flex items-center gap-2">
                  <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
                  <div className="text-foreground text-sm font-medium">候选人筛选</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ScreeningSummaryChip summary={screeningSummary} />
                  <span className="text-muted-foreground text-xs">
                    合格 {screeningSummary.qualifiedCandidateCount} / 全部{' '}
                    {screeningSummary.totalCandidateCount}
                  </span>
                </div>
                {latestScreeningRun ? (
                  <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs">
                    <div className="text-foreground flex items-center justify-between gap-2 font-medium">
                      <span>筛选任务 {latestScreeningRun.id}</span>
                      <span className="text-muted-foreground">{latestScreeningRun.status}</span>
                    </div>
                    <Link
                      className="text-primary mt-1 inline-flex text-xs hover:underline"
                      href={withReturnTarget(
                        `/jd-generator/${jobDescription.id}/screening-runs/${latestScreeningRun.id}`,
                        detailReturnTarget,
                      )}
                    >
                      查看执行日志
                    </Link>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {latestRunId ? (
                    <Link
                      className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      href={withReturnTarget(
                        `/jd-generator/${jobDescription.id}/screening-runs/${latestRunId}`,
                        detailReturnTarget,
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      筛选记录
                    </Link>
                  ) : null}
                  <Link
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                    href={withReturnTarget(
                      `/jd-generator/${jobDescription.id}/candidates`,
                      detailReturnTarget,
                    )}
                  >
                    <ListFilter className="h-3.5 w-3.5" aria-hidden />
                    已筛选候选人
                  </Link>
                </div>
              </div>
            ) : null}
          </section>

          {isEditable ? (
            <section className="border-border space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-muted-foreground h-4 w-4" aria-hidden />
                <div className="text-foreground text-sm font-medium">追加要求</div>
              </div>
              <textarea
                aria-label="追加要求"
                className="border-input bg-background text-foreground min-h-28 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="例如：更强调 AI 招聘产品经验，弱化纯前端框架要求。"
                value={extraInstruction}
                onChange={(event) => setExtraInstruction(event.target.value)}
              />
              <Button
                className="w-full gap-2"
                color="primary"
                disableRipple
                isDisabled={isRegenerating}
                type="button"
                onClick={() => void handleRegenerate()}
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {isRegenerating ? '提交中' : '重新生成'}
              </Button>
            </section>
          ) : null}

          <section className="border-border space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-foreground text-sm font-medium">
                {context?.used ? '已使用公司上下文' : '公司上下文'}
              </div>
              <span className="text-muted-foreground font-mono text-xs">
                {context?.matches.length ?? 0} sources
              </span>
            </div>
            {context?.used ? (
              <Link
                className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                href={withReturnTarget(
                  `/jd-generator/${jobDescription.id}/context`,
                  detailReturnTarget,
                )}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                查看本次上下文
              </Link>
            ) : null}
            {context?.query ? (
              <div className="text-muted-foreground rounded-md border px-3 py-2 font-mono text-xs break-words">
                {context.query}
              </div>
            ) : null}
            {context?.matches.length ? (
              <ul className="space-y-2">
                {context.matches.map((match) => (
                  <li
                    key={`${match.documentId}-${match.chunkId}`}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      {match.title?.trim() || match.filename}
                      <span className="text-muted-foreground ml-2">{match.filename}</span>
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {match.score.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">暂无命中的知识库来源。</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
