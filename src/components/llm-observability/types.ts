export type LlmStatsFilters = {
  startDate: string;
  endDate: string;
  timezone: string;
  provider: string;
  model: string;
  onlyError: boolean;
  granularity: 'day' | 'week';
  page: number;
  limit: number;
  adminToken: string;
};

export type OverviewMetric = {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
  errorRate: number;
};

export type OverviewResponse = {
  overview: {
    today: OverviewMetric;
    week: OverviewMetric & { weekStartDate: string };
    total: OverviewMetric;
  };
};

export type TrendPoint = {
  bucketStart: string;
  totalCalls: number;
  errorCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
};

export type TrendResponse = {
  points: TrendPoint[];
};

export type ErrorDistributionResponse = {
  summary: {
    totalCalls: number;
    totalErrors: number;
    errorRate: number;
  };
  distributions: {
    providers: Array<{ provider: string; errorCalls: number }>;
    models: Array<{ model: string; errorCalls: number }>;
    endpoints: Array<{ endpoint: string; errorCalls: number }>;
  };
  topErrorEndpoints: Array<{ endpoint: string; errorCalls: number }>;
};

export type LogItem = {
  id: string;
  callId: string | null;
  traceId: string | null;
  requestId: string | null;
  timestamp: string;
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

export type LogsResponse = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: LogItem[];
};
