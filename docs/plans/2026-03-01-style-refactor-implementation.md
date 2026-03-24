# 样式重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全面重构项目的样式系统，解决当前样式问题，建立现代化、可维护的样式架构。

**Architecture:** 使用完整的语义化样式系统，结合 Tailwind CSS 4 和 HeroUI (@heroui/react)，实现深色/浅色主题切换和响应式设计。

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 4, HeroUI (@heroui/react)

---

## 任务 1: 更新全局样式配置

**Files:**

- Modify: `src/app/globals.css`

**Step 1: 替换全局样式内容**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
}

.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 224.3 76.3% 48%;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* HeroUI 组件样式优化 */
@layer utilities {
  .hero-ui-card {
    @apply bg-card text-card-foreground rounded-lg border shadow-sm;
  }
}
```

**Step 2: 提交更改**

```bash
git add src/app/globals.css
git commit -m "refactor: 更新全局样式配置，添加完整的主题色值"
```

---

## 任务 2: 优化 Tailwind 配置

**Files:**

- Modify: `tailwind.config.ts`

**Step 1: 更新 Tailwind 配置**

```typescript
import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/theme';

const config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}', './node_modules/@heroui/theme/dist/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [heroui()],
} satisfies Config;

export default config;
```

**Step 2: 提交更改**

```bash
git add tailwind.config.ts
git commit -m "refactor: 优化 Tailwind 配置，添加完整的主题颜色定义"
```

---

## 任务 3: 优化组件导出配置

**Files:**

- Modify: `src/components/ui/index.ts`

**Step 1: 更新组件导出配置**

```typescript
export { Button } from '@heroui/button';
export { Card, CardBody, CardFooter, CardHeader } from '@heroui/card';
export { Input, Textarea } from '@heroui/input';
export { Checkbox } from '@heroui/checkbox';
export { Radio, RadioGroup } from '@heroui/radio';
export { Switch } from '@heroui/switch';
export { Divider } from '@heroui/divider';
export { Chip } from '@heroui/chip';
export { Tabs, Tab } from '@heroui/tabs';
export { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/modal';
```

**Step 2: 提交更改**

```bash
git add src/components/ui/index.ts
git commit -m "refactor: 优化 HeroUI 组件导出配置"
```

---

## 任务 4: 优化主题切换组件

**Files:**

- Modify: `src/components/ui/theme-toggle.tsx`

**Step 1: 更新主题切换组件**

```typescript
"use client";

import { Switch } from "@heroui/switch";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(theme === "dark");
  }, [theme]);

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <Switch
      checked={isDark}
      onChange={handleToggle}
      size="sm"
      aria-label="切换主题"
    />
  );
}
```

**Step 2: 提交更改**

```bash
git add src/components/ui/theme-toggle.tsx
git commit -m "refactor: 优化主题切换组件的用户体验"
```

---

## 任务 5: 优化页面布局组件

**Files:**

- Modify: `src/app/layout.tsx`

**Step 1: 更新页面布局**

```typescript
import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { HeroUIProvider } from '@heroui/system';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Next.js 16 SSR 模板',
  description: '生产就绪的 Next.js 16 SSR 模板',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="bg-background min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HeroUIProvider>
            <Navbar />
            <main className="container mx-auto px-4 pt-24 sm:pt-32">{children}</main>
            <footer className="bg-background border-t py-12">
              <div className="text-muted-foreground container mx-auto px-4 text-center text-sm">
                <p>© 2026 Next.js 16 SSR Template. All rights reserved.</p>
              </div>
            </footer>
          </HeroUIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Step 2: 提交更改**

```bash
git add src/app/layout.tsx
git commit -m "refactor: 优化页面布局，使用新的样式系统"
```

---

## 任务 6: 优化首页组件

**Files:**

- Modify: `src/app/page.tsx`

**Step 1: 更新首页组件**

