# Next.js 16 SSR 模板实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建一个完整的 Next.js 16 SSR 内容网站模板，包含最新技术栈、代码规范、测试配置和工程化配置。

**Architecture:** 使用 Next.js 16 App Router + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui 3.8。采用服务端渲染架构，支持深色/浅色主题切换，集成完整的 ESLint + Prettier + Husky 代码规范流程。

**Tech Stack:** Next.js 16.1.6, React 19.2.4, TypeScript 5.7, Tailwind CSS 4.1.18, shadcn/ui 3.8.5, pnpm 10.9.2, Jest, Cypress, ESLint, Prettier, Husky

---

## 工作目录

**所有任务都在以下目录执行：**

```
/Users/xxwade/mine/claude-code-projects/frontend-template
```

**所有文件路径都是相对于上述工作目录的相对路径。**

---

## 前置检查清单

在开始前，请确认以下环境已准备好：

- [ ] Node.js 20+ 已安装
- [ ] pnpm 10.9.2+ 已安装 (`npm install -g pnpm`)
- [ ] Git 已配置 (`git config --global user.name` 和 `user.email`)
- [ ] 当前目录为空或可以初始化新项目
- [ ] **已在工作目录下** (`cd /Users/xxwade/mine/claude-code-projects/frontend-template`)

---

## Task 1: 项目初始化和 Git 配置

**Files:**

- Create: `.gitignore`
- Create: `.gitattributes`
- Execute: `git init`

**Step 1: 初始化 Git 仓库**

Run:

```bash
git init
git checkout -b main
```

Expected: Git 仓库初始化成功，当前在 main 分支

**Step 2: 创建 .gitignore**

Create: `.gitignore`

```gitignore
# Dependencies
node_modules
.pnp
.pnp.js

# Testing
coverage
.nyc_output

# Next.js
.next
out

# Production
build
dist

# Environment Variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# IDE
.idea
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.temp

# Logs
logs
*.log

# Cache
.cache
.parcel-cache
.eslintcache
.stylelintcache

# Cypress
cypress/downloads
cypress/screenshots
cypress/videos

# Vercel
.vercel

# Turborepo
.turbo
```

**Step 3: 创建 .gitattributes**

Create: `.gitattributes`

```gitattributes
# Auto detect text files and perform LF normalization
* text=auto

# Source code
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.jsx text eol=lf
*.json text eol=lf
*.css text eol=lf
*.scss text eol=lf
*.html text eol=lf
*.md text eol=lf
*.mdx text eol=lf
*.yml text eol=lf
*.yaml text eol=lf

# Scripts
*.sh text eol=lf
*.bash text eol=lf
*.zsh text eol=lf

# Windows scripts (keep CRLF)
*.cmd text eol=crlf
*.bat text eol=crlf

# Binary files
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.svg text
*.webp binary
*.woff binary
*.woff2 binary
*.ttf binary
*.otf binary
*.eot binary
*.pdf binary
*.zip binary
*.tar binary
*.gz binary
```

**Step 4: 首次提交**

Run:

```bash
git add .gitignore .gitattributes
git commit -m "chore: initialize git repository with gitignore"
```

Expected: 提交成功，包含 gitignore 和 gitattributes

---

## Task 2: 初始化 Next.js 16 项目

**Files:**

- Execute: `pnpm create next-app` 等效命令
- Create: `package.json`
- Create: `next.config.ts`

**Step 1: 创建 package.json**

Create: `package.json`

```json
{
  "name": "nextjs16-ssr-template",
  "version": "0.1.0",
  "private": true,
  "description": "A modern Next.js 16 SSR template for content websites",
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "type-check": "tsc --noEmit",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --coverageReporters=text-summary",
    "cypress:open": "cypress open",
    "cypress:run": "cypress run",
    "test:e2e": "start-server-and-test dev http://localhost:3000 cypress:run",
    "prepare": "husky",
    "clean": "rm -rf .next node_modules coverage",
    "reinstall": "pnpm clean && pnpm install"
  },
  "dependencies": {
    "next": "16.1.6",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "next-themes": "^0.4.4",
    "axios": "^1.7.9",
    "ahooks": "^3.8.4",
    "@radix-ui/react-slot": "^1.1.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.1",
    "lucide-react": "^0.475.0"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.4",
    "typescript": "^5.7.3",
    "@next/eslint-plugin-next": "^16.1.6",
    "eslint": "^9.20.1",
    "eslint-config-next": "^16.1.6",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react": "^7.37.4",
    "eslint-plugin-react-hooks": "^5.1.0",
    "eslint-plugin-simple-import-sort": "^12.1.1",
    "@typescript-eslint/eslint-plugin": "^8.24.0",
    "@typescript-eslint/parser": "^8.24.0",
    "prettier": "^3.5.1",
    "prettier-plugin-tailwindcss": "^0.6.11",
    "tailwindcss": "^4.1.18",
    "@tailwindcss/postcss": "^4.1.18",
    "postcss": "^8.5.2",
    "@commitlint/cli": "^19.7.1",
    "@commitlint/config-conventional": "^19.7.1",
    "husky": "^9.1.7",
    "lint-staged": "^15.4.3",
    "jest": "^29.7.0",
    "@testing-library/react": "^16.2.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.6.1",
    "jest-environment-jsdom": "^29.7.0",
    "@types/jest": "^29.5.14",
    "cypress": "^14.0.3",
    "@cypress/webpack-preprocessor": "^6.0.2",
    "start-server-and-test": "^2.0.10",
    "ts-node": "^10.9.2"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=10.0.0"
  },
  "packageManager": "pnpm@10.9.2"
}
```

