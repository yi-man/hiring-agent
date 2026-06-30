'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, ListFilter, Loader2 } from 'lucide-react';
import { Card, CardBody, Chip } from '@/components/ui';
import { fetchCandidateScreeningRun } from '@/lib/candidate-screening/client';
import type { CandidateScreeningRunDto } from '@/lib/candidate-screening/repo';

const terminalStatuses = new Set(['success', 'failed', 'cancelled']);

function RunStatusIcon({ status }: { status: CandidateScreeningRunDto['status'] }) {
  if (status === 'success') {
    return <Check className="h-4 w-4 text-emerald-600" aria-hidden />;
  }
  if (status === 'failed' || status === 'cancelled') {
    return <AlertCircle className="text-destructive h-4 w-4" aria-hidden />;
  }
  return <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" aria-hidden />;
}

export function RunProgress({ runId }: { runId: string }) {
  const [run, setRun] = useState<CandidateScreeningRunDto | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const next = await fetchCandidateScreeningRun(runId);
        if (cancelled) return;
        setRun(next);
        setError('');
        if (!terminalStatuses.has(next.status)) {
          timer = setTimeout(load, 1500);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '加载筛选进度失败');
        timer = setTimeout(load, 3000);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  return (
    <Card className="border-border rounded-lg border shadow-none">
      <CardBody className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            筛选进度
          </div>
          {run ? (
            <Chip size="sm" variant="flat">
              {run.status}
            </Chip>
          ) : null}
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {run ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <RunStatusIcon status={run.status} />
              <span className="font-mono">{run.id}</span>
              <span className="text-muted-foreground">{run.currentStage ?? 'waiting'}</span>
            </div>
            {run.stats ? (
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {[
                  ['获取', run.stats.fetched],
                  ['入库', run.stats.stored],
                  ['评估', run.stats.evaluated],
                  ['推荐沟通', run.stats.recommendedChat],
                ].map(([label, value]) => (
                  <div key={label} className="border-border rounded-md border px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-foreground mt-1 font-mono text-base">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {run.errorMessage ? (
              <p className="text-destructive text-sm">{run.errorMessage}</p>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">正在读取进度…</div>
        )}
      </CardBody>
    </Card>
  );
}
