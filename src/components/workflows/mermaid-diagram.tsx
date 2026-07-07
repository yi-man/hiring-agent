'use client';

import { useEffect, useId, useState } from 'react';

type MermaidDiagramProps = {
  chart: string;
  label?: string;
};

type RenderState =
  | { status: 'loading'; svg?: undefined; error?: undefined }
  | { status: 'ready'; svg: string; error?: undefined }
  | { status: 'error'; svg?: undefined; error: string };

export function MermaidDiagram({ chart, label = 'Mermaid Flow 图' }: MermaidDiagramProps) {
  const reactId = useId();
  const renderId = `workflow-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [state, setState] = useState<RenderState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setState({ status: 'loading' });

      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
        });
        const { svg } = await mermaid.render(renderId, chart);

        if (!cancelled) {
          setState({ status: 'ready', svg });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Mermaid 图渲染失败',
          });
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  return (
    <figure
      aria-label={label}
      className="border-border bg-background overflow-x-auto rounded-lg border"
      data-testid="mermaid-diagram"
    >
      <div className="min-h-64 min-w-[42rem] p-5">
        {state.status === 'ready' ? (
          <div
            className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        ) : null}
        {state.status === 'loading' ? (
          <div className="text-muted-foreground flex min-h-56 items-center justify-center text-sm">
            正在渲染 Mermaid 图...
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {state.error}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
