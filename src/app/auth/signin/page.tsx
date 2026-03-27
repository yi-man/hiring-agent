import { getSignInErrorMessage } from '@/lib/auth/signin-error';
import Link from 'next/link';

type SignInPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default function SignInPage({ searchParams }: SignInPageProps) {
  const errorCode = searchParams?.error;
  const errorMessage = getSignInErrorMessage(errorCode);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {errorCode ? (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
        >
          {errorMessage}
        </p>
      ) : null}
      <p className="text-sm text-gray-600">Continue with your provider to access your account.</p>
      <Link
        className="inline-flex w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        href="/api/auth/signin/github"
      >
        Continue with GitHub
      </Link>
    </main>
  );
}
