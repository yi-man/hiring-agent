'use client';

import { Github } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui';

type SignInButtonProps = {
  className?: string;
};

export function SignInButton({ className }: SignInButtonProps) {
  return (
    <Button className={className} variant="flat" onClick={() => signIn('github')}>
      <Github className="h-4 w-4" />
      Sign in with GitHub
    </Button>
  );
}
