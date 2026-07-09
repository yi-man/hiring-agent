import {
  buildCalibrationProfileForCategory,
  CANDIDATE_CALIBRATION_CATEGORIES,
} from '@/lib/candidate-screening/calibration';
import type { CandidateCalibrationCategory } from '@/lib/candidate-screening/types';
import {
  CANDIDATE_SCORING_DATASET_DESCRIPTION,
  CANDIDATE_SCORING_DATASET_VERSION,
  listCandidateScoringDatasetSamples,
} from '../dataset';

export function formatResumeScoringDatasetSummary(): string {
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

export function formatResumeScoringDatasetSamples(category: CandidateCalibrationCategory): string {
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

export function exportResumeScoringDatasetSamples(category: CandidateCalibrationCategory): string {
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
