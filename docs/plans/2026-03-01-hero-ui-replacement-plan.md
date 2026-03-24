# 将 shadcn/ui 替换为 HeroUI (@heroui/react) 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将项目中的 shadcn/ui 组件库完全替换为 HeroUI (@heroui/react) 官方 npm 包，删除所有 shadcn/ui 的关联代码，同时保留项目的整体架构和功能。

**Architecture:** 使用 HeroUI 官方 npm 包替换所有 shadcn/ui 组件，保持项目架构不变，调整样式以匹配 HeroUI 设计风格，保留主题切换功能。

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 4, HeroUI (@heroui/react)

---

## 准备工作

### Task 1: 检查当前项目状态

**Files:**

- 根目录: `package.json`, `tsconfig.json`, `tailwind.config.ts`

**Step 1: 检查当前项目状态**

```bash
cd /Users/xxwade/mine/claude-code-projects/frontend-template
git status
```

**Step 2: 备份当前项目**

```bash
cp -r /Users/xxwade/mine/claude-code-projects/frontend-template /Users/xxwade/mine/claude-code-projects/frontend-template.backup
```

**Step 3: 提交备份信息**

```bash
git add .
git commit -m "backup: 替换 shadcn/ui 前的备份"
```

---

## 依赖更新

### Task 2: 安装 HeroUI 依赖

**Files:**

- `package.json`

**Step 1: 安装 HeroUI 官方依赖**

```bash
pnpm add @heroui/react @heroui/system @heroui/theme framer-motion
```

**Step 2: 删除 shadcn/ui 相关依赖**

**Step 3: 更新 package.json**

```json
{
  "dependencies": {
    "@heroui/react": "^2.6.11",
    "@heroui/system": "^2.4.10",
    "@heroui/theme": "^2.4.7",
    "framer-motion": "^12.3.17"
    // 保持其他依赖
  },
  "devDependencies": {
    // 保持现有 devDependencies
  }
}
```

**Step 4: 安装依赖**

```bash
pnpm install
```

**Step 5: 提交依赖更新**

```bash
git add package.json pnpm-lock.yaml
git commit -m "refactor: 更新依赖，安装 HeroUI 并删除 shadcn/ui 相关依赖"
```

---

## 配置调整

### Task 3: 配置 HeroUI

**Files:**

- `tailwind.config.ts`
- `src/app/layout.tsx`

**Step 1: 更新 Tailwind 配置**

```typescript
import type { Config } from 'tailwindcss';
import { heroui } from '@heroui/theme';

const config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx,ts,tsx}', './node_modules/@heroui/theme/dist/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [heroui()],
} satisfies Config;

export default config;
```

**Step 2: 更新布局文件**

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { HeroUIProvider } from "@heroui/system";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Next.js 16 SSR 模板",
  description: "生产就绪的 Next.js 16 SSR 模板",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HeroUIProvider>
            <Navbar />
            <main className="container mx-auto px-4 pt-24 sm:pt-32">
              {children}
            </main>
          </HeroUIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Step 3: 提交配置更新**

```bash
git add tailwind.config.ts src/app/layout.tsx
git commit -m "refactor: 配置 HeroUI 主题系统"
```

---

## 组件替换

### Task 4: 替换 UI 组件目录

**Files:**

- 删除: `src/components/ui/`
- 创建: `src/components/ui/` 新目录

**Step 1: 删除 shadcn/ui 组件目录**

```bash
rm -rf /Users/xxwade/mine/claude-code-projects/frontend-template/src/components/ui
mkdir -p /Users/xxwade/mine/claude-code-projects/frontend-template/src/components/ui
```

**Step 2: 创建 HeroUI 组件导出文件**

```typescript
// src/components/ui/index.ts
export { Button } from '@heroui/react';
export { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@heroui/react';
export { Input } from '@heroui/react';
export { Textarea } from '@heroui/react';
export { Checkbox } from '@heroui/react';
export { Radio, RadioGroup } from '@heroui/react';
export { Switch } from '@heroui/react';
export { Label } from '@heroui/react';
export { Divider } from '@heroui/react';
export { Chip } from '@heroui/react';
export { Tabs, Tab, TabList, TabPanel, TabPanels } from '@heroui/react';
export { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
```

