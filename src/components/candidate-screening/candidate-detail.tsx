'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  ClipboardCheck,
  ExternalLink,
  FileText,
  MessageCircle,
  Save,
} from 'lucide-react';
import { Button, Card, CardBody, Chip } from '@/components/ui';
import { startCandidateCommunicationRun } from '@/lib/candidate-communication/client';
import {
  evaluateJdCandidateDecision,
  fetchCandidateInterviewFeedbacks,
  fetchJdCandidateDetail,
  saveCandidateInterviewFeedback,
  updateJdCandidateProgress,
} from '@/lib/candidate-screening/client';
import {
  CANDIDATE_INTERVIEW_FEEDBACK_STAGES,
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
} from '@/lib/candidate-screening/constants';
import type {
  CandidateDecisionResultDto,
  CandidateInterviewFeedbackDto,
  CandidateScreeningDetailDto,
} from '@/lib/candidate-screening/repo';
import type {
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateInterviewStage,
} from '@/lib/candidate-screening/types';

type InterviewFeedbackForm = {
  stage: CandidateInterviewFeedbackStage;
  interviewer: string;
  rating: string;
  prosText: string;
  consText: string;
  decision: CandidateInterviewFeedbackDecision;
  notes: string;
};

const feedbackStageLabels: Record<CandidateInterviewFeedbackStage, string> = {
  first_interview: '一面',
  second_interview: '二面',
  final_interview: '终面',
};

const decisionLabels: Record<CandidateInterviewFeedbackDecision, string> = {
  pass: '通过',
  hold: '待定',
  reject: '淘汰',
};

const hireDecisionLabels: Record<CandidateDecisionResultDto['hireDecision'], string> = {
  strong_yes: '强烈建议录用',
  yes: '建议录用',
  no: '暂不录用',
};

function emptyFeedbackForm(stage: CandidateInterviewFeedbackStage): InterviewFeedbackForm {
  return {
    stage,
    interviewer: '',
    rating: '3',
    prosText: '',
    consText: '',
    decision: 'hold',
    notes: '',
  };
}

function feedbackToForm(feedback: CandidateInterviewFeedbackDto): InterviewFeedbackForm {
  return {
    stage: feedback.stage,
    interviewer: feedback.interviewer,
    rating: String(feedback.rating),
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
    CANDIDATE_INTERVIEW_FEEDBACK_STAGES.map((stage) => [stage, emptyFeedbackForm(stage)]),
  ) as Record<CandidateInterviewFeedbackStage, InterviewFeedbackForm>;

  for (const feedback of feedbacks) {
    forms[feedback.stage] = feedbackToForm(feedback);
  }
  return forms;
}

