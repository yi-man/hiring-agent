import type { SyncUnreadCandidateConversationsResult } from '@/lib/candidate-communication/client';

export function CandidateCommunicationSyncResultPanel({
  result,
}: {
  result: SyncUnreadCandidateConversationsResult;
}) {
  return (
    <div
      aria-label="沟通流程结果"
      className="border-border bg-muted/30 rounded-md border px-3 py-2 text-xs"
    >
      <div className="text-foreground flex items-center justify-between gap-2 font-medium">
        <span>沟通流程完成</span>
        <span className="text-muted-foreground">
          {result.stoppedReason === 'no_unread_messages' ? '无待处理' : result.status}
        </span>
      </div>
      <p className="text-muted-foreground mt-1">
        已处理 {result.processed} 条，失败 {result.failed} 条，扫描 {result.passes} 轮
      </p>
    </div>
  );
}
