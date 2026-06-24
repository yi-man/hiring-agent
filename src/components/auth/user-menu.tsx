'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui';

const AUTH_CHANGED_EVENT = 'hiring-agent-auth-changed';

type UserMenuProps = {
  name?: string | null;
};

export function UserMenu({ name }: UserMenuProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setIsLoggingOut(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Unable to log out');
        return;
      }

      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      router.refresh();
      router.push('/');
    } catch {
      setError('Unable to log out');
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-foreground/80 text-sm font-medium">{name || 'User'}</span>
      <Button disabled={isLoggingOut} variant="light" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
      {error ? (
        <span className="text-danger text-xs" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