**Step 2: 安装依赖**

Run:

```bash
pnpm install
```

Expected: 所有依赖安装成功，出现 `node_modules` 目录

**Step 3: 创建 next.config.ts**

Create: `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Step 4: 提交**

Run:

```bash
git add package.json pnpm-lock.yaml next.config.ts

git commit -m "chore: initialize Next.js 16 project with dependencies

- Add Next.js 16.1.6, React 19.2.4, TypeScript 5.7
- Configure Tailwind CSS 4, shadcn/ui support
- Add testing tools: Jest, Cypress, React Testing Library
- Add linting: ESLint, Prettier, Husky, lint-staged
- Add utility libraries: axios, ahooks, next-themes"
```

---

## Task 3: TypeScript 配置

**Files:**

- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `src/types/index.ts`

**Step 1: 创建 tsconfig.json**

Create: `tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/types/*": ["./src/types/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/styles/*": ["./src/styles/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "cypress"]
}
```

**Step 2: 创建 next-env.d.ts**

Create: `next-env.d.ts`

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

**Step 3: 创建基础类型定义**

Create: `src/types/index.ts`

```typescript
/**
 * 全局类型定义
 */

// ==========================================
// 文章/内容类型
// ==========================================

export interface Post {
  slug: string;
  title: string;
  description: string;
  content: string;
  date: string;
  updatedAt?: string;
  tags: string[];
  published: boolean;
  coverImage?: string;
  readingTime?: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  readingTime?: string;
}

// ==========================================
// 导航/菜单类型
// ==========================================

export interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
  external?: boolean;
}

// ==========================================
// 主题类型
// ==========================================

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}

// ==========================================
// API 响应类型
// ==========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==========================================
// 表单/验证类型
// ==========================================

export interface ValidationError {
  field: string;
  message: string;
}

export type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

// ==========================================
// 通用工具类型
// ==========================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type ValueOf<T> = T[keyof T];

export interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
  noIndex?: boolean;
  canonical?: string;
}

// ==========================================
// React 组件类型
// ==========================================

import type { ReactNode } from 'react';

export interface ChildrenProps {
  children: ReactNode;
}

export interface ClassNameProps {
  className?: string;
}

export interface DefaultProps extends ChildrenProps, ClassNameProps {}
```

**Step 4: 提交**

Run:

```bash
git add tsconfig.json next-env.d.ts src/types/index.ts
git commit -m "chore: configure TypeScript with path aliases and base types"
```

---

## Task 4: Tailwind CSS 和 PostCSS 配置

**Files:**

- Create: `postcss.config.mjs`
- Create: `src/app/globals.css`
- Modify: `src/app/layout.tsx` (后续创建)

**Step 1: 创建 PostCSS 配置**

Create: `postcss.config.mjs`

```javascript
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

**Step 2: 创建全局样式**

Create: `src/app/globals.css`