```typescript
import { Button, Card, CardBody, CardHeader } from '@/components/ui';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-20 sm:py-28 lg:py-36">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl leading-tight font-bold tracking-tight sm:text-5xl lg:text-6xl">
              构建<span className="text-primary">现代化</span>Web 应用
            </h1>

            <p className="text-muted-foreground mx-auto mb-10 max-w-2xl text-lg leading-relaxed sm:text-xl">
              一个生产就绪的 Next.js 16 SSR
              模板，集成完整的技术栈和工程化配置，让您快速启动高质量项目
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button color="primary" size="lg">
                快速开始
                <span className="ml-2">→</span>
              </Button>
              <Button variant="bordered" size="lg">
                查看文档
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mb-20 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">强大的功能特性</h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
              集成现代 Web 开发最佳实践，提供完整的开发、测试和部署流程
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: '极速开发',
                description: '使用 Next.js 16 App Router 和 Turbopack，体验闪电般的开发速度',
                features: ['App Router 架构', 'Turbopack 加速', '热重载支持', '快速刷新'],
              },
              {
                title: '完整技术栈',
                description: '集成 React 19、TypeScript 5.7 和 Tailwind CSS 4，构建高质量应用',
                features: ['React 19', 'TypeScript 5.7', 'Tailwind CSS 4', 'HeroUI'],
              },
              {
                title: '精美设计',
                description: '支持深色/浅色主题切换，响应式设计适配所有设备',
                features: ['主题切换', '响应式布局', '视觉优化', '动画效果'],
              },
              {
                title: '代码规范',
                description: '完整的代码质量保证体系，确保代码风格一致',
                features: ['ESLint 9', 'Prettier', 'Husky', 'Commitlint'],
              },
              {
                title: '工程化配置',
                description: '生产就绪的配置，包含测试、构建和部署流程',
                features: ['Jest 测试', 'Cypress E2E', 'CI/CD 配置', '性能优化'],
              },
              {
                title: '版本控制',
                description: '完整的 Git 工作流程，确保团队协作高效',
                features: ['提交规范', '分支管理', '代码评审', '自动化检查'],
              },
            ].map((feature, index) => (
              <Card key={index} className="group transition-all duration-300 hover:shadow-md">
                <CardHeader className="pb-4">
                  <div className="bg-primary/10 group-hover:bg-primary/20 mb-4 inline-flex rounded-lg p-3 transition-colors">
                    <span className="text-primary text-2xl font-bold">✦</span>
                  </div>
                  <h3 className="text-lg font-bold">{feature.title}</h3>
                  <p className="text-sm text-gray-500">{feature.description}</p>
                </CardHeader>
                <CardBody>
                  <ul className="space-y-2">
                    {feature.features.map((item, i) => (
                      <li key={i} className="text-muted-foreground flex items-center text-sm">
                        <span className="text-primary mr-2">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples Section */}
      <section className="bg-gray-50 py-24">
        <div className="container mx-auto px-4">
          <div className="mb-20 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">快速开始</h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
              简单几步，即可开始开发您的应用
            </p>
          </div>

          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="space-y-8">
              {[
                { title: '安装依赖', code: 'pnpm install' },
                { title: '启动开发服务器', code: 'pnpm dev' },
                { title: '构建生产版本', code: 'pnpm build' },
              ].map((step, index) => (
                <div
                  key={index}
                  className="rounded-lg border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-primary text-xl">⚡</span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                  <div className="overflow-x-auto rounded-lg bg-gray-100 p-3 font-mono text-sm">
                    <code>{step.code}</code>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-primary text-2xl">📁</span>
                <h3 className="text-xl font-semibold">项目架构</h3>
              </div>

              <div className="space-y-3">
                {[
                  { name: 'App Router', description: '现代化路由系统' },
                  { name: 'Server Components', description: '服务端组件' },
                  { name: 'TypeScript', description: '类型安全' },
                  { name: 'Tailwind CSS', description: '响应式设计' },
                  { name: 'HeroUI', description: '精美组件' },
                  { name: 'Jest + Cypress', description: '完整测试' },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-sm text-gray-500">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl">准备好开始了吗？</h2>
            <p className="text-muted-foreground mx-auto mb-10 max-w-2xl text-lg">
              立即使用这个强大的 Next.js 16 模板，构建您的下一个项目
            </p>
            <Button color="primary" size="lg">
              下载模板
              <span className="ml-2">→</span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: 提交更改**

```bash
git add src/app/page.tsx
git commit -m "refactor: 优化首页组件，使用新的样式系统"
```

---

## 任务 7: 优化导航栏组件

**Files:**

- Modify: `src/components/navbar.tsx`

**Step 1: 更新导航栏组件**

```typescript
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Github } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navigation = [
    { name: "首页", href: "/" },
    { name: "关于", href: "/about" },
    { name: "服务", href: "/services" },
    { name: "博客", href: "/blog" },
    { name: "联系", href: "/contact" },
  ];

  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-50 border-b transition-all duration-300 ${
        isScrolled
          ? "border-gray-200 bg-white/70 py-2 backdrop-blur-lg dark:border-gray-800 dark:bg-gray-900/70"
          : "border-transparent bg-white/80 py-3 backdrop-blur-lg dark:bg-gray-900/80"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500 text-white">
              <span className="text-sm font-bold">N</span>
            </div>
            <span className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">
              Next.js 16
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center space-x-5 md:flex">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm font-medium text-gray-700 transition-all hover:scale-105 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400"
              >
                {item.name}
              </Link>
            ))}
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-800" />
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 transition-all hover:scale-105 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400"
            >
              <Github className="h-5 w-5" />
            </Link>
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <ThemeToggle />
            <Button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              size="sm"
              variant="light"
              className="ml-2"
              aria-label="菜单"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="animate-in slide-in-from-top-10 border-b border-gray-200 bg-white/90 backdrop-blur-lg duration-300 md:hidden dark:border-gray-800 dark:bg-gray-900/90">
          <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block rounded-md px-4 py-3 text-base font-medium text-gray-700 transition-all hover:scale-105 hover:bg-gray-50 hover:text-blue-500 dark:text-gray-200 dark:hover:bg-gray-800 dark:hover:text-blue-400"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="my-2 border-t border-gray-200 dark:border-gray-800" />
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-4 py-3 text-gray-600 transition-all hover:scale-105 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400"
              onClick={() => setIsMenuOpen(false)}
            >
              <Github className="mr-2 h-5 w-5" />
              GitHub
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
```

**Step 2: 提交更改**

```bash
git add src/components/navbar.tsx
git commit -m "refactor: 优化导航栏组件，使用新的样式系统"
```

---

## 任务 7: 测试验证

**Files:**

- Run tests: `src/**/*.test.tsx` and `tests/**/*.test.tsx`

**Step 1: 运行类型检查**

```bash
pnpm type-check
```

**Step 2: 构建项目**

```bash
pnpm build
```

**Step 3: 运行所有测试**

```bash
pnpm test
```

**Step 4: 启动开发服务器验证**

```bash
pnpm dev
```

**Step 5: 打开浏览器验证**

访问 `http://localhost:3001` 查看效果，确保：

