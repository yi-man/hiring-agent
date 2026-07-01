'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Eye,
  FileText,
  ListFilter,
  MessageCircle,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
} from 'lucide-react';
import { CandidateCommunicationSyncResultPanel } from '@/components/candidate-communication/sync-result-panel';
import { Button, Chip } from '@/components/ui';
import {
  syncUnreadCandidateConversations,
  type SyncUnreadCandidateConversationsResult,
} from '@/lib/candidate-communication/client';
import { createCandidateScreeningRun } from '@/lib/candidate-screening/client';
import type { CandidateScreeningRunDto } from '@/lib/candidate-screening/repo';
import {
  createJobDescriptionFromInput,
  fetchJobDescription,
  fetchJobDescriptionPublishTasks,
  fetchJobDescriptions,
  publishJobDescriptionResource,
  regenerateJobDescription,
  updateJobDescriptionResource,
} from '@/lib/jd/client';
import type { PublishTaskDto, PublishTaskResult } from '@/lib/jd-publishing/types';
import { JD_STATUSES } from '@/types';
import type { JD, JDStatus, JDTone, JobDescriptionDto } from '@/types';

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
  const [items, setItems] = useState<JobDescriptionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function loadJds(options?: { silent?: boolean }) {
    if (options?.silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');
    try {
      setItems(await fetchJobDescriptions());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载 JD 列表失败');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadJds();
  }, []);

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
            href="/jd-generator/candidates"
            variant="bordered"
          >
            <ListFilter className="h-4 w-4" aria-hidden />
            候选人跟踪
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

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            JD 列表
          </div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${items.length} 条`}
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
                className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_160px_170px_88px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="text-foreground min-w-0 truncate text-sm font-medium">
                    {item.position}
                  </div>
                  <div className="text-muted-foreground mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span>{item.department}</span>
                    <span className="min-w-0 truncate">{item.content.title}</span>
                  </div>
                </div>
                <StatusChip status={item.status} />
                <div className="text-muted-foreground text-xs">
                  {formatUpdatedAt(item.updatedAt)}
                </div>
                <Button
                  as={Link}
                  className="gap-2 justify-self-start md:justify-self-end"
                  disableRipple
                  href={`/jd-generator/${item.id}`}
                  size="sm"
                  variant="light"
                >
                  <Eye className="h-4 w-4" aria-hidden />
                  查看
                </Button>
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
  const [tone, setTone] = useState<JDTone>('tech');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!positions.includes(position)) {
      setPosition(positions[0]);
    }
  }, [position, positions]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const jobDescription = await createJobDescriptionFromInput({
        department,
        position,
        positionDescription: positionDescription.trim(),
        tone,
      });
      router.push(`/jd-generator/${jobDescription.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建 JD 失败');
    } finally {
      setIsSubmitting(false);
    }
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
            isDisabled={isSubmitting || !positionDescription.trim()}
            type="submit"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {isSubmitting ? '生成中' : '生成并创建'}
          </Button>
        </aside>
      </form>
    </div>
  );
}

