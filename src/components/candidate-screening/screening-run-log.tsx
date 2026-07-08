'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FileText, ListFilter, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import {
  fetchCandidateScreeningRunWithEvents,
  fetchJdCandidates,
} from '@/lib/candidate-screening/client';
import { QUALIFIED_CANDIDATE_SCORE } from '@/lib/candidate-screening/constants';
import type {
  CandidateScreeningResultListItem,
  CandidateScreeningRunEventDto,
  CandidateScreeningRunDto,
} from '@/lib/candidate-screening/repo';
import type { CandidateScreeningRunStage } from '@/lib/candidate-screening/types';
import {
  currentPathWithSearch,
  getReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';

const runStageSteps: Array<{ stage: CandidateScreeningRunStage; label: string }> = [
  { stage: 'planning', label: '制定搜索计划' },
  { stage: 'searching_live', label: '搜索候选人' },
  { stage: 'ingesting_live', label: '抓取简历' },
  { stage: 'indexing_resumes', label: '入库去重' },
  { stage: 'recalling_vectors', label: '向量召回' },
  { stage: 'evaluating', label: '评估打分' },
  { stage: 'ranking', label: '排序候选人' },
  { stage: 'planning_actions', label: '计划动作' },
  { stage: 'executing_actions', label: '执行动作' },
  { stage: 'finalizing', label: '收尾统计' },
];

type StepState = 'done' | 'running' | 'failed' | 'pending';

const statusLabel: Record<CandidateScreeningRunDto['status'], string> = {
  pending: '等待中',
  running: '运行中',
  success: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const statsLabels: Array<{
  key: keyof NonNullable<CandidateScreeningRunDto['stats']>;
  label: string;
}> = [
  { key: 'fetched', label: '抓取' },
  { key: 'deduped', label: '去重' },
  { key: 'stored', label: '入库' },
  { key: 'vectorRecalled', label: '召回' },
  { key: 'evaluated', label: '评估' },
  { key: 'recommendedChat', label: '建议沟通' },
  { key: 'recommendedCollect', label: '建议收藏' },
  { key: 'skipped', label: '跳过' },
  { key: 'failed', label: '失败' },
];

function formatTime(value: string | null) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function getStepState(run: CandidateScreeningRunDto, index: number): StepState {
  if (run.status === 'success') return 'done';

  const currentIndex = runStageSteps.findIndex((step) => step.stage === run.currentStage);
  if (currentIndex === -1) {
    return run.status === 'failed' && index === 0 ? 'failed' : 'pending';
  }
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return run.status === 'failed' ? 'failed' : 'running';
  return 'pending';
}

function StepIcon({ state }: { state: StepState }) {
  const className =
    state === 'done'
      ? 'bg-emerald-500'
      : state === 'running'
        ? 'bg-amber-500'
        : state === 'failed'
          ? 'bg-destructive'
          : 'bg-muted-foreground/40';
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`} aria-hidden />;
}

function stepStateLabel(state: StepState) {
  if (state === 'done') return '完成';
  if (state === 'running') return '进行中';
  if (state === 'failed') return '失败';
  return '待开始';
}

function resultLabel(item: CandidateScreeningResultListItem) {
  if (item.finalScore < QUALIFIED_CANDIDATE_SCORE) return '未达标';
  if (item.decisionAction === 'skip') return '已跳过';
  if (item.decisionAction === 'chat') return '待沟通';
  return '待收藏';
}

function candidateSubtitle(item: CandidateScreeningResultListItem) {
  return [item.candidate.currentTitle, item.candidate.currentCompany, item.candidate.location]
    .filter(Boolean)
    .join(' · ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatScoreValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMatchValue(value: number) {
  return value.toFixed(2);
}

type EventCandidateSummary = {
  candidateName: string;
  source: string | null;
  rank: number | null;
  matchScore: number | null;
  finalScore: number | null;
  action: string | null;
};

type EventCalibrationAnchorSummary = {
  label: string;
  expectedAction: string | null;
  scoreRange: [number, number] | null;
};

type EventRegressionTierSummary = {
  name: string;
  llmCalls: string | null;
};

function readCandidateSummaries(value: unknown): EventCandidateSummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const candidateName = readString(item.candidateName) ?? readString(item.candidateId);
      if (!candidateName) return null;
      return {
        candidateName,
        source: readString(item.source),
        rank: readNumber(item.rank),
        matchScore: readNumber(item.matchScore),
        finalScore: readNumber(item.finalScore),
        action: readString(item.action),
      };
    })
    .filter((item): item is EventCandidateSummary => item !== null);
}

function readCalibrationAnchors(value: unknown): EventCalibrationAnchorSummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const label = readString(item.label);
      if (!label) return null;
      const rawRange = Array.isArray(item.scoreRange) ? item.scoreRange : [];
      const min = readNumber(rawRange[0]);
      const max = readNumber(rawRange[1]);

      return {
        label,
        expectedAction: readString(item.expectedAction),
        scoreRange: min === null || max === null ? null : [min, max],
      };
    })
    .filter((item): item is EventCalibrationAnchorSummary => item !== null);
}

function readRegressionTiers(value: unknown): EventRegressionTierSummary[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const name = readString(item.name);
      if (!name) return null;
      return {
        name,
        llmCalls: readString(item.llmCalls),
      };
    })
    .filter((item): item is EventRegressionTierSummary => item !== null);
}

function renderScoreDetail(scoreDetail: Record<string, unknown>) {
  const scoreItems = [
    { key: 'total', label: '总分' },
    { key: 'skill', label: '技能' },
    { key: 'domain', label: '领域' },
    { key: 'ability', label: '能力' },
    { key: 'risk', label: '风险' },
    { key: 'llmBonus', label: '校准' },
  ]
    .map((item) => {
      const value = readNumber(scoreDetail[item.key]);
      return value === null ? null : { ...item, value };
    })
    .filter((item): item is { key: string; label: string; value: number } => item !== null);

  if (scoreItems.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {scoreItems.map((item) => (
        <span key={item.key} className="bg-muted/50 rounded px-2 py-1 font-mono text-[11px]">
          {item.label} {formatScoreValue(item.value)}
        </span>
      ))}
    </div>
  );
}

function renderCandidateSummaries(prefix: string, candidates: EventCandidateSummary[]) {
  if (candidates.length === 0) return null;

  return (
    <div className="space-y-1">
      {candidates.map((candidate, index) => {
        const name = candidate.rank
          ? `#${candidate.rank} ${candidate.candidateName}`
          : candidate.candidateName;
        const parts = [
          name,
          candidate.source,
          candidate.finalScore === null ? null : `总分 ${formatScoreValue(candidate.finalScore)}`,
          candidate.matchScore === null ? null : `匹配 ${formatMatchValue(candidate.matchScore)}`,
          candidate.action ? `动作 ${candidate.action}` : null,
        ].filter(Boolean);

        return (
          <div key={`${prefix}-${index}-${name}-${candidate.source ?? 'unknown'}`}>
            {prefix}：{parts.join(' · ')}
          </div>
        );
      })}
    </div>
  );
}

