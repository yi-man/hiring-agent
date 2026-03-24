# 测试覆盖率提升到 90% 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将项目的测试覆盖率（单元测试 + 集成测试）从当前的 15.24% 提升到 90%。

**Architecture:** 采用分层测试策略：先测试核心工具函数（lib/）和自定义 Hooks（hooks/），然后测试 UI 组件（components/ui/），最后测试页面组件（app/）。使用 Jest 进行单元测试，Cypress 进行集成测试。

**Tech Stack:** Jest, React Testing Library, Cypress, next/jest, Istanbul 覆盖率报告

---

## 阶段 1：工具函数库测试（lib/）- 预计覆盖 35% 总语句

### Task 1: src/lib/date.ts - 日期工具函数

**Files:**

- Modify: `src/lib/date.ts` (如果需要修改)
- Create: `src/lib/date.test.ts`

**Step 1: 编写测试文件**

```typescript
import { formatDate, formatRelativeDate, formatDateForSEO, getReadingTime } from '@/lib/date';

describe('date.ts - 日期工具函数', () => {
  describe('formatDate', () => {
    it('格式化 Date 对象为中文日期字符串', () => {
      const date = new Date('2024-01-15');
      expect(formatDate(date)).toEqual('2024年1月15日');
    });

    it('格式化日期字符串为中文日期', () => {
      expect(formatDate('2024-01-15')).toEqual('2024年1月15日');
    });

    it('格式化无效日期', () => {
      expect(formatDate('invalid-date')).not.toThrow();
    });
  });

  describe('formatRelativeDate', () => {
    it('显示刚刚', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 30 * 1000);
      expect(formatRelativeDate(date)).toEqual('刚刚');
    });

    it('显示分钟前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('5 分钟前');
    });

    it('显示小时前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('2 小时前');
    });

    it('显示天前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('2 天前');
    });

    it('显示周前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('1 周前');
    });

    it('显示月前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('1 个月前');
    });

    it('显示年前', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(date)).toEqual('1 年前');
    });
  });

  describe('formatDateForSEO', () => {
    it('格式化日期为 SEO 友好格式', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(formatDateForSEO(date)).toEqual('2024-01-15');
    });
  });

  describe('getReadingTime', () => {
    it('计算阅读时间', () => {
      const text = ' '.repeat(200); // 200 个单词
      expect(getReadingTime(text)).toEqual('1 分钟阅读');
    });

    it('计算长文本阅读时间', () => {
      const text = ' '.repeat(1000); // 1000 个单词
      expect(getReadingTime(text)).toEqual('5 分钟阅读');
    });

    it('空文本阅读时间', () => {
      expect(getReadingTime('')).toEqual('0 分钟阅读');
    });
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/lib/date.test.ts --coverage
```

**Step 3: 检查覆盖率**

确保 coverage 达到 100%。如果有未覆盖的代码，添加额外的测试用例。

**Step 4: 提交**

```bash
git add src/lib/date.test.ts && git commit -m "test: 添加 date.ts 工具函数测试"
```

---

### Task 2: src/lib/env.ts - 环境变量解析

**Files:**

- Create: `src/lib/env.test.ts`

**Step 1: 编写测试文件**

```typescript
import { env } from '@/lib/env';

describe('env.ts - 环境变量解析', () => {
  it('默认环境变量解析', () => {
    expect(env.NEXT_PUBLIC_APP_NAME).toBeDefined();
    expect(env.NEXT_PUBLIC_APP_DESCRIPTION).toBeDefined();
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBeDefined();
  });

  it('默认主题配置', () => {
    expect(['light', 'dark', 'system']).toContain(env.NEXT_PUBLIC_DEFAULT_THEME);
  });

  it('API 超时配置', () => {
    expect(typeof env.API_TIMEOUT).toBe('number');
    expect(env.API_TIMEOUT).toBeGreaterThan(0);
  });

  it('布尔值配置', () => {
    expect(typeof env.NEXT_PUBLIC_ENABLE_THEME_SWITCHER).toBe('boolean');
    expect(typeof env.NEXT_PUBLIC_ENABLE_ANALYTICS).toBe('boolean');
    expect(typeof env.NEXT_PUBLIC_ENABLE_DEBUG).toBe('boolean');
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/lib/env.test.ts --coverage
```

**Step 3: 提交**

```bash
git add src/lib/env.test.ts && git commit -m "test: 添加 env.ts 环境变量解析测试"
```

---

### Task 3: src/lib/fetch.ts - API 请求

**Files:**

- Create: `src/lib/fetch.test.ts`

**Step 1: 编写测试文件**

