import type { EvaluationResult, JDAgentRequest, JDAgentResponse, JD } from '@/types';
import { needImprove, pickBetter } from './decision';
import { resolveInstruction } from './instruction-parser';
import { runLLM } from './llm';
import { parseJobInput } from './parser';
import { PROMPT_VERSION } from './prompts';

function ensureCurrentJd(currentJd?: JD): JD {
  if (!currentJd) {
    throw new Error('currentJd is required for continue_generate');
  }
  return currentJd;
}

export async function runJDAgent(input: JDAgentRequest): Promise<JDAgentResponse> {
  if (input.action === 'initial_generate') {
    if (!input.jobInput?.trim()) {
      throw new Error('jobInput is required for initial_generate');
    }

    const schema = parseJobInput(input.jobInput, input.tone ?? 'tech');
    const generated = await runLLM({ stage: 'generate', schema });
    const jd = generated.output as JD;

    const evaluated = await runLLM({ stage: 'evaluate', jd });
    const evaluation = evaluated.output as EvaluationResult;

    let finalJd = jd;
    let picked: 'original' | 'improved' = 'original';
    let improved = false;
    let finalEvaluation = evaluation;

    if (needImprove(evaluation) || evaluation.rewrite_required) {
      improved = true;
      const improvedOut = await runLLM({
        stage: 'improve',
        jd,
        evaluation,
        extraInstruction: '',
      });
      const improvedJd = improvedOut.output as JD;
      const reEval = await runLLM({ stage: 'evaluate', jd: improvedJd });
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
      meta: {
        model: generated.model,
        promptVersion: PROMPT_VERSION,
        action: input.action,
      },
    };
  }

  const currentJd = ensureCurrentJd(input.currentJd);
  const { instruction } = resolveInstruction(input.extraInstruction, JSON.stringify(currentJd));
  const evaluated = await runLLM({ stage: 'evaluate', jd: currentJd });
  const evaluation = evaluated.output as EvaluationResult;

  let finalJd = currentJd;
  let finalEvaluation = evaluation;
  let picked: 'original' | 'improved' = 'original';
  let improved = false;

  if (needImprove(evaluation) || evaluation.rewrite_required || instruction) {
    improved = true;
    const improvedOut = await runLLM({
      stage: 'improve',
      jd: currentJd,
      evaluation,
      extraInstruction: instruction,
    });
    const improvedJd = improvedOut.output as JD;
    const reEval = await runLLM({ stage: 'evaluate', jd: improvedJd });
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
    meta: {
      model: evaluated.model,
      promptVersion: PROMPT_VERSION,
      action: input.action,
    },
  };
}