export function JDDetailView({ jobDescriptionId }: { jobDescriptionId: string }) {
  const [jobDescription, setJobDescription] = useState<JobDescriptionDto | null>(null);
  const [form, setForm] = useState<JDForm | null>(null);
  const [status, setStatus] = useState<JDStatus>('created');
  const [extraInstruction, setExtraInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isScreening, setIsScreening] = useState(false);
  const [isSyncingCommunication, setIsSyncingCommunication] = useState(false);
  const [latestScreeningRun, setLatestScreeningRun] = useState<CandidateScreeningRunDto | null>(
    null,
  );
  const [communicationSyncResult, setCommunicationSyncResult] =
    useState<SyncUnreadCandidateConversationsResult | null>(null);
  const [publishCompany, setPublishCompany] = useState('星河智能');
  const [publishSalary, setPublishSalary] = useState('25-40K');
  const [publishLocation, setPublishLocation] = useState('上海');
  const [publishKeywords, setPublishKeywords] = useState('TypeScript, React');
  const [publishTasks, setPublishTasks] = useState<PublishTaskDto[]>([]);
  const [publishTrace, setPublishTrace] = useState<PublishTaskResult['trace'] | null>(null);
  const [error, setError] = useState('');

  async function loadJobDescription() {
    setIsLoading(true);
    setError('');
    try {
      const [data, tasks] = await Promise.all([
        fetchJobDescription(jobDescriptionId),
        fetchJobDescriptionPublishTasks(jobDescriptionId).catch(() => []),
      ]);
      setJobDescription(data);
      setForm(jdToForm(data.content));
      setStatus(data.status);
      setPublishTasks(tasks);
      setPublishTrace(tasks.find((task) => task.trace)?.trace ?? null);
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

  async function handleSave() {
    if (!jobDescription || !form) return;
    setIsSaving(true);
    setError('');
    try {
      const next = await updateJobDescriptionResource(jobDescription.id, {
        status,
        content: formToJd(form),
      });
      setJobDescription(next);
      setForm(jdToForm(next.content));
      setStatus(next.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存 JD 失败');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!jobDescription || !form) return;
    setIsRegenerating(true);
    setError('');
    try {
      const next = await regenerateJobDescription(jobDescription.id, {
        currentJd: formToJd(form),
        extraInstruction: extraInstruction.trim(),
      });
      setJobDescription(next);
      setForm(jdToForm(next.content));
      setStatus(next.status);
      setExtraInstruction('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新生成 JD 失败');
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handlePublish() {
    if (!jobDescription || !form) return;
    setIsPublishing(true);
    setError('');
    setPublishTrace(null);
    try {
      const saved = await updateJobDescriptionResource(jobDescription.id, {
        status: 'ready_to_publish',
        content: formToJd(form),
      });
      setJobDescription(saved);
      setForm(jdToForm(saved.content));
      setStatus(saved.status);

      const result = await publishJobDescriptionResource(saved.id, {
        platform: 'boss-like',
        company: publishCompany.trim(),
        salary: publishSalary.trim(),
        location: publishLocation.trim(),
        keywords: parseKeywordInput(publishKeywords),
      });
      setJobDescription(result.jobDescription);
      setForm(jdToForm(result.jobDescription.content));
      setStatus(result.jobDescription.status);
      setPublishTrace(result.task.trace);
      setPublishTasks((current) => [
        {
          id: result.task.taskId,
          userId: result.jobDescription.userId,
          jobDescriptionId: result.jobDescription.id,
          skillId: result.task.skillId,
          platform: 'boss-like',
          input: {},
          currentStep: null,
          status: result.task.status,
          errorMessage: result.task.trace.steps.at(-1)?.result.error ?? null,
          trace: result.task.trace,
          createdAt: result.task.trace.createdAt,
          updatedAt: result.task.trace.createdAt,
        },
        ...current,
      ]);
    } catch (e) {
      const publishError = e as Error &
        Partial<{ jobDescription: JobDescriptionDto; task: PublishTaskResult }>;
      if (publishError.jobDescription) {
        setJobDescription(publishError.jobDescription);
        setStatus(publishError.jobDescription.status);
      }
      if (publishError.task) {
        setPublishTrace(publishError.task.trace);
      }
      setError(e instanceof Error ? e.message : '发布 JD 失败');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动候选人筛选失败');
    } finally {
      setIsScreening(false);
    }
  }

  async function handleSyncCommunication() {
    setIsSyncingCommunication(true);
    setCommunicationSyncResult(null);
    setError('');
    try {
      const result = await syncUnreadCandidateConversations({
        platform: 'boss-like',
        maxPasses: 10,
      });
      setCommunicationSyncResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动候选人沟通失败');
    } finally {
      setIsSyncingCommunication(false);
    }
  }

  const context = jobDescription?.generationMeta?.context ?? null;
  const canScreenCandidates = status === 'published' || status === 'ready_to_publish';

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载 JD…</div>;
  }

  if (!jobDescription || !form) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2" disableRipple href="/jd-generator" variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回列表
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
            href="/jd-generator"
            variant="light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回列表
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
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            disableRipple
            isDisabled={isSaving}
            type="button"
            variant="bordered"
            onClick={() => void handleSave()}
          >
            <Save className="h-4 w-4" aria-hidden />
            {isSaving ? '保存中' : '保存修改'}
          </Button>
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
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>

          <label className="block space-y-2">
            <FieldLabel>岗位摘要</FieldLabel>
            <textarea
              aria-label="岗位摘要"
              className="border-input bg-background text-foreground min-h-24 w-full rounded-md border px-3 py-2 text-sm"
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block space-y-2">
              <FieldLabel>岗位职责</FieldLabel>
              <textarea
                aria-label="岗位职责"
                className="border-input bg-background text-foreground min-h-48 w-full rounded-md border px-3 py-2 text-sm"
                value={form.responsibilities}
                onChange={(event) => setForm({ ...form, responsibilities: event.target.value })}
              />
            </label>
            <label className="block space-y-2">
              <FieldLabel>任职要求</FieldLabel>
              <textarea
                aria-label="任职要求"
                className="border-input bg-background text-foreground min-h-48 w-full rounded-md border px-3 py-2 text-sm"
                value={form.requirements}
                onChange={(event) => setForm({ ...form, requirements: event.target.value })}
              />
            </label>
            <label className="block space-y-2">
              <FieldLabel>加分项</FieldLabel>
              <textarea
                aria-label="加分项"
                className="border-input bg-background text-foreground min-h-32 w-full rounded-md border px-3 py-2 text-sm"
                value={form.bonus}
                onChange={(event) => setForm({ ...form, bonus: event.target.value })}
              />
            </label>
            <label className="block space-y-2">
              <FieldLabel>岗位亮点</FieldLabel>
              <textarea
                aria-label="岗位亮点"
                className="border-input bg-background text-foreground min-h-32 w-full rounded-md border px-3 py-2 text-sm"
                value={form.highlights}
                onChange={(event) => setForm({ ...form, highlights: event.target.value })}
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
                value={status}
                onChange={(event) => setStatus(event.target.value as JDStatus)}
              >
                {JD_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <div className="border-border space-y-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Rocket className="text-muted-foreground h-4 w-4" aria-hidden />
                <div className="text-foreground text-sm font-medium">Boss-like 发布</div>
              </div>
              <label className="block space-y-2">
                <FieldLabel>公司名称</FieldLabel>
                <input
                  aria-label="发布公司名称"
                  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                  value={publishCompany}
                  onChange={(event) => setPublishCompany(event.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2">
                  <FieldLabel>薪资范围</FieldLabel>
                  <input
                    aria-label="发布薪资范围"
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    value={publishSalary}
                    onChange={(event) => setPublishSalary(event.target.value)}
                  />
                </label>
                <label className="block space-y-2">
                  <FieldLabel>工作地点</FieldLabel>
                  <input
                    aria-label="发布工作地点"
                    className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                    value={publishLocation}
                    onChange={(event) => setPublishLocation(event.target.value)}
                  />
                </label>
              </div>
              <label className="block space-y-2">
                <FieldLabel>技能标签</FieldLabel>
                <input
                  aria-label="发布技能标签"
                  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                  value={publishKeywords}
                  onChange={(event) => setPublishKeywords(event.target.value)}
                />
              </label>
              <Button
                className="w-full gap-2"
                color="primary"
                disableRipple
                isDisabled={
                  isPublishing ||
                  !publishCompany.trim() ||
                  !publishSalary.trim() ||
                  !publishLocation.trim()
                }
                type="button"
                onClick={() => void handlePublish()}
              >
                <Rocket className="h-4 w-4" aria-hidden />
                {isPublishing ? '发布中' : '发布到 Boss-like'}
              </Button>
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="gap-2"
                    color="primary"
                    disableRipple
                    isDisabled={isScreening}
                    type="button"
                    onClick={() => void handleStartScreening()}
                  >
                    <ListFilter className="h-4 w-4" aria-hidden />
                    {isScreening ? '启动中' : '筛选并执行'}
                  </Button>
                  <Button
                    as={Link}
                    className="gap-2"
                    disableRipple
                    href={`/jd-generator/${jobDescription.id}/candidates`}
                    variant="bordered"
                  >
                    <ListFilter className="h-4 w-4" aria-hidden />
                    已筛选候选人
                  </Button>
                  <Button
                    className="gap-2 sm:col-span-2"
                    disableRipple
                    isDisabled={isSyncingCommunication}
                    type="button"
                    variant="bordered"
                    onClick={() => void handleSyncCommunication()}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    {isSyncingCommunication ? '启动中' : '启动沟通'}
                  </Button>
                </div>
                {latestScreeningRun ? (
                  <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs">
                    <div className="text-foreground flex items-center justify-between gap-2 font-medium">
                      <span>筛选任务 {latestScreeningRun.id}</span>
                      <span className="text-muted-foreground">{latestScreeningRun.status}</span>
                    </div>
                    <Link
                      className="text-primary mt-1 inline-flex text-xs hover:underline"
                      href={`/jd-generator/${jobDescription.id}/candidates`}
                    >
                      查看筛选结果
                    </Link>
                  </div>
                ) : null}
                {communicationSyncResult ? (
                  <CandidateCommunicationSyncResultPanel result={communicationSyncResult} />
                ) : null}
              </div>
            ) : null}
          </section>

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
              {isRegenerating ? '生成中' : '重新生成'}
            </Button>
          </section>

          <section className="border-border space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-foreground text-sm font-medium">
                {context?.used ? '已使用公司上下文' : '公司上下文'}
              </div>
              <span className="text-muted-foreground font-mono text-xs">
                {context?.matches.length ?? 0} sources
              </span>
            </div>
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
