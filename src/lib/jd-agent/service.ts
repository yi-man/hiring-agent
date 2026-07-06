import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { env } from '@/lib/env';
import { retrieveUserKnowledgeContext } from '@/lib/rag/knowledge-retrieval';
import { buildJDSearchProfile } from '@/lib/jd/search-profile';
import type {
  EvaluationResult,
  JDAgentContextMatch,
  JDAgentRequest,
  JDAgentResponse,
  JDSearchProfile,
  JDAgentStageTiming,
  JDAgentStageTokenUsage,
  JDAgentTokenUsage,
  JD,
  JobSchema,
} from '@/types';
import { needImprove, pickBetter } from './decision';
import { resolveInstruction } from './instruction-parser';
import { runLLM } from './llm';
import { parseJobInput } from './parser';
import { PROMPT_VERSION } from './prompts';
import { buildTimingSuggestions } from './timing-recommendations';

export class JDAgentContextRetrievalError extends Error {
  readonly code = 'JD_CONTEXT_RETRIEVAL_FAILED';
  readonly status = 502;

  constructor(message: string) {
    super(message);
    this.name = 'JDAgentContextRetrievalError';
  }
}

const NO_COMPANY_CONTEXT_WARNING =
  '未检索到可用公司上下文，已按岗位信息生成。请在知识库上传公司介绍、团队信息或招聘口径以提升效果。';

const JDAgentState = Annotation.Root({
  request: Annotation<JDAgentRequest>(),
  userId: Annotation<string>(),
  schema: Annotation<JobSchema | undefined>(),
  currentJd: Annotation<JD | undefined>(),
  instruction: Annotation<string>(),
  retrievalQuery: Annotation<string>(),
  companyContext: Annotation<string>(),
  contextMatches: Annotation<JDAgentContextMatch[]>(),
  warnings: Annotation<string[]>(),
  stages: Annotation<JDAgentStageTiming[]>(),
  tokenStages: Annotation<JDAgentStageTokenUsage[]>(),
  model: Annotation<string>(),
  originalJd: Annotation<JD | undefined>(),
  originalEvaluation: Annotation<EvaluationResult | undefined>(),
  improvedJd: Annotation<JD | undefined>(),
  improvedEvaluation: Annotation<EvaluationResult | undefined>(),
  finalJd: Annotation<JD | undefined>(),
  finalEvaluation: Annotation<EvaluationResult | undefined>(),
  improved: Annotation<boolean>(),
  picked: Annotation<'original' | 'improved'>(),
});

type JDAgentGraphState = typeof JDAgentState.State;
type JDAgentGraphUpdate = typeof JDAgentState.Update;

