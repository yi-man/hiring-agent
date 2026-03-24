# 网站重新设计 - 极简主义风格实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有的 Next.js 16 模板项目重新设计为现代极简主义风格，强调内容优先和优秀的用户体验。

**Architecture:** 采用分层重构方法，先更新基础配置，再重构组件，最后优化页面布局和交互效果。保持现有的功能架构，但彻底重新设计视觉呈现。

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Tailwind CSS 4, shadcn/ui 组件库

---

## 任务分解

### Task 1: 更新 Tailwind 配置和全局样式

**Files:**

- Modify: `/Users/xxwade/mine/claude-code-projects/frontend-template/tailwind.config.ts`
- Modify: `/Users/xxwade/mine/claude-code-projects/frontend-template/src/app/globals.css`

**Step 1: 更新 Tailwind 配置**

```typescript
// 修改 tailwind.config.ts 中的主题配置
// 更新 colors 和动画配置
export default {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
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
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
        'fade-in': {
          from: {
            opacity: '0',
          },
          to: {
            opacity: '1',
          },
        },
        'slide-in-from-bottom-4': {
          from: {
            transform: 'translateY(16px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'slide-in-from-bottom-6': {
          from: {
            transform: 'translateY(24px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'slide-in-from-bottom-8': {
          from: {
            transform: 'translateY(32px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'slide-in-from-bottom-10': {
          from: {
            transform: 'translateY(40px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'slide-in-from-top-10': {
          from: {
            transform: 'translateY(-40px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.6s ease-out',
        'slide-in-from-bottom-4': 'slide-in-from-bottom-4 0.6s ease-out',
        'slide-in-from-bottom-6': 'slide-in-from-bottom-6 0.6s ease-out',
        'slide-in-from-bottom-8': 'slide-in-from-bottom-8 0.6s ease-out',
        'slide-in-from-bottom-10': 'slide-in-from-bottom-10 0.6s ease-out',
        'slide-in-from-top-10': 'slide-in-from-top-10 0.6s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
```

**Step 2: 更新全局样式**

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;

    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;

    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;

    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;

    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;

    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;

    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;

    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;

    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;

    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;

    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;

    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;

    --primary: 210 40% 98%;
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
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    @apply font-bold tracking-tight;
  }

  h1 {
    @apply text-4xl sm:text-5xl lg:text-6xl;
  }

  h2 {
    @apply text-2xl sm:text-3xl lg:text-4xl;
  }

  h3 {
    @apply text-xl sm:text-2xl;
  }

  p {
    @apply text-muted-foreground leading-relaxed;
  }
}

@layer components {
  .container {
    @apply mx-auto px-4 sm:px-6 lg:px-8;
  }

  .btn {
    @apply inline-flex items-center justify-center rounded-lg px-6 py-3 font-medium transition-all duration-300;
  }

  .btn-primary {
    @apply bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105;
  }

  .btn-secondary {
    @apply text-foreground border-input hover:bg-accent border bg-white;
  }

  .card {
    @apply border-input rounded-lg border bg-white p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-lg;
  }
}
```

**Step 3: 提交更改**

```bash
git add /Users/xxwade/mine/claude-code-projects/frontend-template/tailwind.config.ts /Users/xxwade/mine/claude-code-projects/frontend-template/src/app/globals.css
git commit -m "chore: 更新配色方案和全局样式"
```

---

### Task 2: 重构导航栏组件

**Files:**

- Modify: `/Users/xxwade/mine/claude-code-projects/frontend-template/src/components/navbar.tsx`

**Step 1: 重构 Navbar 组件**

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Github } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navigation = [
    { name: '首页', href: '/' },
    { name: '关于', href: '/about' },
    { name: '服务', href: '/services' },
    { name: '博客', href: '/blog' },
    { name: '联系', href: '/contact' },
  ];

  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-50 border-b transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 border-input/50 py-3 backdrop-blur-lg'
          : 'bg-white/80 border-transparent py-5 backdrop-blur-md'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex items-center space-x-3">
            <div className="bg-primary text-white flex h-10 w-10 items-center justify-center rounded-lg">
              <span className="text-lg font-bold">N</span>
            </div>
            <span className="group-hover:text-primary text-xl font-bold tracking-tight transition-colors">
              Next.js 16
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center space-x-8 md:flex">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-foreground/80 hover:text-primary hover:bg-accent/50 group rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300"
              >
                {item.name}
              </Link>
            ))}
            <div className="bg-input/50 h-6 w-px" />
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-primary transition-colors"
            >
              <Github className="h-5 w-5" />
            </Link>
            <ThemeToggle />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-foreground hover:bg-accent ml-2 rounded-lg p-2 transition-colors"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="bg-white/98 animate-in slide-in-from-top-10 border-b backdrop-blur-lg duration-300 md:hidden">
          <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-foreground hover:text-primary hover:bg-accent/50 block rounded-lg px-4 py-3 text-base font-medium transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="border-input/50 my-2 border-t" />
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-primary flex items-center px-4 py-3 transition-colors"
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
git add /Users/xxwade/mine/claude-code-projects/frontend-template/src/components/navbar.tsx
git commit -m "refactor: 重构导航栏组件，简化设计风格"
```