```css
@import 'tailwindcss';

@theme {
  /* 颜色系统 - 浅色主题 */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(240 10% 3.9%);
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(240 10% 3.9%);
  --color-popover: hsl(0 0% 100%);
  --color-popover-foreground: hsl(240 10% 3.9%);
  --color-primary: hsl(240 5.9% 10%);
  --color-primary-foreground: hsl(0 0% 98%);
  --color-secondary: hsl(240 4.8% 95.9%);
  --color-secondary-foreground: hsl(240 5.9% 10%);
  --color-muted: hsl(240 4.8% 95.9%);
  --color-muted-foreground: hsl(240 3.8% 46.1%);
  --color-accent: hsl(240 4.8% 95.9%);
  --color-accent-foreground: hsl(240 5.9% 10%);
  --color-destructive: hsl(0 84.2% 60.2%);
  --color-destructive-foreground: hsl(0 0% 98%);
  --color-border: hsl(240 5.9% 91%);
  --color-input: hsl(240 5.9% 91%);
  --color-ring: hsl(240 5.9% 10%);

  /* 深色主题 */
  --color-dark-background: hsl(240 10% 3.9%);
  --color-dark-foreground: hsl(0 0% 98%);
  --color-dark-card: hsl(240 10% 3.9%);
  --color-dark-card-foreground: hsl(0 0% 98%);
  --color-dark-popover: hsl(240 10% 3.9%);
  --color-dark-popover-foreground: hsl(0 0% 98%);
  --color-dark-primary: hsl(0 0% 98%);
  --color-dark-primary-foreground: hsl(240 5.9% 10%);
  --color-dark-secondary: hsl(240 3.7% 15.9%);
  --color-dark-secondary-foreground: hsl(0 0% 98%);
  --color-dark-muted: hsl(240 3.7% 15.9%);
  --color-dark-muted-foreground: hsl(240 5% 64.9%);
  --color-dark-accent: hsl(240 3.7% 15.9%);
  --color-dark-accent-foreground: hsl(0 0% 98%);
  --color-dark-destructive: hsl(0 62.8% 30.6%);
  --color-dark-destructive-foreground: hsl(0 0% 98%);
  --color-dark-border: hsl(240 3.7% 15.9%);
  --color-dark-input: hsl(240 3.7% 15.9%);
  --color-dark-ring: hsl(240 4.9% 83.9%);

  /* 圆角 */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius));
  --radius-lg: calc(var(--radius) + 4px);
  --radius-xl: calc(var(--radius) + 8px);
  --radius: 0.625rem;

  /* 字体 */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;

  /* 动画 */
  --animate-in: animateIn 0.3s ease-out;
  --animate-out: animateOut 0.2s ease-in;

  @keyframes animateIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes animateOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(10px);
    }
  }
}

/* 基础样式 */
* {
  border-color: var(--color-border);
}

html {
  scroll-behavior: smooth;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  font-feature-settings:
    'rlig' 1,
    'calt' 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 选中文本 */
::selection {
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
}

/* 深色主题 */
.dark {
  --color-background: var(--color-dark-background);
  --color-foreground: var(--color-dark-foreground);
  --color-card: var(--color-dark-card);
  --color-card-foreground: var(--color-dark-card-foreground);
  --color-popover: var(--color-dark-popover);
  --color-popover-foreground: var(--color-dark-popover-foreground);
  --color-primary: var(--color-dark-primary);
  --color-primary-foreground: var(--color-dark-primary-foreground);
  --color-secondary: var(--color-dark-secondary);
  --color-secondary-foreground: var(--color-dark-secondary-foreground);
  --color-muted: var(--color-dark-muted);
  --color-muted-foreground: var(--color-dark-muted-foreground);
  --color-accent: var(--color-dark-accent);
  --color-accent-foreground: var(--color-dark-accent-foreground);
  --color-destructive: var(--color-dark-destructive);
  --color-destructive-foreground: var(--color-dark-destructive-foreground);
  --color-border: var(--color-dark-border);
  --color-input: var(--color-dark-input);
  --color-ring: var(--color-dark-ring);
}

/* 滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-muted-foreground);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-foreground);
}

/* 聚焦样式 */
:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 2px;
}

/* 工具类 */
.container-custom {
  width: 100%;
  max-width: 80rem;
  margin-left: auto;
  margin-right: auto;
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (min-width: 640px) {
  .container-custom {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .container-custom {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}

/* 动画 */
.animate-in {
  animation: animateIn 0.3s ease-out;
}

@keyframes animateIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 代码块样式（基础） */
code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background-color: var(--color-muted);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}

pre {
  background-color: var(--color-muted);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
}

pre code {
  background-color: transparent;
  padding: 0;
}
```

**Step 3: 提交**

Run:

```bash
git add postcss.config.mjs src/app/globals.css
git commit -m "chore: configure Tailwind CSS 4 with PostCSS and global styles"
```

---

## Task 5: ESLint 和 Prettier 配置

**Files:**

- Create: `eslint.config.mjs`
- Create: `.prettierrc`
- Create: `.prettierignore`

**Step 1: 创建 ESLint 配置**

Create: `eslint.config.mjs`

```javascript
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: ['node_modules/', '.next/', 'out/', 'coverage/', 'cypress/'],
  },
];

export default eslintConfig;
```

**Step 2: 创建 Prettier 配置**

Create: `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid",
  "bracketSpacing": true,
  "endOfLine": "lf",
  "jsxBracketSameLine": false,
  "jsxSingleQuote": false,
  "quoteProps": "as-needed",
  "useTabs": false,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

Create: `.prettierignore`

```gitignore
# Dependencies
node_modules
.pnp
.pnp.js

# Build outputs
.next
out
dist
build

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Coverage
coverage
.nyc_output

