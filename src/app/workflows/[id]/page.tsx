import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Database,
  GitBranch,
  History,
  Network,
} from 'lucide-react';
import { SignInButton } from '@/components/auth/sign-in-button';
import { MermaidDiagram } from '@/components/workflows/mermaid-diagram';
import { getServerAuthSession } from '@/lib/auth/session';
import { getPublishedWorkflowDetail } from '@/lib/workflows/published-workflows';
import type { PublishedWorkflowSummary } from '@/lib/workflows/published-workflows';
import { buildWorkflowFlow, type WorkflowFlow } from '@/lib/workflows/flow';
import type { PublishStep } from '@/lib/jd-publishing/types';
import {
  getOptionalReturnTarget,
  getReturnTarget,
  withReturnTarget,
  type ReturnTarget,
} from '@/lib/navigation/return-url';

type WorkflowDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: 'Workflow 详情 · 招聘助手',
  description: '查看已发布 workflow 的执行步骤、流程图和历史版本。',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function readNumberMeta(workflow: PublishedWorkflowSummary, key: string): number | null {
  const value = workflow.meta?.[key];
  return typeof value === 'number' ? value : null;
}

function formatSuccessRate(workflow: PublishedWorkflowSummary): string {
  const rate = readNumberMeta(workflow, 'success_rate');
  return rate === null ? '暂无' : `${Math.round(rate * 100)}%`;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="bg-muted text-foreground max-h-[32rem] overflow-auto rounded-lg p-4 text-xs leading-6">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function SignInPanel() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto flex min-h-screen items-center px-4 py-10">
        <section className="border-border bg-card w-full max-w-xl rounded-lg border p-6">
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">请先登录后继续</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            登录后可查看 workflow 详情、步骤内容与历史版本。
          </p>
          <div className="mt-5">
            <SignInButton />
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkflowMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GitBranch;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border rounded-lg border px-4 py-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <div className="text-foreground mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function WorkflowFlowDiagram({ flow }: { flow: WorkflowFlow }) {
  const edgesBySource = new Map<string, WorkflowFlow['edges']>();
  for (const edge of flow.edges) {
    edgesBySource.set(edge.from, [...(edgesBySource.get(edge.from) ?? []), edge]);
  }

  return (
    <div className="space-y-3">
      {flow.nodes.map((node, index) => {
        const outgoing = edgesBySource.get(node.id) ?? [];
        const tone =
          node.kind === 'condition'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
            : node.kind === 'end'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200';

        return (
          <div
            key={node.id}
            className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)]"
          >
            <div className={`rounded-lg border px-4 py-3 ${tone}`}>
              <div className="flex items-center gap-3">
                <span className="text-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-semibold dark:bg-black/20">
                  {index + 1}
                </span>
                <span className="min-w-0 text-sm font-semibold">
                  {node.label} · {node.description}
                </span>
              </div>
            </div>
            <div className="border-border rounded-lg border px-4 py-3">
              {outgoing.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {outgoing.map((edge) => (
                    <span
                      key={`${edge.from}-${edge.label}-${edge.to}`}
                      className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs font-medium"
                    >
                      {edge.label} → {edge.to}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">无后续节点</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepTimeline({ steps }: { steps: PublishStep[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.id} className="border-border rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-muted text-muted-foreground inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold">
              {index + 1}
            </span>
            <h3 className="text-foreground text-sm font-semibold">{step.id}</h3>
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              {step.type}
            </span>
          </div>
          <div className="mt-3">
            <JsonBlock value={step} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function VersionHistory({
  activeId,
  returnTarget,
  versions,
}: {
  activeId: string;
  returnTarget: ReturnTarget | null;
  versions: PublishedWorkflowSummary[];
}) {
  return (
    <aside className="space-y-3">
      <div className="border-border bg-card rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="text-muted-foreground h-4 w-4" aria-hidden="true" />
          <h2 className="text-foreground text-sm font-semibold">历史版本</h2>
        </div>
        <div className="space-y-2">
          {versions.map((version) => {
            const isCurrent = version.id === activeId;
            return (
              <Link
                key={version.id}
                href={withReturnTarget(`/workflows/${version.id}`, returnTarget)}
                className={`block rounded-lg border px-3 py-3 text-sm transition-colors ${
                  isCurrent
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-border text-foreground hover:border-primary/35 hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">v{version.version}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      version.isActive
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {version.isActive ? '使用中' : '旧版本'}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {version.stepCount} steps · {formatDate(version.updatedAt)}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function toUrlSearchParams(values: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

export default async function WorkflowDetailPage({
  params,
  searchParams,
}: WorkflowDetailPageProps) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return <SignInPanel />;
  }

  const { id } = await params;
  const detail = await getPublishedWorkflowDetail(id);

  if (!detail) {
    notFound();
    return null;
  }

  const { workflow, versions } = detail;
  const flow = buildWorkflowFlow(workflow.steps);
  const usageCount = readNumberMeta(workflow, 'usage_count');
  const resolvedSearchParams = toUrlSearchParams((await searchParams) ?? {});
  const optionalReturnTarget = getOptionalReturnTarget(resolvedSearchParams);
  const returnTarget = getReturnTarget(resolvedSearchParams, {
    href: '/workflows',
    label: 'Workflow 库',
  });

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto space-y-5 px-4 py-6">
        <Link
          href={returnTarget.href}
          className="text-muted-foreground hover:text-primary inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {returnTarget.label}
        </Link>

        <div className="border-border flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="bg-primary/10 text-primary inline-flex h-9 w-9 items-center justify-center rounded-lg">
                <GitBranch className="h-4 w-4" aria-hidden="true" />
              </span>
              <h1 className="text-foreground text-2xl font-semibold tracking-normal">
                {workflow.name}
              </h1>
              <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">
                v{workflow.version}
              </span>
              {workflow.isActive ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  使用中
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground max-w-3xl text-sm leading-6">
              {workflow.description}
            </p>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Workflow 指标"
            >
              <WorkflowMetric icon={GitBranch} label="平台" value={workflow.platform} />
              <WorkflowMetric icon={Network} label="步骤数" value={`${workflow.stepCount} steps`} />
              <WorkflowMetric
                icon={CheckCircle2}
                label="成功率"
                value={formatSuccessRate(workflow)}
              />
              <WorkflowMetric
                icon={CircleDot}
                label="使用次数"
                value={usageCount === null ? '暂无' : `${usageCount} 次`}
              />
            </section>

            <section className="border-border bg-card rounded-lg border p-5">
              <div className="mb-4 flex items-center gap-2">
                <Network className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                <h2 className="text-foreground text-lg font-semibold">执行流程</h2>
              </div>
              <WorkflowFlowDiagram flow={flow} />
            </section>

            <section className="border-border bg-card rounded-lg border p-5">
              <div className="mb-4 flex items-center gap-2">
                <Network className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                <h2 className="text-foreground text-lg font-semibold">Mermaid Flow</h2>
              </div>
              <MermaidDiagram chart={flow.mermaid} />
            </section>

            <section className="border-border bg-card rounded-lg border p-5">
              <div className="mb-4 flex items-center gap-2">
                <Database className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                <h2 className="text-foreground text-lg font-semibold">Input Schema</h2>
              </div>
              <JsonBlock value={workflow.inputSchema} />
            </section>

            <section className="border-border bg-card rounded-lg border p-5">
              <div className="mb-4 flex items-center gap-2">
                <Database className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                <h2 className="text-foreground text-lg font-semibold">Variables</h2>
              </div>
              <JsonBlock value={workflow.variables} />
            </section>

            <section className="border-border bg-card rounded-lg border p-5">
              <div className="mb-4 flex items-center gap-2">
                <GitBranch className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                <h2 className="text-foreground text-lg font-semibold">Steps</h2>
              </div>
              <StepTimeline steps={workflow.steps} />
            </section>
          </div>

          <VersionHistory
            activeId={workflow.id}
            returnTarget={optionalReturnTarget}
            versions={versions}
          />
        </div>
      </div>
    </main>
  );
}
