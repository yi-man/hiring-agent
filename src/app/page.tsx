import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { BrainCircuit, Eye, FileCode, FileText, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui';

const features = [
  {
    id: 'chat',
    title: '智能对话',
    eyebrow: 'Conversation',
    description: '基于 LangChain 的多轮对话，支持职位上下文与文档 RAG，便于梳理需求与沟通记录。',
    details: '适合需求访谈、候选人沟通记录整理，以及把分散的招聘上下文收束为可追踪对话。',
    cta: '进入智能对话',
    Icon: MessageCircle,
    href: '/chat',
  },
  {
    id: 'knowledge',
    title: '知识库',
    eyebrow: 'Knowledge',
    description: '上传和检索对话文档、岗位资料与招聘知识，让后续生成和沟通能复用已有上下文。',
    details: '把岗位信息、流程材料与候选人相关资料沉淀下来，支撑 RAG 检索与跨会话引用。',
    cta: '进入知识库',
    Icon: FileCode,
    href: '/knowledge',
  },
  {
    id: 'jd',
    title: 'JD 工作台',
    eyebrow: 'JD Agent',
    description: '生成、评估与迭代职位描述（JD），让岗位表述更清晰、可衡量。',
    details: '围绕岗位目标、职责、要求和亮点进行结构化生成，并支持后续候选人筛选链路。',
    cta: '进入 JD 工作台',
    Icon: FileText,
    href: '/jd-generator',
  },
  {
    id: 'workflow',
    title: 'Workflow 学习',
    eyebrow: 'Workflow',
    description: '在受控环境中学习浏览器工作流，辅助招聘与运营侧流程沉淀。',
    details: '用于学习和固化招聘平台里的重复操作，把流程步骤沉淀为更可靠的自动化能力。',
    cta: '进入 Workflow',
    Icon: BrainCircuit,
    href: '/workflow-learning',
  },
  {
    id: 'observability',
    title: 'LLM 可观测',
    eyebrow: 'Observability',
    description: '查看调用、错误与趋势，便于排查模型行为与成本。',
    details: '聚合模型调用、延迟、错误与趋势数据，便于定位异常、控制成本和评估质量。',
    cta: '进入可观测看板',
    Icon: Eye,
    href: '/llm-observability',
  },
] satisfies Array<{
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  details: string;
  cta: string;
  Icon: LucideIcon;
  href: string;
}>;

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
          <div className="mb-12 max-w-3xl">
            <h2 className="mb-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
              核心<span className="gradient-text">能力</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              与仓库内业务模块一致，无演示用博客或联系页等模板噪音。
            </p>
          </div>

          <section aria-label="核心能力概览" className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {features.map(({ Icon, ...feature }) => (
              <article key={feature.href} className="hero-ui-card rounded-lg p-5 sm:p-6">
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="text-primary mb-1 text-xs font-semibold tracking-normal uppercase">
                        {feature.eyebrow}
                      </div>
                      <h3 className="text-foreground text-xl font-bold">{feature.title}</h3>
                    </div>
                  </div>
                  <Link
                    href={feature.href}
                    className="border-border text-foreground hover:border-primary/50 hover:text-primary inline-flex h-10 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition-colors"
                  >
                    {feature.cta}
                  </Link>
                </div>
                <p className="text-muted-foreground mb-3 text-sm leading-7">
                  {feature.description}
                </p>
                <p className="text-muted-foreground text-sm leading-7">{feature.details}</p>
              </article>
            ))}
          </section>
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
                  <div>bun install && bun run dev</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