# Cache
.cache
.eslintcache
.parcel-cache

# Misc
.DS_Store
*.pem
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Lock files (optional, but usually better to format them)
# package-lock.json
# yarn.lock
# pnpm-lock.yaml
```

**Step 3: 提交**

Run:

```bash
git add eslint.config.mjs .prettierrc .prettierignore
git commit -m "chore: configure ESLint and Prettier with Next.js rules"
```

## Task 6: Husky 和 lint-staged 配置

**Files:**

- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `.lintstagedrc.json`
- Create: `.commitlintrc.json`

**Step 1: 初始化 Husky**

Run:

```bash
pnpm exec husky init
```

Expected: `.husky/` 目录创建，包含 `pre-commit` 文件

**Step 2: 配置 pre-commit 钩子**

Create: `.husky/pre-commit`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# 运行 lint-staged
echo "📝 Running lint-staged..."
pnpx lint-staged

# 运行 TypeScript 类型检查
echo "🔍 Running TypeScript type check..."
pnpm type-check

# 运行单元测试
echo "🧪 Running unit tests..."
pnpm test:ci

echo "✅ Pre-commit checks passed!"
```

**Step 3: 创建 commit-msg 钩子**

Create: `.husky/commit-msg`

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Checking commit message format..."

pnpx commitlint --edit "$1"
```

**Step 4: 配置 lint-staged**

Create: `.lintstagedrc.json`

```json
{
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,mdx}": ["prettier --write"],
  "*.{css,scss}": ["prettier --write"]
}
```

**Step 5: 配置 commitlint**

Create: `.commitlintrc.json`

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "test", "chore", "ci", "perf", "revert"]
    ],
    "type-case": [2, "always", "lower-case"],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100]
  }
}
```

**Step 6: 提交**

Run:

```bash
git add .husky/ .lintstagedrc.json .commitlintrc.json
git commit -m "chore: configure Husky, lint-staged and commitlint"
```

---

## Task 7: Jest 和 React Testing Library 配置

**Files:**

- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Create: `tests/unit/example.test.tsx`

**Step 1: 创建 Jest 配置**

Create: `jest.config.ts`

```typescript
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',

  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

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
    '<rootDir>src/**/*.test.{js,jsx,ts,tsx}',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/cypress/'],

  clearMocks: true,
};

export default createJestConfig(config);
```

**Step 2: 创建 Jest Setup**

Create: `jest.setup.ts`

```typescript
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
    };
  },
  usePathname() {
    return '';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

jest.mock('next-themes', () => ({
  useTheme() {
    return {
      theme: 'light',
      setTheme: jest.fn(),
    };
  },
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
```

**Step 3: 创建示例测试**

Create: `tests/unit/example.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';

describe('Example Test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('should render a div', () => {
    render(<div data-testid="test-div">Hello</div>);
    expect(screen.getByTestId('test-div')).toBeInTheDocument();
  });
});
```

**Step 4: 提交**

Run:

```bash
git add jest.config.ts jest.setup.ts tests/unit/example.test.tsx
git commit -m "chore: configure Jest and React Testing Library with 90% coverage threshold"
```

---

## Task 8: Cypress 集成测试配置

**Files:**

- Create: `cypress.config.ts`
- Create: `tests/integration/support/e2e.ts`
- Create: `tests/integration/support/commands.ts`
- Create: `tests/integration/e2e/home.cy.ts`

**Step 1: 创建 Cypress 配置**

Create: `cypress.config.ts`

```typescript
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'tests/integration/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'tests/integration/support/e2e.ts',
    fixturesFolder: 'tests/integration/fixtures',
    screenshotsFolder: 'tests/integration/screenshots',
    videosFolder: 'tests/integration/videos',
    viewportWidth: 1280,
    viewportHeight: 720,
    retries: {
      runMode: 2,
      openMode: 0,
    },
    defaultCommandTimeout: 10000,
    video: true,
    screenshotOnRunFailure: true,
    env: {
      apiUrl: 'http://localhost:3000/api',
    },
    setupNodeEvents(on, config) {
      return config;
    },
  },
});
```

**Step 2: 创建 Cypress 支持文件**

Create: `tests/integration/support/e2e.ts`

```typescript
import './commands';

declare global {
  namespace Cypress {
    interface Chainable {
      getByTestId(testId: string): Chainable<Element>;
      checkHydration(): Chainable<Element>;
    }
  }
}
```

Create: `tests/integration/support/commands.ts`

```typescript
Cypress.Commands.add('getByTestId', (testId: string) => {
  return cy.get(`[data-testid="${testId}"]`);
});

Cypress.Commands.add('checkHydration', () => {
  return cy.window().should('have.property', '__NEXT_DATA__');
});
```

