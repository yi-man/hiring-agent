import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, GitBranch, History } from 'lucide-react';
import { SignInButton } from '@/components/auth/sign-in-button';
import { getServerAuthSession } from '@/lib/auth/session';
import { getRecruitmentPlatformLabel } from '@/lib/recruitment-platforms';
import {
  listLatestActivePublishedWorkflows,
  type PublishedWorkflowSummary,
} from '@/lib/workflows/published-workflows';

export const metadata: Metadata = {
  title: 'Workflow 库 · 招聘助手',
  description: '查看 Agent 探索生成及已完成真实执行验证的招聘自动化 workflow。',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
}

function formatSuccessRate(workflow: PublishedWorkflowSummary): string {
  const rate = workflow.successRate;
  return rate === null ? '当前 Skill 尚未执行' : `${Math.round(rate * 100)}%`;
}

function workflowStatusPresentation(workflow: PublishedWorkflowSummary) {
  if (workflow.successRate !== null) {
    return {
      label: '已验证',
      className:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
      note: null,
    };
  }

  const isRepair = Boolean(workflow.meta?.repaired_from_skill_id);
  return {
    label: isRepair ? 'Agent 修复完成' : 'Agent 探索完成',
    className:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
    note: isRepair
      ? 'Agent 已完成目标重探索并生成修复 Skill；当前 Skill 尚未完整执行。'
      : 'Agent 已完成页面探索并生成 Skill；当前 Skill 尚未完整执行。',
  };
}

function SignInPanel() {
  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto flex min-h-screen items-center px-4 py-10">
        <section className="border-border bg-card w-full max-w-xl rounded-lg border p-6">
          <h1 className="text-foreground text-2xl font-semibold tracking-normal">请先登录后继续</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            登录后可查看已发布 workflow、执行步骤与历史版本。
          </p>
          <div className="mt-5">
            <SignInButton />
          </div>
        </section>
      </div>
    </main>
  );
}

function WorkflowListItem({ workflow }: { workflow: PublishedWorkflowSummary }) {
  const platformLabel = getRecruitmentPlatformLabel(workflow.platform);
  const status = workflowStatusPresentation(workflow);

  return (
    <Link
      href={`/workflows/${workflow.id}`}
      className="group border-border bg-card hover:border-primary/40 hover:bg-primary/5 block rounded-lg border p-5 transition-colors"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-primary/10 text-primary inline-flex h-8 w-8 items-center justify-center rounded-lg">
              <GitBranch className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-foreground text-lg font-semibold tracking-normal">
              {workflow.name} · {platformLabel}
            </h2>
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs font-medium">
              v{workflow.version}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="text-muted-foreground mt-3 text-sm leading-6">{workflow.description}</p>
        </div>
        <ArrowRight
          className="text-muted-foreground group-hover:text-primary h-5 w-5 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="text-sm">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            平台
          </div>
          <div className="text-foreground mt-1 font-medium">
            {platformLabel}（{workflow.platform}）
          </div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            步骤
          </div>
          <div className="text-foreground mt-1 font-medium">{workflow.stepCount} steps</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {workflow.successRate === null ? '执行状态' : '成功率'}
          </div>
          <div className="text-foreground mt-1 font-medium">{formatSuccessRate(workflow)}</div>
        </div>
        <div className="text-sm">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            最近更新
          </div>
          <div className="text-foreground mt-1 font-medium">{formatDate(workflow.updatedAt)}</div>
        </div>
      </div>

      {status.note ? (
        <div className="mt-4 space-y-1">
          <div className="text-xs text-sky-700 dark:text-sky-300">{status.note}</div>
          {workflow.usageCount > 0 ? (
            <div className="text-muted-foreground text-xs">
              同名 Workflow 历史累计使用 {workflow.usageCount} 次
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-muted-foreground mt-4 text-xs">累计使用 {workflow.usageCount} 次</div>
      )}
    </Link>
  );
}

export default async function WorkflowsPage() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return <SignInPanel />;
  }

  const workflows = await listLatestActivePublishedWorkflows();

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="container mx-auto space-y-5 px-4 py-6">
        <div className="border-border flex flex-col gap-3 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <GitBranch className="text-muted-foreground h-5 w-5" aria-hidden="true" />
              <h1 className="text-foreground text-2xl font-semibold tracking-normal">
                Workflow 库
              </h1>
            </div>
            <p className="text-muted-foreground text-sm">
              展示 Agent 探索生成及已完成真实执行验证的最新 workflow；真实执行成功率为 0%
              的流程不展示。
            </p>
          </div>
          <div className="border-border text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            {workflows.length} 个 workflow
          </div>
        </div>

        {workflows.length === 0 ? (
          <section className="border-border bg-card rounded-lg border px-5 py-12 text-center">
            <h2 className="text-foreground text-lg font-semibold">暂无 workflow</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Agent 完成页面探索并生成 Skill 后，会自动出现在这里。
            </p>
          </section>
        ) : (
          <section aria-label="Workflow 列表" className="grid gap-4">
            {workflows.map((workflow) => (
              <WorkflowListItem key={workflow.id} workflow={workflow} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