function renderQualityVersions(versions: Record<string, unknown> | null) {
  if (!versions) return null;
  const parts = [
    ['prompt', readString(versions.promptVersion)],
    ['scoring', readString(versions.scoringVersion)],
    ['calibration', readString(versions.calibrationVersion)],
    ['policy', readString(versions.qualityPolicyVersion)],
  ]
    .filter((item): item is [string, string] => item[1] !== null)
    .map(([label, value]) => `${label}=${value}`);

  if (parts.length === 0) return null;

  return <div className="font-mono break-words">版本：{parts.join(' · ')}</div>;
}

function renderCalibrationAnchors(anchors: EventCalibrationAnchorSummary[]) {
  if (anchors.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {anchors.map((anchor) => (
        <span key={anchor.label} className="bg-muted/50 rounded px-2 py-1 text-[11px]">
          {anchor.label}
          {anchor.expectedAction ? ` ${anchor.expectedAction}` : ''}
          {anchor.scoreRange ? ` ${anchor.scoreRange[0]}-${anchor.scoreRange[1]}` : ''}
        </span>
      ))}
    </div>
  );
}

function renderRunEventDetail(event: CandidateScreeningRunEventDto) {
  const detail = event.detail;
  if (!detail) return null;

  const candidateName = readString(detail.candidateName);
  const retrievalQuery =
    readString(detail.retrievalQuery) ??
    (isRecord(detail.searchPlan) ? readString(detail.searchPlan.retrievalQuery) : null);
  const scoreDetail = isRecord(detail.scoreDetail) ? detail.scoreDetail : null;
  const decision = isRecord(detail.decision) ? detail.decision : null;
  const action = readString(detail.action) ?? (decision ? readString(decision.action) : null);
  const priority = readString(detail.priority) ?? (decision ? readString(decision.priority) : null);
  const reason = readString(detail.reason) ?? (decision ? readString(decision.reason) : null);
  const dedupeBy = readString(detail.dedupeBy);
  const duplicateOf = isRecord(detail.duplicateOf) ? detail.duplicateOf : null;
  const duplicateOfName = duplicateOf ? readString(duplicateOf.candidateName) : null;
  const previousRunId = readString(detail.previousRunId);
  const contentPreview = readString(detail.contentPreview);
  const selectedCandidates = readCandidateSummaries(detail.selectedCandidates);
  const rankedCandidates = readCandidateSummaries(detail.candidates);
  const categoryLabel = readString(detail.categoryLabel);
  const category = readString(detail.category);
  const versions = isRecord(detail.versions) ? detail.versions : null;
  const anchors = readCalibrationAnchors(detail.anchors);
  const regressionTiers = readRegressionTiers(detail.regressionTiers);

  if (
    !candidateName &&
    !retrievalQuery &&
    !scoreDetail &&
    !action &&
    !reason &&
    !dedupeBy &&
    !duplicateOfName &&
    !previousRunId &&
    !contentPreview &&
    !categoryLabel &&
    !versions &&
    anchors.length === 0 &&
    regressionTiers.length === 0 &&
    selectedCandidates.length === 0 &&
    rankedCandidates.length === 0
  ) {
    return null;
  }

  return (
    <div className="text-muted-foreground mt-1 space-y-1 text-xs">
      {candidateName ? <div>候选人：{candidateName}</div> : null}
      {retrievalQuery ? <div className="font-mono break-words">{retrievalQuery}</div> : null}
      {scoreDetail ? renderScoreDetail(scoreDetail) : null}
      {action ? (
        <div>
          动作 {action}
          {priority ? ` · ${priority}` : ''}
        </div>
      ) : null}
      {reason ? <div className="text-foreground/80">{reason}</div> : null}
      {categoryLabel ? (
        <div>
          评分校准：{categoryLabel}
          {category ? ` · ${category}` : ''}
        </div>
      ) : null}
      {renderQualityVersions(versions)}
      {renderCalibrationAnchors(anchors)}
      {regressionTiers.length > 0 ? (
        <div>
          回归层级：
          {regressionTiers
            .map((tier) => `${tier.name}${tier.llmCalls ? `(${tier.llmCalls})` : ''}`)
            .join(' · ')}
        </div>
      ) : null}
      {renderCandidateSummaries('评估池', selectedCandidates)}
      {renderCandidateSummaries('排序', rankedCandidates)}
      {dedupeBy ? <div>去重依据：{dedupeBy}</div> : null}
      {duplicateOfName ? <div>重复于：{duplicateOfName}</div> : null}
      {previousRunId ? <div>历史评估：{previousRunId}</div> : null}
      {contentPreview ? <div className="line-clamp-2">{contentPreview}</div> : null}
    </div>
  );
}

