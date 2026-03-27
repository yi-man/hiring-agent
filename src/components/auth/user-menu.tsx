'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui';

type UserMenuProps = {
  name?: string | null;
};

export function UserMenu({ name }: UserMenuProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-foreground/80 text-sm font-medium">{name || 'User'}</span>
      <Button variant="light" onClick={() => signOut()}>
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </div>
  );
}
