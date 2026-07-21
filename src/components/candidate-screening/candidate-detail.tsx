'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarCheck2,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  MessageCircle,
} from 'lucide-react';
import { Button, Card, CardBody, Chip } from '@/components/ui';
import { startCandidateCommunicationRun } from '@/lib/candidate-communication/client';
import {
  fetchCandidateInterviewFeedbacks,
  fetchJdCandidateDetail,
} from '@/lib/candidate-screening/client';
import {
  isCandidateOutreachAllowedJobStatus,
  CANDIDATE_INTERVIEW_FEEDBACK_STAGES,
  isTerminalCandidateInterviewStage,
} from '@/lib/candidate-screening/constants';
import type {
  CandidateInterviewFeedbackDto,
  CandidateScreeningDetailDto,
} from '@/lib/candidate-screening/repo';
import {
  currentPathWithSearch,
  getReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';
import {
  feedbackStageLabels,
  interviewStageLabels,
} from '@/components/candidate-screening/interview-display';
import { fetchJobDescription } from '@/lib/jd/client';
import type { JDStatus } from '@/types';

export function CandidateDetail({
  jobDescriptionId,
  candidateId,
}: {
  jobDescriptionId: string;
  candidateId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: `/jd-generator/${jobDescriptionId}/candidates`,
    label: '返回候选人',
  });
  const detailReturnTarget = {
    href: currentPathWithSearch(
      `/jd-generator/${jobDescriptionId}/candidates/${candidateId}`,
      searchParams,
    ),
    label: '返回候选人详情',
  };
  const [candidate, setCandidate] = useState<CandidateScreeningDetailDto | null>(null);
  const [jobDescriptionStatus, setJobDescriptionStatus] = useState<JDStatus | null>(null);
  const [feedbacks, setFeedbacks] = useState<CandidateInterviewFeedbackDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingCommunication, setIsStartingCommunication] = useState(false);
  const [error, setError] = useState('');

  const originalProfileHref =
    candidate?.candidate.profileUrl || candidate?.resume?.profileUrl
      ? `/api/jd/${jobDescriptionId}/candidates/${candidateId}/original-profile`
      : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [nextCandidate, nextFeedbacks, jobDescription] = await Promise.all([
          fetchJdCandidateDetail(jobDescriptionId, candidateId),
          fetchCandidateInterviewFeedbacks(jobDescriptionId, candidateId),
          fetchJobDescription(jobDescriptionId),
        ]);
        if (cancelled) return;
        setCandidate(nextCandidate);
        setFeedbacks(nextFeedbacks);
        setJobDescriptionStatus(jobDescription.status);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '加载候选人详情失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [candidateId, jobDescriptionId]);

  async function handleStartSingleCommunication(sourceScreeningRunId: string) {
    setIsStartingCommunication(true);
    setError('');
    try {
      const run = await startCandidateCommunicationRun({
        mode: 'single',
        jobDescriptionId,
        candidateId,
        sourceScreeningRunId,
        platform: candidate?.candidate.sourcePlatform ?? 'boss-like',
      });
      router.push(
        withReturnTarget(`/jd-generator/communication-runs/${run.id}`, detailReturnTarget),
      );
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : '启动单点沟通失败');
    } finally {
      setIsStartingCommunication(false);
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载候选人…</div>;
  }

  if (!candidate) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '候选人不存在'}
        </div>
      </div>
    );
  }

  const completedFeedbackStages = new Set(feedbacks.map((feedback) => feedback.stage));
  const interviewHref = withReturnTarget(
    `/jd-generator/${jobDescriptionId}/candidates/${candidateId}/interview`,
    detailReturnTarget,
  );
  const canStartSingleCommunication =
    jobDescriptionStatus !== null &&
    isCandidateOutreachAllowedJobStatus(jobDescriptionStatus) &&
    !isTerminalCandidateInterviewStage(candidate.interviewStage) &&
    candidate.actionPlan?.action === 'chat' &&
    candidate.latestPlannedChatRunId !== null;

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <BadgeCheck className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              {candidate.candidate.displayName}
            </h1>
            <Chip size="sm" variant="flat">
              {candidate.decisionAction}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              candidate.candidate.currentTitle,
              candidate.candidate.currentCompany,
              candidate.candidate.location,
            ]
              .filter(Boolean)
              .join(' · ') || '候选人信息待补充'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canStartSingleCommunication ? (
            <Button
              className="gap-2"
              isDisabled={isStartingCommunication}
              type="button"
              variant="bordered"
              onClick={() => {
                if (candidate.latestPlannedChatRunId) {
                  void handleStartSingleCommunication(candidate.latestPlannedChatRunId);
                }
              }}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {isStartingCommunication ? '启动中' : '单点沟通'}
            </Button>
          ) : null}
          {originalProfileHref ? (
            <Button
              as={Link}
              className="gap-2"
              href={originalProfileHref}
              prefetch={false}
              rel="noreferrer"
              target="_blank"
              variant="bordered"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              查看原站
            </Button>
          ) : null}
          <div className="ml-2 text-left lg:text-right">
            <div className="font-mono text-3xl font-semibold">
              {Math.round(candidate.finalScore)}
            </div>
            <div className="text-muted-foreground text-xs">匹配分</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(320px,0.32fr)]">
        <section className="space-y-4">
          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="text-muted-foreground h-4 w-4" aria-hidden />
                简历
              </div>
              <p className="text-foreground text-sm leading-6 whitespace-pre-wrap">
                {candidate.resume?.rawText ?? '暂无简历正文'}
              </p>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BadgeCheck className="text-muted-foreground h-4 w-4" aria-hidden />
                评估
              </div>
              <p className="text-foreground text-sm">{candidate.decisionReason}</p>
              <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                {[
                  ['skill', candidate.scoreDetail.skill],
                  ['domain', candidate.scoreDetail.domain],
                  ['ability', candidate.scoreDetail.ability],
                  ['risk', candidate.scoreDetail.risk],
                  ['calibration', candidate.scoreDetail.llmBonus],
                ].map(([label, value]) => (
                  <div key={label} className="border-border rounded-md border px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-foreground mt-1 font-mono text-base">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border-border overflow-hidden rounded-lg border shadow-none">
            <CardBody className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarCheck2 className="text-muted-foreground h-4 w-4" aria-hidden />
                  面试状态
                </div>
                <Chip
                  color={candidate.interviewStage === 'interviewing' ? 'primary' : 'default'}
                  size="sm"
                  variant="flat"
                >
                  {interviewStageLabels[candidate.interviewStage]}
                </Chip>
              </div>
              <div>
                <p className="text-foreground text-sm font-medium">
                  已完成 {feedbacks.length} / {CANDIDATE_INTERVIEW_FEEDBACK_STAGES.length} 轮评价
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {candidate.notes || '暂无面试备注'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CANDIDATE_INTERVIEW_FEEDBACK_STAGES.map((stage) => {
                  const isCompleted = completedFeedbackStages.has(stage);
                  return (
                    <div
                      key={stage}
                      className="border-border bg-muted/20 flex min-h-16 flex-col justify-between rounded-md border p-2.5"
                    >
                      <span className="text-muted-foreground text-xs">
                        {feedbackStageLabels[stage]}
                      </span>
                      <span className="text-foreground mt-2 flex items-center gap-1 text-xs font-medium">
                        {isCompleted ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                        {feedbackStageLabels[stage]}
                        {isCompleted ? '已评价' : '待评价'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <Button
                as={Link}
                className="w-full justify-between"
                color="primary"
                href={interviewHref}
              >
                查看面试详情
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-2 p-4">
              <div className="text-sm font-medium">动作记录</div>
              {candidate.actionLogs.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无动作记录。</p>
              ) : (
                <div className="space-y-2">
                  {candidate.actionLogs.map((log) => (
                    <div key={log.id} className="border-border rounded-md border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-muted-foreground">{log.status}</span>
                      </div>
                      {log.message ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2">{log.message}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
