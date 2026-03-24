import { Card, CardBody, CardHeader } from '@/components/ui';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// 模拟博客文章数据
const blogPosts = {
  'nextjs-16-new-features': {
    id: '1',
    title: 'Next.js 16 新特性介绍',
    content: `
      <h2>Next.js 16 的新特性</h2>
      <p>Next.js 16 带来了许多令人兴奋的新特性和改进，包括：</p>
      <ul>
        <li>App Router 的优化</li>
        <li>性能提升</li>
        <li>新的 API 和功能</li>
        <li>更好的开发体验</li>
      </ul>
      <h3>App Router 的优化</h3>
      <p>Next.js 16 对 App Router 进行了重大改进，包括：</p>
      <ul>
        <li>更好的路由管理</li>
        <li>更快的页面加载速度</li>
        <li>更灵活的布局系统</li>
      </ul>
      <h3>性能提升</h3>
      <p>Next.js 16 在性能方面有显著提升，包括：</p>
      <ul>
        <li>更快的构建时间</li>
        <li>更小的打包体积</li>
        <li>更优的运行时性能</li>
      </ul>
    `,
    date: '2026-02-20',
    author: '张三',
    category: '技术',
  },
  'using-typescript-5-7': {
    id: '2',
    title: '使用 TypeScript 5.7 开发应用',
    content: `
      <h2>TypeScript 5.7 的新特性</h2>
      <p>TypeScript 5.7 引入了许多新特性和改进，包括：</p>
      <ul>
        <li>更好的类型推断</li>
        <li>新的语法特性</li>
        <li>性能优化</li>
        <li>更友好的错误信息</li>
      </ul>
      <h3>类型推断改进</h3>
      <p>TypeScript 5.7 在类型推断方面有显著提升，包括：</p>
      <ul>
        <li>更智能的类型判断</li>
        <li>更好的泛型推断</li>
        <li>更精确的类型检查</li>
      </ul>
      <h3>语法新特性</h3>
      <p>TypeScript 5.7 引入了一些新的语法特性，包括：</p>
      <ul>
        <li>新的类型操作符</li>
        <li>更灵活的语法</li>
        <li>更好的代码可读性</li>
      </ul>
    `,
    date: '2026-02-18',
    author: '李四',
    category: '开发',
  },
  'tailwind-css-4-theme-config': {
    id: '3',
    title: 'Tailwind CSS 4 主题配置',
    content: `
      <h2>Tailwind CSS 4 的主题配置</h2>
      <p>Tailwind CSS 4 提供了更强大的主题配置功能，包括：</p>
      <ul>
        <li>更灵活的配置方式</li>
        <li>更好的自定义选项</li>
        <li>新的颜色系统</li>
        <li>更易于扩展</li>
      </ul>
      <h3>颜色系统</h3>
      <p>Tailwind CSS 4 引入了新的颜色系统，支持：</p>
      <ul>
        <li>更精确的颜色值</li>
        <li>更好的对比度</li>
        <li>更易于维护的颜色配置</li>
      </ul>
      <h3>配置选项</h3>
      <p>Tailwind CSS 4 提供了更多的配置选项，包括：</p>
      <ul>
        <li>自定义断点</li>
        <li>扩展的间距系统</li>
        <li>更灵活的排版配置</li>
      </ul>
    `,
    date: '2026-02-15',
    author: '王五',
    category: '样式',
  },
};

interface BlogPostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = blogPosts[slug as keyof typeof blogPosts];

  if (!post) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-4 text-4xl font-bold">文章不存在</h1>
          <p className="mb-8">您访问的文章不存在或已被删除。</p>
          <Link
            href="/blog"
            className="bg-primary hover:bg-primary/90 inline-flex items-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回博客
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/blog"
          className="text-muted-foreground hover:text-primary mb-6 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回博客
        </Link>

        <article>
          <header className="mb-8">
            <div className="mb-4 flex items-center space-x-2">
              <span className="text-muted-foreground text-xs font-medium">{post.category}</span>
              <span className="text-muted-foreground text-xs">•</span>
              <span className="text-muted-foreground text-xs">{post.date}</span>
            </div>
            <h1 className="mb-4 text-4xl font-bold">{post.title}</h1>
            <p className="text-muted-foreground">作者: {post.author}</p>
          </header>

          <div className="my-8 border-t border-gray-200 dark:border-gray-800" />

          <div
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          <div className="my-8 border-t border-gray-200 dark:border-gray-800" />

          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold">相关文章</h2>
            <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2">
              {Object.entries(blogPosts)
                .filter(([blogSlug]) => blogSlug !== slug)
                .slice(0, 2)
                .map(([slug, relatedPost]) => (
                  <Link key={slug} href={`/blog/${slug}`}>
                    <Card className="transition-shadow hover:shadow-md">
                      <CardHeader>
                        <h3 className="text-lg font-bold">{relatedPost.title}</h3>
                        <p className="text-sm text-gray-500">
                          {relatedPost.category} • {relatedPost.date}
                        </p>
                      </CardHeader>
                      <CardBody>
                        <p className="text-muted-foreground">
                          {relatedPost.content.substring(0, 150)}...
                        </p>
                      </CardBody>
                    </Card>
                  </Link>
                ))}
            </div>
            <Link
              href="/blog"
              className="bg-primary hover:bg-primary/90 inline-flex items-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm"
            >
              查看更多文章
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
