# 测试覆盖率检查实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在代码提交前自动检查测试覆盖率，确保所有指标（分支、函数、行、语句）的覆盖率达到 90%，如果不达标则阻止提交。

**Architecture:** 直接修改 Jest 配置中的 coverageThreshold，将所有指标的阈值从当前较低的值提高到 90%。与现有的 Husky 钩子机制配合使用，确保在提交前自动执行检查。

**Tech Stack:**

- Next.js 16
- React 19
- TypeScript 5.7
- Jest (v29)
- Husky (v9)
- next-themes

---

## 任务 1: 修改 Jest 配置中的 coverageThreshold

**文件:**

- Modify: `jest.config.mjs:15-22`

**Step 1: 查看当前配置**

```javascript
// 当前配置
coverageThreshold: {
  global: {
    branches: 10,
    functions: 5,
    lines: 14.9,
    statements: 15,
  },
},
```

**Step 2: 修改阈值为 90%**

```javascript
// 新配置
coverageThreshold: {
  global: {
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90,
  },
},
```

**Step 3: 验证配置修改**
运行 `cat jest.config.mjs` 检查修改是否正确

**Step 4: 提交配置变更**

```bash
git add jest.config.mjs
git commit -m "refactor: 提高测试覆盖率阈值到 90%"
```

---

## 任务 2: 验证修改后的配置

**文件:**

- 无直接文件修改，但需要运行测试命令

**Step 1: 运行所有测试并生成覆盖率报告**

```bash
pnpm test:ci
```

**Step 2: 检查控制台输出**
预期结果：会显示所有测试通过，但覆盖率检查失败
错误信息示例：

```
ERROR: Coverage for branches (X%) does not meet 90% threshold
ERROR: Coverage for functions (Y%) does not meet 90% threshold
ERROR: Coverage for lines (Z%) does not meet 90% threshold
ERROR: Coverage for statements (W%) does not meet 90% threshold
```

**Step 3: 查看详细的覆盖率报告**
打开 `coverage/index.html` 文件查看详细的 HTML 报告

**Step 4: 记录当前覆盖率状况**
将控制台输出的覆盖率摘要保存到临时文件：

```bash
pnpm test:ci | grep -E 'All files|Total' > coverage-summary.txt
```

---

## 任务 3: 根据需求调整覆盖范围（可选）

**文件:**

- Modify: `jest.config.mjs:24-30`

**Step 1: 分析 coverageDirectory**
检查 coverage 目录中的 HTML 报告，重点关注：

- 哪些文件的覆盖率较低
- 是否有不应该纳入测试的文件（如第三方代码）
- 是否有需要优化的测试文件

**Step 2: 调整 collectCoverageFrom**
如果需要忽略特定文件，可以添加到 ignore 列表：

```javascript
collectCoverageFrom: [
  'src/**/*.{js,jsx,ts,tsx}',
  '!src/**/*.d.ts',
  '!src/app/**/page.tsx',
  '!src/app/**/layout.tsx',
  '!src/lib/utils.ts',
  '!src/components/ui/**/*.tsx', // 示例：忽略 ui 组件库文件
],
```

**Step 3: 重新运行测试验证调整**

```bash
pnpm test:ci
```

---

## 任务 4: 测试 git commit 钩子

**文件:**

- 无直接文件修改，但需要测试 Husky 钩子

**Step 1: 确保有未提交的变更**
创建一个临时文件进行测试：

```bash
echo "// 测试文件" > temp-test.js
git add temp-test.js
```

**Step 2: 尝试提交**

```bash
git commit -m "test: 验证测试覆盖率钩子"
```

**Step 3: 预期结果**
提交应该失败，并显示覆盖率检查失败的信息

**Step 4: 清理测试文件**

```bash
git reset HEAD --mixed temp-test.js
rm temp-test.js
```

---

## 任务 5: 编写优化测试的指南（文档任务）

**文件:**

- Create: `docs/guides/increasing-test-coverage.md`

**Step 1: 编写文档内容**

````markdown
# 提高测试覆盖率指南

## 概述

项目要求代码提交前测试覆盖率达到 90%。如果您的提交被阻止，请按照本指南优化您的测试。

## 常见问题和解决方案

### 1. 覆盖率报告显示的问题

- **缺少测试文件**：为未测试的组件或函数创建测试文件
- **低分支覆盖率**：添加对条件语句的测试，覆盖所有分支
- **低函数覆盖率**：确保所有函数都有对应的测试用例

### 2. 优化方法

#### 2.1 检查未覆盖的代码

使用 `pnpm test:ci` 运行测试，查看控制台输出的详细信息：

```bash
pnpm test:ci | grep -E 'File.*\|.*0'
```
````

#### 2.2 使用 HTML 报告定位问题

打开 `coverage/index.html` 文件，点击具体文件查看哪些行未被覆盖

#### 2.3 示例：提高组件覆盖率

```typescript
// 原测试
import { render } from '@testing-library/react';
import Component from '@/components/Component';

test('renders component', () => {
  render(<Component />);
  expect(true).toBeTruthy();
});

// 优化后的测试
import { render, screen } from '@testing-library/react';
import Component from '@/components/Component';

test('renders component with content', () => {
  render(<Component title="Test Title" />);
  expect(screen.getByText('Test Title')).toBeInTheDocument();
});

test('renders component with different prop values', () => {
  render(<Component title="Another Title" disabled={true} />);
  expect(screen.getByText('Another Title')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeDisabled();
});
```

## 总结

测试覆盖率是代码质量的重要指标，但不是唯一指标。在编写测试时，应关注测试的质量而非单纯的数值。确保每个测试都有明确的目的，并覆盖代码的关键路径。

````

**Step 2: 提交文档**
```bash
git add docs/guides/increasing-test-coverage.md
git commit -m "docs: 新增提高测试覆盖率指南"
````

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-02-27-test-coverage-check-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
