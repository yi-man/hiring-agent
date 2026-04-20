import { z } from 'zod';
import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env.development') });

const envSchema = z.object({
  // 应用配置
  NEXT_PUBLIC_APP_NAME: z.string().default('Hiring Agent'),
  NEXT_PUBLIC_APP_DESCRIPTION: z
    .string()
    .default('AI-powered hiring assistant: chat, JD, workflow learning, LLM observability'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // API 配置
  NEXT_PUBLIC_API_BASE_URL: z.string().default('/api'),
  API_TIMEOUT: z.coerce.number().default(10000),

  // 主题配置
  NEXT_PUBLIC_DEFAULT_THEME: z.enum(['light', 'dark', 'system']).default('light'),
  NEXT_PUBLIC_ENABLE_THEME_SWITCHER: z.coerce.boolean().default(true),

  // 分析和监控
  NEXT_PUBLIC_ENABLE_ANALYTICS: z.coerce.boolean().default(false),
  NEXT_PUBLIC_GA_TRACKING_ID: z.string().optional(),

  // 性能优化
  NEXT_PUBLIC_ENABLE_IMAGE_OPTIMIZATION: z.coerce.boolean().default(true),
  NEXT_PUBLIC_ENABLE_CACHE: z.coerce.boolean().default(true),

  // 开发配置
  NEXT_PUBLIC_ENABLE_DEBUG: z.coerce.boolean().default(false),

  // JD Agent LLM（OpenAI 兼容接口，仅服务端使用）
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().default('doubao-embedding-vision-250615'),
  /**
   * auto: 当 OPENAI_EMBEDDING_MODEL 名含 embedding-vision 时走 /embeddings/multimodal（如豆包视觉向量）。
   * true / false 可强制开关；multimodal 请求体为 input: [{ type: "text", text }]，每段文本单独请求以得到独立向量。
   */
  OPENAI_EMBEDDING_USE_MULTIMODAL: z.enum(['auto', 'true', 'false']).default('auto'),
  /** 为 true 时强制走本地 mock，不调用外部模型 */
  JD_LLM_MOCK: z.coerce.boolean().default(false),
  /** 部分兼容接口不支持 json_object，可设为 false */
  OPENAI_JSON_MODE: z.coerce.boolean().default(true),
  /** JD Agent 调用上游 LLM 的超时（毫秒），与通用 API_TIMEOUT 分离，避免慢模型被 10s 截断 */
  JD_LLM_TIMEOUT_MS: z.coerce.number().default(120000),
  /** LLM 聚合准实时任务水位线（分钟） */
  LLM_OBSERVABILITY_REALTIME_WATERMARK_MINUTES: z.coerce.number().int().nonnegative().default(10),
  /** LLM 聚合：每日固化 UTC 调度时间 */
  LLM_OBSERVABILITY_DAILY_SOLIDIFY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(0),
  LLM_OBSERVABILITY_DAILY_SOLIDIFY_MINUTE_UTC: z.coerce.number().int().min(0).max(59).default(5),
  /** LLM 聚合：每周固化 UTC 调度时间，weekday 遵循 JS getUTCDay (0=Sun..6=Sat) */
  LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_WEEKDAY_UTC: z.coerce.number().int().min(0).max(6).default(1),
  LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(0),
  LLM_OBSERVABILITY_WEEKLY_SOLIDIFY_MINUTE_UTC: z.coerce.number().int().min(0).max(59).default(10),
  LLM_OBSERVABILITY_ADMIN_TOKEN: z.string().optional(),

  // Chat persistence
  MYSQL_HOST: z.string().default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().default('root'),
  MYSQL_PASS: z.string().default('mysql1234'),
  MYSQL_DATABASE: z.string().default('bia'),
  MYSQL_CI_SUFFIX: z.string().default('_ci'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  CHAT_REDIS_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  CHAT_HISTORY_REHYDRATE_LIMIT: z.coerce.number().int().positive().default(50),
  CHAT_TEST_REDIS_PREFIX: z.string().default('chat:test'),

  // RAG / Qdrant
  QDRANT_URL: z.string().url().default('http://127.0.0.1:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION_NAME: z.string().default('conversation_markdown_chunks'),
  RAG_TOP_K: z.coerce.number().int().positive().default(6),
  RAG_MIN_SCORE: z.coerce.number().default(0),
  RAG_CONTEXT_MAX_CHARS: z.coerce.number().int().positive().default(6000),
  RAG_INGEST_LEASE_MS: z.coerce.number().int().positive().default(1800000),
});

type Env = z.infer<typeof envSchema>;

const defaultEnv = envSchema.parse({});

function getInputValue(input: Partial<NodeJS.ProcessEnv>, key: string): string | undefined {
  try {
    return input[key];
  } catch (error) {
    console.error(`❌ Failed reading environment variable "${key}":`, error);
    return undefined;
  }
}

function parseEnvSafely(input: Partial<NodeJS.ProcessEnv>): Env {
  const parsed: Record<string, unknown> = { ...defaultEnv };
  const schemaShape = envSchema.shape as Record<string, z.ZodTypeAny>;

  for (const key of Object.keys(defaultEnv)) {
    const keySchema = schemaShape[key];
    const value = getInputValue(input, key);
    const result = keySchema.safeParse(value);
    if (result.success) {
      parsed[key] = result.data;
      continue;
    }

    console.error(`❌ Invalid environment variable "${key}":`, result.error.issues);
    parsed[key] = defaultEnv[key as keyof Env];
  }

  return envSchema.parse(parsed);
}

// 解析环境变量的函数
export function parseEnv(input: Partial<NodeJS.ProcessEnv> = process.env): Env {
  try {
    return envSchema.parse(input);
  } catch (error) {
    // Degrade gracefully: keep valid values and only default invalid keys.
    if (!(error instanceof z.ZodError)) {
      console.error('❌ Failed to parse environment variables:', error);
    }
    return parseEnvSafely(input);
  }
}

// 导出解析后的环境变量
export const env = parseEnv();
