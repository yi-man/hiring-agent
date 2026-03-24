import { render, screen } from '@testing-library/react';
import Loading from './loading';

describe('Loading', () => {
  it('renders loading indicator', () => {
    render(<Loading />);
    expect(screen.getByText('正在加载')).toBeInTheDocument();
    expect(screen.getByText('请稍候，我们正在为您准备内容...')).toBeInTheDocument();
  });

  it('renders spinning loader', () => {
    render(<Loading />);
    const spinner = screen.getByTestId('loader2-icon');
    expect(spinner).toBeInTheDocument();
  });

  it('renders container with correct styling', () => {
    render(<Loading />);
    const container = document.querySelector('.container-custom');
    expect(container).toBeInTheDocument();
  });
});
