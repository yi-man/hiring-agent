import { Button, Card, CardBody } from '@/components/ui';
import type { LogItem } from '@/components/llm-observability/types';

type LogTableProps = {
  logs: LogItem[];
  page: number;
  hasMore: boolean;
  total: number;
  isLoading?: boolean;
  canLoadDetails?: boolean;
  onPageChange: (page: number) => void;
  onSelectLog: (log: LogItem) => void;
};

export function LogTable({
  logs,
  page,
  hasMore,
  total,
  isLoading = false,
  canLoadDetails = false,
  onPageChange,
  onSelectLog,
}: LogTableProps) {
  return (
    <Card className="border-border/60 bg-background/70 border">
      <CardBody className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Logs</h2>
          <div className="text-foreground/70 text-xs">Total: {total.toLocaleString()}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-foreground/70 border-b text-left">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Endpoint</th>
                <th className="px-2 py-2">Provider/Model</th>
                <th className="px-2 py-2">Latency</th>
                <th className="px-2 py-2">Tokens</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className={`border-b border-dashed ${log.isError ? 'bg-danger/10' : ''}`}
                  data-testid={log.isError ? 'error-row' : 'ok-row'}
                >
                  <td className="px-2 py-2">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="max-w-[220px] truncate px-2 py-2">{log.endpoint}</td>
                  <td className="px-2 py-2">
                    {log.provider} / {log.model}
                  </td>
                  <td className="px-2 py-2">{log.latencyMs}ms</td>
                  <td className="px-2 py-2">{log.totalTokens.toLocaleString()}</td>
                  <td className="px-2 py-2">
                    {log.isError ? `Error (${log.errorCode ?? 'unknown'})` : 'OK'}
                  </td>
                  <td className="px-2 py-2">
                    <Button size="sm" variant="light" onClick={() => onSelectLog(log)}>
                      {canLoadDetails ? 'Details' : 'View'}
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-foreground/70 px-2 py-6 text-center">
                    No logs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="light"
            isDisabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </Button>
          <div className="text-foreground/70 text-xs">Page {page}</div>
          <Button
            size="sm"
            variant="light"
            isDisabled={!hasMore}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
