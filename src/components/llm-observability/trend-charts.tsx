import { Card, CardBody } from '@/components/ui';
import type { TrendPoint } from '@/components/llm-observability/types';

type TrendChartsProps = {
  points: TrendPoint[];
  isLoading?: boolean;
};

function trendDelta(points: TrendPoint[], key: keyof TrendPoint): string {
  if (points.length < 2) return 'n/a';
  const first = Number(points[0][key]) || 0;
  const last = Number(points[points.length - 1][key]) || 0;
  const delta = last - first;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toLocaleString()}`;
}

export function TrendCharts({ points, isLoading = false }: TrendChartsProps) {
  if (isLoading) {
    return <div className="text-foreground/70 text-sm">Loading trend...</div>;
  }

  return (
    <Card className="border-border/60 bg-background/70 border">
      <CardBody className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Trend</h2>
          <div className="text-foreground/70 text-xs">{points.length} points</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="text-sm font-medium">Calls</div>
            <div className="text-foreground/80 text-xs">
              Delta: {trendDelta(points, 'totalCalls')}
            </div>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="text-sm font-medium">Tokens</div>
            <div className="text-foreground/80 text-xs">
              Delta: {trendDelta(points, 'totalTokens')}
            </div>
          </div>
          <div className="bg-secondary/40 rounded-lg p-3">
            <div className="text-sm font-medium">Errors</div>
            <div className="text-foreground/80 text-xs">
              Delta: {trendDelta(points, 'errorCalls')}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-foreground/70 border-b text-left">
                <th className="px-2 py-2">Bucket</th>
                <th className="px-2 py-2">Calls</th>
                <th className="px-2 py-2">Tokens</th>
                <th className="px-2 py-2">Errors</th>
                <th className="px-2 py-2">Latency</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.bucketStart} className="border-b border-dashed">
                  <td className="px-2 py-2">{point.bucketStart}</td>
                  <td className="px-2 py-2">{point.totalCalls.toLocaleString()}</td>
                  <td className="px-2 py-2">{point.totalTokens.toLocaleString()}</td>
                  <td className="px-2 py-2">{point.errorCalls.toLocaleString()}</td>
                  <td className="px-2 py-2">{Math.round(point.avgLatencyMs)}ms</td>
                </tr>
              ))}
              {points.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-foreground/70 px-2 py-6 text-center">
                    No trend data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
