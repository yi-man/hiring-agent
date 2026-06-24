'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

const AUTH_CHANGED_EVENT = 'hiring-agent-auth-changed';

export function SignInForm() {
  const router = useRouter();
  const [username, setUsername] = useState('xxwade');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? 'Unable to log in');
        return;
      }

      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      router.refresh();
      router.push('/chat');
    } catch {
      setError('Unable to log in');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <label className="text-foreground/80 flex flex-col gap-2 text-sm font-medium">
        Username
        <input
          className="border-border bg-background text-foreground focus:border-primary focus:ring-primary/20 rounded-md border px-3 py-2 text-sm transition outline-none focus:ring-2"
          name="username"
          autoComplete="username"
          required
          aria-invalid={error ? true : undefined}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>

      <label className="text-foreground/80 flex flex-col gap-2 text-sm font-medium">
        Password
        <input
          className="border-border bg-background text-foreground focus:border-primary focus:ring-primary/20 rounded-md border px-3 py-2 text-sm transition outline-none focus:ring-2"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Button color="primary" type="submit" disabled={isSubmitting} disableRipple>
        Log in
      </Button>
    </form>
  );
}
