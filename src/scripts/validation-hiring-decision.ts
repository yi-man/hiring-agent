import { runHiringDecisionValidationOp } from '@/lib/validation/hiring-decision/scripts/ops';

const result = runHiringDecisionValidationOp(process.argv.slice(2));
const write = result.exitCode === 0 ? console.log : console.error;
write(result.detail);
process.exitCode = result.exitCode;
