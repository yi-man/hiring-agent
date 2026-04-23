import { randomUUID } from 'node:crypto';

import type { ChatPatternId, ChatRunEventPayload } from './types';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function words(input: string): string[] {
  return input.split(/\s+/).filter(Boolean);
}

export async function* runPattern(params: {
  runId: string;
  patternId: ChatPatternId;
  userInput: string;
  approvalToken?: string;
}): AsyncGenerator<ChatRunEventPayload> {
  const { runId, patternId, userInput, approvalToken } = params;
  yield { type: 'run_start', runId, patternId, startedAt: new Date().toISOString() };

  if (patternId === 'human_approval_gate' && !approvalToken) {
    const token = randomUUID();
    yield {
      type: 'approval_required',
      runId,
      approvalToken: token,
      message: '候选人拒绝率高于阈值，是否继续发送邀约？',
    };
    return;
  }

  if (patternId === 'human_approval_gate' && approvalToken) {
    yield { type: 'approval_resolved', runId, approvalToken, approved: true };
    await sleep(150);
  }

  if (patternId === 'agent_trace_stream') {
    yield { type: 'reasoning_delta', runId, text: '先识别岗位、行业和 seniority。' };
    await sleep(120);
    yield { type: 'reasoning_delta', runId, text: '再匹配硬技能与软技能权重。' };
    await sleep(120);
    yield { type: 'reasoning_delta', runId, text: '最后产出结构化筛选建议。' };
    await sleep(120);
  }

  if (patternId === 'tool_calling') {
    const toolCallId = randomUUID();
    yield {
      type: 'tool_call_start',
      runId,
      toolCallId,
      toolName: 'candidate_search',
      argsPreview: JSON.stringify({ query: userInput, limit: 5 }),
    };
    await sleep(180);
    yield {
      type: 'tool_call_result',
      runId,
      toolCallId,
      ok: true,
      durationMs: 186,
      resultPreview: '命中 5 名候选人：Go(2), Rust(1), Python(2)。',
    };
  }

  if (patternId === 'structured_output') {
    yield {
      type: 'structured_output',
      runId,
      schemaName: 'CandidateScreeningResult',
      payload: {
        score: 82,
        riskLevel: 'medium',
        matchedSkills: ['TypeScript', 'System Design', '沟通'],
        nextActions: ['安排 30 分钟技术面', '补充英文沟通样本'],
      },
    };
  }

  if (patternId === 'memory_persistence') {
    yield { type: 'queue_state', runId, pending: 0 };
  }

  if (patternId === 'source_grounding') {
    yield {
      type: 'checkpoint_created',
      runId,
      checkpointId: randomUUID(),
      label: 'source: document://candidate-profile#section-2',
    };
  }

  if (patternId === 'rag_over_uploaded_doc') {
    yield {
      type: 'checkpoint_created',
      runId,
      checkpointId: randomUUID(),
      label: 'RAG hit: attached markdown',
    };
  }

  if (patternId === 'agent_trace_stream') {
    yield { type: 'reasoning_delta', runId, text: '模拟长流输出，可通过重连回放最近事件。' };
  }

  if (patternId === 'structured_output') {
    yield {
      type: 'structured_output',
      runId,
      schemaName: 'InterviewPlanCard',
      payload: {
        title: '面试流程建议',
        rounds: [
          { name: '电话初筛', durationMin: 20 },
          { name: '技术深挖', durationMin: 60 },
          { name: '文化匹配', durationMin: 30 },
        ],
      },
    };
  }

  const assembled =
    patternId === 'basic_streaming_chat'
      ? `## 分析结论\n\n已收到：${userInput}\n\n- 这是基础流式聊天\n- 支持 Markdown 列表与代码\n\n\`\`\`ts\nconst mode = "${patternId}";\n\`\`\``
      : patternId === 'error_recovery_retry' && userInput.includes('fail')
        ? '触发了可恢复错误，请点击重试继续。'
        : `已完成模式 **${patternId}** 的一次可交互演示。输入要点：${userInput}`;

  const pieces = words(assembled);
  let cumulative = '';
  for (const token of pieces) {
    cumulative = `${cumulative}${cumulative ? ' ' : ''}${token}`;
    yield { type: 'assistant_delta', runId, text: `${token} ` };
    await sleep(35);
  }
  if (patternId === 'memory_persistence') {
    yield { type: 'queue_state', runId, pending: 0 };
  }
  if (patternId === 'error_recovery_retry' && userInput.includes('fail')) {
    yield { type: 'error', runId, message: '模拟错误：依赖服务暂时不可用，请重试。' };
    return;
  }
  yield { type: 'assistant_final', runId, text: cumulative };
  yield { type: 'run_end', runId };
}
