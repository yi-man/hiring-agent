import { SignInForm } from '@/components/auth/sign-in-form';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-foreground text-2xl font-semibold">Log in</h1>
        <p className="text-muted-foreground text-sm">
          Use your local Hiring Agent account to continue.
        </p>
      </div>
      <SignInForm />
    </main>
  );
}
