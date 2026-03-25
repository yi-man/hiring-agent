import type {
  EvaluationResult,
  JDAgentRequest,
  JDAgentResponse,
  JDAgentStageTiming,
  JD,
} from '@/types';
import { needImprove, pickBetter } from './decision';
import { resolveInstruction } from './instruction-parser';
import { runLLM } from './llm';
import { parseJobInput } from './parser';
import { PROMPT_VERSION } from './prompts';
import { buildTimingSuggestions } from './timing-recommendations';

function ensureCurrentJd(currentJd?: JD): JD {
  if (!currentJd) {
    throw new Error('currentJd is required for continue_generate');
  }
  return currentJd;
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function buildMeta(
  model: string,
  action: JDAgentRequest['action'],
  stages: JDAgentStageTiming[],
  didImprovePath: boolean,
): JDAgentResponse['meta'] {
  const totalMs = stages.reduce((acc, s) => acc + s.ms, 0);
  return {
    model,
    promptVersion: PROMPT_VERSION,
    action,
    timing: {
      totalMs,
      stages,
      suggestions: buildTimingSuggestions(stages, totalMs, { didImprovePath, action }),
    },
  };
}

export async function runJDAgent(input: JDAgentRequest): Promise<JDAgentResponse> {
  if (input.action === 'initial_generate') {
    if (!input.jobInput?.trim()) {
      throw new Error('jobInput is required for initial_generate');
    }

    const stages: JDAgentStageTiming[] = [];

    let mark = performance.now();
    const schema = parseJobInput(input.jobInput, input.tone ?? 'tech');
    stages.push({ id: 'parse', label: '解析岗位输入', ms: elapsedMs(mark) });

    mark = performance.now();
    const generated = await runLLM({ stage: 'generate', schema });
    stages.push({ id: 'generate', label: '生成 JD', ms: elapsedMs(mark) });
    const jd = generated.output as JD;

    mark = performance.now();
    const evaluated = await runLLM({ stage: 'evaluate', jd });
    stages.push({ id: 'evaluate', label: '评估 JD', ms: elapsedMs(mark) });
    const evaluation = evaluated.output as EvaluationResult;

    let finalJd = jd;
    let picked: 'original' | 'improved' = 'original';
    let improved = false;
    let finalEvaluation = evaluation;

    if (needImprove(evaluation) || evaluation.rewrite_required) {
      improved = true;
      mark = performance.now();
      const improvedOut = await runLLM({
        stage: 'improve',
        jd,
        evaluation,
        extraInstruction: '',
      });
      stages.push({ id: 'improve', label: '改写 JD', ms: elapsedMs(mark) });
      const improvedJd = improvedOut.output as JD;
      mark = performance.now();
      const reEval = await runLLM({ stage: 'evaluate', jd: improvedJd });
      stages.push({ id: 'reevaluate', label: '改写后再评估', ms: elapsedMs(mark) });
      const improvedEval = reEval.output as EvaluationResult;
      finalEvaluation = improvedEval;
      const pickedResult = pickBetter(jd, improvedJd, evaluation, improvedEval);
      finalJd = pickedResult.jd;
      picked = pickedResult.picked;
    }

    return {
      jd: finalJd,
      evaluation: finalEvaluation,
      decision: { improved, picked },
      meta: buildMeta(generated.model, input.action, stages, improved),
    };
  }

  const stages: JDAgentStageTiming[] = [];
  const currentJd = ensureCurrentJd(input.currentJd);

  let mark = performance.now();
  const { instruction } = resolveInstruction(input.extraInstruction, JSON.stringify(currentJd));
  stages.push({ id: 'instruction', label: '解析追加要求', ms: elapsedMs(mark) });

  mark = performance.now();
  const evaluated = await runLLM({ stage: 'evaluate', jd: currentJd });
  stages.push({ id: 'evaluate', label: '评估当前 JD', ms: elapsedMs(mark) });
  const evaluation = evaluated.output as EvaluationResult;

  let finalJd = currentJd;
  let finalEvaluation = evaluation;
  let picked: 'original' | 'improved' = 'original';
  let improved = false;

  if (needImprove(evaluation) || evaluation.rewrite_required || instruction) {
    improved = true;
    mark = performance.now();
    const improvedOut = await runLLM({
      stage: 'improve',
      jd: currentJd,
      evaluation,
      extraInstruction: instruction,
    });
    stages.push({ id: 'improve', label: '改写 JD', ms: elapsedMs(mark) });
    const improvedJd = improvedOut.output as JD;
    mark = performance.now();
    const reEval = await runLLM({ stage: 'evaluate', jd: improvedJd });
    stages.push({ id: 'reevaluate', label: '改写后再评估', ms: elapsedMs(mark) });
    const improvedEval = reEval.output as EvaluationResult;
    finalEvaluation = improvedEval;
    const pickedResult = pickBetter(currentJd, improvedJd, evaluation, improvedEval);
    finalJd = pickedResult.jd;
    picked = pickedResult.picked;
  }

  return {
    jd: finalJd,
    evaluation: finalEvaluation,
    decision: { improved, picked },
    meta: buildMeta(evaluated.model, input.action, stages, improved),
  };
}