function splitFeedbackText(value: string): string[] {
  return value
    .split(/\n|；|;|、/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CandidateDetail({
  jobDescriptionId,
  candidateId,
}: {
  jobDescriptionId: string;
  candidateId: string;
}) {
  const router = useRouter();
  const [candidate, setCandidate] = useState<CandidateScreeningDetailDto | null>(null);
  const [feedbacks, setFeedbacks] = useState<CandidateInterviewFeedbackDto[]>([]);
  const [feedbackForms, setFeedbackForms] = useState<
    Record<CandidateInterviewFeedbackStage, InterviewFeedbackForm>
  >(() => createFeedbackForms([]));
  const [decisionResult, setDecisionResult] = useState<CandidateDecisionResultDto | null>(null);
  const [interviewStage, setInterviewStage] = useState<CandidateInterviewStage>('sourced');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingFeedbackStage, setSavingFeedbackStage] =
    useState<CandidateInterviewFeedbackStage | null>(null);
  const [isEvaluatingDecision, setIsEvaluatingDecision] = useState(false);
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
        const [next, nextFeedbacks] = await Promise.all([
          fetchJdCandidateDetail(jobDescriptionId, candidateId),
          fetchCandidateInterviewFeedbacks(jobDescriptionId, candidateId),
        ]);
        if (cancelled) return;
        setCandidate(next);
        setFeedbacks(nextFeedbacks);
        setFeedbackForms(createFeedbackForms(nextFeedbacks));
        setDecisionResult(null);
        setInterviewStage(next.interviewStage);
        setNotes(next.notes ?? '');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '加载候选人详情失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [candidateId, jobDescriptionId]);

  async function handleSaveProgress() {
    if (!candidate) return;
    setIsSaving(true);
    setError('');
    try {
      const updated = await updateJdCandidateProgress(jobDescriptionId, candidateId, {
        interviewStage,
        notes,
      });
      setCandidate({ ...candidate, ...updated });
      setInterviewStage(updated.interviewStage);
      setNotes(updated.notes ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存候选人进度失败');
    } finally {
      setIsSaving(false);
    }
  }

  function updateFeedbackForm(
    stage: CandidateInterviewFeedbackStage,
    update: Partial<InterviewFeedbackForm>,
  ) {
    setFeedbackForms((current) => ({
      ...current,
      [stage]: {
        ...current[stage],
        ...update,
      },
    }));
  }

  async function handleSaveFeedback(stage: CandidateInterviewFeedbackStage) {
    const form = feedbackForms[stage];
    setSavingFeedbackStage(stage);
    setError('');
    try {
      const feedback = await saveCandidateInterviewFeedback(jobDescriptionId, candidateId, {
        stage,
        interviewer: form.interviewer,
        rating: Number(form.rating),
        pros: splitFeedbackText(form.prosText),
        cons: splitFeedbackText(form.consText),
        decision: form.decision,
        notes: form.notes,
      });
      setFeedbacks((current) => [
        ...current.filter((item) => item.stage !== feedback.stage),
        feedback,
      ]);
      setFeedbackForms((current) => ({ ...current, [stage]: feedbackToForm(feedback) }));
      setDecisionResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存面试反馈失败');
    } finally {
      setSavingFeedbackStage(null);
    }
  }

  async function handleEvaluateDecision() {
    setIsEvaluatingDecision(true);
    setError('');
    try {
      setDecisionResult(await evaluateJdCandidateDecision(jobDescriptionId, candidateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成录用建议失败');
    } finally {
      setIsEvaluatingDecision(false);
    }
  }

  async function handleStartSingleCommunication() {
    setIsStartingCommunication(true);
    setError('');
    try {
      const run = await startCandidateCommunicationRun({
        mode: 'single',
        jobDescriptionId,
        candidateId,
        sourceScreeningRunId: candidate?.runId,
        platform: 'boss-like',
      });
      router.push(`/jd-generator/communication-runs/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动单点沟通失败');
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
        <Button
          as={Link}
          className="gap-2 px-0"
          href={`/jd-generator/${jobDescriptionId}/candidates`}
          variant="light"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回候选人
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '候选人不存在'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button
            as={Link}
            className="mb-3 gap-2 px-0"
            href={`/jd-generator/${jobDescriptionId}/candidates`}
            variant="light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回候选人
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
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Button
            className="gap-2"
            isDisabled={isStartingCommunication}
            type="button"
            variant="bordered"
            onClick={() => void handleStartSingleCommunication()}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {isStartingCommunication ? '启动中' : '单点沟通'}
          </Button>
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
          <div className="text-left lg:text-right">
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
                  ['bonus', candidate.scoreDetail.llmBonus],
                ].map(([label, value]) => (
                  <div key={label} className="border-border rounded-md border px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-foreground mt-1 font-mono text-base">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BrainCircuit className="text-muted-foreground h-4 w-4" aria-hidden />
                  录用建议
                </div>
                <Button
                  className="gap-2 self-start sm:self-auto"
                  color="primary"
                  isDisabled={isEvaluatingDecision}
                  type="button"
                  onClick={() => void handleEvaluateDecision()}
                >
                  <BrainCircuit className="h-4 w-4" aria-hidden />
                  {isEvaluatingDecision ? '生成中' : '生成录用建议'}
                </Button>
              </div>

              {decisionResult ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="border-border rounded-md border px-3 py-2">
                      <div className="text-muted-foreground text-xs">建议</div>
                      <div className="text-foreground mt-1 text-base font-semibold">
                        {hireDecisionLabels[decisionResult.hireDecision]}
                      </div>
                    </div>
                    <div className="border-border rounded-md border px-3 py-2">
                      <div className="text-muted-foreground text-xs">置信度</div>
                      <div className="text-foreground mt-1 font-mono text-base">
                        {Math.round(decisionResult.confidence * 100)}%
                      </div>
                    </div>
                    <div className="border-border rounded-md border px-3 py-2">
                      <div className="text-muted-foreground text-xs">接受概率</div>
                      <div className="text-foreground mt-1 font-mono text-base">
                        接受 offer 概率 {Math.round(decisionResult.offerAcceptProbability * 100)}%
                      </div>
                    </div>
                  </div>

                  {decisionResult.riskAnalysis.reasons.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-muted-foreground text-xs">风险点</div>
                      <div className="flex flex-wrap gap-2">
                        {decisionResult.riskAnalysis.reasons.map((reason) => (
                          <Chip key={reason} size="sm" variant="flat">
                            {reason}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-muted-foreground text-xs">优势</div>
                      <ul className="text-foreground list-inside list-disc space-y-1 text-sm">
                        {decisionResult.strengths.map((strength) => (
                          <li key={strength}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <div className="text-muted-foreground text-xs">不足</div>
                      <ul className="text-foreground list-inside list-disc space-y-1 text-sm">
                        {decisionResult.weaknesses.map((weakness) => (
                          <li key={weakness}>{weakness}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-muted-foreground text-xs">下一步</div>
                    <ul className="text-foreground list-inside list-disc space-y-1 text-sm">
                      {decisionResult.suggestions.map((suggestion) => (
                        <li key={suggestion.content}>{suggestion.content}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  录入一面、二面、终面的反馈后，可结合 JD 匹配、沟通响应和风险信号生成建议。
                </p>
              )}
            </CardBody>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">面试进度</div>
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
                  {CANDIDATE_SCREENING_INTERVIEW_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
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
                isDisabled={isSaving}
                type="button"
                onClick={() => void handleSaveProgress()}
              >
                <Save className="h-4 w-4" aria-hidden />
                {isSaving ? '保存中' : '保存进度'}
              </Button>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardCheck className="text-muted-foreground h-4 w-4" aria-hidden />
                  面试反馈
                </div>
                <Chip size="sm" variant="flat">
                  {feedbacks.length}/3
                </Chip>
              </div>

              <div className="space-y-4">
                {CANDIDATE_INTERVIEW_FEEDBACK_STAGES.map((stage) => {
                  const label = feedbackStageLabels[stage];
                  const form = feedbackForms[stage];
                  return (
                    <section key={stage} className="border-border rounded-md border p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-foreground text-sm font-medium">{label}</div>
                        <Chip size="sm" variant="flat">
                          {decisionLabels[form.decision]}
                        </Chip>
                      </div>

                      <div className="grid gap-3">
                        <label className="block space-y-2">
                          <span className="text-muted-foreground text-xs">{label}面试官</span>
                          <input
                            aria-label={`${label}面试官`}
                            className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm"
                            value={form.interviewer}
                            onChange={(event) =>
                              updateFeedbackForm(stage, { interviewer: event.target.value })
                            }
                          />
                        </label>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-2">
                            <span className="text-muted-foreground text-xs">{label}评分</span>
                            <input
                              aria-label={`${label}评分`}
                              className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm"
                              max={5}
                              min={1}
                              type="number"
                              value={form.rating}
                              onChange={(event) =>
                                updateFeedbackForm(stage, { rating: event.target.value })
                              }
                            />
                          </label>
                          <label className="block space-y-2">
                            <span className="text-muted-foreground text-xs">{label}结论</span>
                            <select
                              aria-label={`${label}结论`}
                              className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm"
                              value={form.decision}
                              onChange={(event) =>
                                updateFeedbackForm(stage, {
                                  decision: event.target
                                    .value as CandidateInterviewFeedbackDecision,
                                })
                              }
                            >
                              {Object.entries(decisionLabels).map(([value, text]) => (
                                <option key={value} value={value}>
                                  {text}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <label className="block space-y-2">
                          <span className="text-muted-foreground text-xs">{label}优势</span>
                          <textarea
                            aria-label={`${label}优势`}
                            className="border-input bg-background text-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                            value={form.prosText}
                            onChange={(event) =>
                              updateFeedbackForm(stage, { prosText: event.target.value })
                            }
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="text-muted-foreground text-xs">{label}不足</span>
                          <textarea
                            aria-label={`${label}不足`}
                            className="border-input bg-background text-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                            value={form.consText}
                            onChange={(event) =>
                              updateFeedbackForm(stage, { consText: event.target.value })
                            }
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="text-muted-foreground text-xs">{label}备注</span>
                          <textarea
                            aria-label={`${label}备注`}
                            className="border-input bg-background text-foreground min-h-16 w-full rounded-md border px-3 py-2 text-sm"
                            value={form.notes}
                            onChange={(event) =>
                              updateFeedbackForm(stage, { notes: event.target.value })
                            }
                          />
                        </label>

                        <Button
                          className="w-full gap-2"
                          isDisabled={savingFeedbackStage === stage}
                          type="button"
                          variant="bordered"
                          onClick={() => void handleSaveFeedback(stage)}
                        >
                          <Save className="h-4 w-4" aria-hidden />
                          {savingFeedbackStage === stage ? '保存中' : `保存${label}`}
                        </Button>
                      </div>
                    </section>
                  );
                })}
              </div>
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
