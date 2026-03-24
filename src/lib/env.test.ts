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