```typescript
import { fetchJSON, fetchWithTimeout, handleAPIError } from '@/lib/fetch';

describe('fetch.ts - API 请求工具', () => {
  describe('handleAPIError', () => {
    it('处理网络错误', () => {
      const error = new TypeError('Network request failed');
      expect(() => handleAPIError(error)).toThrow();
    });

    it('处理 HTTP 错误', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Not Found' }),
      } as Response;

      await expect(handleAPIError(mockResponse)).rejects.toThrow('404 - Not Found');
    });
  });

  describe('fetchWithTimeout', () => {
    it('超时处理', async () => {
      const promise = fetchWithTimeout('https://example.com', { timeout: 1 });
      await expect(promise).rejects.toThrow('请求超时');
    });
  });

  describe('fetchJSON', () => {
    it('成功解析 JSON 响应', async () => {
      const mockData = { data: 'test' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchJSON('https://example.com');
      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com');
    });
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/lib/fetch.test.ts --coverage
```

**Step 3: 提交**

```bash
git add src/lib/fetch.test.ts && git commit -m "test: 添加 fetch.ts API 请求工具测试"
```

---

### Task 4: src/lib/string.ts - 字符串工具

**Files:**

- Create: `src/lib/string.test.ts`

**Step 1: 编写测试文件**

```typescript
import { slugify, truncate, stripHtml, capitalize } from '@/lib/string';

describe('string.ts - 字符串工具函数', () => {
  describe('slugify', () => {
    it('转换为 slug', () => {
      expect(slugify('Hello World')).toEqual('hello-world');
    });

    it('处理中文', () => {
      expect(slugify('你好 世界')).toEqual('你好-世界');
    });

    it('处理特殊字符', () => {
      expect(slugify('Hello!@#World')).toEqual('hello-world');
    });
  });

  describe('truncate', () => {
    it('截断字符串', () => {
      expect(truncate('1234567890', 5)).toEqual('12345...');
    });

    it('不截断短字符串', () => {
      expect(truncate('1234', 5)).toEqual('1234');
    });
  });

  describe('stripHtml', () => {
    it('去除 HTML 标签', () => {
      expect(stripHtml('<p>test</p>')).toEqual('test');
    });
  });

  describe('capitalize', () => {
    it('首字母大写', () => {
      expect(capitalize('hello')).toEqual('Hello');
    });
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/lib/string.test.ts --coverage
```

**Step 3: 提交**

```bash
git add src/lib/string.test.ts && git commit -m "test: 添加 string.ts 字符串工具测试"
```

---

## 阶段 2：自定义 Hooks 测试（hooks/）- 预计覆盖 25% 总语句

### Task 5: src/hooks/use-local-storage.ts

**Files:**

- Create: `src/hooks/use-local-storage.test.ts`

**Step 1: 编写测试文件**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '@/hooks/use-local-storage';

