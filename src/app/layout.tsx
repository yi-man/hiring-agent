import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { HeroUIProvider } from '@heroui/system';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: '招聘助手 · Hiring Agent',
  description: 'AI 驱动的招聘协作：对话、JD 生成、工作流学习与 LLM 可观测',
};

const footerLinks = [
  { name: '首页', href: '/' },
  { name: '对话', href: '/chat' },
  { name: 'JD 工作台', href: '/jd-generator' },
  { name: 'Workflow 学习', href: '/workflow-learning' },
  { name: 'LLM 可观测', href: '/llm-observability' },
  { name: '登录', href: '/auth/signin' },
];

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
            <main className="pt-24 sm:pt-32">{children}</main>
            <footer className="bg-secondary/30 border-t py-16">
              <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
                  <div className="lg:col-span-2">
                    <div className="mb-6 flex items-center space-x-2">
                      <div className="hero-gradient flex h-10 w-10 items-center justify-center rounded-lg text-white">
                        <span className="text-lg font-bold">招</span>
                      </div>
                      <span className="text-foreground text-xl font-semibold tracking-tight">
                        招聘助手
                      </span>
                    </div>
                    <p className="text-muted-foreground max-w-md text-sm">
                      Hiring Agent：面向招聘与 HR 场景的 Next.js 应用，集成对话、JD
                      生成、工作流学习与 LLM 可观测性。
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-6 text-lg font-semibold">功能</h3>
                    <ul className="space-y-3">
                      {footerLinks.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
                          >
                            {item.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-6 text-lg font-semibold">开发</h3>
                    <ul className="space-y-3">
                      <li>
                        <Link
                          href="/api/health"
                          className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
                        >
                          健康检查
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="text-muted-foreground border-border mt-12 border-t pt-8 text-center text-sm">
                  <p>© {new Date().getFullYear()} Hiring Agent. All rights reserved.</p>
                </div>
              </div>
            </footer>
          </HeroUIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