**Step 3: 创建示例 E2E 测试**

Create: `tests/integration/e2e/home.cy.ts`

```typescript
describe('首页', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('应该显示页面标题', () => {
    cy.get('h1').should('be.visible');
    cy.title().should('contain', 'Next.js');
  });

  it('应该能切换主题', () => {
    cy.getByTestId('theme-toggle').click();
    cy.get('html').should('have.class', 'dark');
    cy.getByTestId('theme-toggle').click();
    cy.get('html').should('not.have.class', 'dark');
  });

  it('应该响应式布局', () => {
    cy.viewport(1280, 720);
    cy.get('header').should('be.visible');
    cy.viewport(375, 667);
    cy.get('header').should('be.visible');
  });
});
```

**Step 4: 提交**

Run:

```bash
git add cypress.config.ts tests/integration/
git commit -m "chore: configure Cypress for E2E testing"
```

---

## Task 9: shadcn/ui 初始化

**Files:**

- Create: `components.json`
- Execute: `pnpm dlx shadcn@latest init`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`

**Step 1: 创建 components.json**

Create: `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

**Step 2: 创建工具函数**

Create: `src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

**Step 3: 创建 Button 组件**

Create: `src/components/ui/button.tsx`

```typescript
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

**Step 4: 提交**

Run:

```bash
git add components.json src/lib/utils.ts src/components/ui/button.tsx
git commit -m "chore: initialize shadcn/ui with Button component"
```

---

## Task 10: 环境变量配置

**Files:**

- Create: `.env.example`
- Create: `src/lib/env.ts`

**Step 1: 创建环境变量示例文件**

Create: `.env.example`

```env
# 应用配置
NEXT_PUBLIC_APP_NAME="Next.js 16 SSR Template"
NEXT_PUBLIC_APP_DESCRIPTION="A modern Next.js 16 SSR template for content websites"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# API 配置
NEXT_PUBLIC_API_BASE_URL="/api"
API_TIMEOUT=10000

# 主题配置
NEXT_PUBLIC_DEFAULT_THEME="light"
NEXT_PUBLIC_ENABLE_THEME_SWITCHER="true"

# 分析和监控
NEXT_PUBLIC_ENABLE_ANALYTICS="false"
NEXT_PUBLIC_GA_TRACKING_ID=""

# 性能优化
NEXT_PUBLIC_ENABLE_IMAGE_OPTIMIZATION="true"
NEXT_PUBLIC_ENABLE_CACHE="true"

# 开发配置
NEXT_PUBLIC_ENABLE_DEBUG="false"
```

**Step 2: 创建环境变量类型和验证**

Create: `src/lib/env.ts`

```typescript
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

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:', error.issues);
  } else {
    console.error('❌ Failed to parse environment variables:', error);
  }

  // 使用默认值
  env = envSchema.parse({});
}

export { env };
```

**Step 3: 提交**

Run:

```bash
git add .env.example src/lib/env.ts
git commit -m "chore: add environment variable configuration with validation"
```

---

## Task 11: 核心布局组件

**Files:**

- Create: `src/components/layout/ThemeProvider.tsx`
- Create: `src/components/layout/ThemeToggle.tsx`
- Create: `src/components/layout/Header.tsx`
- Create: `src/components/layout/Footer.tsx`
- Create: `src/app/layout.tsx`

**Step 1: 创建主题提供者**

Create: `src/components/layout/ThemeProvider.tsx`

```typescript
'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from '@/types';

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  enableSystem = true,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={disableTransitionOnChange}
    >
      {children}
    </NextThemesProvider>
  );
}
```

**Step 2: 创建主题切换组件**

Create: `src/components/layout/ThemeToggle.tsx`

```typescript
'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      data-testid="theme-toggle"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

**Step 3: 创建头部组件**

Create: `src/components/layout/Header.tsx`

```typescript
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { Button } from '@/components/ui/button';

