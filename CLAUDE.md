```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

## 项目概述

这是一个现代化的 Next.js 16 SSR 模板项目，使用 React 19、TypeScript 5.7、Tailwind CSS 4 和 shadcn/ui 组件库构建，支持深色/浅色主题切换和响应式设计。项目包含完整的测试配置（Jest 单元测试 + Cypress 端到端测试）和代码规范工具链。

## 常用命令

### 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器 (使用 Turbopack 加速)
pnpm dev

# 生产构建
pnpm build

# 启动生产服务器
pnpm start

# 代码规范检查
pnpm lint

# 代码规范自动修复
pnpm lint:fix

# 代码格式化
pnpm format

# 类型检查
pnpm type-check
```

### 测试命令

```bash
# 运行所有 Jest 测试并生成覆盖率报告
pnpm test

# 运行 Jest 测试并监听文件变化
pnpm test:watch

# CI 环境测试
pnpm test:ci

# 打开 Cypress 测试界面
pnpm cypress:open

# 运行 Cypress 测试 (无头模式)
pnpm cypress:run

# 启动开发服务器并运行 Cypress 测试
pnpm test:e2e
```

### 项目管理命令

```bash
# 清理项目
pnpm clean

# 重新安装依赖
pnpm reinstall
```

## 架构概览

### 项目结构

```
├── src/
│   ├── app/                          # Next.js App Router 页面路由
│   ├── components/                   # 可复用组件
│   │   ├── ui/                      # shadcn/ui 组件库
│   │   ├── navbar.tsx               # 导航栏组件
│   │   └── theme-provider.tsx       # 主题提供商
│   ├── hooks/                        # 自定义 Hooks
│   ├── lib/                         # 工具函数和工具库
│   └── types/                       # TypeScript 类型定义
├── tests/                           # 测试文件目录
│   ├── integration/                # Cypress 端到端测试
│   └── unit/                       # Jest 单元测试
├── public/                          # 静态资源
└── 配置文件
```

### 关键技术架构

1. **Next.js 16 App Router**: 使用 App Router 架构，支持服务器组件、客户端组件和布局组件
2. **主题系统**: 使用 next-themes 实现深色/浅色主题切换，支持系统主题检测
3. **响应式导航**: 自适应桌面端和移动端的导航栏组件
4. **组件库**: 使用 shadcn/ui 组件库，基于 Radix UI 和 Tailwind CSS 构建
5. **数据获取**: 支持服务器端渲染 (SSR)、静态页面生成 (SSG) 和增量静态再生 (ISR)

### 测试架构

- **单元测试**: 使用 Jest 和 React Testing Library，测试文件位于 `src/**/*.test.tsx` 和 `tests/unit/**/*.test.tsx`
- **端到端测试**: 使用 Cypress，测试文件位于 `tests/integration/e2e/**/*.cy.ts`
- **覆盖率要求**: 目标覆盖率为 90% 以上（当前配置为基础阈值）

## 开发指南

### 创建新页面

在 `src/app/` 目录下创建新文件夹和 `page.tsx` 文件：

```typescript
// src/app/new-page/page.tsx
export default function NewPage() {
  return <h1>New Page</h1>;
}
```

### 创建新组件

在 `src/components/` 目录下创建新组件，或使用 shadcn/ui 命令添加组件：

```typescript
// src/components/MyComponent.tsx
interface MyComponentProps {
  title: string;
}

export function MyComponent({ title }: MyComponentProps) {
  return <h2>{title}</h2>;
}
```

### 创建新 Hook

在 `src/hooks/` 目录下创建自定义 Hook：

```typescript
// src/hooks/use-custom-hook.ts
import { useState, useEffect } from 'react';

export function useCustomHook() {
  const [state, setState] = useState(null);

  useEffect(() => {
    // 逻辑
  }, []);

  return state;
}
```

### 创建工具函数

在 `src/lib/` 目录下创建工具函数：

```typescript
// src/lib/utils.ts
export function formatText(text: string): string {
  return text.toUpperCase();
}
```

### 测试开发流程

1. 为新组件/函数创建测试文件（`*.test.tsx`）
2. 编写测试用例
3. 运行测试并修复问题
4. 确保测试覆盖率达到目标

## 配置文件位置

- **TypeScript**: `tsconfig.json`
- **Next.js**: `next.config.mjs`
- **Jest**: `jest.config.mjs` 和 `jest.setup.tsx`
- **Cypress**: `cypress.config.ts` 和 `tests/integration/support/e2e.ts`
- **ESLint**: `eslint.config.mjs`
- **Prettier**: `.prettierrc` 和 `.prettierignore`
- **Tailwind CSS**: `tailwind.config.ts` 和 `postcss.config.js`

## 重要说明

- 项目使用 pnpm 作为包管理器
- 所有路径别名使用 `@/` 前缀指向 `src/` 目录
- 组件和工具函数应包含完整的类型定义
- 测试文件应遵循项目的测试规范

## 代码规范与提交流程

### 自动检查机制

项目配置了完整的自动检查机制，使用 Husky 和 lint-staged：

1. **pre-commit 钩子**：在提交前会自动运行以下检查：
   - 对暂存文件执行 lint-staged（自动修复 ESLint 错误和格式化代码）
   - 运行 TypeScript 类型检查
   - 运行所有单元测试

2. **commit-msg 钩子**：检查提交消息是否符合规范（使用 commitlint）

### pre-commit 钩子内容

```bash
# 运行 lint-staged（自动修复 ESLint 错误和格式化代码）
pnpx lint-staged

# 运行 TypeScript 类型检查
pnpm type-check

# 运行所有单元测试
pnpm test:ci
```

### lint-staged 配置

```json
{
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,mdx}": ["prettier --write"],
  "*.{css,scss}": ["prettier --write"]
}
```

### 提交消息规范

使用 commitlint 检查提交消息是否符合规范，建议使用：

```bash
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**常用 type 类型：**

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档修改
- `style`: 代码格式化
- `refactor`: 重构
- `test`: 测试文件修改
- `chore`: 其他修改（如构建过程）
