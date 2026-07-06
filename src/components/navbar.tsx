'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { SignInButton } from '@/components/auth/sign-in-button';
import { UserMenu } from '@/components/auth/user-menu';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Button } from '@/components/ui';

const AUTH_CHANGED_EVENT = 'hiring-agent-auth-changed';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SessionUser = {
  id?: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let isActive = true;
    let latestSessionRequestId = 0;

    async function loadSession() {
      const requestId = ++latestSessionRequestId;
      try {
        const response = await fetch('/api/auth/session');
        const payload = (await response.json().catch(() => ({ user: null }))) as {
          user?: SessionUser | null;
        };
        const sessionUser = response.ok ? (payload.user ?? null) : null;

        if (!isActive || requestId !== latestSessionRequestId) {
          return;
        }

        setUser(sessionUser);
        setStatus(sessionUser ? 'authenticated' : 'unauthenticated');
      } catch {
        if (isActive && requestId === latestSessionRequestId) {
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    }

    void loadSession();
    window.addEventListener(AUTH_CHANGED_EVENT, loadSession);

    return () => {
      isActive = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, loadSession);
    };
  }, []);

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
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500 text-white">
              <span className="text-sm font-bold">招</span>
            </div>
            <span className="text-foreground text-base font-semibold tracking-tight">招聘助手</span>
          </Link>

          <div className="hidden items-center space-x-5 md:flex">
            {status === 'authenticated' ? (
              <UserMenu name={user?.name ?? user?.username ?? user?.email} />
            ) : status === 'unauthenticated' ? (
              <SignInButton className="px-4" />
            ) : (
              <div className="h-10 w-[148px]" aria-hidden />
            )}
            <ThemeToggle />
          </div>

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

      {isMenuOpen && (
        <div className="animate-in slide-in-from-top-10 border-border bg-background/90 border-b backdrop-blur-lg duration-300 md:hidden">
          <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
            {status === 'authenticated' ? (
              <div className="px-4 py-3">
                <UserMenu name={user?.name ?? user?.username ?? user?.email} />
              </div>
            ) : status === 'unauthenticated' ? (
              <div className="px-4 py-3">
                <SignInButton className="w-full" />
              </div>
            ) : (
              <div className="px-4 py-3" aria-hidden>
                <div className="h-10 w-full" />
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