export function Header() {
  const navItems = [
    { label: '首页', href: '/' },
    { label: '文章', href: '/posts' },
    { label: '关于', href: '/about' },
    { label: '联系方式', href: '/contact' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container-custom flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <span className="text-sm">N</span>
            </div>
            <span>Next.js SSR</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Button size="sm" className="hidden md:inline-flex">
            订阅
          </Button>
        </div>
      </div>
    </header>
  );
}
```

**Step 4: 创建底部组件**

Create: `src/components/layout/Footer.tsx`

```typescript
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container-custom py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Next.js SSR Template</h3>
            <p className="text-sm text-muted-foreground">
              A modern Next.js 16 SSR template for content websites with the latest web technologies.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">导航</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/" className="hover:text-primary">首页</Link></li>
              <li><Link href="/posts" className="hover:text-primary">文章</Link></li>
              <li><Link href="/about" className="hover:text-primary">关于</Link></li>
              <li><Link href="/contact" className="hover:text-primary">联系方式</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">资源</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/docs" className="hover:text-primary">文档</Link></li>
              <li><Link href="/api" className="hover:text-primary">API</Link></li>
              <li><Link href="/blog" className="hover:text-primary">博客</Link></li>
              <li><Link href="/github" className="hover:text-primary">GitHub</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">联系方式</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>邮箱: info@example.com</li>
              <li>电话: +1 234 567 8900</li>
              <li>地址: 123 Main St, City</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Next.js SSR Template. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
```

**Step 5: 创建根布局**

Create: `src/app/layout.tsx`

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { env } from '@/lib/env';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: env.NEXT_PUBLIC_APP_NAME,
    template: '%s | Next.js SSR Template',
  },
  description: env.NEXT_PUBLIC_APP_DESCRIPTION,
  keywords: ['Next.js', 'SSR', 'React', 'TypeScript', 'Tailwind CSS'],
  authors: [{ name: 'Your Name' }],
  creator: 'Your Name',
  publisher: 'Your Name',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: env.NEXT_PUBLIC_APP_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          defaultTheme={env.NEXT_PUBLIC_DEFAULT_THEME as 'light' | 'dark' | 'system'}
          enableSystem={true}
        >
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 container-custom py-8">
              {children}
            </main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Step 6: 提交**

Run:

```bash
git add src/components/layout src/app/layout.tsx
git commit -m "feat: add core layout components (ThemeProvider, ThemeToggle, Header, Footer)"
```

---

## Task 12: 基础页面

**Files:**

- Create: `src/app/page.tsx` (首页)
- Create: `src/app/not-found.tsx` (404 页面)
- Create: `src/app/error.tsx` (错误页面)
- Create: `src/app/loading.tsx` (加载页面)
- Create: `src/app/global-error.tsx` (全局错误页面)

**Step 1: 创建首页**

Create: `src/app/page.tsx`

```typescript
import { Button } from '@/components/ui/button';
import { ArrowRight, Code, Layout, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero 区域 */}
      <section className="text-center space-y-8 py-12 md:py-24">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
          全新 Next.js 16 SSR 模板
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            构建现代内容网站的<br />
            <span className="text-primary">完美起点</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            一个完整的 Next.js 16 SSR 模板，包含最新技术栈、代码规范、测试配置和工程化配置。
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="gap-2">
            开始使用
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline">
            查看文档
          </Button>
        </div>
      </section>

      {/* 功能特性 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-6 rounded-xl border bg-card">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
            <Layout className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">响应式设计</h3>
          <p className="text-muted-foreground">
            使用 Tailwind CSS 4 构建的完全响应式布局，在所有设备上都能提供出色的用户体验。
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">极致性能</h3>
          <p className="text-muted-foreground">
            服务端渲染架构，支持增量静态生成，提供最佳的页面加载速度和 SEO 优化。
          </p>
        </div>

        <div className="p-6 rounded-xl border bg-card">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
            <Code className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">现代技术栈</h3>
          <p className="text-muted-foreground">
            使用 Next.js 16、React 19、TypeScript 5.7 和 shadcn/ui 3.8 构建，遵循最佳实践。
          </p>
        </div>
      </section>

      {/* 技术栈 */}
      <section className="py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">技术栈</h2>
          <p className="text-muted-foreground">使用最新和最稳定的技术构建</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {[
            'Next.js 16',
            'React 19',
            'TypeScript 5.7',
            'Tailwind CSS 4',
            'shadcn/ui 3.8',
            'Jest',
            'Cypress',
            'ESLint',
            'Prettier',
            'Husky',
          ].map((tech) => (
            <div
              key={tech}
              className="p-4 rounded-lg border bg-card text-center font-medium"
            >
              {tech}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: 创建 404 页面**

Create: `src/app/not-found.tsx`

```typescript
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <div className="space-y-2">
        <h1 className="text-9xl font-bold text-primary/10">404</h1>
        <h2 className="text-2xl font-semibold">页面未找到</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          抱歉，您访问的页面不存在或已被移动。
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button size="lg" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Button>
        <Button size="lg" variant="outline">
          查看文章
        </Button>
      </div>
    </div>
  );
}
```

**Step 3: 创建错误页面**

Create: `src/app/error.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <AlertCircle className="h-16 w-16 text-destructive" />

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">发生错误</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          抱歉，页面加载时发生了错误。请尝试刷新页面或联系支持团队。
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Button size="lg" onClick={reset}>
          重试
        </Button>
        <Button size="lg" variant="outline" onClick={() => window.location.href = '/'}>
          返回首页
        </Button>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 rounded-lg bg-muted text-left w-full max-w-md">
          <h3 className="font-semibold mb-2">错误信息:</h3>
          <pre className="text-sm text-muted-foreground">{error.message}</pre>
        </div>
      )}
    </div>
  );
}
```

**Step 4: 创建加载页面**

Create: `src/app/loading.tsx`

```typescript
import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">加载中...</p>
    </div>
  );
}
```

**Step 5: 创建全局错误页面**

Create: `src/app/global-error.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-background text-foreground">
        <div className="flex flex-col items-center justify-center min-h-screen text-center space-y-6 p-4">
          <AlertCircle className="h-16 w-16 text-destructive" />

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">应用程序错误</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              抱歉，应用程序发生了严重错误。请尝试刷新页面或联系支持团队。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" onClick={reset}>
              重试
            </Button>
            <Button size="lg" variant="outline" onClick={() => window.location.href = '/'}>
              返回首页
            </Button>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 rounded-lg bg-muted text-left w-full max-w-md">
              <h3 className="font-semibold mb-2">错误信息:</h3>
              <pre className="text-sm text-muted-foreground">{error.message}</pre>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
```

**Step 6: 提交**

Run:

```bash
git add src/app/page.tsx src/app/not-found.tsx src/app/error.tsx src/app/loading.tsx src/app/global-error.tsx
git commit -m "feat: add basic pages (Home, NotFound, Error, Loading)"
```

---

## Task 13: 工具函数和 Hooks

**Files:**

- Create: `src/hooks/useTheme.ts`
- Create: `src/hooks/useLocalStorage.ts`
- Create: `src/hooks/useDebounce.ts`
- Create: `src/hooks/useIntersectionObserver.ts`
- Create: `src/lib/fetch.ts`
- Create: `src/lib/date.ts`
- Create: `src/lib/string.ts`

**Step 1: 创建主题 Hook**

Create: `src/hooks/useTheme.ts`

```typescript
import { useTheme as useNextTheme } from 'next-themes';
import type { Theme } from '@/types';

export function useTheme() {
  const { theme, setTheme } = useNextTheme();

  const toggleTheme = () => {
    setTheme((prev: string) => (prev === 'light' ? 'dark' : 'light'));
  };

  const isDark = theme === 'dark';
  const isLight = theme === 'light';
  const isSystem = theme === 'system';

  return {
    theme: theme as Theme,
    setTheme: (newTheme: Theme) => setTheme(newTheme),
    toggleTheme,
    isDark,
    isLight,
    isSystem,
  };
}
```

**Step 2: 创建本地存储 Hook**

Create: `src/hooks/useLocalStorage.ts`

```typescript
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      if (typeof window !== 'undefined') {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
      }
      return initialValue;
    } catch (error) {
      console.error('Error loading local storage item:', error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error('Error setting local storage item:', error);
    }
  };

  return [storedValue, setValue] as const;
}
```

**Step 3: 创建防抖 Hook**

Create: `src/hooks/useDebounce.ts`

```typescript
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

**Step 4: 创建交集观察器 Hook**

Create: `src/hooks/useIntersectionObserver.ts`

```typescript
import { useEffect, useRef, useState } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  root?: Element | null;
  rootMargin?: string;
}

export function useIntersectionObserver(options: UseIntersectionObserverOptions = {}) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const ref = useRef<Element | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
        setEntry(entry);
      },
      {
        threshold: options.threshold ?? 0,
        root: options.root ?? null,
        rootMargin: options.rootMargin ?? '0px',
      },
    );

    const currentRef = ref.current;

    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [options.threshold, options.root, options.rootMargin]);

  return { ref, isIntersecting, entry };
}
```

**Step 5: 创建通用请求函数**

Create: `src/lib/fetch.ts`

```typescript
import axios from 'axios';
import { env } from '@/lib/env';

