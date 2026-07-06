import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/navbar';

const refresh = jest.fn();
const push = jest.fn();
const fetchMock = jest.fn();
const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Menu: jest.fn(() => <div data-testid="menu-icon" />),
  X: jest.fn(() => <div data-testid="x-icon" />),
  LogIn: jest.fn(() => <div data-testid="login-icon" />),
  LogOut: jest.fn(() => <div data-testid="logout-icon" />),
}));

jest.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: jest.fn(() => <button data-testid="theme-toggle-button">Toggle theme</button>),
}));

jest.mock('@/components/ui', () => ({
  Button: jest.fn(({ children, onClick, ...props }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  )),
}));

describe('Navbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ refresh, push });
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    });
  });

  it('should keep product feature links out of the desktop header', async () => {
    render(<Navbar />);

    expect(screen.getByText('招聘助手')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: '首页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '对话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '知识库' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Workflow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'JD 工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'LLM 可观测' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('should render theme toggle button', async () => {
    render(<Navbar />);

    const themeButtons = screen.getAllByTestId('theme-toggle-button');
    expect(themeButtons).toHaveLength(2);
    themeButtons.forEach((button) => {
      expect(button).toBeInTheDocument();
    });
    expect(await screen.findByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('should render mobile menu button', async () => {
    render(<Navbar />);
    expect(screen.getByTestId('menu-icon')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /log in/i })).toBeInTheDocument();
  });

  it('should open mobile menu when button is clicked', async () => {
    render(<Navbar />);

    const menuButton = screen.getByRole('button', { name: /菜单/i });
    fireEvent.click(menuButton);

    expect(screen.queryByRole('link', { name: '首页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '对话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'JD 工作台' })).not.toBeInTheDocument();
    expect(await screen.findAllByRole('link', { name: /log in/i })).toHaveLength(2);
  });

  it('should render login link when unauthenticated', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: null }),
    });

    render(<Navbar />);

    expect(await screen.findByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      '/auth/signin',
    );
  });

  it('should render user menu and logout when authenticated', async () => {
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

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('should post to local logout when logout is clicked', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: /logout/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'hiring-agent-auth-changed',
        }),
      );
      expect(refresh).toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith('/');
    });
  });

  it('should refetch session when auth changes', async () => {
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

  it('should not refresh or navigate when logout fails', async () => {
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
