import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '@/components/navbar';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'unauthenticated',
    data: null,
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Menu: jest.fn(() => <div data-testid="menu-icon" />),
  X: jest.fn(() => <div data-testid="x-icon" />),
  Github: jest.fn(() => <div data-testid="github-icon" />),
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
  it('should display logo and main navigation links', () => {
    render(<Navbar />);

    expect(screen.getByText('招聘助手')).toBeInTheDocument();

    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('对话')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.getByText('JD 工作台')).toBeInTheDocument();
    expect(screen.getByText('LLM 可观测')).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    render(<Navbar />);

    const themeButtons = screen.getAllByTestId('theme-toggle-button');
    expect(themeButtons).toHaveLength(2);
    themeButtons.forEach((button) => {
      expect(button).toBeInTheDocument();
    });
  });

  it('should render mobile menu button', () => {
    render(<Navbar />);
    expect(screen.getByTestId('menu-icon')).toBeInTheDocument();
  });

  it('should open mobile menu when button is clicked', () => {
    render(<Navbar />);

    const menuButton = screen.getByRole('button', { name: /菜单/i });
    fireEvent.click(menuButton);

    const homeLinks = screen.getAllByText('首页');
    expect(homeLinks.length).toBe(2);
  });
});
