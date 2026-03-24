import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from '@/components/navbar';

// 模拟 lucide-react 图标
jest.mock('lucide-react', () => ({
  Menu: jest.fn(() => <div data-testid="menu-icon" />),
  X: jest.fn(() => <div data-testid="x-icon" />),
  Github: jest.fn(() => <div data-testid="github-icon" />),
}));

// 模拟 ThemeToggle 组件
jest.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: jest.fn(() => <button data-testid="theme-toggle-button">Toggle theme</button>),
}));

// 模拟 Button 组件
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

    // 检查是否有 logo 或品牌名称
    expect(screen.getByText('Next.js 16')).toBeInTheDocument();

    // 检查主要导航链接
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('服务')).toBeInTheDocument();
    expect(screen.getByText('博客')).toBeInTheDocument();
    expect(screen.getByText('关于')).toBeInTheDocument();
    expect(screen.getByText('联系')).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    render(<Navbar />);

    // ThemeToggle 在导航栏中渲染了两次（桌面端和移动端）
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

    // 找到菜单按钮（带有 aria-label="菜单" 的按钮）
    const menuButton = screen.getByRole('button', { name: /菜单/i });
    fireEvent.click(menuButton);

    // 检查是否显示了移动端菜单（会渲染额外的导航链接）
    const homeLinks = screen.getAllByText('首页');
    expect(homeLinks.length).toBe(2);
  });
});
