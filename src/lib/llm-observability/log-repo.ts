export type PersistLlmCallLogInput = {
  callId?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  endpoint: string;
  provider: string;
  model: string;
  requestHeaders: object;
  requestPayload: object;
  responsePayload?: object | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  httpStatus?: number | null;
  isError: boolean;
  errorDomain?: string | null;
  errorCode?: string | null;
  providerStatus?: string | null;
  retryCount: number;
  finalOutcome: string;
  timestamp: Date;
};

type PrismaLike = {
  llmCallLog: { create: (args: unknown) => Promise<unknown> };
  llmUsageStatsDaily: {
    create: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
  };
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

async function loadPrisma(): Promise<PrismaLike | null> {
  try {
    const mod = await import('@/lib/prisma');
    const candidate = (mod as { prisma?: PrismaLike }).prisma;
    return candidate ?? null;
  } catch {
    // Keep observability persistence best-effort when prisma client is unavailable.
    return null;
  }
}

export async function persistLlmCallLog(input: PersistLlmCallLogInput): Promise<unknown> {
  const prisma = await loadPrisma();
  if (!prisma) {
    return null;
  }
  return prisma.llmCallLog.create({
    data: {
      ...input,
      callId: input.callId ?? null,
    },
  });
}

export type UpsertLlmUsageStatsDailyInput = {
  bucketDate: Date;
  provider: string;
  model: string;
  endpoint: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
};

export async function upsertLlmUsageStatsDaily(
  input: UpsertLlmUsageStatsDailyInput,
): Promise<unknown> {
  const prisma = await loadPrisma();
  if (!prisma) {
    return null;
  }
  const where = {
    bucketDate_provider_model_endpoint: {
      bucketDate: input.bucketDate,
      provider: input.provider,
      model: input.model,
      endpoint: input.endpoint,
    },
  };

  try {
    return await prisma.llmUsageStatsDaily.create({
      data: input,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      (error as { code?: string }).code !== 'P2002'
    ) {
      throw error;
    }
  }

  await prisma.$executeRaw`
    UPDATE llm_usage_stats_daily
    SET
      total_calls = total_calls + ${input.totalCalls},
      success_calls = success_calls + ${input.successCalls},
      error_calls = error_calls + ${input.errorCalls},
      input_tokens = input_tokens + ${input.inputTokens},
      output_tokens = output_tokens + ${input.outputTokens},
      total_tokens = total_tokens + ${input.totalTokens},
      avg_latency_ms = CASE
        WHEN (total_calls + ${input.totalCalls}) = 0 THEN 0
        ELSE ((avg_latency_ms * total_calls) + (${input.avgLatencyMs} * ${input.totalCalls}))
          / (total_calls + ${input.totalCalls})
      END
    WHERE
      bucket_date = ${input.bucketDate}
      AND provider = ${input.provider}
      AND model = ${input.model}
      AND endpoint = ${input.endpoint}
  `;

  return prisma.llmUsageStatsDaily.findUnique({
    where,
  });
}