const apiClient = axios.create({
  baseURL: env.NEXT_PUBLIC_API_BASE_URL,
  timeout: env.API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (env.NEXT_PUBLIC_ENABLE_DEBUG) {
      console.debug('API Request:', config);
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    if (env.NEXT_PUBLIC_ENABLE_DEBUG) {
      console.debug('API Response:', response);
    }
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    return Promise.reject(error);
  },
);

export async function fetcher<T = any>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await apiClient.get(url, {
      headers: options?.headers,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || error.message);
  }
}

export async function post<T = any>(url: string, data?: any, options?: RequestInit): Promise<T> {
  try {
    const response = await apiClient.post(url, data, {
      headers: options?.headers,
    });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || error.message);
  }
}

export { apiClient };
```

**Step 6: 创建日期工具函数**

Create: `src/lib/date.ts`

```typescript
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatRelativeDate(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  } else if (diff < week) {
    return `${Math.floor(diff / day)} 天前`;
  } else if (diff < month) {
    return `${Math.floor(diff / week)} 周前`;
  } else if (diff < year) {
    return `${Math.floor(diff / month)} 个月前`;
  } else {
    return `${Math.floor(diff / year)} 年前`;
  }
}

export function formatDateForSEO(date: Date | string): string {
  return new Date(date).toISOString().split('T')[0];
}

