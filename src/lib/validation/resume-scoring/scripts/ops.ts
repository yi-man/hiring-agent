import { CANDIDATE_CALIBRATION_CATEGORIES } from '@/lib/candidate-screening/calibration';
import type { CandidateCalibrationCategory } from '@/lib/candidate-screening/types';
import {
  exportResumeScoringDatasetSamples,
  formatResumeScoringDatasetSamples,
  formatResumeScoringDatasetSummary,
} from './dataset-ops';

export type ResumeScoringValidationOpResult = {
  operation: 'dataset' | 'usage';
  detail: string;
  exitCode: 0 | 1;
};

const CATEGORY_SET = new Set(CANDIDATE_CALIBRATION_CATEGORIES.map((item) => item.category));

export function getResumeScoringValidationOpsUsage(): string {
  return `Usage: validation-resume-scoring <command>

Commands:
  dataset
    查看内置简历评分 golden sample 数据集概览。

  dataset show <category>
    查看某个岗位类型的简历评分样本。

  dataset export <category>
    以 JSON 导出某个岗位类型的简历评分样本，用于小样本真实回归。`;
}

function isCalibrationCategory(value: string): value is CandidateCalibrationCategory {
  return CATEGORY_SET.has(value as CandidateCalibrationCategory);
}

function resolveCategory(value: string | undefined): CandidateCalibrationCategory | null {
  if (!value) return null;
  return isCalibrationCategory(value) ? value : null;
}

function runDatasetOp(args: string[]): ResumeScoringValidationOpResult {
  const [command, categoryArg] = args;

  if (!command) {
    return {
      operation: 'dataset',
      detail: formatResumeScoringDatasetSummary(),
      exitCode: 0,
    };
  }

  if (command === 'show') {
    const category = resolveCategory(categoryArg);
    if (!category) {
      return {
        operation: 'usage',
        detail: `Unknown calibration category: ${categoryArg ?? '<missing>'}\n\n${getResumeScoringValidationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return {
      operation: 'dataset',
      detail: formatResumeScoringDatasetSamples(category),
      exitCode: 0,
    };
  }

  if (command === 'export') {
    const category = resolveCategory(categoryArg);
    if (!category) {
      return {
        operation: 'usage',
        detail: `Unknown calibration category: ${categoryArg ?? '<missing>'}\n\n${getResumeScoringValidationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return {
      operation: 'dataset',
      detail: exportResumeScoringDatasetSamples(category),
      exitCode: 0,
    };
  }

  return {
    operation: 'usage',
    detail: `Unknown dataset command: ${command}\n\n${getResumeScoringValidationOpsUsage()}`,
    exitCode: 1,
  };
}

export function runResumeScoringValidationOp(args: string[]): ResumeScoringValidationOpResult {
  const [command, ...rest] = args;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { operation: 'usage', detail: getResumeScoringValidationOpsUsage(), exitCode: 0 };
  }

  if (command === 'dataset') {
    return runDatasetOp(rest);
  }

  return {
    operation: 'usage',
    detail: `Unknown command: ${command}\n\n${getResumeScoringValidationOpsUsage()}`,
    exitCode: 1,
  };
}
