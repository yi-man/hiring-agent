'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ListFilter, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchCandidateInterviewRecords } from '@/lib/candidate-screening/client';
import {
  CANDIDATE_INTERVIEW_FEEDBACK_DECISIONS,
  CANDIDATE_INTERVIEW_FEEDBACK_STAGES,
} from '@/lib/candidate-screening/constants';
import type { CandidateInterviewRecordDto } from '@/lib/candidate-screening/repo';
import { getCandidateEvaluationDimension } from '@/lib/candidate-screening/evaluation-dimensions';
import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
} from '@/lib/candidate-screening/types';
import { withReturnTarget } from '@/lib/navigation/return-url';

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无时间';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '暂无时间';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function candidateSubtitle(record: CandidateInterviewRecordDto) {
  return [record.candidate.currentTitle, record.candidate.currentCompany, record.candidate.location]
    .filter(Boolean)
    .join(' · ');
}

function textList(values: string[]) {
  return values.length > 0 ? values.join('、') : '暂无';
}

const jdStatusLabels: Record<CandidateInterviewRecordDto['jobDescription']['status'], string> = {
  created: '已创建',
  ready_to_publish: '待发布',
  publishing: '发布中',
  published: '招聘中',
  filled: '已招满',
  publish_failed: '发布失败',
  offline: '已停止招聘（系统内）',
  archived: '已归档',
};

export function InterviewRecordList() {
  const returnTarget = { href: '/interviews', label: '返回面试记录' };
  const [records, setRecords] = useState<CandidateInterviewRecordDto[]>([]);
  const [jobDescriptionId, setJobDescriptionId] = useState('');
  const [stage, setStage] = useState<'' | CandidateInterviewFeedbackStage>('');
  const [decision, setDecision] = useState<'' | CandidateInterviewFeedbackDecision>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadRecords(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError('');
    try {
      setRecords(await fetchCandidateInterviewRecords(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载面试记录失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const jobs = useMemo(() => {
    const byId = new Map<string, CandidateInterviewRecordDto['jobDescription']>();
    for (const record of records) {
      byId.set(record.jobDescription.id, record.jobDescription);
    }
    return [...byId.values()];
  }, [records]);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        if (jobDescriptionId && record.jobDescription.id !== jobDescriptionId) return false;
        if (stage && record.stage !== stage) return false;
        if (decision && record.decision !== decision) return false;
        return true;
      }),
    [decision, jobDescriptionId, records, stage],
  );

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ListFilter className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">面试记录</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            跨 JD 查看候选人的面试反馈与推进结论。
          </p>
        </div>
        <Button
          className="gap-2 self-start lg:self-auto"
          isDisabled={isLoading}
          type="button"
          variant="bordered"
          onClick={() => void loadRecords({ silent: true })}
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
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">JD</span>
            <select
              aria-label="JD 筛选"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={jobDescriptionId}
              onChange={(event) => setJobDescriptionId(event.target.value)}
            >
              <option value="">全部 JD</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">阶段</span>
            <select
              aria-label="面试阶段筛选"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={stage}
              onChange={(event) =>
                setStage(event.target.value as '' | CandidateInterviewFeedbackStage)
              }
            >
              <option value="">全部阶段</option>
              {CANDIDATE_INTERVIEW_FEEDBACK_STAGES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">结论</span>
            <select
              aria-label="面试结论筛选"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={decision}
              onChange={(event) =>
                setDecision(event.target.value as '' | CandidateInterviewFeedbackDecision)
              }
            >
              <option value="">全部结论</option>
              {CANDIDATE_INTERVIEW_FEEDBACK_DECISIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
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
            记录
          </div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${filteredRecords.length} 条`}
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            正在加载面试记录…
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">暂无面试记录。</div>
        ) : (
          <div className="divide-border divide-y">
            {filteredRecords.map((record) => (
              <article key={record.id} className="space-y-3 px-4 py-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_108px_84px_84px_150px] lg:items-center">
                  <div className="min-w-0">
                    <Link
                      className="text-foreground block truncate text-sm font-medium hover:underline"
                      href={withReturnTarget(
                        `/jd-generator/${record.jobDescription.id}/candidates/${record.candidate.id}`,
                        returnTarget,
                      )}
                    >
                      {record.candidate.displayName}
                    </Link>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {candidateSubtitle(record) || '候选人信息待补充'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <Link
                      className="text-foreground block truncate text-sm font-medium hover:underline"
                      href={withReturnTarget(
                        `/jd-generator/${record.jobDescription.id}`,
                        returnTarget,
                      )}
                    >
                      {record.jobDescription.title}
                    </Link>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {record.jobDescription.department} ·{' '}
                      {jdStatusLabels[record.jobDescription.status]}
                    </div>
                  </div>
                  <Chip size="sm" variant="flat">
                    {record.stage}
                  </Chip>
                  <div className="font-mono text-lg font-semibold">{record.rating}/5</div>
                  <Chip size="sm" variant="flat">
                    {record.decision}
                  </Chip>
                  <div className="text-muted-foreground text-xs">
                    <span className="text-foreground block truncate text-sm">
                      {record.interviewer}
                    </span>
                    {formatDateTime(record.updatedAt)}
                  </div>
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div className="bg-muted/30 min-w-0 rounded-md p-3">
                    <div className="text-muted-foreground mb-1 text-xs">优势</div>
                    <div className="text-foreground break-words">{textList(record.pros)}</div>
                  </div>
                  <div className="bg-muted/30 min-w-0 rounded-md p-3">
                    <div className="text-muted-foreground mb-1 text-xs">不足</div>
                    <div className="text-foreground break-words">{textList(record.cons)}</div>
                  </div>
                  <div className="bg-muted/30 min-w-0 rounded-md p-3">
                    <div className="text-muted-foreground mb-1 text-xs">备注</div>
                    <div className="text-foreground break-words">{record.notes || '暂无'}</div>
                  </div>
                </div>
                {record.dimensionRatings.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {record.dimensionRatings.map((rating) => (
                      <Chip key={rating.dimension} size="sm" variant="flat">
                        {getCandidateEvaluationDimension(rating.dimension).label} {rating.score}/5
                      </Chip>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