function ensureCurrentJd(currentJd?: JD): JD {
  if (!currentJd) {
    throw new Error('currentJd is required for continue_generate');
  }
  return currentJd;
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function addStage(
  state: JDAgentGraphState,
  id: string,
  label: string,
  start: number,
): JDAgentStageTiming[] {
  return [...state.stages, { id, label, ms: elapsedMs(start) }];
}

function addTokenStage(
  state: JDAgentGraphState,
  id: string,
  label: string,
  usage: JDAgentTokenUsage,
): JDAgentStageTokenUsage[] {
  return [...state.tokenStages, { id, label, usage }];
}

function buildContextWarnings(companyContext: string): string[] {
  return companyContext.trim() ? [] : [NO_COMPANY_CONTEXT_WARNING];
}

function buildInitialRetrievalQuery(request: JDAgentRequest, schema: JobSchema): string {
  return [
    request.jobInput,
    schema.title,
    schema.seniority,
    schema.skills.join(' '),
    schema.responsibilities.join(' '),
    (schema.companyHighlights ?? []).join(' '),
    schema.tone,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n');
}

function buildContinueRetrievalQuery(request: JDAgentRequest, jd: JD, instruction: string): string {
  return [
    jd.title,
    jd.summary,
    jd.responsibilities.join(' '),
    jd.requirements.join(' '),
    jd.highlights.join(' '),
    request.tone,
    instruction,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n');
}

function buildMeta(
  model: string,
  action: JDAgentRequest['action'],
  stages: JDAgentStageTiming[],
  tokenStages: JDAgentStageTokenUsage[],
  didImprovePath: boolean,
  context: {
    query: string;
    companyContext: string;
    matches: JDAgentContextMatch[];
    warnings: string[];
  },
  searchProfile: JDSearchProfile,
): JDAgentResponse['meta'] {
  const totalMs = stages.reduce((acc, s) => acc + s.ms, 0);
  const totalTokens = tokenStages.reduce(
    (acc, s) => ({
      promptTokens: acc.promptTokens + s.usage.promptTokens,
      completionTokens: acc.completionTokens + s.usage.completionTokens,
      totalTokens: acc.totalTokens + s.usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 } satisfies JDAgentTokenUsage,
  );
  return {
    model,
    promptVersion: PROMPT_VERSION,
    action,
    timing: {
      totalMs,
      stages,
      suggestions: buildTimingSuggestions(stages, totalMs, { didImprovePath, action }),
    },
    tokens: {
      total: totalTokens,
      stages: tokenStages,
    },
    context: {
      used: Boolean(context.companyContext.trim()),
      query: context.query,
      textLength: context.companyContext.length,
      matches: context.matches,
      warnings: context.warnings,
    },
    searchProfile,
  };
}

function requireOriginalJd(state: JDAgentGraphState): JD {
  const jd = state.originalJd ?? state.currentJd;
  if (!jd) {
    throw new Error('JD is missing before evaluation');
  }
  return jd;
}

function requireOriginalEvaluation(state: JDAgentGraphState): EvaluationResult {
  if (!state.originalEvaluation) {
    throw new Error('Evaluation is missing before decision');
  }
  return state.originalEvaluation;
}

async function prepareInputNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  const mark = performance.now();
  if (state.request.action === 'initial_generate') {
    if (!state.request.jobInput?.trim()) {
      throw new Error('jobInput is required for initial_generate');
    }
    const schema = parseJobInput(state.request.jobInput, state.request.tone ?? 'tech');
    return {
      schema,
      retrievalQuery: buildInitialRetrievalQuery(state.request, schema),
      stages: addStage(state, 'parse', '解析岗位输入', mark),
    };
  }

  const currentJd = ensureCurrentJd(state.request.currentJd);
  const { instruction } = resolveInstruction(
    state.request.extraInstruction,
    JSON.stringify(currentJd),
  );
  return {
    currentJd,
    instruction,
    retrievalQuery: buildContinueRetrievalQuery(state.request, currentJd, instruction),
    stages: addStage(state, 'instruction', '解析追加要求', mark),
  };
}

async function retrieveContextNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  const mark = performance.now();
  try {
    const result = await retrieveUserKnowledgeContext({
      userId: state.userId,
      query: state.retrievalQuery,
      topK: env.RAG_TOP_K,
    });
    const companyContext = result.contextText.trim();
    const warnings = buildContextWarnings(companyContext);
    return {
      companyContext,
      contextMatches: result.matches,
      warnings: [...state.warnings, ...warnings],
      stages: addStage(state, 'retrieve_context', '检索公司上下文', mark),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '公司上下文检索失败';
    throw new JDAgentContextRetrievalError(message);
  }
}

async function generateNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  if (!state.schema) {
    throw new Error('Job schema is missing before JD generation');
  }

  const mark = performance.now();
  const generated = await runLLM({
    stage: 'generate',
    schema: state.schema,
    companyContext: state.companyContext,
  });

  return {
    originalJd: generated.output as JD,
    model: generated.model,
    stages: addStage(state, 'generate', '生成 JD', mark),
    tokenStages: addTokenStage(state, 'generate', '生成 JD', generated.usage),
  };
}

async function evaluateOriginalNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  const jd = requireOriginalJd(state);
  const mark = performance.now();
  const evaluated = await runLLM({
    stage: 'evaluate',
    jd,
    companyContext: state.companyContext,
  });
  const label = state.request.action === 'initial_generate' ? '评估 JD' : '评估当前 JD';

  return {
    originalEvaluation: evaluated.output as EvaluationResult,
    model: state.model || evaluated.model,
    stages: addStage(state, 'evaluate', label, mark),
    tokenStages: addTokenStage(state, 'evaluate', label, evaluated.usage),
  };
}

function routeAfterContext(state: JDAgentGraphState): 'generate' | 'evaluate_original' {
  return state.request.action === 'initial_generate' ? 'generate' : 'evaluate_original';
}

function routeAfterEvaluation(state: JDAgentGraphState): 'improve' | 'finalize' {
  const evaluation = requireOriginalEvaluation(state);
  if (state.request.action === 'continue_generate') {
    return 'improve';
  }
  return needImprove(evaluation) || evaluation.rewrite_required ? 'improve' : 'finalize';
}

async function improveNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  const jd = requireOriginalJd(state);
  const evaluation = requireOriginalEvaluation(state);
  const mark = performance.now();
  const improvedOut = await runLLM({
    stage: 'improve',
    jd,
    evaluation,
    extraInstruction: state.instruction,
    companyContext: state.companyContext,
  });

  return {
    improvedJd: improvedOut.output as JD,
    model: state.model || improvedOut.model,
    improved: true,
    stages: addStage(state, 'improve', '改写 JD', mark),
    tokenStages: addTokenStage(state, 'improve', '改写 JD', improvedOut.usage),
  };
}

