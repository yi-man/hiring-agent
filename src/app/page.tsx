import { Button, Card, CardBody, CardHeader } from '@/components/ui';

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-24 sm:py-32 lg:py-40">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="hero-gradient animate-pulse-slow absolute -top-40 -right-40 h-80 w-80 rounded-full opacity-10 blur-3xl"></div>
          <div className="animate-pulse-slow absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-500 opacity-10 blur-3xl delay-1000"></div>
        </div>

        <div className="relative z-10 container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <div className="hero-ui-card border-primary/20 bg-primary/5 text-primary mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium">
              <span className="bg-primary h-2 w-2 animate-pulse rounded-full"></span>
              Next.js 16 SSR 模板
            </div>

            <h1 className="mb-8 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              构建
              <span className="gradient-text ml-2 block sm:inline-block">现代化</span>
              <br className="sm:hidden" /> Web 应用
            </h1>

            <p className="text-muted-foreground mx-auto mb-12 max-w-3xl text-lg leading-relaxed sm:text-xl">
              一个生产就绪的 Next.js 16 SSR 模板，集成完整的技术栈和工程化配置，
              <br className="hidden sm:block" /> 让您快速启动高质量项目
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                color="primary"
                size="lg"
                className="hero-gradient rounded-xl px-8 py-6 text-lg font-semibold text-white transition-opacity hover:opacity-90"
              >
                快速开始
                <span className="ml-2">→</span>
              </Button>
              <Button
                variant="bordered"
                size="lg"
                className="border-gradient rounded-xl px-8 py-6 text-lg font-semibold"
              >
                查看文档
              </Button>
            </div>

            {/* Stats */}
            <div className="hero-ui-card mt-16 grid grid-cols-1 gap-8 rounded-2xl p-8 md:grid-cols-3">
              <div className="text-center">
                <div className="text-primary text-3xl font-bold">100%</div>
                <div className="text-muted-foreground text-sm">生产就绪</div>
              </div>
              <div className="text-center">
                <div className="text-primary text-3xl font-bold">Next.js 16</div>
                <div className="text-muted-foreground text-sm">最新版本</div>
              </div>
              <div className="text-center">
                <div className="text-primary text-3xl font-bold">完整配置</div>
                <div className="text-muted-foreground text-sm">工程化</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-secondary/30 py-24">
        <div className="container mx-auto px-4">
          <div className="mb-20 text-center">
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl lg:text-5xl">
              强大的<span className="gradient-text">功能特性</span>
            </h2>
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
                icon: '⚡',
              },
              {
                title: '完整技术栈',
                description: '集成 React 19、TypeScript 5.7 和 Tailwind CSS 4，构建高质量应用',
                features: ['React 19', 'TypeScript 5.7', 'Tailwind CSS 4', 'HeroUI'],
                icon: '🚀',
              },
              {
                title: '精美设计',
                description: '支持深色/浅色主题切换，响应式设计适配所有设备',
                features: ['主题切换', '响应式布局', '视觉优化', '动画效果'],
                icon: '🎨',
              },
              {
                title: '代码规范',
                description: '完整的代码质量保证体系，确保代码风格一致',
                features: ['ESLint 9', 'Prettier', 'Husky', 'Commitlint'],
                icon: '✅',
              },
              {
                title: '工程化配置',
                description: '生产就绪的配置，包含测试、构建和部署流程',
                features: ['Jest 测试', 'Cypress E2E', 'CI/CD 配置', '性能优化'],
                icon: '🔧',
              },
              {
                title: '版本控制',
                description: '完整的 Git 工作流程，确保团队协作高效',
                features: ['提交规范', '分支管理', '代码评审', '自动化检查'],
                icon: '📊',
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="hero-ui-card card-gradient overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:rotate-1"
              >
                <Card className="h-full border-none bg-transparent">
                  <CardHeader className="pb-4">
                    <div className="bg-primary/10 text-primary group-hover:bg-primary/20 mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-bold transition-all duration-300">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold">{feature.title}</h3>
                    <p className="text-muted-foreground mt-2 text-sm">{feature.description}</p>
                  </CardHeader>
                  <CardBody>
                    <ul className="space-y-3">
                      {feature.features.map((item, i) => (
                        <li key={i} className="text-muted-foreground flex items-center text-sm">
                          <span className="bg-primary/10 text-primary mr-3 flex h-5 w-5 items-center justify-center rounded-full text-xs">
                            ✓
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="mb-20 text-center">
            <h2 className="mb-6 text-3xl font-bold sm:text-4xl lg:text-5xl">
              快速<span className="gradient-text">开始</span>
            </h2>
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
                  className="hero-ui-card overflow-hidden transition-all duration-300 hover:shadow-xl"
                >
                  <div className="border-gradient p-1">
                    <div className="bg-card h-full rounded-xl p-6">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="text-primary text-2xl">⚡</span>
                        <h3 className="text-foreground text-lg font-semibold">{step.title}</h3>
                      </div>
                      <div className="relative overflow-hidden rounded-lg bg-gray-900 p-4 font-mono text-sm text-green-400 shadow-inner">
                        <div className="absolute -top-4 -right-4 h-20 w-20 rounded-full bg-green-500 opacity-20 blur-2xl"></div>
                        <code>{step.code}</code>
                        <button className="absolute top-2 right-2 text-gray-500 transition-colors hover:text-white">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hero-ui-card">
              <div className="border-gradient p-1">
                <div className="bg-card h-full rounded-xl p-8">
                  <div className="mb-6 flex items-center gap-3">
                    <span className="text-primary text-2xl">📁</span>
                    <h3 className="text-foreground text-xl font-semibold">项目架构</h3>
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
                        className="hover:bg-primary/5 dark:hover:bg-primary/10 flex items-center justify-between rounded-lg bg-gray-50 p-4 transition-all duration-300 hover:translate-x-2 dark:bg-gray-800"
                      >
                        <span className="text-foreground font-medium">{item.name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {item.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative overflow-hidden py-24">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="hero-gradient animate-pulse-slow absolute -top-40 -left-40 h-80 w-80 rounded-full opacity-10 blur-3xl"></div>
          <div className="animate-pulse-slow absolute -right-40 -bottom-40 h-80 w-80 rounded-full bg-purple-500 opacity-10 blur-3xl delay-1000"></div>
        </div>

        <div className="relative z-10 container mx-auto px-4">
          <div className="hero-ui-card mx-auto max-w-4xl overflow-hidden text-center">
            <div className="border-gradient p-1">
              <div className="bg-card rounded-xl p-12">
                <h2 className="mb-6 text-3xl font-bold sm:text-4xl lg:text-5xl">
                  准备好<span className="gradient-text">开始了吗？</span>
                </h2>
                <p className="text-muted-foreground mx-auto mb-12 max-w-2xl text-lg">
                  立即使用这个强大的 Next.js 16 模板，构建您的下一个项目
                </p>
                <Button
                  color="primary"
                  size="lg"
                  className="hero-gradient rounded-xl px-8 py-6 text-lg font-semibold text-white transition-all duration-300 hover:scale-105 hover:opacity-90 active:scale-95"
                >
                  下载模板
                  <span className="ml-2">→</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
