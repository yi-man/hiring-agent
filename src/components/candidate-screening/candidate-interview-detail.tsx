'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BrainCircuit,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  Save,
} from 'lucide-react';
import { Button, Card, CardBody, Chip } from '@/components/ui';
import {
  fetchCandidateInterviewFeedbacks,
  fetchJdCandidateDetail,
  saveCandidateInterviewFeedback,
  updateJdCandidateProgress,
} from '@/lib/candidate-screening/client';
import { CANDIDATE_INTERVIEW_FEEDBACK_STAGES } from '@/lib/candidate-screening/constants';
import { CANDIDATE_EVALUATION_DIMENSIONS } from '@/lib/candidate-screening/evaluation-dimensions';
import { getAllowedCandidateInterviewStageTransitions } from '@/lib/candidate-screening/interview-stage';
import type {
  CandidateInterviewFeedbackDto,
  CandidateScreeningDetailDto,
} from '@/lib/candidate-screening/repo';
import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateEvaluationDimensionKey,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';
import { getReturnTarget } from '@/lib/navigation/return-url';
import {
  feedbackDecisionLabels,
  feedbackStageLabels,
  interviewStageLabels,
  needsInterviewFeedback,
} from '@/components/candidate-screening/interview-display';

type InterviewFeedbackForm = {
  interviewer: string;
  dimensionRatings: Record<CandidateEvaluationDimensionKey, { score: string; evidence: string }>;
  prosText: string;
  consText: string;
  decision: CandidateInterviewFeedbackDecision;
  notes: string;
};

function emptyDimensionRatings(): InterviewFeedbackForm['dimensionRatings'] {
  return Object.fromEntries(
    CANDIDATE_EVALUATION_DIMENSIONS.map((dimension) => [
      dimension.key,
      { score: '', evidence: '' },
    ]),
  ) as InterviewFeedbackForm['dimensionRatings'];
}

function emptyFeedbackForm(): InterviewFeedbackForm {
  return {
    interviewer: '',
    dimensionRatings: emptyDimensionRatings(),
    prosText: '',
    consText: '',
    decision: 'hold',
    notes: '',
  };
}

function feedbackToForm(feedback: CandidateInterviewFeedbackDto): InterviewFeedbackForm {
  const dimensionRatings = emptyDimensionRatings();
  for (const rating of feedback.dimensionRatings) {
    dimensionRatings[rating.dimension] = {
      score: String(rating.score),
      evidence: rating.evidence,
    };
  }
  return {
    interviewer: feedback.interviewer,
    dimensionRatings,
    prosText: feedback.pros.join('\n'),
    consText: feedback.cons.join('\n'),
    decision: feedback.decision,
    notes: feedback.notes ?? '',
  };
}

function createFeedbackForms(
  feedbacks: CandidateInterviewFeedbackDto[],
): Record<CandidateInterviewFeedbackStage, InterviewFeedbackForm> {
  const forms = Object.fromEntries(
    CANDIDATE_INTERVIEW_FEEDBACK_STAGES.map((stage) => [stage, emptyFeedbackForm()]),
  ) as Record<CandidateInterviewFeedbackStage, InterviewFeedbackForm>;
  for (const feedback of feedbacks) forms[feedback.stage] = feedbackToForm(feedback);
  return forms;
}

function nextFeedbackStage(
  interviewStage: CandidateInterviewStage,
  feedbacks: CandidateInterviewFeedbackDto[],
) {
  const completed = new Set(feedbacks.map((feedback) => feedback.stage));
  if (interviewStage === 'phone_screen') {
    return completed.has('phone_screen') ? null : 'phone_screen';
  }
  if (interviewStage !== 'interviewing') return null;
  return CANDIDATE_INTERVIEW_FEEDBACK_STAGES.find((stage) => !completed.has(stage)) ?? null;
}

