'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from '@/components/ui';
import type { LogItem, LlmStatsFilters, LogsResponse } from '@/components/llm-observability/types';

type LogDetailsDrawerProps = {
  isOpen: boolean;
  selectedLog: LogItem | null;
  filters: LlmStatsFilters;
  onClose: () => void;
};

function asPrettyJson(value: unknown): string {
  if (value === undefined) return 'not available';
  return JSON.stringify(value, null, 2);
}

function formatNullable(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export function LogDetailsDrawer({ isOpen, selectedLog, filters, onClose }: LogDetailsDrawerProps) {
  const [details, setDetails] = useState<LogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetails(null);
    setError(null);
    if (!isOpen || !selectedLog) return;
    if (!filters.adminToken) return;

    const loadDetails = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('startDate', filters.startDate);
        params.set('endDate', filters.endDate);
        params.set('timezone', filters.timezone);
        params.set('page', String(filters.page));
        params.set('limit', String(filters.limit));
        params.set('includeDetails', 'true');
        if (filters.provider) params.set('provider', filters.provider);
        if (filters.model) params.set('model', filters.model);
        if (filters.onlyError) params.set('onlyError', 'true');

        const response = await fetch(`/api/llm-stats/logs?${params.toString()}`, {
          headers: { 'x-llm-observability-admin-token': filters.adminToken },
        });
        if (!response.ok) {
          throw new Error(`load details failed: ${response.status}`);
        }
        const json = (await response.json()) as LogsResponse;
        const matched = json.items.find((item) => item.id === selectedLog.id) ?? null;
        setDetails(matched);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'failed to load details');
      } finally {
        setLoading(false);
      }
    };

    void loadDetails();
  }, [filters, isOpen, selectedLog]);

  const displayLog = details ?? selectedLog;
  const fullDetailsJson = displayLog
    ? {
        ...displayLog,
        requestHeaders: details?.requestHeaders,
        requestPayload: details?.requestPayload,
        responsePayload: details?.responsePayload,
      }
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="4xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader>Log Details</ModalHeader>
        <ModalBody>
          {!selectedLog && <div className="text-sm">No log selected.</div>}
          {selectedLog && (
            <div className="space-y-3 pb-4 text-sm">
              <div>
                <strong>ID:</strong> {selectedLog.id}
              </div>
              <div>
                <strong>Endpoint:</strong> {selectedLog.endpoint}
              </div>
              <div>
                <strong>Outcome:</strong> {selectedLog.finalOutcome}
              </div>
              {displayLog && (
                <div className="border-divider grid grid-cols-1 gap-2 rounded border p-3 md:grid-cols-2">
                  <div>
                    <strong>Timestamp:</strong> {displayLog.timestamp}
                  </div>
                  <div>
                    <strong>Provider:</strong> {displayLog.provider}
                  </div>
                  <div>
                    <strong>Model:</strong> {displayLog.model}
                  </div>
                  <div>
                    <strong>Is Error:</strong> {displayLog.isError ? 'true' : 'false'}
                  </div>
                  <div>
                    <strong>HTTP Status:</strong> {formatNullable(displayLog.httpStatus)}
                  </div>
                  <div>
                    <strong>Latency(ms):</strong> {displayLog.latencyMs}
                  </div>
                  <div>
                    <strong>Input Tokens:</strong> {displayLog.inputTokens}
                  </div>
                  <div>
                    <strong>Output Tokens:</strong> {displayLog.outputTokens}
                  </div>
                  <div>
                    <strong>Total Tokens:</strong> {displayLog.totalTokens}
                  </div>
                  <div>
                    <strong>Retry Count:</strong> {displayLog.retryCount}
                  </div>
                  <div>
                    <strong>Error Domain:</strong> {formatNullable(displayLog.errorDomain)}
                  </div>
                  <div>
                    <strong>Error Code:</strong> {formatNullable(displayLog.errorCode)}
                  </div>
                  <div>
                    <strong>Provider Status:</strong> {formatNullable(displayLog.providerStatus)}
                  </div>
                  <div>
                    <strong>Call ID:</strong> {formatNullable(displayLog.callId)}
                  </div>
                  <div>
                    <strong>Trace ID:</strong> {formatNullable(displayLog.traceId)}
                  </div>
                  <div>
                    <strong>Request ID:</strong> {formatNullable(displayLog.requestId)}
                  </div>
                </div>
              )}
              {error && <div className="text-danger">{error}</div>}
              {loading && <div className="text-foreground/70">Loading detailed payloads...</div>}
              {!filters.adminToken && (
                <div className="text-foreground/70">
                  Add admin token in filter bar to request `includeDetails` payloads.
                </div>
              )}
              {filters.adminToken && !loading && !details && (
                <div className="text-foreground/70">
                  Detailed payload not available for this row on current page.
                </div>
              )}
              {details && (
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 font-medium">Request Headers</div>
                    <pre className="bg-secondary/40 overflow-x-auto rounded p-2 text-xs">
                      {asPrettyJson(details.requestHeaders)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 font-medium">Request Payload</div>
                    <pre className="bg-secondary/40 overflow-x-auto rounded p-2 text-xs">
                      {asPrettyJson(details.requestPayload)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 font-medium">Response Payload</div>
                    <pre className="bg-secondary/40 overflow-x-auto rounded p-2 text-xs">
                      {asPrettyJson(details.responsePayload)}
                    </pre>
                  </div>
                </div>
              )}
              {fullDetailsJson && (
                <div>
                  <div className="mb-1 font-medium">Full Details JSON</div>
                  <pre className="bg-secondary/40 overflow-x-auto rounded p-2 text-xs">
                    {asPrettyJson(fullDetailsJson)}
                  </pre>
                </div>
              )}
              <Button size="sm" variant="light" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
