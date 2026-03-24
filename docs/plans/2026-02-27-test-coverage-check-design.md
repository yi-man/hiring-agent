# 测试覆盖率检查设计方案

## 概述

为了提高代码质量和项目稳定性，我们需要在代码提交前确保测试覆盖率达到 90% 及以上。本方案通过配置 Jest 测试框架和 Husky 钩子来实现这一目标。

## 项目上下文

这是一个使用 Next.js 16、React 19、TypeScript 5.7、Tailwind CSS 4 和 shadcn/ui 组件库构建的现代化 SSR 模板项目。项目已经配置了完整的测试架构和 git 钩子机制：

- 使用 Husky 管理 git 钩子
- 使用 Jest 作为单元测试框架
- 使用 React Testing Library 进行组件测试
- 现有的 pre-commit 钩子会运行 lint-staged、类型检查和单元测试

## 需求分析

**目标：**

- 在代码提交前自动检查测试覆盖率
- 确保所有指标（分支、函数、行、语句）的覆盖率达到 90%
- 如果覆盖率不达标，阻止提交并显示详细信息
- 提供清晰的反馈，帮助开发者了解哪些部分需要改进

## 设计方案

### 方法选择

我们选择直接修改 Jest 配置的 coverageThreshold 方法，原因如下：

1. **简单直接**：只需要修改一个配置文件
2. **技术栈符合**：Jest 内置功能，无需额外依赖
3. **与现有流程集成**：完美配合 Husky 钩子
4. **稳定性高**：官方支持的功能，经过充分测试

### 具体实现

#### 1. 修改 Jest 配置

**文件：`jest.config.mjs`**

```javascript
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',

  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // 提高测试覆盖率阈值到 90%
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**/page.tsx',
    '!src/app/**/layout.tsx',
    '!src/lib/utils.ts',
  ],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  testMatch: [
    '<rootDir>/tests/unit/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.test.{js,jsx,ts,tsx}',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.tsx'],

  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/out/',
    '<rootDir>/coverage/',
    '<rootDir>/cypress/',
  ],
  transformIgnorePatterns: ['node_modules/(?!(lucide-react)/)'],

  clearMocks: true,
};

export default createJestConfig(config);
```

#### 2. 保持 Husky 钩子不变

**文件：`.husky/pre-commit`**

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# 运行 lint-staged（自动修复 ESLint 错误和格式化代码）
pnpx lint-staged

# 运行 TypeScript 类型检查
pnpm type-check

# 运行单元测试（包括覆盖率检查）
pnpm test:ci

echo "✅ Pre-commit checks passed!"
```

#### 3. 确保 test:ci 命令配置正确

**文件：`package.json`**

```json
{
  "scripts": {
    "test:ci": "jest --ci --coverage --coverageReporters=text-summary"
  }
}
```

## 实现后的流程

1. **开发者修改代码**：对项目文件进行修改
2. **git add**：将修改的文件添加到暂存区
3. **git commit**：尝试提交时触发 Husky 钩子
4. **钩子执行**：
   - 运行 lint-staged 自动修复和格式化
   - 运行 TypeScript 类型检查
   - 运行所有 Jest 测试并生成覆盖率报告
   - 检查覆盖率是否达到 90% 阈值
5. **结果**：
   - 如果所有检查通过，提交成功
   - 如果任何检查失败（包括覆盖率不达标），提交失败

## 验证方法

1. **运行测试命令**：`pnpm test:ci`
2. **查看覆盖率报告**：报告将显示在控制台中
3. **尝试提交**：使用 `git commit` 命令，钩子会自动检查
4. **测试覆盖率未达标**：钩子会显示错误信息并阻止提交

## 可扩展性和维护性

**支持增量覆盖率：**
如果项目规模较大，可以考虑结合 `@istanbuljs/nyc` 等工具实现增量覆盖率检查，只对修改的文件进行严格检查。

**分支级别配置：**
对于特定的复杂模块，可以在代码中使用 `/* istanbul ignore next */` 注释来忽略特定代码块的覆盖率检查，但应谨慎使用。

## 风险评估

1. **紧急修复场景**：高覆盖率要求可能会延迟紧急修复的提交
   - 缓解方案：使用 `--no-verify` 参数跳过钩子检查（不推荐）

2. **大型项目增量改造**：对于已经存在的大型项目，可能需要逐步提高覆盖率
   - 缓解方案：先设定较低的阈值，逐步提高

## 批准记录

**设计方案已通过用户批准**
