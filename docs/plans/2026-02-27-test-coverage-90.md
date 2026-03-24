# 测试覆盖率提升计划（目标：90%）

## 1. 项目当前状态分析

**当前覆盖率（jest --coverage）：**

- 语句覆盖率：15.24%（66/433）
- 分支覆盖率：10%（7/70）
- 函数覆盖率：5.63%（4/71）
- 行覆盖率：14.97%（62/414）

**已有的测试文件：**

- `src/components/ui/button.test.tsx` - Button 组件测试（100% 行覆盖）
- `tests/unit/pages/Home.test.tsx` - 主页测试
- `tests/unit/components/Navbar.test.tsx` - 导航栏测试
- `tests/unit/components/ThemeToggle.test.tsx` - 主题切换测试

## 2. 需要测试的关键文件

### 优先级 1（核心功能/高覆盖率潜力）：

1. `src/lib/` - 工具函数库（日期、环境变量、字符串、API 请求）
2. `src/hooks/` - 自定义 React Hooks
3. `src/components/ui/` - UI 组件库（大部分组件完全没有测试）
4. `src/app/` - 页面组件（error.tsx, loading.tsx, not-found.tsx）

## 3. 测试策略

### 3.1 单元测试策略

**lib/ 目录（工具函数）：**

- 每个函数至少 3-5 个测试用例
- 测试边界条件和异常情况

**hooks/ 目录（自定义 Hooks）：**

- 使用 @testing-library/react-hooks 或直接在组件中测试
- 测试 Hook 的各种状态和边缘情况

**ui/ 目录（组件）：**

- 每个组件至少 5-10 个测试用例
- 测试组件的渲染、交互和状态变化
- 测试组件的可访问性（a11y）

### 3.2 集成测试策略（Cypress）

**核心页面和功能：**

- 主页（/）- 导航、内容渲染、主题切换
- 博客页面（/blog）- 列表渲染、分页、搜索
- 博客文章（/blog/[slug]）- 内容渲染、评论、分享
- 联系页面（/contact）- 表单验证、提交功能

## 4. 测试进度计划

### 阶段 1 - 高优先级文件（目标：50% 覆盖率） - 2 周

1. `src/lib/date.ts` - 完成（4 个函数，预计 30+ 测试用例）
2. `src/lib/env.ts` - 完成（环境变量解析，预计 20+ 测试用例）
3. `src/lib/fetch.ts` - 完成（API 请求，预计 25+ 测试用例）
4. `src/lib/string.ts` - 完成（字符串处理，预计 15+ 测试用例）
5. `src/hooks/use-local-storage.ts` - 完成（LocalStorage Hook，预计 15+ 测试用例）
6. `src/hooks/use-debounce.ts` - 完成（防抖 Hook，预计 10+ 测试用例）

### 阶段 2 - 中等优先级文件（目标：75% 覆盖率） - 2 周

1. 所有 UI 组件（accordion、alert、badge、card、checkbox、dialog 等）
2. 剩余的自定义 Hooks（use-media-query、use-scroll-position、use-viewport-size 等）
3. 页面组件（error.tsx、loading.tsx、not-found.tsx）

### 阶段 3 - 低优先级文件（目标：90%+ 覆盖率） - 2 周

1. 边缘情况和边界条件测试
2. 性能和加载时间测试
3. 可访问性（a11y）测试
4. 视觉回归测试

## 5. 覆盖率阈值设置

建议在 `jest.config.mjs` 中设置以下覆盖率阈值：

```javascript
coverageThreshold: {
  global: {
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90,
  },
}
```

## 6. CI/CD 集成

建议在 GitHub Actions 中添加以下步骤：

```yaml
name: Tests & Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run type check
        run: pnpm type-check

      - name: Run linting
        run: pnpm lint

      - name: Run unit tests with coverage
        run: pnpm test:ci
        env:
          CI: true

      - name: Run e2e tests
        uses: cypress-io/github-action@v6
        with:
          build: pnpm build
          start: pnpm start
          wait-on: 'http://localhost:3000'
```

## 7. 预期的最终状态

**完成后的覆盖率目标：**

- 语句覆盖率：90%+（390/433）
- 分支覆盖率：90%+（63/70）
- 函数覆盖率：90%+（64/71）
- 行覆盖率：90%+（373/414）

**项目质量指标：**

- 0 个未解决的高优先级问题
- 0 个未处理的安全漏洞
- 构建时间 < 2 分钟
- 测试时间 < 3 分钟
- 代码重复率 < 3%
