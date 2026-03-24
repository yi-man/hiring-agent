import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  it('应该显示页面标题', () => {
    render(<Home />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toContain('构建现代化 Web 应用');
  });

  it('应该显示快速开始按钮', () => {
    render(<Home />);
    const buttons = screen.getAllByText(/快速开始/);
    const button = buttons.find((el) => el.tagName === 'BUTTON');
    expect(button).toBeInTheDocument();
  });

  it('应该显示功能特性卡片', () => {
    render(<Home />);
    const featuresSection = screen
      .getByRole('heading', { level: 2, name: /强大的/ })
      .closest('section');
    expect(featuresSection).toBeInTheDocument();
    expect(screen.getAllByText(/极速开发/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/完整技术栈/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/精美设计/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/代码规范/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/工程化配置/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/版本控制/).length).toBeGreaterThan(0);
  });

  it('应该显示快速开始代码示例', () => {
    render(<Home />);
    expect(screen.getByText(/安装依赖/)).toBeInTheDocument();
    expect(screen.getByText(/启动开发服务器/)).toBeInTheDocument();
    expect(screen.getByText(/构建生产版本/)).toBeInTheDocument();
  });

  it('应该显示项目架构信息', () => {
    render(<Home />);
    const projectArchitecture = screen.getByText(/项目架构/).closest('.hero-ui-card');
    expect(projectArchitecture).toBeInTheDocument();
    expect(projectArchitecture?.textContent).toContain('App Router');
    expect(projectArchitecture?.textContent).toContain('Server Components');
    expect(projectArchitecture?.textContent).toContain('TypeScript');
    expect(projectArchitecture?.textContent).toContain('Tailwind CSS');
    expect(projectArchitecture?.textContent).toContain('HeroUI');
    expect(projectArchitecture?.textContent).toContain('Jest + Cypress');
  });
});
