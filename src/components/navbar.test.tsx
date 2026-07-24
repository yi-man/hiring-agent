import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/navbar';

const refresh = jest.fn();
const push = jest.fn();
const fetchMock = jest.fn();
const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

type SessionPayload = {
  user: {
    id: string;
    username: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
};

type MockSessionResponse = {
  ok: boolean;
  json: () => Promise<SessionPayload>;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

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

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
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
  UserRound: () => <div data-testid="user-round-icon" />,
  X: () => <div data-testid="x-icon" />,
  LogIn: () => <div data-testid="login-icon" />,
  LogOut: () => <div data-testid="logout-icon" />,
}));

describe('Navbar auth states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ refresh, push });
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    });
  });

  it('shows login link when unauthenticated', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: null }),
    });

    render(<Navbar />);

    expect(screen.getByRole('link', { name: /招聘助手/ })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: '首页' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/auth/signin');
    });
  });

  it('keeps standalone home links out of the mobile auth menu', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: null }),
    });

    render(<Navbar />);

    const accountMenuToggle = screen.getByRole('button', { name: '打开账户菜单' });
    fireEvent.click(accountMenuToggle);

    expect(screen.queryByRole('link', { name: '首页' })).not.toBeInTheDocument();
    expect(await screen.findAllByRole('link', { name: /log in/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '关闭账户菜单' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('shows user menu and logout when authenticated', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: 'user_123',
          username: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
        },
      }),
    });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
  });

  it('posts to local logout and refreshes on logout', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: 'user_123',
          username: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
        },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<Navbar />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hiring-agent-auth-changed',
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/');
  });

  it('refetches the session when auth changes', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user_123',
            username: 'alice',
            name: 'Alice',
            email: 'alice@example.com',
            image: null,
          },
        }),
      });

    render(<Navbar />);

    expect(await screen.findByRole('link', { name: /log in/i })).toBeInTheDocument();
    window.dispatchEvent(new Event('hiring-agent-auth-changed'));

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the latest session response when an older request resolves later', async () => {
    const initialRequest = createDeferred<MockSessionResponse>();
    const refreshedRequest = createDeferred<MockSessionResponse>();

    fetchMock
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshedRequest.promise);

    render(<Navbar />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    window.dispatchEvent(new Event('hiring-agent-auth-changed'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      refreshedRequest.resolve({
        ok: true,
        json: async () => ({
          user: {
            id: 'user_123',
            username: 'alice',
            name: 'Alice',
            email: 'alice@example.com',
            image: null,
          },
        }),
      });
      await refreshedRequest.promise;
    });

    expect(await screen.findByText('Alice')).toBeInTheDocument();

    await act(async () => {
      initialRequest.resolve({
        ok: true,
        json: async () => ({ user: null }),
      });
      await initialRequest.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument();
    });
  });

  it('does not refresh or navigate when logout fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: 'user_123',
          username: 'alice',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
        },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Logout failed' }),
    });

    render(<Navbar />);

    fireEvent.click(await screen.findByRole('button', { name: /logout/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/logout failed/i);
    expect(dispatchEventSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hiring-agent-auth-changed',
      }),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
