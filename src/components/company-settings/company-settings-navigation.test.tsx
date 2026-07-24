import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { CompanySettingsNavigation } from './company-settings-navigation';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

describe('CompanySettingsNavigation', () => {
  it('links to separate company settings pages and marks the active page', () => {
    (usePathname as jest.Mock).mockReturnValue('/settings/company/interview-processes');

    render(<CompanySettingsNavigation />);

    const navigation = screen.getByRole('navigation', { name: '公司设置导航' });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /公司信息/i })).toHaveAttribute(
      'href',
      '/settings/company',
    );
    expect(screen.getByRole('link', { name: /工作地点/i })).toHaveAttribute(
      'href',
      '/settings/company/locations',
    );
    expect(screen.getByRole('link', { name: /面试流程/i })).toHaveAttribute(
      'href',
      '/settings/company/interview-processes',
    );
    expect(screen.getByRole('link', { name: /招聘平台/i })).toHaveAttribute(
      'href',
      '/settings/company/recruitment-platforms',
    );
    expect(screen.getByRole('link', { name: /面试流程/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /公司信息/i })).not.toHaveAttribute('aria-current');
  });
});
