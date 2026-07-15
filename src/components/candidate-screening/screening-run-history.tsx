import Link from 'next/link';
import { Eye, GitBranch } from 'lucide-react';
import type { CandidateScreeningRunDto } from '@/lib/candidate-screening/repo';
import { withReturnTarget, type ReturnTarget } from '@/lib/navigation/return-url';

const statusLabel: Record<CandidateScreeningRunDto['status'], string> = {
  pending: '等待中',
  running: '运行中',
  success: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function formatRunTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ScreeningRunHistory({
  jobDescriptionId,
  returnTarget,
  runs,
}: {
  jobDescriptionId: string;
  returnTarget: ReturnTarget;
  runs: CandidateScreeningRunDto[];
}) {
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>筛选历史</span>
        <span>{runs.length} 次</span>
      </div>
      {runs.length > 0 ? (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="border-border bg-muted/30 rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-foreground font-medium">{run.id}</span>
                <span className="text-muted-foreground">
                  {statusLabel[run.status]} · {formatRunTime(run.createdAt)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  aria-label={`${run.id} 查看执行日志`}
                  className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                  href={withReturnTarget(
                    `/jd-generator/${jobDescriptionId}/screening-runs/${run.id}`,
                    returnTarget,
                  )}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  查看执行日志
                </Link>
                {run.skillId && run.workflow ? (
                  <Link
                    aria-label={`${run.workflow.name} v${run.workflow.version}`}
                    className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                    href={withReturnTarget(`/workflows/${run.skillId}`, returnTarget)}
                  >
                    <GitBranch className="h-3.5 w-3.5" aria-hidden />
                    {run.workflow.name} · v{run.workflow.version}
                  </Link>
                ) : run.skillId ? (
                  <span className="text-muted-foreground text-xs">关联的 Workflow 已不可用</span>
                ) : (
                  <span className="text-muted-foreground text-xs">未关联 Workflow</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">暂无筛选记录</p>
      )}
    </div>
  );
}
