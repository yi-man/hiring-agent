import { z } from 'zod';

const envSchema = z.object({
  // 应用配置
  NEXT_PUBLIC_APP_NAME: z.string().default('Next.js 16 SSR Template'),
  NEXT_PUBLIC_APP_DESCRIPTION: z
    .string()
    .default('A modern Next.js 16 SSR template for content websites'),
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
});

type Env = z.infer<typeof envSchema>;

// 解析环境变量的函数
export function parseEnv(input: Partial<NodeJS.ProcessEnv> = process.env): Env {
  try {
    return envSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:', error.issues);
    } else {
      console.error('❌ Failed to parse environment variables:', error);
    }

    // 使用默认值
    return envSchema.parse({});
  }
}

// 导出解析后的环境变量
export const env = parseEnv();
