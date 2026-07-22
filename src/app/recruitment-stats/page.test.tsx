import { render, screen } from '@testing-library/react';
import RecruitmentStatsRoute from './page';
import { getServerAuthSession } from '@/lib/auth/session';

jest.mock('@/lib/auth/session', () => ({
  getServerAuthSession: jest.fn(),
}));

jest.mock('@/components/auth/sign-in-button', () => ({
  SignInButton: () => <a href="/auth/signin">登录</a>,
}));

jest.mock('@/components/dashboard/recruitment-stats-page', () => ({
  RecruitmentStatsPage: () => <section aria-label="招聘统计内容">招聘统计内容</section>,
}));

const getServerAuthSessionMock = getServerAuthSession as jest.MockedFunction<
  typeof getServerAuthSession
>;

describe('Recruitment stats route', () => {
  beforeEach(() => {
    getServerAuthSessionMock.mockReset();
  });

  it('renders sign-in guidance when unauthenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce(null);

    render(await RecruitmentStatsRoute());

    expect(screen.getByRole('heading', { name: '请先登录后继续' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/auth/signin');
  });

  it('renders recruitment stats for an authenticated user', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });

    render(await RecruitmentStatsRoute());

    expect(screen.getByRole('region', { name: '招聘统计内容' })).toBeInTheDocument();
  });
});