async function reevaluateImprovedNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  if (!state.improvedJd) {
    throw new Error('Improved JD is missing before re-evaluation');
  }

  const mark = performance.now();
  const reEval = await runLLM({
    stage: 'evaluate',
    jd: state.improvedJd,
    companyContext: state.companyContext,
  });

  return {
    improvedEvaluation: reEval.output as EvaluationResult,
    model: state.model || reEval.model,
    stages: addStage(state, 'reevaluate', '改写后再评估', mark),
    tokenStages: addTokenStage(state, 'reevaluate', '改写后再评估', reEval.usage),
  };
}

async function finalizeNode(state: JDAgentGraphState): Promise<JDAgentGraphUpdate> {
  const originalJd = requireOriginalJd(state);
  const originalEvaluation = requireOriginalEvaluation(state);

  if (state.improvedJd && state.improvedEvaluation) {
    if (state.request.action === 'continue_generate') {
      return {
        finalJd: state.improvedJd,
        finalEvaluation: state.improvedEvaluation,
        picked: 'improved',
        improved: true,
      };
    }

    const pickedResult = pickBetter(
      originalJd,
      state.improvedJd,
      originalEvaluation,
      state.improvedEvaluation,
    );
    const pickedEvaluation =
      pickedResult.picked === 'improved' ? state.improvedEvaluation : originalEvaluation;
    return {
      finalJd: pickedResult.jd,
      finalEvaluation: pickedEvaluation,
      picked: pickedResult.picked,
      improved: true,
    };
  }

  return {
    finalJd: originalJd,
    finalEvaluation: originalEvaluation,
    picked: 'original',
    improved: false,
  };
}

const jdAgentGraph = new StateGraph(JDAgentState)
  .addNode('prepare_input', prepareInputNode)
  .addNode('retrieve_context', retrieveContextNode)
  .addNode('generate', generateNode)
  .addNode('evaluate_original', evaluateOriginalNode)
  .addNode('improve', improveNode)
  .addNode('reevaluate_improved', reevaluateImprovedNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'prepare_input')
  .addEdge('prepare_input', 'retrieve_context')
  .addConditionalEdges('retrieve_context', routeAfterContext, {
    generate: 'generate',
    evaluate_original: 'evaluate_original',
  })
  .addEdge('generate', 'evaluate_original')
  .addConditionalEdges('evaluate_original', routeAfterEvaluation, {
    improve: 'improve',
    finalize: 'finalize',
  })
  .addEdge('improve', 'reevaluate_improved')
  .addEdge('reevaluate_improved', 'finalize')
  .addEdge('finalize', END)
  .compile();

export async function runJDAgent(
  input: JDAgentRequest,
  options: { userId: string },
): Promise<JDAgentResponse> {
  const result = await jdAgentGraph.invoke({
    request: input,
    userId: options.userId,
    schema: undefined,
    currentJd: undefined,
    instruction: '',
    retrievalQuery: '',
    companyContext: '',
    contextMatches: [],
    warnings: [],
    stages: [],
    tokenStages: [],
    model: '',
    originalJd: undefined,
    originalEvaluation: undefined,
    improvedJd: undefined,
    improvedEvaluation: undefined,
    finalJd: undefined,
    finalEvaluation: undefined,
    improved: false,
    picked: 'original',
  });

  if (!result.finalJd || !result.finalEvaluation) {
    throw new Error('JD graph finished without a final result');
  }

  return {
    jd: result.finalJd,
    evaluation: result.finalEvaluation,
    decision: { improved: result.improved, picked: result.picked },
    meta: buildMeta(
      result.model || 'unknown',
      input.action,
      result.stages,
      result.tokenStages,
      result.improved,
      {
        query: result.retrievalQuery,
        companyContext: result.companyContext,
        matches: result.contextMatches,
        warnings: result.warnings,
      },
      buildJDSearchProfile({ jd: result.finalJd, schema: result.schema }),
    ),
    warnings: result.warnings,
  };
}
