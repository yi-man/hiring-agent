import { getObservabilityOpsUsage, runObservabilityOp } from '@/lib/llm-observability/ops-runner';

async function main(): Promise<void> {
  try {
    const result = await runObservabilityOp(process.argv.slice(2));
    console.log(`[llm-observability] ${result.operation}: ${result.detail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (!message.includes('Usage: llm-observability-ops')) {
      console.error(getObservabilityOpsUsage());
    }
    process.exitCode = 1;
  }
}

void main();
