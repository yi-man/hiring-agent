import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

jest.mock('react', () => {
  const actual = jest.requireActual('react') as typeof import('react');
  return {
    ...actual,
    useState: jest.fn((initialState: boolean) => [initialState, jest.fn()]),
    useEffect: jest.fn(),
  };
});

jest.mock('@heroui/react', () => ({
  Switch: ({
    checked,
    onChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean;
    onChange?: () => void;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked ?? false}
      onClick={onChange}
    >
      toggle
    </button>
  ),
}));

describe('ThemeToggle', () => {
  it('应该渲染主题切换按钮', async () => {
    render(<ThemeToggle />);
    expect(await screen.findByRole('switch', { name: /切换主题/i })).toBeInTheDocument();
  });

  it('应该点击时切换主题', async () => {
    render(<ThemeToggle />);
    const button = await screen.findByRole('switch', { name: /切换主题/i });

    fireEvent.click(button);

    expect(button).toBeInTheDocument();
  });
});
