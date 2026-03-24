# Next.js 16 SSR Template

一个现代化、生产就绪的 Next.js 16 SSR 模板，包含完整的技术栈、代码规范、测试配置和工程化配置。

## 技术栈

- **Next.js 16.1.6** - 服务端渲染框架
- **React 19.2.4** - 用户界面库
- **TypeScript 5.7** - 类型安全的 JavaScript 超集
- **Tailwind CSS 4.2.1** - 实用优先的 CSS 框架
- **shadcn/ui 3.8.5** - 现代化的 UI 组件库
- **pnpm 10.9.2** - 快速、节省空间的包管理器
- **Jest** - JavaScript 测试框架
- **Cypress** - 端到端测试工具
- **ESLint 9.15.0** - 代码规范检查工具
- **Prettier** - 代码格式化工具
- **Husky 9.1.7** - Git 钩子工具

## 特性

### 架构设计

- 使用 Next.js 16 App Router 架构
- 服务端渲染 (SSR) 支持
- 静态页面生成 (SSG) 支持
- 深色/浅色主题切换
- 响应式设计

### 开发体验

- 完整的代码规范流程 (ESLint + Prettier + Husky)
- 类型安全开发
- 热重载和快速刷新
- 组件库支持
- 模拟数据支持
- 自动化测试

### UI 组件

- 使用 shadcn/ui 组件库
- 包含常用的 UI 组件 (按钮、卡片、对话框、表单组件等)
- 主题切换组件
- 响应式导航栏

### 性能优化

- 优化的打包配置
- 代码分割和懒加载
- 图片优化
- 缓存策略

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 10.9.2+

### 安装依赖

```bash
pnpm install
```

### 开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 查看应用。

### 生产构建

```bash
pnpm build
```

### 生产服务器

```bash
pnpm start
```

### 运行测试

```bash
# 运行 Jest 测试
pnpm test

# 运行 Jest 测试并监听文件变化
pnpm test:watch

# 运行 Jest 测试并生成覆盖率报告
pnpm test:coverage

# 运行 Cypress 端到端测试
pnpm cypress

# 运行 Cypress 端到端测试 (无头模式)
pnpm cypress:headless
```

### 代码规范检查

```bash
# 运行 ESLint 检查
pnpm lint

# 运行 Prettier 格式化代码
pnpm format
```

## 项目结构

```
├── src/
│   ├── app/                          # 应用路由和页面
│   │   ├── layout.tsx               # 根布局
│   │   ├── page.tsx                 # 首页
│   │   ├── about/
│   │   │   └── page.tsx
│   │   ├── blog/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── contact/
│   │   │   └── page.tsx
│   │   ├── services/
│   │   │   └── page.tsx
│   │   └── globals.css              # 全局样式
│   ├── components/                  # 可复用组件
│   │   ├── ui/                      # shadcn/ui 组件
│   │   ├── navbar.tsx               # 导航栏组件
│   │   └── theme-provider.tsx       # 主题提供商
│   ├── hooks/                       # 自定义 Hooks
│   │   ├── use-debounce.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-media-query.ts
│   │   ├── use-scroll-position.ts
│   │   ├── use-throttle.ts
│   │   └── use-viewport-size.ts
│   ├── lib/                         # 工具函数
│   │   └── utils.ts                 # 通用工具函数
│   └── types/                       # 类型定义
│       └── index.ts
├── public/                           # 静态资源
├── .env.development                  # 开发环境变量
├── .env.production                   # 生产环境变量
├── .env.test                        # 测试环境变量
├── .env.example                     # 环境变量示例
├── components.json                  # shadcn/ui 配置
├── eslint.config.mjs                # ESLint 配置
├── jest.config.cjs                  # Jest 配置
├── jest.setup.ts                    # Jest 启动文件
├── next.config.mjs                  # Next.js 配置
├── package.json                     # 项目依赖配置
├── postcss.config.js                # PostCSS 配置
├── tailwind.config.ts               # Tailwind CSS 配置
└── tsconfig.json                    # TypeScript 配置
```

## 开发流程

### 创建新页面

在 `src/app/` 目录下创建新的文件夹，然后添加 `page.tsx` 文件。

```typescript
// src/app/new-page/page.tsx
export default function NewPage() {
  return <h1>New Page</h1>;
}
```

### 创建新组件

在 `src/components/` 目录下创建新的组件文件。

```typescript
// src/components/MyComponent.tsx
interface MyComponentProps {
  title: string;
}

export function MyComponent({ title }: MyComponentProps) {
  return <h2>{title}</h2>;
}
```

### 样式

使用 Tailwind CSS 类名进行样式开发。

### 数据获取

使用 Next.js 的数据获取方法：

```typescript
// 服务器端数据获取
export async function getServerSideProps() {
  const data = await fetch('https://api.example.com/data');
  return { props: { data } };
}

// 静态数据获取
export async function getStaticProps() {
  const data = await fetch('https://api.example.com/data');
  return { props: { data } };
}

// 静态路径生成
export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'post-1' } }, { params: { slug: 'post-2' } }],
    fallback: false,
  };
}
```

## 部署

### Vercel 部署

1. 安装 Vercel CLI
2. 登录 Vercel 账号
3. 运行 `vercel` 命令

### 其他部署方式

可以使用 Docker 或其他方式部署。

## 许可证

MIT
