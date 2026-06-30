'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ListFilter, RefreshCw } from 'lucide-react';
import { Button, Chip, Input } from '@/components/ui';
import { fetchJdCandidates, type CandidateListFilters } from '@/lib/candidate-screening/client';
import { CANDIDATE_SCREENING_INTERVIEW_STAGES } from '@/lib/candidate-screening/constants';
import type { CandidateScreeningResultListItem } from '@/lib/candidate-screening/repo';
import type {
  CandidateDecisionAction,
  CandidateInterviewStage,
  CandidateScreeningSource,
} from '@/lib/candidate-screening/types';

const decisionOptions: Array<{ value: '' | CandidateDecisionAction; label: string }> = [
  { value: '', label: '全部动作' },
  { value: 'chat', label: 'chat' },
  { value: 'collect', label: 'collect' },
  { value: 'skip', label: 'skip' },
];

const sourceOptions: Array<{ value: '' | CandidateScreeningSource; label: string }> = [
  { value: '', label: '全部来源' },
  { value: 'live_search', label: 'live_search' },
  { value: 'vector_recall', label: 'vector_recall' },
  { value: 'both', label: 'both' },
];

function toMinScore(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, Math.trunc(parsed)));
}

function candidateSubtitle(item: CandidateScreeningResultListItem) {
  return [item.candidate.currentTitle, item.candidate.currentCompany, item.candidate.location]
    .filter(Boolean)
    .join(' · ');
}

export function CandidateList({ jobDescriptionId }: { jobDescriptionId: string }) {
  const [items, setItems] = useState<CandidateScreeningResultListItem[]>([]);
  const [decisionAction, setDecisionAction] = useState<'' | CandidateDecisionAction>('');
  const [interviewStage, setInterviewStage] = useState<'' | CandidateInterviewStage>('');
  const [source, setSource] = useState<'' | CandidateScreeningSource>('');
  const [minScore, setMinScore] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = useMemo<CandidateListFilters>(
    () => ({
      decisionAction: decisionAction || undefined,
      interviewStage: interviewStage || undefined,
      source: source || undefined,
      minScore: toMinScore(minScore),
      limit: 100,
    }),
    [decisionAction, interviewStage, minScore, source],
  );

  async function loadCandidates(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError('');
    try {
      setItems(await fetchJdCandidates(jobDescriptionId, filters));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载候选人失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobDescriptionId, filters]);

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button
            as={Link}
            className="mb-3 gap-2 px-0"
            href={`/jd-generator/${jobDescriptionId}`}
            variant="light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回 JD
          </Button>
          <div className="flex items-center gap-2">
            <ListFilter className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">已筛选候选人</h1>
          </div>
        </div>
        <Button
          className="gap-2 self-start lg:self-auto"
          isDisabled={isLoading}
          type="button"
          variant="bordered"
          onClick={() => void loadCandidates({ silent: true })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </Button>
      </div>

      <section className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
          筛选
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">推荐动作</span>
            <select
              aria-label="推荐动作"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={decisionAction}
              onChange={(event) =>
                setDecisionAction(event.target.value as '' | CandidateDecisionAction)
              }
            >
              {decisionOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">面试阶段</span>
            <select
              aria-label="面试阶段筛选"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={interviewStage}
              onChange={(event) =>
                setInterviewStage(event.target.value as '' | CandidateInterviewStage)
              }
            >
              <option value="">全部阶段</option>
              {CANDIDATE_SCREENING_INTERVIEW_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">来源</span>
            <select
              aria-label="来源"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={source}
              onChange={(event) => setSource(event.target.value as '' | CandidateScreeningSource)}
            >
              {sourceOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            aria-label="最低分"
            label="最低分"
            placeholder="0-100"
            value={minScore}
            onValueChange={setMinScore}
          />
        </div>
      </section>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            候选人
          </div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${items.length} 人`}
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            正在加载候选人…
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">暂无筛选结果。</div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_72px_110px_100px_110px_120px] lg:items-center"
              >
                <div className="min-w-0">
                  <Link
                    className="text-foreground block truncate text-sm font-medium hover:underline"
                    href={`/jd-generator/${jobDescriptionId}/candidates/${item.candidateId}`}
                  >
                    {item.candidate.displayName}
                  </Link>
                  <div className="text-muted-foreground mt-1 truncate text-xs">
                    {candidateSubtitle(item) || '候选人信息待补充'}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold">{Math.round(item.finalScore)}</div>
                <Chip size="sm" variant="flat">
                  {item.decisionAction}
                </Chip>
                <span className="text-muted-foreground text-xs">{item.source}</span>
                <span className="text-muted-foreground text-xs">{item.actionStatus}</span>
                <span className="text-muted-foreground text-xs">{item.interviewStage}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
