import { Card, CardBody } from '@/components/ui';
import type { OverviewResponse } from '@/components/llm-observability/types';

type OverviewCardsProps = {
  data: OverviewResponse['overview'] | null;
  isLoading?: boolean;
};

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function OverviewCards({ data, isLoading = false }: OverviewCardsProps) {
  if (!data || isLoading) {
    return <div className="text-foreground/70 text-sm">Loading overview...</div>;
  }

  const items = [
    { label: 'Today', value: data.today },
    { label: 'Week', value: data.week },
    { label: 'Total', value: data.total },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="border-border/60 bg-background/70 border">
          <CardBody className="space-y-2 p-4">
            <div className="text-foreground/80 text-sm font-medium">{item.label}</div>
            <div className="text-2xl font-semibold">
              {item.value.totalCalls.toLocaleString()} calls
            </div>
            <div className="text-foreground/70 text-sm">
              Tokens: {item.value.totalTokens.toLocaleString()} | Errors:{' '}
              {item.value.errorCalls.toLocaleString()}
            </div>
            <div className="text-foreground/70 text-sm">
              Error rate: {formatRate(item.value.errorRate)} | Avg latency:{' '}
              {Math.round(item.value.avgLatencyMs)}ms
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
