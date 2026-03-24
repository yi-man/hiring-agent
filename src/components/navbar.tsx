'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Github } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui';

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
          ? 'border-border bg-background/70 py-2 backdrop-blur-lg'
          : 'bg-background/80 border-transparent py-3 backdrop-blur-lg'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500 text-white">
              <span className="text-sm font-bold">N</span>
            </div>
            <span className="text-foreground text-base font-semibold tracking-tight">
              Next.js 16
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center space-x-5 md:flex">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-foreground/80 hover:text-primary dark:text-foreground/70 dark:hover:text-primary text-sm font-medium transition-all hover:scale-105"
              >
                {item.name}
              </Link>
            ))}
            <div className="bg-border h-6 w-px" />
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-primary dark:text-foreground/50 dark:hover:text-primary transition-all hover:scale-105"
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
        <div className="animate-in slide-in-from-top-10 border-border bg-background/90 border-b backdrop-blur-lg duration-300 md:hidden">
          <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-foreground/80 hover:bg-secondary hover:text-primary dark:text-foreground/70 dark:hover:bg-secondary/30 dark:hover:text-primary block rounded-md px-4 py-3 text-base font-medium transition-all hover:scale-105"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.name}
              </Link>
            ))}
            <div className="border-border my-2 border-t" />
            <Link
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-primary dark:text-foreground/50 dark:hover:text-primary flex items-center px-4 py-3 transition-all hover:scale-105"
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