---

### Task 3: 重构首页布局

**Files:**

- Modify: `/Users/xxwade/mine/claude-code-projects/frontend-template/src/app/page.tsx`

**Step 1: 重构 Hero 区域**

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-24 sm:py-32 lg:py-40">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <span className="bg-primary inline-block h-2 w-2 animate-ping rounded-full" />
              全新 Next.js 16 模板
            </div>

            <h1 className="mb-8 text-5xl leading-tight tracking-tight sm:text-6xl lg:text-7xl">
              构建现代化<span className="text-primary">Web 应用</span>
            </h1>

            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              一个生产就绪的 Next.js 16 SSR 模板，集成完整的技术栈和工程化配置，让您快速启动高质量项目
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button className="btn btn-primary">
                快速开始
                <span className="ml-2">→</span>
              </button>
              <button className="btn btn-secondary">
                查看文档
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="mb-20 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">强大的功能特性</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
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
                features: ['React 19', 'TypeScript 5.7', 'Tailwind CSS 4', 'shadcn/ui'],
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
              <Card
                key={index}
                className="card"
              >
                <CardHeader className="pb-4">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <span className="text-2xl">✦</span>
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, i) => (
                      <li key={i} className="flex items-center text-sm text-muted-foreground">
                        <span className="mr-2 text-primary">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mb-20 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl">快速开始</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              简单几步，即可开始开发您的应用
            </p>
          </div>

          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="space-y-8">
              <div className="card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl text-primary">⚡</span>
                  <h3 className="text-lg font-semibold">安装依赖</h3>
                </div>
                <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-sm">
                  <code>pnpm install</code>
                </div>
              </div>

              <div className="card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl text-primary">⚡</span>
                  <h3 className="text-lg font-semibold">启动开发服务器</h3>
                </div>
                <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-sm">
                  <code>pnpm dev</code>
                </div>
              </div>

              <div className="card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-2xl text-primary">⚡</span>
                  <h3 className="text-lg font-semibold">构建生产版本</h3>
                </div>
                <div className="bg-muted/50 overflow-x-auto rounded-lg p-4 font-mono text-sm">
                  <code>pnpm build</code>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-2xl text-primary">📁</span>
                <h3 className="text-xl font-semibold">项目架构</h3>
              </div>

              <div className="space-y-4">
                <div className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors">
                  <span className="font-medium">App Router</span>
                  <span className="text-sm text-muted-foreground">现代化路由系统</span>
                </div>
                <div className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors">
                  <span className="font-medium">Server Components</span>
                  <span className="text-sm text-muted-foreground">服务端组件</span>
                </div>
                <div className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors">
                  <span className="font-medium">TypeScript</span>
                  <span className="text-sm text-muted-foreground">类型安全</span>
                </div>
                <div className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors">
                  <span className="font-medium">Tailwind CSS</span>
                  <span className="text-sm text-muted-foreground">响应式设计</span>
                </div>
                <div className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors">
                  <span className="font-medium">shadcn/ui</span>
                  <span className="text-sm text-muted-foreground">精美组件</span>
                </div>
                <div className="bg-muted/50 hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors">
                  <span className="font-medium">Jest + Cypress</span>
                  <span className="text-sm text-muted-foreground">完整测试</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 bg-gradient-to-b from-muted/50 to-white">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl">准备好开始了吗？</h2>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground">
              立即使用这个强大的 Next.js 16 模板，构建您的下一个项目
            </p>
            <button className="btn btn-primary">
              下载模板
              <span className="ml-2">→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: 提交更改**

```bash
git add /Users/xxwade/mine/claude-code-projects/frontend-template/src/app/page.tsx
git commit -m "refactor: 重构首页布局，采用极简主义设计风格"
```

---

### Task 4: 优化组件设计

**Files:**

- Modify: `/Users/xxwade/mine/claude-code-projects/frontend-template/src/components/ui/button.tsx`

**Step 1: 优化按钮组件**

```typescript
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-all duration-300",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-9 rounded-md px-3",
        lg: "h-14 rounded-lg px-8",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

**Step 2: 提交更改**

```bash
git add /Users/xxwade/mine/claude-code-projects/frontend-template/src/components/ui/button.tsx
git commit -m "refactor: 优化按钮组件，添加悬停缩放效果"
```

---

### Task 5: 运行测试和构建

**Files:**

- Run: `pnpm test`
- Run: `pnpm build`

**Step 1: 运行测试**

```bash
pnpm test
```

**Step 2: 检查构建是否正常**

```bash
pnpm build
```

**Step 3: 提交所有更改**

```bash
git add -u
git commit -m "refactor: 优化项目设计，更新配色方案、导航栏和首页布局，添加动画效果"
```

---

## 执行选择

计划已完成并保存到 `docs/plans/2026-02-28-website-redesign-implementation-plan.md`。您有两个执行选项：

**1. Subagent-Driven (当前会话)** - 我将逐任务调度新的子代理，任务之间进行代码审查，实现快速迭代

**2. Parallel Session (单独会话)** - 在新的会话中使用 executing-plans 技能，批量执行并设置检查点

您希望选择哪种方法来实现这个计划？