- HeroUI 组件正常渲染
- 深色/浅色主题切换正常
- 响应式设计正常工作
- 所有链接可点击

---

## 任务 8: 完成重构

**Files:**

**Step 1: 提交最终更改**

```bash
git add .
git commit -m "refactor: 完成样式重构，使用新的样式系统"
```

**Step 2: 验证重构后的项目**

```bash
pnpm build
```

**Step 3: 检查构建产物**

```bash
ls -la .next/
```

---

## 预期效果

1. **HeroUI 组件正常渲染**：所有 HeroUI 组件将正确显示其预期的样式。
2. **主题切换功能正常**：深色/浅色主题切换功能将正常工作。
3. **响应式设计优化**：页面在不同设备上的显示效果将得到改善。
4. **视觉效果提升**：整体设计将更加美观和现代化。

## 风险评估

1. **兼容性问题**：Tailwind CSS 4 和 HeroUI 之间可能存在兼容性问题，需要测试验证。
2. **测试覆盖率**：重构可能会影响现有测试的覆盖率，需要更新相关测试。
3. **代码改动量**：重构需要修改大量代码，需要仔细审查和测试。

---

## 后续优化建议

1. **组件文档**：为 HeroUI 组件添加详细的使用文档。
2. **性能优化**：根据需要添加组件懒加载。
3. **辅助功能**：确保所有 HeroUI 组件符合可访问性标准。
