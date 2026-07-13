import { JDAgentContextRetrievalError, runJDAgent } from '@/lib/jd-agent/service';
import {
  createJobDescriptionRegenerateRunEvent,
  getJobDescriptionRegenerateRun,
  updateJobDescriptionRegenerateRun,
  type JobDescriptionRegenerateRunDto,
  type JobDescriptionRegenerateRunStage,
} from './regenerate-run-repo';
import { getJobDescriptionById, updateMutableJobDescription } from './job-description-repo';

type RunJobDescriptionRegenerateRunParams = {
  userId: string;
  runId: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'JD 重新生成失败';
}

function isContextRetrievalError(error: unknown): boolean {
  return (
    error instanceof JDAgentContextRetrievalError ||
    (error instanceof Error && error.name === 'JDAgentContextRetrievalError')
  );
}

async function recordEvent(params: {
  run: JobDescriptionRegenerateRunDto;
  stage: JobDescriptionRegenerateRunStage;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  detail?: Record<string, unknown> | null;
}) {
  await createJobDescriptionRegenerateRunEvent({
    userId: params.run.userId,
    runId: params.run.id,
    jobDescriptionId: params.run.jobDescriptionId,
    stage: params.stage,
    level: params.level,
    message: params.message,
    detail: params.detail,
  });
}

export async function runJobDescriptionRegenerateRun({
  userId,
  runId,
}: RunJobDescriptionRegenerateRunParams): Promise<void> {
  const run = await getJobDescriptionRegenerateRun({ userId, runId });
  if (!run) {
    return;
  }
  if (run.status === 'success' || run.status === 'failed') {
    return;
  }

  let activeStage: JobDescriptionRegenerateRunStage = 'input_preparation';

  try {
    await updateJobDescriptionRegenerateRun({
      userId,
      runId,
      status: 'running',
      currentStage: 'input_preparation',
      errorMessage: null,
      startedAt: new Date(),
    });
    await recordEvent({
      run,
      stage: 'input_preparation',
      message: '正在校验 JD 状态',
      detail: {
        jobDescriptionId: run.jobDescriptionId,
        tone: run.tone,
        extraInstruction: run.extraInstruction,
      },
    });

    const current = await getJobDescriptionById(userId, run.jobDescriptionId);
    if (!current) {
      throw new Error('job description not found');
    }
    if (current.status === 'published') {
      throw new Error('published job descriptions cannot be modified');
    }

    await recordEvent({
      run,
      stage: 'input_preparation',
      level: 'success',
      message: 'JD 状态校验通过',
      detail: {
        status: current.status,
        tone: run.tone,
      },
    });

    activeStage = 'llm_generation';
    await updateJobDescriptionRegenerateRun({
      userId,
      runId,
      status: 'running',
      currentStage: activeStage,
    });
    await recordEvent({
      run,
      stage: activeStage,
      message: '正在按追加要求改写 JD',
      detail: {
        extraInstruction: run.extraInstruction,
        tone: run.tone,
      },
    });

    const agentResponse = await runJDAgent(
      {
        action: 'continue_generate',
        currentJd: run.currentJd,
        extraInstruction: run.extraInstruction,
        tone: run.tone,
      },
      { userId },
    );
    await recordEvent({
      run,
      stage: activeStage,
      level: 'success',
      message: 'JD 改写完成',
      detail: {
        title: agentResponse.jd.title,
        model: agentResponse.meta.model,
        promptVersion: agentResponse.meta.promptVersion,
        totalMs: agentResponse.meta.timing?.totalMs ?? null,
        tokenTotal: agentResponse.meta.tokens?.total.totalTokens ?? null,
        contextUsed: agentResponse.meta.context?.used ?? false,
        contextSources: agentResponse.meta.context?.matches.length ?? 0,
        timingStages: agentResponse.meta.timing?.stages ?? [],
        warnings: agentResponse.warnings ?? agentResponse.meta.context?.warnings ?? [],
      },
    });

    activeStage = 'saving';
    await updateJobDescriptionRegenerateRun({
      userId,
      runId,
      status: 'running',
      currentStage: activeStage,
    });
    await recordEvent({
      run,
      stage: activeStage,
      message: '正在写回工作台',
    });

    const jobDescription = await updateMutableJobDescription({
      userId,
      id: run.jobDescriptionId,
      tone: run.tone,
      status: 'created',
      content: agentResponse.jd,
      evaluation: agentResponse.evaluation,
      generationMeta: agentResponse.meta,
    });
    if (!jobDescription) {
      throw new Error('failed to update job description (may have been published)');
    }

    await recordEvent({
      run,
      stage: activeStage,
      level: 'success',
      message: 'JD 已写回工作台',
      detail: {
        jobDescriptionId: jobDescription.id,
        status: jobDescription.status,
      },
    });

    activeStage = 'completed';
    await updateJobDescriptionRegenerateRun({
      userId,
      runId,
      status: 'success',
      currentStage: activeStage,
      errorMessage: null,
      finishedAt: new Date(),
    });
    await recordEvent({
      run,
      stage: activeStage,
      level: 'success',
      message: 'JD 重新生成完成',
      detail: { jobDescriptionId: run.jobDescriptionId },
    });
  } catch (error) {
    const message = errorMessage(error);
    await updateJobDescriptionRegenerateRun({
      userId,
      runId,
      status: 'failed',
      currentStage: activeStage,
      errorMessage: message,
      finishedAt: new Date(),
    });
    await recordEvent({
      run,
      stage: activeStage,
      level: 'error',
      message,
      detail: isContextRetrievalError(error) ? { code: 'JD_CONTEXT_RETRIEVAL_FAILED' } : undefined,
    });
  }
}
