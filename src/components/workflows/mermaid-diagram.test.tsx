import { waitFor, render, screen } from '@testing-library/react';
import { MermaidDiagram } from './mermaid-diagram';

const initializeMock = jest.fn();
const renderMock = jest.fn();

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}));

describe('MermaidDiagram', () => {
  beforeEach(() => {
    initializeMock.mockReset();
    renderMock.mockReset();
  });

  it('renders Mermaid SVG from chart text', async () => {
    const chart = `flowchart TD
  start --> done`;
    renderMock.mockResolvedValueOnce({
      svg: '<svg role="img" aria-label="Rendered Mermaid"></svg>',
    });

    render(<MermaidDiagram chart={chart} />);

    expect(screen.getByText(/正在渲染 Mermaid 图/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalledWith(expect.stringMatching(/^workflow-mermaid-/), chart);
    });
    expect(initializeMock).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
    });
    expect(screen.getByRole('img', { name: /Rendered Mermaid/i })).toBeInTheDocument();
  });
});
