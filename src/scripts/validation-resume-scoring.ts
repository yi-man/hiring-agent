import {
  getResumeScoringValidationOpsUsage,
  runResumeScoringValidationOp,
} from '@/lib/validation/resume-scoring/scripts/ops';

function main(): void {
  const result = runResumeScoringValidationOp(process.argv.slice(2));

  if (result.detail) {
    const write = result.exitCode === 0 ? console.log : console.error;
    write(result.detail);
  }
  if (result.exitCode !== 0 && !result.detail.includes('Usage: validation-resume-scoring')) {
    console.error(getResumeScoringValidationOpsUsage());
  }
  process.exitCode = result.exitCode;
}

main();
