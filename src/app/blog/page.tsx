import { Card, CardBody, CardHeader } from '@/components/ui';
import Link from 'next/link';

// 示例博客文章数据
const blogPosts = [
  {
    id: '1',
    title: 'Next.js 16 新特性介绍',
    excerpt: '介绍 Next.js 16 的新特性和改进，包括 App Router 的优化、性能提升等。',
    date: '2026-02-20',
    author: '张三',
    category: '技术',
    slug: 'nextjs-16-new-features',
  },
  {
    id: '2',
    title: '使用 TypeScript 5.7 开发应用',
    excerpt: '探索 TypeScript 5.7 的新特性和改进，以及如何在项目中应用这些特性。',
    date: '2026-02-18',
    author: '李四',
    category: '开发',
    slug: 'using-typescript-5-7',
  },
  {
    id: '3',
    title: 'Tailwind CSS 4 主题配置',
    excerpt: '学习如何配置和自定义 Tailwind CSS 4 的主题，以满足您的设计需求。',
    date: '2026-02-15',
    author: '王五',
    category: '样式',
    slug: 'tailwind-css-4-theme-config',
  },
  {
    id: '4',
    title: 'HeroUI 组件库使用指南',
    excerpt: '介绍如何使用 HeroUI 组件库创建出色的用户界面。',
    date: '2026-02-12',
    author: '赵六',
    category: 'UI/UX',
    slug: 'heroui-guide',
  },
  {
    id: '5',
    title: 'React 19 并发渲染',
    excerpt: '探索 React 19 的并发渲染特性，以及如何在项目中应用这些特性。',
    date: '2026-02-10',
    author: '钱七',
    category: '技术',
    slug: 'react-19-concurrent-rendering',
  },
  {
    id: '6',
    title: 'Next.js 16 性能优化',
    excerpt: '分享一些优化 Next.js 16 应用程序性能的技巧和最佳实践。',
    date: '2026-02-08',
    author: '孙八',
    category: '性能',
    slug: 'nextjs-16-performance-optimization',
  },
];

export default function Blog() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-4xl font-bold">博客</h1>
        <p className="mb-12 text-xl text-gray-600">
          分享关于 Next.js、React、TypeScript 等技术的文章和教程。
        </p>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {blogPosts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 flex items-center space-x-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      {post.category}
                    </span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-muted-foreground text-xs">{post.date}</span>
                  </div>
                  <h3 className="text-lg font-bold">{post.title}</h3>
                  <p className="text-sm text-gray-500">{post.author}</p>
                </CardHeader>
                <CardBody>
                  <p className="text-muted-foreground">{post.excerpt}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        <div className="my-12 border-t border-gray-200 dark:border-gray-800" />

        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold">订阅我们的博客</h2>
          <p className="mb-6">订阅我们的博客，获取最新的技术文章和教程。</p>
          <form className="mx-auto flex max-w-md space-x-2">
            <input
              type="email"
              placeholder="您的邮箱地址"
              className="focus:ring-primary flex-1 rounded-md border border-gray-300 px-4 py-2 shadow-sm focus:border-transparent focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-primary hover:bg-primary/90 focus:ring-primary rounded-md px-4 py-2 text-white shadow-sm focus:ring-2 focus:ring-offset-2 focus:outline-none"
            >
              订阅
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
