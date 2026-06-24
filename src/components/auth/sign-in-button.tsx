'use client';

import Link from 'next/link';
import { LogIn } from 'lucide-react';

type SignInButtonProps = {
  className?: string;
};

export function SignInButton({ className }: SignInButtonProps) {
  return (
    <Link
      className={`bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors ${className ?? ''}`}
      href="/auth/signin"
    >
      <LogIn className="h-4 w-4" />
      Log in
    </Link>
  );
}
