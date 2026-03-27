import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { parseDateRange, parseFilters } from '@/app/api/llm-stats/_shared';
import { recordSensitivePayloadAccess } from '@/lib/llm-observability/log-service';
import { timingSafeEqual } from 'crypto';

type LogRow = {
  id: string;
  callId: string | null;
  traceId: string | null;
  requestId: string | null;
  timestamp: Date;
  endpoint: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  isError: boolean;
  errorDomain: string | null;
  errorCode: string | null;
  providerStatus: string | null;
  httpStatus: number | null;
  retryCount: number;
  finalOutcome: string;
  requestHeaders?: unknown;
  requestPayload?: unknown;
  responsePayload?: unknown;
};

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const asInt = Math.trunc(parsed);
  return asInt > 0 ? asInt : fallback;
}

function canAccessDetails(request: Request): boolean {
  const configuredToken = env.LLM_OBSERVABILITY_ADMIN_TOKEN?.trim();
  if (!configuredToken) {
    return false;
  }
  const providedToken = request.headers.get('x-llm-observability-admin-token')?.trim();
  if (!providedToken) {
    return false;
  }
  const configured = Buffer.from(configuredToken);
  const provided = Buffer.from(providedToken);
  if (configured.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(configured, provided);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = parseDateRange(searchParams);
    const { provider, model, onlyError } = parseFilters(searchParams);
    const page = parsePositiveInt(searchParams.get('page'), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get('limit'), 20));
    const offset = (page - 1) * limit;
    const includeDetails =
      searchParams.get('includeDetails')?.toLowerCase() === 'true' ||
      searchParams.get('includeDetails') === '1';
    const actor =
      request.headers.get('x-user-email') || request.headers.get('x-user-id') || 'unknown';

    if (includeDetails && !canAccessDetails(request)) {
      recordSensitivePayloadAccess({
        actor,
        action: 'read_log_details',
        endpoint: '/api/llm-stats/logs',
        success: false,
        reason: 'invalid_or_missing_admin_token',
      });
      return NextResponse.json(
        { error: 'forbidden: details require trusted admin token' },
        { status: 403 },
      );
    }
    if (includeDetails) {
      recordSensitivePayloadAccess({
        actor,
        action: 'read_log_details',
        endpoint: '/api/llm-stats/logs',
        success: true,
      });
    }

    const where = {
      timestamp: {
        gte: range.startUtc,
        lt: range.endUtcExclusive,
      },
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(onlyError ? { isError: true } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.llmCallLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          callId: true,
          traceId: true,
          requestId: true,
          timestamp: true,
          endpoint: true,
          provider: true,
          model: true,
          latencyMs: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          isError: true,
          errorDomain: true,
          errorCode: true,
          providerStatus: true,
          httpStatus: true,
          retryCount: true,
          finalOutcome: true,
          ...(includeDetails
            ? {
                requestHeaders: true,
                requestPayload: true,
                responsePayload: true,
              }
            : {}),
        },
      }),
      prisma.llmCallLog.count({ where }),
    ]);

    return NextResponse.json({
      timezone: range.timezone,
      range: { startDate: range.startDate, endDate: range.endDate },
      filters: { provider, model, onlyError, includeDetails },
      page,
      limit,
      total,
      hasMore: offset + items.length < total,
      items: (items as LogRow[]).map((row) => ({
        id: row.id,
        callId: row.callId,
        traceId: row.traceId,
        requestId: row.requestId,
        timestamp: row.timestamp,
        endpoint: row.endpoint,
        provider: row.provider,
        model: row.model,
        latencyMs: row.latencyMs,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        isError: row.isError,
        errorDomain: row.errorDomain,
        errorCode: row.errorCode,
        providerStatus: row.providerStatus,
        httpStatus: row.httpStatus,
        retryCount: row.retryCount,
        finalOutcome: row.finalOutcome,
        ...(includeDetails
          ? {
              requestHeaders: row.requestHeaders ?? null,
              requestPayload: row.requestPayload ?? null,
              responsePayload: row.responsePayload ?? null,
            }
          : {}),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
