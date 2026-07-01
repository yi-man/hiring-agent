import { render, screen, within } from '@testing-library/react';
import Home from './page';

describe('Home page', () => {
  it('renders feature overview cards without owning the app menu', () => {
    render(<Home />);

    expect(screen.queryByRole('navigation', { name: '核心功能菜单' })).not.toBeInTheDocument();

    const featureOverview = screen.getByRole('region', { name: '核心能力概览' });
    expect(featureOverview).toBeInTheDocument();

    expect(within(featureOverview).getByRole('link', { name: /进入智能对话/i })).toHaveAttribute(
      'href',
      '/chat',
    );
    expect(within(featureOverview).getByRole('link', { name: /进入知识库/i })).toHaveAttribute(
      'href',
      '/knowledge',
    );
  });
});
