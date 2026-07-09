import { parseEnv, env } from '@/lib/env';

describe('env.ts - 环境变量解析', () => {
  describe('导出的默认环境变量', () => {
    it('验证导出的 env 变量', () => {
      expect(env).toBeDefined();
      expect(typeof env).toBe('object');
      expect(env.NEXT_PUBLIC_APP_NAME).toBeDefined();
    });
  });

  describe('parseEnv 函数', () => {
    it('正确解析默认环境变量', () => {
      const result = parseEnv({});
      expect(result.NEXT_PUBLIC_APP_NAME).toBeDefined();
      expect(result.NEXT_PUBLIC_APP_DESCRIPTION).toBeDefined();
      expect(result.NEXT_PUBLIC_API_BASE_URL).toBeDefined();
    });

    it('正确解析默认主题配置', () => {
      const result = parseEnv({});
      expect(['light', 'dark', 'system']).toContain(result.NEXT_PUBLIC_DEFAULT_THEME);
    });

    it('正确解析 API 超时配置', () => {
      const result = parseEnv({});
      expect(typeof result.API_TIMEOUT).toBe('number');
      expect(result.API_TIMEOUT).toBeGreaterThan(0);
    });

    it('正确解析布尔值配置', () => {
      const result = parseEnv({});
      expect(typeof result.NEXT_PUBLIC_ENABLE_THEME_SWITCHER).toBe('boolean');
      expect(typeof result.NEXT_PUBLIC_ENABLE_ANALYTICS).toBe('boolean');
      expect(typeof result.NEXT_PUBLIC_ENABLE_DEBUG).toBe('boolean');
    });

    it('将字符串 false 解析为 false', () => {
      expect(parseEnv({ OPENAI_JSON_MODE: 'false' }).OPENAI_JSON_MODE).toBe(false);
      expect(parseEnv({ NEXT_PUBLIC_ENABLE_ANALYTICS: 'false' }).NEXT_PUBLIC_ENABLE_ANALYTICS).toBe(
        false,
      );
    });

    it('不再暴露 JD_LLM_MOCK 运行时配置', () => {
      expect(parseEnv({ JD_LLM_MOCK: 'true' })).not.toHaveProperty('JD_LLM_MOCK');
    });

    it('解析 LLM provider fallback 与熔断配置', () => {
      const result = parseEnv({
        LLM_PROVIDER_ORDER: 'deepseek,doubao,openai',
        LLM_MAX_RETRIES: '2',
        LLM_RETRY_BACKOFF_MS: '50',
        LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '4',
        LLM_CIRCUIT_BREAKER_COOLDOWN_MS: '30000',
        DEEPSEEK_API_KEY: 'deepseek-key',
        DEEPSEEK_MODEL: 'deepseek-chat',
        DOUBAO_API_KEY: 'doubao-key',
        DOUBAO_MODEL: 'doubao-model',
      });

      expect(result.LLM_PROVIDER_ORDER).toBe('deepseek,doubao,openai');
      expect(result.LLM_MAX_RETRIES).toBe(2);
      expect(result.LLM_RETRY_BACKOFF_MS).toBe(50);
      expect(result.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD).toBe(4);
      expect(result.LLM_CIRCUIT_BREAKER_COOLDOWN_MS).toBe(30000);
      expect(result.DEEPSEEK_API_KEY).toBe('deepseek-key');
      expect(result.DEEPSEEK_MODEL).toBe('deepseek-chat');
      expect(result.DOUBAO_API_KEY).toBe('doubao-key');
      expect(result.DOUBAO_MODEL).toBe('doubao-model');
    });

    it('正确处理无效环境变量（ZodError）', () => {
      // 捕获 console.error 输出
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = parseEnv({
        NEXT_PUBLIC_APP_URL: 'invalid-url',
        API_TIMEOUT: 'not-a-number',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();

      expect(result.NEXT_PUBLIC_APP_NAME).toBeDefined();
      expect(['light', 'dark', 'system']).toContain(result.NEXT_PUBLIC_DEFAULT_THEME);
      expect(typeof result.API_TIMEOUT).toBe('number');
    });

    it('正确处理非 ZodError 类型的错误', () => {
      // 捕获 console.error 输出
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // 创建一个会抛出非 ZodError 的输入
      const invalidInput = Object.create(null, {
        // 创建一个 getter 会抛出异常
        NEXT_PUBLIC_APP_NAME: {
          get() {
            throw new Error('Non-Zod error');
          },
          enumerable: true,
        },
      });

      const result = parseEnv(invalidInput as unknown as Record<string, string>);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();

      expect(result.NEXT_PUBLIC_APP_NAME).toBeDefined();
      expect(['light', 'dark', 'system']).toContain(result.NEXT_PUBLIC_DEFAULT_THEME);
      expect(typeof result.API_TIMEOUT).toBe('number');
    });
  });
});
