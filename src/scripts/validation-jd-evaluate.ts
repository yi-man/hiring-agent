import { runJdEvaluateValidationOp } from '@/lib/validation/jd-evaluate/scripts/ops';

async function main(): Promise<void> {
  const result = await runJdEvaluateValidationOp(process.argv.slice(2));

  if (result.detail) {
    const write = result.exitCode === 0 ? console.log : console.error;
    write(result.detail);
  }
  process.exitCode = result.exitCode;
}

void main();
