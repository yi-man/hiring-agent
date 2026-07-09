import {
  buildCalibrationProfileForCategory,
  CANDIDATE_CALIBRATION_CATEGORIES,
  inferCalibrationCategoryFromText,
} from './calibration';
import {
  CANDIDATE_SCORING_DATASET_DESCRIPTION,
  CANDIDATE_SCORING_DATASET_VERSION,
  listCandidateScoringDatasetSamples,
} from './scoring-dataset';
import type { CandidateCalibrationCategory } from './types';

export type CalibrationOpResult = {
  operation: 'list' | 'show' | 'doctor' | 'export' | 'dataset' | 'usage';
  detail: string;
  exitCode: 0 | 1;
};

const CATEGORY_SET = new Set(CANDIDATE_CALIBRATION_CATEGORIES.map((item) => item.category));

export function getCalibrationOpsUsage(): string {
  return `Usage: candidate-screening-calibration <command>

Commands:
  list
    列出内置岗位校准类型。

  show <category>
    查看某个岗位类型的校准锚点，例如 technical、product、sales。

  doctor <jd text...>
    根据一段 JD 文本推断会使用哪个校准类型。

  export <category>
    以 JSON 导出某个岗位类型的完整校准 profile，方便评审和回归留档。

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

function formatProfile(category: CandidateCalibrationCategory): string {
  const profile = buildCalibrationProfileForCategory(category);
  const anchors = profile.anchors
    .map(
      (anchor) =>
        `- ${anchor.label} ${anchor.expectedAction} ${anchor.scoreRange[0]}-${anchor.scoreRange[1]}：${anchor.guidance}`,
    )
    .join('\n');

  return `${profile.category} / ${profile.categoryLabel}
version: ${profile.version}

校准锚点:
${anchors}

抽样复盘:
${profile.reviewSampling.map((item) => `- ${item}`).join('\n')}`;
}

function formatDatasetSummary(): string {
  const lines = [
    `评分数据集: ${CANDIDATE_SCORING_DATASET_VERSION}`,
    CANDIDATE_SCORING_DATASET_DESCRIPTION,
    '',
  ];

  for (const item of CANDIDATE_CALIBRATION_CATEGORIES) {
    const category = item.category;
    const samples = listCandidateScoringDatasetSamples({ category });
    if (samples.length === 0) continue;

    const anchors = samples
      .map(
        (sample) =>
          `${sample.anchor} ${sample.expected.action} ${sample.expected.scoreRange[0]}-${sample.expected.scoreRange[1]}`,
      )
      .join(' · ');
    lines.push(`${category}\t${item.label}\t${samples.length} samples\t${anchors}`);
  }

  return lines.join('\n');
}

function formatDatasetSamples(category: CandidateCalibrationCategory): string {
  const profile = buildCalibrationProfileForCategory(category);
  const samples = listCandidateScoringDatasetSamples({ category });
  const formattedSamples = samples
    .map(
      (sample) => `- ${sample.id} ${sample.anchor}
  expected: ${sample.expected.action} ${sample.expected.scoreRange[0]}-${sample.expected.scoreRange[1]} ${sample.expected.priority}
  JD: ${sample.jobTitle}｜${sample.jdText}
  candidate: ${sample.candidateName}
  resume: ${sample.resumeText}
  rationale: ${sample.rationale}`,
    )
    .join('\n');

  return `${profile.category} / ${profile.categoryLabel}
dataset: ${CANDIDATE_SCORING_DATASET_VERSION}
samples: ${samples.length}

${formattedSamples}`;
}

function exportDatasetSamples(category: CandidateCalibrationCategory): string {
  return JSON.stringify(
    {
      version: CANDIDATE_SCORING_DATASET_VERSION,
      category,
      samples: listCandidateScoringDatasetSamples({ category }),
    },
    null,
    2,
  );
}

function runDatasetOp(args: string[]): CalibrationOpResult {
  const [command, categoryArg] = args;

  if (!command) {
    return {
      operation: 'dataset',
      detail: formatDatasetSummary(),
      exitCode: 0,
    };
  }

  if (command === 'show') {
    const category = resolveCategory(categoryArg);
    if (!category) {
      return {
        operation: 'usage',
        detail: `Unknown calibration category: ${categoryArg ?? '<missing>'}\n\n${getCalibrationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return {
      operation: 'dataset',
      detail: formatDatasetSamples(category),
      exitCode: 0,
    };
  }

  if (command === 'export') {
    const category = resolveCategory(categoryArg);
    if (!category) {
      return {
        operation: 'usage',
        detail: `Unknown calibration category: ${categoryArg ?? '<missing>'}\n\n${getCalibrationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return {
      operation: 'dataset',
      detail: exportDatasetSamples(category),
      exitCode: 0,
    };
  }

  return {
    operation: 'usage',
    detail: `Unknown dataset command: ${command}\n\n${getCalibrationOpsUsage()}`,
    exitCode: 1,
  };
}

export function runCalibrationOp(args: string[]): CalibrationOpResult {
  const [command, categoryArg, ...rest] = args;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { operation: 'usage', detail: getCalibrationOpsUsage(), exitCode: 0 };
  }

  if (command === 'list') {
    return {
      operation: 'list',
      detail: CANDIDATE_CALIBRATION_CATEGORIES.map(
        (item) => `${item.category}\t${item.label}`,
      ).join('\n'),
      exitCode: 0,
    };
  }

  if (command === 'show') {
    const category = resolveCategory(categoryArg);
    if (!category) {
      return {
        operation: 'usage',
        detail: `Unknown calibration category: ${categoryArg ?? '<missing>'}\n\n${getCalibrationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return { operation: 'show', detail: formatProfile(category), exitCode: 0 };
  }

  if (command === 'doctor') {
    const jdText = [categoryArg, ...rest].filter(Boolean).join(' ');
    if (!jdText.trim()) {
      return {
        operation: 'usage',
        detail: `Missing JD text.\n\n${getCalibrationOpsUsage()}`,
        exitCode: 1,
      };
    }
    const category = inferCalibrationCategoryFromText(jdText);
    const profile = buildCalibrationProfileForCategory(category);
    return {
      operation: 'doctor',
      detail: `推断校准类型：${profile.category} / ${profile.categoryLabel}\n\n${formatProfile(category)}`,
      exitCode: 0,
    };
  }

  if (command === 'export') {
    const category = resolveCategory(categoryArg);
    if (!category) {
      return {
        operation: 'usage',
        detail: `Unknown calibration category: ${categoryArg ?? '<missing>'}\n\n${getCalibrationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return {
      operation: 'export',
      detail: JSON.stringify(buildCalibrationProfileForCategory(category), null, 2),
      exitCode: 0,
    };
  }

  if (command === 'dataset') {
    return runDatasetOp([categoryArg, ...rest].filter(Boolean));
  }

  return {
    operation: 'usage',
    detail: `Unknown command: ${command}\n\n${getCalibrationOpsUsage()}`,
    exitCode: 1,
  };
}
