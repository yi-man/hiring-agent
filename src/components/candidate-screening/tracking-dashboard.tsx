'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, ListFilter, MessageCircle, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { startCandidateCommunicationRun } from '@/lib/candidate-communication/client';
import { fetchCandidateTrackingOverview } from '@/lib/candidate-screening/client';
import {
  CANDIDATE_INTERVIEW_STAGE_LABELS,
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
} from '@/lib/candidate-screening/constants';
import {
  getRecruitmentType,
  isRecruitmentType,
  recruitmentTypeOptions,
  type RecruitmentType,
} from '@/lib/candidate-screening/recruitment-progress';
import type {
  CandidateTrackingCandidateDto,
  CandidateTrackingOverviewDto,
} from '@/lib/candidate-screening/repo';
import type {
  CandidateDecisionAction,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';
import {
  currentPathWithSearch,
  getOptionalReturnTarget,
  withReturnTarget,
} from '@/lib/navigation/return-url';

const actionOptions: Array<{ value: '' | CandidateDecisionAction; label: string }> = [
  { value: '', label: '全部动作' },
  { value: 'chat', label: 'chat' },
  { value: 'collect', label: 'collect' },
  { value: 'skip', label: 'skip' },
];

type CandidateScope = 'active' | 'onboarded' | 'ended' | 'all';
type CandidateProgressState = 'active' | 'rejected' | 'onboarded' | 'not_joined';

const interviewingStages = new Set<CandidateInterviewStage>([
  'phone_screen',
  'interviewing',
  'interview_completed',
  'offer',
]);

function candidateSubtitle(item: CandidateTrackingCandidateDto) {
  return [item.candidate.currentTitle, item.candidate.currentCompany, item.candidate.location]
    .filter(Boolean)
    .join(' · ');
}

function getCandidateProgressState(item: CandidateTrackingCandidateDto): CandidateProgressState {
  if (item.interviewStage === 'onboarded') return 'onboarded';
  if (item.interviewStage === 'not_joined') return 'not_joined';
  if (
    item.interviewStage === 'rejected' ||
    item.interviewStage === 'withdrawn' ||
    (item.decisionAction === 'skip' && !interviewingStages.has(item.interviewStage))
  ) {
    return 'rejected';
  }
  return 'active';
}

function getCandidateProgressLabel(item: CandidateTrackingCandidateDto) {
  const state = getCandidateProgressState(item);
  if (state === 'onboarded') return CANDIDATE_INTERVIEW_STAGE_LABELS.onboarded;
  if (state === 'not_joined') return CANDIDATE_INTERVIEW_STAGE_LABELS.not_joined;
  if (state === 'rejected') return '淘汰';
  return '正在推进';
}

function isEndedCandidate(item: CandidateTrackingCandidateDto) {
  return getCandidateProgressState(item) !== 'active';
}

function isActiveCandidate(item: CandidateTrackingCandidateDto) {
  return !isEndedCandidate(item);
}

export function CandidateTrackingDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTarget = getOptionalReturnTarget(searchParams);
  const dashboardReturnTarget = {
    href: currentPathWithSearch('/candidates', searchParams),
    label: '返回候选人列表',
  };
  const [overview, setOverview] = useState<CandidateTrackingOverviewDto>({
    jobs: [],
    candidates: [],
  });
  const [recruitmentType, setRecruitmentType] = useState<RecruitmentType>(() => {
    const value = searchParams.get('recruitmentType');
    return isRecruitmentType(value) ? value : 'recruiting';
  });
  const [interviewStage, setInterviewStage] = useState<'' | CandidateInterviewStage>('');
  const [decisionAction, setDecisionAction] = useState<'' | CandidateDecisionAction>('');
  const [scope, setScope] = useState<CandidateScope>(() => {
    const value = searchParams.get('scope');
    return value === 'active' || value === 'onboarded' || value === 'ended' || value === 'all'
      ? value
      : 'active';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingCommunication, setIsSyncingCommunication] = useState(false);
  const [error, setError] = useState('');

  async function loadOverview(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError('');
    try {
      setOverview(await fetchCandidateTrackingOverview(300));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载候选人跟踪失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  async function handleSyncCommunication() {
    setIsSyncingCommunication(true);
    setError('');
    try {
      const run = await startCandidateCommunicationRun({
        mode: 'batch',
        maxPasses: 10,
      });
      router.push(
        withReturnTarget(`/jd-generator/communication-runs/${run.id}`, dashboardReturnTarget),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动候选人沟通失败');
    } finally {
      setIsSyncingCommunication(false);
    }
  }

  const filteredCandidates = useMemo(
    () =>
      overview.candidates.filter((candidate) => {
        if (scope === 'active' && !isActiveCandidate(candidate)) return false;
        if (scope === 'onboarded' && getCandidateProgressState(candidate) !== 'onboarded') {
          return false;
        }
        if (scope === 'ended' && !isEndedCandidate(candidate)) return false;
        if (
          recruitmentType !== 'all' &&
          getRecruitmentType(candidate.jobDescription) !== recruitmentType
        ) {
          return false;
        }
        if (interviewStage && candidate.interviewStage !== interviewStage) return false;
        if (decisionAction && candidate.decisionAction !== decisionAction) return false;
        return true;
      }),
    [decisionAction, interviewStage, overview.candidates, recruitmentType, scope],
  );

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {returnTarget ? (
            <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {returnTarget.label}
            </Button>
          ) : null}
          <div className="flex items-center gap-2">
            <ListFilter className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">候选人列表</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            集中筛选和跟进候选人，查看人员状态及其关联招聘岗位。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start lg:self-auto">
          <Button
            className="gap-2"
            isDisabled={isSyncingCommunication}
            type="button"
            variant="bordered"
            onClick={() => void handleSyncCommunication()}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {isSyncingCommunication ? '启动中' : '批量沟通'}
          </Button>
          <Button
            className="gap-2"
            isDisabled={isLoading}
            type="button"
            variant="bordered"
            onClick={() => void loadOverview({ silent: true })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="border-border rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
          跟踪范围
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">招聘类型</span>
            <select
              aria-label="招聘类型"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={recruitmentType}
              onChange={(event) => setRecruitmentType(event.target.value as RecruitmentType)}
            >
              {recruitmentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-muted-foreground text-xs">候选人状态</span>
            <select
              aria-label="跟踪范围"
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={scope}
              onChange={(event) => setScope(event.target.value as CandidateScope)}
            >
              <option value="active">正在推进</option>
              <option value="onboarded">已入职</option>
              <option value="ended">已结束（含已入职）</option>
              <option value="all">全部候选人</option>
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
                  {CANDIDATE_INTERVIEW_STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
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
              {actionOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">候选人</div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${filteredCandidates.length} 人`}
          </div>
        </div>
        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            正在加载候选人…
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            当前筛选条件下暂无候选人。
          </div>
        ) : (
          <div className="divide-border divide-y">
            {filteredCandidates.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_72px_96px_minmax(0,120px)_140px] xl:items-center"
              >
                <div className="min-w-0">
                  <Link
                    className="text-foreground block truncate text-sm font-medium hover:underline"
                    href={withReturnTarget(
                      `/jd-generator/${item.jobDescription.id}/candidates/${item.candidateId}`,
                      dashboardReturnTarget,
                    )}
                  >
                    {item.candidate.displayName}
                  </Link>
                  <div className="text-muted-foreground mt-1 truncate text-xs">
                    {candidateSubtitle(item) || '候选人信息待补充'}
                  </div>
                </div>
                <div className="min-w-0">
                  <Link
                    className="text-muted-foreground block truncate text-xs hover:underline"
                    href={withReturnTarget(
                      `/jd-generator/${item.jobDescription.id}`,
                      dashboardReturnTarget,
                    )}
                  >
                    {item.jobDescription.position}
                  </Link>
                  {item.notes ? (
                    <div className="text-foreground mt-1 truncate text-xs">{item.notes}</div>
                  ) : null}
                </div>
                <div className="font-mono text-lg font-semibold">{Math.round(item.finalScore)}</div>
                <Chip size="sm" variant="flat">
                  {item.decisionAction}
                </Chip>
                <div className="min-w-0 space-y-1">
                  <span className="text-muted-foreground block truncate text-xs">
                    {CANDIDATE_INTERVIEW_STAGE_LABELS[item.interviewStage]}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {getCandidateProgressLabel(item)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button
                    as={Link}
                    href={withReturnTarget(
                      `/jd-generator/${item.jobDescription.id}/candidates/${item.candidateId}`,
                      dashboardReturnTarget,
                    )}
                    size="sm"
                    variant="light"
                  >
                    查看简历
                  </Button>
                  {item.candidate.profileUrl || item.resume?.profileUrl ? (
                    <Button
                      as={Link}
                      className="gap-1"
                      href={`/api/jd/${item.jobDescription.id}/candidates/${item.candidateId}/original-profile`}
                      prefetch={false}
                      rel="noreferrer"
                      size="sm"
                      target="_blank"
                      variant="bordered"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      查看原站
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
