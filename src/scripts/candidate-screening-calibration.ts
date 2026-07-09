import {
  getCalibrationOpsUsage,
  runCalibrationOp,
} from '@/lib/candidate-screening/calibration-ops';

function main(): void {
  const result = runCalibrationOp(process.argv.slice(2));

  if (result.detail) {
    const write = result.exitCode === 0 ? console.log : console.error;
    write(result.detail);
  }
  if (result.exitCode !== 0 && !result.detail.includes('Usage: candidate-screening-calibration')) {
    console.error(getCalibrationOpsUsage());
  }
  process.exitCode = result.exitCode;
}

main();
