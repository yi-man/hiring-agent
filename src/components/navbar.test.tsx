import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Navbar } from '@/components/navbar';

const mockUseSession = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

jest.mock('@/components/ui', () => ({
  Button: ({
    children,
    onClick,
    className,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    [key: string]: unknown;
  }) => (
    <button type="button" onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('lucide-react', () => ({
  Menu: () => <div data-testid="menu-icon" />,
  X: () => <div data-testid="x-icon" />,
  Github: () => <div data-testid="github-icon" />,
  LogOut: () => <div data-testid="logout-icon" />,
}));

describe('Navbar auth states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
  });

  it('shows GitHub sign-in when unauthenticated', async () => {
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
    });
  });

  it('shows user menu and logout when authenticated', async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'Alice',
          email: 'alice@example.com',
        },
      },
      status: 'authenticated',
    });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
  });

  it('calls next-auth actions for sign in and logout', async () => {
    mockUseSession.mockReturnValueOnce({
      data: null,
      status: 'unauthenticated',
    });
    mockUseSession.mockReturnValueOnce({
      data: {
        user: {
          name: 'Alice',
        },
      },
      status: 'authenticated',
    });

    const { unmount } = render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i }));
    expect(mockSignIn).toHaveBeenCalledWith('github');

    unmount();
    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