describe('useLocalStorage', () => {
  const TEST_KEY = 'test-key';

  it('初始化默认值', () => {
    const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'default'));
    expect(result.current[0]).toEqual('default');
  });

  it('从 localStorage 读取值', () => {
    const testValue = 'stored-value';
    localStorage.setItem(TEST_KEY, JSON.stringify(testValue));

    const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'default'));
    expect(result.current[0]).toEqual(testValue);
  });

  it('更新值到 localStorage', () => {
    const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'default'));

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toEqual('new-value');
    expect(localStorage.getItem(TEST_KEY)).toEqual(JSON.stringify('new-value'));
  });

  it('处理函数式更新', () => {
    const { result } = renderHook(() => useLocalStorage(TEST_KEY, 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toEqual(1);
  });

  it('key 变化时重新读取', () => {
    const { result, rerender } = renderHook(({ key }) => useLocalStorage(key, 'default'), {
      initialProps: { key: 'key1' },
    });

    localStorage.setItem('key2', JSON.stringify('value2'));

    rerender({ key: 'key2' });
    expect(result.current[0]).toEqual('value2');
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/hooks/use-local-storage.test.ts --coverage
```

**Step 3: 提交**

```bash
git add src/hooks/use-local-storage.test.ts && git commit -m "test: 添加 useLocalStorage Hook 测试"
```

---

### Task 6: src/hooks/use-debounce.ts

**Files:**

- Create: `src/hooks/use-debounce.test.ts`

**Step 1: 编写测试文件**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '@/hooks/use-debounce';

describe('useDebounce', () => {
  it('防抖值更新', async () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'initial' },
    });

    // 初始值
    expect(result.current).toEqual('initial');

    // 快速更新
    rerender({ value: 'updated' });
    expect(result.current).toEqual('initial'); // 还没有更新

    // 等待防抖时间
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(result.current).toEqual('updated');
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/hooks/use-debounce.test.ts --coverage
```

**Step 3: 提交**

```bash
git add src/hooks/use-debounce.test.ts && git commit -m "test: 添加 useDebounce Hook 测试"
```

---

## 阶段 3：UI 组件测试（components/ui/）- 预计覆盖 20% 总语句

### Task 7: src/components/ui/accordion.tsx

**Files:**

- Create: `src/components/ui/accordion.test.tsx`

**Step 1: 编写测试文件**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

describe('Accordion', () => {
  it('渲染折叠面板', () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>标题</AccordionTrigger>
          <AccordionContent>内容</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(screen.getByText('标题')).toBeInTheDocument();
  });

  it('切换面板内容', () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>标题</AccordionTrigger>
          <AccordionContent>内容</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    fireEvent.click(screen.getByText('标题'));
    expect(screen.getByText('内容')).toBeVisible();
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/components/ui/accordion.test.tsx --coverage
```

**Step 3: 提交**

```bash
git add src/components/ui/accordion.test.tsx && git commit -m "test: 添加 Accordion 组件测试"
```

---

### Task 8: src/components/ui/alert.tsx

**Files:**

- Create: `src/components/ui/alert.test.tsx`

**Step 1: 编写测试文件**

```typescript
import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

describe('Alert', () => {
  it('渲染警告组件', () => {
    render(
      <Alert>
        <AlertTitle>警告</AlertTitle>
        <AlertDescription>这是一个警告消息</AlertDescription>
      </Alert>
    );

    expect(screen.getByText('警告')).toBeInTheDocument();
    expect(screen.getByText('这是一个警告消息')).toBeInTheDocument();
  });

  it('关闭警告', () => {
    const { container, rerender } = render(
      <Alert>
        <AlertTitle>警告</AlertTitle>
        <AlertDescription>这是一个警告消息</AlertDescription>
      </Alert>
    );

    expect(container.firstChild).toBeVisible();
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/components/ui/alert.test.tsx --coverage
```

**Step 3: 提交**

```bash
git add src/components/ui/alert.test.tsx && git commit -m "test: 添加 Alert 组件测试"
```

---

## 阶段 4：页面组件测试（app/）- 预计覆盖 10% 总语句

### Task 9: src/app/error.tsx

**Files:**

- Create: `src/app/error.test.tsx`

**Step 1: 编写测试文件**

```typescript
import { render, screen } from '@testing-library/react';
import Error from '@/app/error';

describe('error.tsx', () => {
  it('渲染错误页面', () => {
    const error = new Error('测试错误');
    render(<Error error={error} />);

    expect(screen.getByText(/出错了/i)).toBeInTheDocument();
  });

  it('重试按钮', () => {
    const error = new Error('测试错误');
    const reset = jest.fn();
    render(<Error error={error} reset={reset} />);

    const retryBtn = screen.getByRole('button', { name: /重试/i });
    expect(retryBtn).toBeInTheDocument();
  });
});
```

**Step 2: 运行测试**

```bash
pnpm jest src/app/error.test.tsx --coverage
```

**Step 3: 提交**

```bash
git add src/app/error.test.tsx && git commit -m "test: 添加 error.tsx 页面测试"
```

---

## 阶段 5：集成测试（Cypress）- 预计覆盖 10% 总语句

### Task 10: Cypress 集成测试

**Files:**

- Create: `tests/integration/e2e/home.cy.ts`
- Create: `tests/integration/e2e/blog.cy.ts`
- Create: `tests/integration/e2e/contact.cy.ts`

**Step 1: 主页测试**

```typescript
describe('主页测试', () => {
  it('访问主页', () => {
    cy.visit('/');
    cy.contains('Next.js 16 SSR Template').should('be.visible');
  });

  it('导航到博客页面', () => {
    cy.visit('/');
    cy.contains('博客').click();
    cy.url().should('include', '/blog');
  });

  it('主题切换', () => {
    cy.visit('/');
    cy.get('button[aria-label*="主题"]').click();
  });
});
```

**Step 2: 运行 Cypress 测试**

```bash
pnpm cypress:open
```

**Step 3: 提交**

```bash
git add tests/integration/e2e/*.cy.ts && git commit -m "test: 添加 Cypress 集成测试"
```

---

## 阶段 6：覆盖率检查和优化

### Task 11: 检查整体覆盖率

**Step 1: 运行完整测试套件**

```bash
pnpm jest --coverage
```

**Step 2: 分析覆盖率报告**

查看 `coverage/lcov-report/index.html` 中的报告，重点关注：

- 未覆盖的文件
- 未覆盖的函数
- 未覆盖的分支

**Step 3: 补充测试**

对覆盖率不足的文件添加额外的测试用例。

---

## 预期完成后的状态

**覆盖率目标：**

- 语句覆盖率：90%+
- 分支覆盖率：90%+
- 函数覆盖率：90%+
- 行覆盖率：90%+

**提交数量：** 预计 20-30 个提交

**时间：** 6-8 周（取决于团队速度）
