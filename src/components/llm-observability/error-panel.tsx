import { Card, CardBody } from '@/components/ui';
import type { ErrorDistributionResponse } from '@/components/llm-observability/types';

type ErrorPanelProps = {
  data: ErrorDistributionResponse | null;
  isLoading?: boolean;
};

export function ErrorPanel({ data, isLoading = false }: ErrorPanelProps) {
  if (!data || isLoading) {
    return <div className="text-foreground/70 text-sm">Loading error distribution...</div>;
  }

  return (
    <Card className="border-border/60 bg-background/70 border">
      <CardBody className="space-y-4 p-4">
        <h2 className="text-lg font-semibold">Errors</h2>
        <div className="text-foreground/80 text-sm">
          Total errors: {data.summary.totalErrors.toLocaleString()} /{' '}
          {data.summary.totalCalls.toLocaleString()} calls (
          {(data.summary.errorRate * 100).toFixed(1)}%)
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">By provider</h3>
            <ul className="space-y-1 text-sm">
              {data.distributions.providers.slice(0, 5).map((item) => (
                <li key={item.provider} className="flex justify-between">
                  <span>{item.provider}</span>
                  <span>{item.errorCalls.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Top endpoints</h3>
            <ul className="space-y-1 text-sm">
              {data.topErrorEndpoints.slice(0, 5).map((item) => (
                <li key={item.endpoint} className="flex justify-between gap-3">
                  <span className="truncate">{item.endpoint}</span>
                  <span>{item.errorCalls.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