export function CandidateScreeningRunLog({
  jobDescriptionId,
  runId,
}: {
  jobDescriptionId: string;
  runId: string;
}) {
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: `/jd-generator/${jobDescriptionId}`,
    label: '返回 JD',
  });
  const runLogReturnTarget = {
    href: currentPathWithSearch(
      `/jd-generator/${jobDescriptionId}/screening-runs/${runId}`,
      searchParams,
    ),
    label: '返回筛选记录',
  };
  const [run, setRun] = useState<CandidateScreeningRunDto | null>(null);
  const [events, setEvents] = useState<CandidateScreeningRunEventDto[]>([]);
  const [items, setItems] = useState<CandidateScreeningResultListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadRun = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError('');
      try {
        const [runDetail, candidates] = await Promise.all([
          fetchCandidateScreeningRunWithEvents(runId),
          fetchJdCandidates(jobDescriptionId, { runId, limit: 100 }),
        ]);
        setRun(runDetail.run);
        setEvents(runDetail.events);
        setItems(candidates);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载筛选执行日志失败');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [jobDescriptionId, runId],
  );

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (!run || (run.status !== 'pending' && run.status !== 'running')) return;
    const timer = window.setInterval(() => void loadRun({ silent: true }), 3000);
    return () => window.clearInterval(timer);
  }, [loadRun, run]);

  const resultStats = useMemo(() => {
    const qualified = items.filter((item) => item.finalScore >= QUALIFIED_CANDIDATE_SCORE);
    const selected = qualified.filter((item) => item.decisionAction !== 'skip');
    return {
      total: items.length,
      qualified: qualified.length,
      selected: selected.length,
      skipped: items.filter(
        (item) => item.decisionAction === 'skip' || item.finalScore < QUALIFIED_CANDIDATE_SCORE,
      ).length,
    };
  }, [items]);

  const eventsByStage = useMemo(() => {
    const grouped = new Map<CandidateScreeningRunStage, CandidateScreeningRunEventDto[]>();
    for (const event of events) {
      const current = grouped.get(event.stage) ?? [];
      current.push(event);
      grouped.set(event.stage, current);
    }
    return grouped;
  }, [events]);

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载筛选日志…</div>;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '筛选执行记录不存在'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">筛选执行日志</h1>
            <Chip size="sm" variant="flat">
              {statusLabel[run.status]}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Run {run.id} · {formatTime(run.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            as={Link}
            className="gap-2"
            href={withReturnTarget(
              `/jd-generator/${jobDescriptionId}/candidates`,
              runLogReturnTarget,
            )}
            variant="bordered"
          >
            <ListFilter className="h-4 w-4" aria-hidden />
            全部候选人
          </Button>
          <Button
            className="gap-2"
            isDisabled={isRefreshing}
            type="button"
            variant="bordered"
            onClick={() => void loadRun({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {isRefreshing ? '刷新中' : '刷新'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">本次结果</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">{resultStats.total} 条</div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">
            合格简历（{QUALIFIED_CANDIDATE_SCORE}+）
          </div>
          <div className="text-foreground mt-2 text-2xl font-semibold">
            {resultStats.qualified} 条合格
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">入选动作</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">
            {resultStats.selected} 条入选
          </div>
        </div>
        <div className="border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">未推进</div>
          <div className="text-foreground mt-2 text-2xl font-semibold">
            {resultStats.skipped} 条
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.62fr)_minmax(340px,0.38fr)]">
        <section className="border-border rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <FileText className="text-muted-foreground h-4 w-4" aria-hidden />
            执行步骤
          </div>
          <div className="space-y-3">
            {runStageSteps.map((step, index) => {
              const state = getStepState(run, index);
              const stepEvents = eventsByStage.get(step.stage) ?? [];
              return (
                <div key={step.stage} className="border-border rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <StepIcon state={state} />
                      <span className="text-foreground truncate text-sm">{step.label}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {stepStateLabel(state)}
                    </span>
                  </div>
                  {stepEvents.length > 0 ? (
                    <div className="border-border/70 mt-2 space-y-2 border-t pt-2">
                      {stepEvents.map((event) => (
                        <div key={event.id} className="pl-5">
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                              {formatEventTime(event.createdAt)}
                            </span>
                            <span className="text-foreground text-xs">{event.message}</span>
                          </div>
                          {renderRunEventDetail(event)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {run.errorMessage ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive mt-4 rounded-md border px-3 py-2 text-sm">
              {run.errorMessage}
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="border-border rounded-lg border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
              搜索与评估
            </div>
            {run.searchPlan ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">召回查询</div>
                  <div className="text-foreground mt-1 font-mono text-xs break-words">
                    {run.searchPlan.retrievalQuery}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {run.searchPlan.keywords.map((keyword) => (
                    <Chip key={keyword} size="sm" variant="flat">
                      {keyword}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">暂无搜索计划。</p>
            )}
            {run.evaluationSchema ? (
              <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                {Object.entries(run.evaluationSchema)
                  .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
                  .map(([key, values]) => (
                    <div key={key}>
                      <div className="text-muted-foreground text-xs">{key}</div>
                      <div className="text-foreground mt-1 text-xs">
                        {values.length > 0 ? values.join('、') : '未设置'}
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}
          </section>

          <section className="border-border rounded-lg border p-4">
            <div className="mb-3 text-sm font-medium">运行统计</div>
            {run.stats ? (
              <div className="grid grid-cols-3 gap-2">
                {statsLabels.map((item) => (
                  <div key={item.key} className="bg-muted/30 rounded-md px-3 py-2">
                    <div className="text-muted-foreground text-xs">{item.label}</div>
                    <div className="text-foreground mt-1 font-mono text-sm">
                      {run.stats?.[item.key] ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">运行中暂未写入统计。</p>
            )}
          </section>
        </aside>
      </div>

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            本次筛选记录
          </div>
          <div className="text-muted-foreground text-xs">{items.length} 人</div>
        </div>
        {items.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            暂无候选人结果。
          </div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_72px_92px_96px_minmax(160px,0.5fr)] lg:items-center"
              >
                <div className="min-w-0">
                  <Link
                    className="text-foreground block truncate text-sm font-medium hover:underline"
                    href={withReturnTarget(
                      `/jd-generator/${jobDescriptionId}/candidates/${item.candidateId}`,
                      runLogReturnTarget,
                    )}
                  >
                    {item.candidate.displayName}
                  </Link>
                  <div className="text-muted-foreground mt-1 truncate text-xs">
                    {candidateSubtitle(item) || '候选人信息待补充'}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold">{Math.round(item.finalScore)}</div>
                <Chip size="sm" variant="flat">
                  {resultLabel(item)}
                </Chip>
                <span className="text-muted-foreground text-xs">{item.actionStatus}</span>
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {item.decisionReason}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