**Step 3: 创建主题切换组件**

```typescript
// src/components/ui/theme-toggle.tsx
"use client";

import { Switch } from "@heroui/react";
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

**Step 4: 提交组件目录更新**

```bash
git add src/components/ui/
git commit -m "refactor: 替换 UI 组件目录为 HeroUI"
```

---

## 页面和组件更新

### Task 5: 更新首页使用 HeroUI 组件

**Files:**

- `src/app/page.tsx`

**Step 1: 更新首页组件**

```typescript
import { Button, Card, CardBody, CardHeader, Chip, Divider } from "@/components/ui";

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
                title: "极速开发",
                description: "使用 Next.js 16 App Router 和 Turbopack，体验闪电般的开发速度",
                features: ["App Router 架构", "Turbopack 加速", "热重载支持", "快速刷新"],
              },
              {
                title: "完整技术栈",
                description: "集成 React 19、TypeScript 5.7 和 Tailwind CSS 4，构建高质量应用",
                features: ["React 19", "TypeScript 5.7", "Tailwind CSS 4", "HeroUI"],
              },
              {
                title: "精美设计",
                description: "支持深色/浅色主题切换，响应式设计适配所有设备",
                features: ["主题切换", "响应式布局", "视觉优化", "动画效果"],
              },
              {
                title: "代码规范",
                description: "完整的代码质量保证体系，确保代码风格一致",
                features: ["ESLint 9", "Prettier", "Husky", "Commitlint"],
              },
              {
                title: "工程化配置",
                description: "生产就绪的配置，包含测试、构建和部署流程",
                features: ["Jest 测试", "Cypress E2E", "CI/CD 配置", "性能优化"],
              },
              {
                title: "版本控制",
                description: "完整的 Git 工作流程，确保团队协作高效",
                features: ["提交规范", "分支管理", "代码评审", "自动化检查"],
              },
            ].map((feature, index) => (
              <Card key={index} className="group transition-all duration-300 hover:shadow-md">
                <CardHeader className="pb-4">
                  <div className="bg-primary/10 group-hover:bg-primary/20 mb-4 inline-flex rounded-lg p-3 transition-colors">
                    <span className="text-primary text-2xl font-bold">✦</span>
                  </div>
                  <h3 className="text-lg font-bold">{feature.title}</h3>
                  <p className="text-gray-500 text-sm">{feature.description}</p>
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
                { title: "安装依赖", code: "pnpm install" },
                { title: "启动开发服务器", code: "pnpm dev" },
                { title: "构建生产版本", code: "pnpm build" },
              ].map((step, index) => (
                <div
                  key={index}
                  className="bg-white rounded-lg border p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-primary text-xl">⚡</span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                  <div className="bg-gray-100 overflow-x-auto rounded-lg p-3 font-mono text-sm">
                    <code>{step.code}</code>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg border p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-primary text-2xl">📁</span>
                <h3 className="text-xl font-semibold">项目架构</h3>
              </div>

              <div className="space-y-3">
                {[
                  { name: "App Router", description: "现代化路由系统" },
                  { name: "Server Components", description: "服务端组件" },
                  { name: "TypeScript", description: "类型安全" },
                  { name: "Tailwind CSS", description: "响应式设计" },
                  { name: "HeroUI", description: "精美组件" },
                  { name: "Jest + Cypress", description: "完整测试" },
                ].map((item, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 hover:bg-gray-100 flex items-center justify-between rounded-lg p-3 transition-colors"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-gray-500 text-sm">{item.description}</span>
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

**Step 2: 提交首页更新**

```bash
git add src/app/page.tsx
git commit -m "refactor: 更新首页使用 HeroUI 组件"
```

---

## 导航栏组件更新

### Task 6: 更新导航栏组件

**Files:**

- `src/components/navbar.tsx`

**Step 1: 更新导航栏使用 HeroUI 组件**

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

**Step 2: 提交导航栏更新**

```bash
git add src/components/navbar.tsx
git commit -m "refactor: 更新导航栏使用 HeroUI 组件"
```

---

## 样式和主题调整

### Task 7: 更新全局样式

**Files:**

- `src/app/globals.css`

**Step 1: 更新 Tailwind 配置**

**Step 2: 更新全局样式**

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

**Step 3: 提交样式更新**

```bash
git add src/app/globals.css
git commit -m "refactor: 更新全局样式以匹配 HeroUI 设计"
```

---

## 测试更新

### Task 8: 更新组件测试

**Files:**

- 删除: `src/components/ui/*.test.tsx`
- 创建: 新的 HeroUI 组件测试

**Step 1: 删除旧的测试文件**

```bash
rm -f /Users/xxwade/mine/claude-code-projects/frontend-template/src/components/ui/*.test.tsx
```

**Step 2: 创建 HeroUI 组件测试**

```typescript
// src/components/ui/button.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui";

describe("Button", () => {
  it("renders a button with text", () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("handles click events", () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    fireEvent.click(screen.getByRole("button", { name: /click me/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("renders different sizes", () => {
    const { container: sm } = render(<Button size="sm">Small</Button>);
    const { container: md } = render(<Button size="md">Medium</Button>);
    const { container: lg } = render(<Button size="lg">Large</Button>);

    expect(sm.firstChild).toHaveClass("h-8");
    expect(md.firstChild).toHaveClass("h-10");
    expect(lg.firstChild).toHaveClass("h-12");
  });
});
```

**Step 3: 更新首页测试**

```typescript
// src/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home Page", () => {
  it("renders hero section", () => {
    render(<Home />);
    expect(screen.getByText(/构建现代化 Web 应用/i)).toBeInTheDocument();
  });

  it("renders features section", () => {
    render(<Home />);
    expect(screen.getByText(/强大的功能特性/i)).toBeInTheDocument();
  });

  it("renders quick start section", () => {
    render(<Home />);
    expect(screen.getByText(/快速开始/i)).toBeInTheDocument();
  });

  it("renders footer CTA", () => {
    render(<Home />);
    expect(screen.getByText(/准备好开始了吗？/i)).toBeInTheDocument();
  });
});
```

**Step 4: 提交测试更新**

```bash
git add src/components/ui/*.test.tsx src/app/page.test.tsx
git commit -m "refactor: 更新组件和页面测试"
```

---

## 验证和测试

### Task 9: 构建和测试项目

**Files:**

**Step 1: 运行类型检查**

```bash
pnpm type-check
```

**Step 2: 构建项目**

```bash
pnpm build
```

**Step 3: 运行测试**

```bash
pnpm test
```

**Step 4: 启动开发服务器**

```bash
pnpm dev
```

---

## 清理工作

### Task 10: 删除临时文件和备份

**Files:**

- 临时文件

**Step 1: 删除备份文件**

```bash
rm -rf /Users/xxwade/mine/claude-code-projects/frontend-template.backup
```

**Step 2: 提交最终更新**

```bash
git add .
git commit -m "feat: 完全替换 shadcn/ui 为 HeroUI"
```

---

## 完成后的验证

### 检查列表

- [x] 所有 shadcn/ui 组件已替换为 HeroUI
- [x] 所有依赖已更新
- [x] 项目可以正常构建和运行
- [x] 所有页面和组件可以正常渲染
- [x] 深色/浅色主题切换功能正常
- [x] 响应式设计正常
- [x] 所有测试通过
- [x] 没有 shadcn/ui 相关代码残留

---

## 额外优化建议

1. **优化组件导入**：考虑使用路径别名优化 HeroUI 组件的导入
2. **添加组件文档**：为 HeroUI 组件添加详细的使用文档
3. **性能优化**：根据需要添加组件懒加载
4. **辅助功能**：确保所有 HeroUI 组件符合可访问性标准

---

## 总结

本实施计划详细描述了将项目中的 shadcn/ui 组件库完全替换为 HeroUI (@heroui/react) 官方 npm 包的步骤。通过逐步执行这些任务，可以确保项目的功能完整性和代码质量。

---