function splitFeedbackText(value: string): string[] {
  return value
    .split(/\n|；|;|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textList(values: string[]) {
  return values.length > 0 ? values.join('、') : '暂无';
}

export function CandidateInterviewDetail({
  jobDescriptionId,
  candidateId,
}: {
  jobDescriptionId: string;
  candidateId: string;
}) {
  const searchParams = useSearchParams();
  const returnTarget = getReturnTarget(searchParams, {
    href: `/jd-generator/${jobDescriptionId}/candidates/${candidateId}`,
    label: '返回候选人详情',
  });
  const [candidate, setCandidate] = useState<CandidateScreeningDetailDto | null>(null);
  const [feedbacks, setFeedbacks] = useState<CandidateInterviewFeedbackDto[]>([]);
  const [feedbackForms, setFeedbackForms] = useState<
    Record<CandidateInterviewFeedbackStage, InterviewFeedbackForm>
  >(() => createFeedbackForms([]));
  const [editingStage, setEditingStage] = useState<CandidateInterviewFeedbackStage | null>(null);
  const [interviewStage, setInterviewStage] = useState<CandidateInterviewStage>('sourced');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [savingFeedbackStage, setSavingFeedbackStage] =
    useState<CandidateInterviewFeedbackStage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [nextCandidate, nextFeedbacks] = await Promise.all([
          fetchJdCandidateDetail(jobDescriptionId, candidateId),
          fetchCandidateInterviewFeedbacks(jobDescriptionId, candidateId),
        ]);
        if (cancelled) return;
        setCandidate(nextCandidate);
        setFeedbacks(nextFeedbacks);
        setFeedbackForms(createFeedbackForms(nextFeedbacks));
        setInterviewStage(nextCandidate.interviewStage);
        setNotes(nextCandidate.notes ?? '');
        setEditingStage(
          needsInterviewFeedback(nextCandidate.interviewStage)
            ? nextFeedbackStage(nextCandidate.interviewStage, nextFeedbacks)
            : null,
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '加载面试详情失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [candidateId, jobDescriptionId]);

  async function handleSaveProgress(stageOverride?: CandidateInterviewStage) {
    if (!candidate) return;
    setIsSavingProgress(true);
    setError('');
    try {
      const updated = await updateJdCandidateProgress(jobDescriptionId, candidateId, {
        interviewStage: stageOverride ?? interviewStage,
        notes,
      });
      setCandidate({ ...candidate, ...updated });
      setInterviewStage(updated.interviewStage);
      setNotes(updated.notes ?? '');
      if (needsInterviewFeedback(updated.interviewStage) && editingStage === null) {
        setEditingStage(nextFeedbackStage(updated.interviewStage, feedbacks));
      } else if (!needsInterviewFeedback(updated.interviewStage)) {
        setEditingStage(null);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存面试进度失败');
    } finally {
      setIsSavingProgress(false);
    }
  }

  function updateFeedbackForm(
    stage: CandidateInterviewFeedbackStage,
    update: Partial<InterviewFeedbackForm>,
  ) {
    setFeedbackForms((current) => ({
      ...current,
      [stage]: { ...current[stage], ...update },
    }));
  }

  async function handleSaveFeedback(stage: CandidateInterviewFeedbackStage) {
    const form = feedbackForms[stage];
    const dimensionRatings = CANDIDATE_EVALUATION_DIMENSIONS.flatMap((dimension) => {
      const value = form.dimensionRatings[dimension.key];
      if (!value.score) return [];
      return [
        {
          dimension: dimension.key,
          score: Number(value.score),
          evidence: value.evidence.trim(),
        },
      ];
    });
    if (dimensionRatings.length === 0) {
      setError('请至少评价一个岗位胜任力维度');
      return;
    }
    if (dimensionRatings.some((rating) => !rating.evidence)) {
      setError('每个已评分维度都需要填写具体证据');
      return;
    }
    const rating =
      Math.round(
        (dimensionRatings.reduce((total, item) => total + item.score, 0) /
          dimensionRatings.length) *
          10,
      ) / 10;
    setSavingFeedbackStage(stage);
    setError('');
    try {
      const feedback = await saveCandidateInterviewFeedback(jobDescriptionId, candidateId, {
        stage,
        interviewer: form.interviewer,
        rating,
        dimensionRatings,
        pros: splitFeedbackText(form.prosText),
        cons: splitFeedbackText(form.consText),
        decision: form.decision,
        notes: form.notes,
      });
      const nextFeedbacks = [
        ...feedbacks.filter((item) => item.stage !== feedback.stage),
        feedback,
      ].sort(
        (left, right) =>
          CANDIDATE_INTERVIEW_FEEDBACK_STAGES.indexOf(left.stage) -
          CANDIDATE_INTERVIEW_FEEDBACK_STAGES.indexOf(right.stage),
      );
      setFeedbacks(nextFeedbacks);
      setFeedbackForms((current) => ({ ...current, [stage]: feedbackToForm(feedback) }));
      setEditingStage(
        candidate && needsInterviewFeedback(candidate.interviewStage)
          ? nextFeedbackStage(candidate.interviewStage, nextFeedbacks)
          : null,
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存面试反馈失败');
    } finally {
      setSavingFeedbackStage(null);
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载面试详情…</div>;
  }

  if (!candidate) {
    return (
      <div className="space-y-4">
        <Button as={Link} className="gap-2 px-0" href={returnTarget.href} variant="light">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {returnTarget.label}
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '面试信息不存在'}
        </div>
      </div>
    );
  }

  const pendingStage = nextFeedbackStage(candidate.interviewStage, feedbacks);
  const canContinue = needsInterviewFeedback(candidate.interviewStage) && pendingStage !== null;
  const editingFeedback = editingStage
    ? feedbacks.find((feedback) => feedback.stage === editingStage)
    : null;
  const availableInterviewStages = [
    candidate.interviewStage,
    ...getAllowedCandidateInterviewStageTransitions(candidate.interviewStage, feedbacks),
  ];
  const hasUnsyncedReply = candidate.candidate.replied && candidate.interviewStage === 'contacted';
  const hasInterviewEvidence = feedbacks.length > 0;
  const hasCompleteInterviewEvidence =
    feedbacks.length === CANDIDATE_INTERVIEW_FEEDBACK_STAGES.length;
  const decisionButtonLabel = hasCompleteInterviewEvidence ? '生成最终录用建议' : '生成阶段性建议';
  const decisionHref = `/jd-generator/${jobDescriptionId}/candidates/${candidateId}/interview/decision`;

  return (
    <div className="space-y-4">
      <header className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button as={Link} className="mb-3 gap-2 px-0" href={returnTarget.href} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {returnTarget.label}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarCheck2 className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">面试详情</h1>
            <Chip
              color={candidate.interviewStage === 'interviewing' ? 'primary' : 'default'}
              size="sm"
              variant="flat"
            >
              {interviewStageLabels[candidate.interviewStage]}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {candidate.candidate.displayName}
            {candidate.candidate.currentTitle ? ` · ${candidate.candidate.currentTitle}` : ''}
          </p>
        </div>
        <div className="text-left lg:text-right">
          <div className="font-mono text-2xl font-semibold">
            {feedbacks.length}/{CANDIDATE_INTERVIEW_FEEDBACK_STAGES.length}
          </div>
          <div className="text-muted-foreground text-xs">已完成评价</div>
        </div>
      </header>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {hasUnsyncedReply ? (
        <div className="border-warning/40 bg-warning/10 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-foreground text-sm font-medium">检测到候选人已经回复</p>
            <p className="text-muted-foreground mt-1 text-xs">
              这是一条历史状态不一致记录，可以同步为“已回复”后继续推进。
            </p>
          </div>
          <Button
            className="shrink-0"
            isDisabled={isSavingProgress}
            type="button"
            variant="bordered"
            onClick={() => void handleSaveProgress('replied')}
          >
            同步为已回复
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.65fr)_minmax(320px,0.35fr)]">
        <main className="space-y-4">
          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardCheck className="text-muted-foreground h-4 w-4" aria-hidden />
                  评价记录
                </div>
                <span className="text-muted-foreground text-xs">按面试轮次推进</span>
              </div>

              {feedbacks.length === 0 ? (
                <div className="border-border bg-muted/20 rounded-md border border-dashed px-4 py-8 text-center">
                  <p className="text-foreground text-sm font-medium">还没有面试评价</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {candidate.interviewStage === 'phone_screen'
                      ? '完成电话沟通后，在这里记录结构化评价。'
                      : '候选人进入对应面试阶段后，可继续记录评价。'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbacks.map((feedback) => (
                    <article key={feedback.id} className="border-border rounded-md border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="text-success h-4 w-4" aria-hidden />
                            <h2 className="text-foreground text-sm font-semibold">
                              {feedbackStageLabels[feedback.stage]}
                            </h2>
                            <Chip size="sm" variant="flat">
                              {feedbackDecisionLabels[feedback.decision]}
                            </Chip>
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {feedback.interviewer} · {feedback.rating}/5
                          </p>
                        </div>
                        <Button
                          className="gap-1.5"
                          size="sm"
                          type="button"
                          variant="light"
                          onClick={() => setEditingStage(feedback.stage)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          编辑评价
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div className="bg-muted/25 rounded-md p-3">
                          <div className="text-muted-foreground mb-1 text-xs">优势</div>
                          <div>{textList(feedback.pros)}</div>
                        </div>
                        <div className="bg-muted/25 rounded-md p-3">
                          <div className="text-muted-foreground mb-1 text-xs">不足</div>
                          <div>{textList(feedback.cons)}</div>
                        </div>
                      </div>
                      {feedback.dimensionRatings.length > 0 ? (
                        <div className="border-border mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
                          {feedback.dimensionRatings.map((rating) => {
                            const dimension = CANDIDATE_EVALUATION_DIMENSIONS.find(
                              (item) => item.key === rating.dimension,
                            );
                            if (!dimension) return null;
                            return (
                              <div key={rating.dimension} className="bg-muted/20 rounded-md p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-xs font-medium">{dimension.label}</span>
                                  <Chip size="sm" variant="flat">
                                    {rating.score}/5
                                  </Chip>
                                </div>
                                <p className="text-muted-foreground mt-2 text-xs leading-5">
                                  {rating.evidence}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-warning mt-3 text-xs">
                          历史评价尚未按岗位胜任力拆分，编辑后可补齐结构化证据。
                        </p>
                      )}
                      {feedback.notes ? (
                        <p className="text-muted-foreground mt-3 text-sm">{feedback.notes}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {editingStage ? (
            <FeedbackEditor
              form={feedbackForms[editingStage]}
              isSaving={savingFeedbackStage === editingStage}
              stage={editingStage}
              title={`${editingFeedback ? '编辑评价' : '继续评价'} · ${feedbackStageLabels[editingStage]}`}
              onCancel={() => setEditingStage(null)}
              onChange={(update) => updateFeedbackForm(editingStage, update)}
              onSave={() => void handleSaveFeedback(editingStage)}
            />
          ) : canContinue ? (
            <Card className="border-primary/30 bg-primary/5 rounded-lg border shadow-none">
              <CardBody className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-foreground text-sm font-medium">
                    下一步：评价{feedbackStageLabels[pendingStage]}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">当前面试仍在进行中。</p>
                </div>
                <Button color="primary" type="button" onClick={() => setEditingStage(pendingStage)}>
                  继续评价
                </Button>
              </CardBody>
            </Card>
          ) : (
            <div className="border-border bg-muted/20 rounded-lg border px-4 py-4">
              <p className="text-foreground text-sm font-medium">
                {pendingStage ? '当前无需评价' : '当前阶段评价已完成'}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {pendingStage
                  ? `候选人当前处于“${interviewStageLabels[candidate.interviewStage]}”，进入对应面试阶段后可继续评价。`
                  : '可以根据完整反馈生成录用建议。'}
              </p>
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">当前面试情况</div>
                <div aria-label="当前候选人进度">
                  <Chip size="sm" variant="flat">
                    {candidate.interviewStage}
                  </Chip>
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-muted-foreground text-xs">面试阶段</span>
                <select
                  aria-label="面试阶段"
                  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                  value={interviewStage}
                  onChange={(event) =>
                    setInterviewStage(event.target.value as CandidateInterviewStage)
                  }
                >
                  {availableInterviewStages.map((stage) => (
                    <option key={stage} value={stage}>
                      {interviewStageLabels[stage]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-muted-foreground text-xs">备注</span>
                <textarea
                  aria-label="候选人备注"
                  className="border-input bg-background text-foreground min-h-28 w-full rounded-md border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <Button
                className="w-full gap-2"
                color="primary"
                isDisabled={isSavingProgress}
                type="button"
                onClick={() => void handleSaveProgress()}
              >
                <Save className="h-4 w-4" aria-hidden />
                {isSavingProgress ? '保存中' : '保存进度'}
              </Button>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BrainCircuit className="text-muted-foreground h-4 w-4" aria-hidden />
                  录用建议
                </div>
                {hasInterviewEvidence ? (
                  <Button as={Link} className="gap-2" color="primary" href={decisionHref} size="sm">
                    {decisionButtonLabel}
                  </Button>
                ) : (
                  <Button className="gap-2" color="primary" isDisabled size="sm" type="button">
                    {decisionButtonLabel}
                  </Button>
                )}
              </div>

              <p className="text-muted-foreground text-sm leading-6">
                {hasInterviewEvidence
                  ? '将在独立执行页加载评价证据、展示计算日志并生成录用建议。'
                  : '至少完成电话沟通或一轮面试评价后，才能生成阶段性建议。'}
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function FeedbackEditor({
  stage,
  title,
  form,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: {
  stage: CandidateInterviewFeedbackStage;
  title: string;
  form: InterviewFeedbackForm;
  isSaving: boolean;
  onChange: (update: Partial<InterviewFeedbackForm>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const label = feedbackStageLabels[stage];
  return (
    <Card className="border-primary/30 rounded-lg border shadow-none">
      <CardBody className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-foreground text-sm font-semibold">{title}</h2>
          <Button size="sm" type="button" variant="light" onClick={onCancel}>
            收起
          </Button>
        </div>
        <div className="grid gap-3">
          <label className="block space-y-2">
            <span className="text-muted-foreground text-xs">{label}面试官</span>
            <input
              aria-label={`${label}面试官`}
              className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
              value={form.interviewer}
              onChange={(event) => onChange({ interviewer: event.target.value })}
            />
          </label>
          <div className="border-border bg-muted/15 rounded-lg border p-3 sm:p-4">
            <div className="mb-3">
              <div className="text-sm font-medium">统一岗位胜任力评价</div>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                只评价本轮实际覆盖的维度；每个分数必须附带候选人的具体回答或案例证据。
              </p>
            </div>
            <div className="space-y-3">
              {CANDIDATE_EVALUATION_DIMENSIONS.map((dimension) => {
                const value = form.dimensionRatings[dimension.key];
                return (
                  <div
                    key={dimension.key}
                    className="border-border bg-background rounded-md border p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{dimension.label}</span>
                          <Chip size="sm" variant="flat">
                            权重 {Math.round(dimension.weight * 100)}%
                          </Chip>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs leading-5">
                          {dimension.description}
                        </p>
                      </div>
                      <label className="block shrink-0 space-y-1.5">
                        <span className="text-muted-foreground text-xs">评分</span>
                        <select
                          aria-label={`${label}${dimension.label}评分`}
                          className="border-input bg-background text-foreground h-9 min-w-28 rounded-md border px-2 text-sm"
                          value={value.score}
                          onChange={(event) =>
                            onChange({
                              dimensionRatings: {
                                ...form.dimensionRatings,
                                [dimension.key]: { ...value, score: event.target.value },
                              },
                            })
                          }
                        >
                          <option value="">本轮未评价</option>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <option key={score} value={score}>
                              {score} / 5
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block space-y-1.5">
                      <span className="text-muted-foreground text-xs">评价证据</span>
                      <textarea
                        aria-label={`${label}${dimension.label}证据`}
                        className="border-input bg-background text-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                        disabled={!value.score}
                        placeholder={dimension.interviewPrompt}
                        value={value.evidence}
                        onChange={(event) =>
                          onChange({
                            dimensionRatings: {
                              ...form.dimensionRatings,
                              [dimension.key]: { ...value, evidence: event.target.value },
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-muted-foreground text-xs">{label}结论</span>
              <select
                aria-label={`${label}结论`}
                className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                value={form.decision}
                onChange={(event) =>
                  onChange({ decision: event.target.value as CandidateInterviewFeedbackDecision })
                }
              >
                {Object.entries(feedbackDecisionLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-muted-foreground text-xs">{label}优势</span>
              <textarea
                aria-label={`${label}优势`}
                className="border-input bg-background text-foreground min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                value={form.prosText}
                onChange={(event) => onChange({ prosText: event.target.value })}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-muted-foreground text-xs">{label}不足</span>
              <textarea
                aria-label={`${label}不足`}
                className="border-input bg-background text-foreground min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                value={form.consText}
                onChange={(event) => onChange({ consText: event.target.value })}
              />
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-muted-foreground text-xs">{label}备注</span>
            <textarea
              aria-label={`${label}备注`}
              className="border-input bg-background text-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm"
              value={form.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </label>
          <Button
            className="w-full gap-2"
            color="primary"
            isDisabled={isSaving}
            type="button"
            onClick={onSave}
          >
            <Save className="h-4 w-4" aria-hidden />
            {isSaving ? '保存中' : `保存${label}`}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
