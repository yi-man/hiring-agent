import Link from 'next/link';
import { Button, Card, CardBody, CardHeader } from '@/components/ui';

const features = [
  {
    title: '智能对话',
    description: '基于 LangChain 的多轮对话，支持职位上下文与文档 RAG，便于梳理需求与沟通记录。',
    icon: '💬',
    href: '/chat',
  },
  {
    title: 'JD 工作台',
    description: '生成、评估与迭代职位描述（JD），让岗位表述更清晰、可衡量。',
    icon: '📝',
    href: '/jd-generator',
  },
  {
    title: 'Workflow 学习',
    description: '在受控环境中学习浏览器工作流，辅助招聘与运营侧流程沉淀。',
    icon: '🔁',
    href: '/workflow-learning',
  },
  {
    title: 'LLM 可观测',
    description: '查看调用、错误与趋势，便于排查模型行为与成本。',
    icon: '📊',
    href: '/llm-observability',
  },
];

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <section className="relative overflow-hidden py-24 sm:py-32 lg:py-40">
        <div className="absolute inset-0 overflow-hidden">
          <div className="hero-gradient animate-pulse-slow absolute -top-40 -right-40 h-80 w-80 rounded-full opacity-10 blur-3xl"></div>
          <div className="animate-pulse-slow absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-500 opacity-10 blur-3xl delay-1000"></div>
        </div>

        <div className="relative z-10 container mx-auto px-4">
          <div className="mx-auto max-w-4xl text-center">
            <div className="hero-ui-card border-primary/20 bg-primary/5 text-primary mb-8 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium">
              <span className="bg-primary h-2 w-2 animate-pulse rounded-full"></span>
              Hiring Agent · 招聘助手
            </div>

            <h1 className="mb-8 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              用 AI 协助
              <span className="gradient-text ml-2">招聘全流程</span>
            </h1>

            <p className="text-muted-foreground mx-auto mb-12 max-w-3xl text-lg leading-relaxed sm:text-xl">
              从 JD 撰写、对话沉淀到流程学习与模型可观测，面向招聘与 HR
              场景的一体化助手，而非通用网站模板。
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                color="primary"
                size="lg"
                className="hero-gradient rounded-xl px-8 py-6 text-lg font-semibold text-white transition-opacity hover:opacity-90"
                href="/chat"
              >
                进入对话
                <span className="ml-2">→</span>
              </Button>
              <Button
                variant="bordered"
                size="lg"
                className="border-gradient rounded-xl px-8 py-6 text-lg font-semibold"
                href="/jd-generator"
              >
                JD 工作台
              </Button>
            </div>

            <div className="hero-ui-card mt-16 grid grid-cols-1 gap-8 rounded-2xl p-8 md:grid-cols-3">
              <div className="text-center">
                <div className="text-primary text-3xl font-bold">对话 + RAG</div>
                <div className="text-muted-foreground text-sm">上下文与文档</div>
              </div>
              <div className="text-center">
                <div className="text-primary text-3xl font-bold">JD Agent</div>
                <div className="text-muted-foreground text-sm">生成与评估</div>
              </div>
              <div className="text-center">
                <div className="text-primary text-3xl font-bold">可观测</div>
                <div className="text-muted-foreground text-sm">调用与趋势</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-secondary/30 py-24">
        <div className="container mx-auto px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
              核心<span className="gradient-text">能力</span>
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
              与仓库内业务模块一致，无演示用博客或联系页等模板噪音。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {features.map((feature) => (
              <Link key={feature.href} href={feature.href} className="group block">
                <div className="hero-ui-card card-gradient h-full overflow-hidden transition-all duration-500 hover:scale-[1.01]">
                  <Card className="h-full border-none bg-transparent">
                    <CardHeader className="pb-4">
                      <div className="bg-primary/10 text-primary group-hover:bg-primary/20 mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl text-2xl transition-all">
                        {feature.icon}
                      </div>
                      <h3 className="text-xl font-bold">{feature.title}</h3>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </CardHeader>
                    <CardBody className="pt-0">
                      <span className="text-primary text-sm font-medium group-hover:underline">
                        进入 →
                      </span>
                    </CardBody>
                  </Card>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 overflow-hidden">
          <div className="hero-gradient animate-pulse-slow absolute -top-40 -left-40 h-80 w-80 rounded-full opacity-10 blur-3xl"></div>
        </div>
        <div className="relative z-10 container mx-auto px-4">
          <div className="hero-ui-card mx-auto max-w-3xl overflow-hidden text-center">
            <div className="border-gradient p-1">
              <div className="bg-card rounded-xl p-10">
                <h2 className="mb-4 text-2xl font-bold sm:text-3xl">本地开发</h2>
                <p className="text-muted-foreground mb-8 text-left text-sm sm:text-center">
                  详见仓库 <code className="text-foreground">CLAUDE.md</code>
                  ：依赖、数据库、Workflow E2E 与集成测试约定。
                </p>
                <div className="bg-muted/50 rounded-lg p-4 text-left font-mono text-sm">
                  <div className="text-muted-foreground mb-1"># 安装与启动</div>
                  <div>pnpm install && pnpm dev</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