export function getReadingTime(text: string): string {
  const wordsPerMinute = 200;
  const wordCount = text.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return `${minutes} 分钟阅读`;
}
```

**Step 7: 创建字符串工具函数**

Create: `src/lib/string.ts`

```typescript
export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"]/g, (m) => map[m]);
}

export function generateRandomString(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```

**Step 8: 提交**

Run:

```bash
git add src/hooks src/lib/fetch.ts src/lib/date.ts src/lib/string.ts
git commit -m "chore: add utility functions and custom hooks"
```

---

## Task 14: 最终测试和验证

**Files:**

- Create: `tests/unit/components/Header.test.tsx`
- Create: `tests/unit/components/ThemeToggle.test.tsx`
- Create: `tests/unit/pages/Home.test.tsx`
- Create: `tests/integration/e2e/layout.cy.ts`
- Execute: `pnpm test`
- Execute: `pnpm build`

**Step 1: 创建组件测试**

Create: `tests/unit/components/Header.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { Header } from '@/components/layout/Header';

describe('Header', () => {
  it('应该显示 Logo 和标题', () => {
    render(<Header />);
    expect(screen.getByText(/Next\.js SSR/)).toBeInTheDocument();
  });

  it('应该显示导航链接', () => {
    render(<Header />);
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('文章')).toBeInTheDocument();
    expect(screen.getByText('关于')).toBeInTheDocument();
    expect(screen.getByText('联系方式')).toBeInTheDocument();
  });

  it('应该包含主题切换按钮', () => {
    render(<Header />);
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
  });
});
```

**Step 2: 创建主题切换组件测试**

Create: `tests/unit/components/ThemeToggle.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

describe('ThemeToggle', () => {
  it('应该渲染主题切换按钮', () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
  });

  it('应该点击时切换主题', () => {
    render(<ThemeToggle />);
    const button = screen.getByLabelText('Toggle theme');

    fireEvent.click(button);

    expect(button).toBeInTheDocument();
  });
});
```

**Step 3: 创建首页测试**

Create: `tests/unit/pages/Home.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  it('应该显示页面标题', () => {
    render(<Home />);
    expect(screen.getByText(/构建现代内容网站的/)).toBeInTheDocument();
  });

  it('应该显示功能特性', () => {
    render(<Home />);
    expect(screen.getByText('响应式设计')).toBeInTheDocument();
    expect(screen.getByText('极致性能')).toBeInTheDocument();
    expect(screen.getByText('现代技术栈')).toBeInTheDocument();
  });

  it('应该显示技术栈', () => {
    render(<Home />);
    expect(screen.getByText('Next.js 16')).toBeInTheDocument();
    expect(screen.getByText('React 19')).toBeInTheDocument();
    expect(screen.getByText('TypeScript 5.7')).toBeInTheDocument();
    expect(screen.getByText('Tailwind CSS 4')).toBeInTheDocument();
  });
});
```

**Step 4: 创建布局集成测试**

Create: `tests/integration/e2e/layout.cy.ts`

```typescript
describe('布局', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('应该显示头部导航', () => {
    cy.get('header').should('be.visible');
    cy.contains('Next.js SSR').should('be.visible');
  });

  it('应该显示导航菜单', () => {
    cy.contains('首页').should('be.visible');
    cy.contains('文章').should('be.visible');
    cy.contains('关于').should('be.visible');
    cy.contains('联系方式').should('be.visible');
  });

  it('应该显示页脚', () => {
    cy.get('footer').should('be.visible');
    cy.contains('Next.js SSR Template').should('be.visible');
  });

  it('应该正确加载字体', () => {
    cy.get('body').should('have.css', 'font-family').and('include', 'Inter');
  });
});
```

**Step 5: 运行完整测试套件**

Run:

```bash
# 运行单元测试
pnpm test

# 运行 ESLint 和 Prettier
pnpm lint
pnpm format:check

# 运行 TypeScript 类型检查
pnpm type-check

# 运行构建
pnpm build
```

**Step 6: 启动开发服务器验证**

Run:

```bash
pnpm dev
```

Expected: 服务器在 http://localhost:3000 启动成功

**Step 7: 提交**

Run:

```bash
git add tests/unit/components/Header.test.tsx tests/unit/components/ThemeToggle.test.tsx tests/unit/pages/Home.test.tsx tests/integration/e2e/layout.cy.ts
git commit -m "test: add comprehensive tests for components and pages"
```

---
