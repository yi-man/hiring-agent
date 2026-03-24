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
            <main className="pt-24 sm:pt-32">{children}</main>
            <footer className="bg-secondary/30 border-t py-16">
              <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
                  <div className="lg:col-span-1">
                    <div className="mb-6 flex items-center space-x-2">
                      <div className="hero-gradient flex h-10 w-10 items-center justify-center rounded-lg text-white">
                        <span className="text-lg font-bold">N</span>
                      </div>
                      <span className="text-foreground text-xl font-semibold tracking-tight">
                        Next.js 16
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      生产就绪的 Next.js 16 SSR 模板，集成完整的技术栈和工程化配置，
                      让您快速启动高质量项目。
                    </p>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-6 text-lg font-semibold">快速链接</h3>
                    <ul className="space-y-4">
                      {[
                        { name: '首页', href: '/' },
                        { name: '关于', href: '/about' },
                        { name: '服务', href: '/services' },
                        { name: '博客', href: '/blog' },
                        { name: '联系', href: '/contact' },
                      ].map((item, index) => (
                        <li key={index}>
                          <a
                            href={item.href}
                            className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
                          >
                            {item.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-6 text-lg font-semibold">资源</h3>
                    <ul className="space-y-4">
                      {[
                        { name: '文档', href: '/docs' },
                        { name: 'API', href: '/api' },
                        { name: '教程', href: '/tutorials' },
                        { name: '示例', href: '/examples' },
                        { name: 'GitHub', href: 'https://github.com' },
                      ].map((item, index) => (
                        <li key={index}>
                          <a
                            href={item.href}
                            className="text-muted-foreground hover:text-primary text-sm font-medium transition-colors"
                          >
                            {item.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-foreground mb-6 text-lg font-semibold">联系我们</h3>
                    <ul className="space-y-4">
                      <li className="text-muted-foreground flex items-center gap-2 text-sm">
                        <span>📧</span>
                        <span>contact@example.com</span>
                      </li>
                      <li className="text-muted-foreground flex items-center gap-2 text-sm">
                        <span>📱</span>
                        <span>+86 123 4567 8900</span>
                      </li>
                      <li className="text-muted-foreground flex items-center gap-2 text-sm">
                        <span>📍</span>
                        <span>中国，北京</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="text-muted-foreground border-border mt-12 border-t pt-8 text-center text-sm">
                  <p>© 2026 Next.js 16 SSR Template. All rights reserved.</p>
                </div>
              </div>
            </footer>
          </HeroUIProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
