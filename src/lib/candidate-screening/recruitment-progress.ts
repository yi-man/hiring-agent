import type { CandidateTrackingJobDescriptionDto } from './repo';

export type RecruitmentType = 'recruiting' | 'preparing' | 'filled' | 'closed' | 'all';

export const recruitmentTypeOptions: Array<{ value: RecruitmentType; label: string }> = [
  { value: 'recruiting', label: '招聘中（未招满）' },
  { value: 'preparing', label: '招聘准备中' },
  { value: 'filled', label: '已招满' },
  { value: 'closed', label: '已停止' },
  { value: 'all', label: '全部招聘' },
];

export function isRecruitmentType(value: string | null): value is RecruitmentType {
  return recruitmentTypeOptions.some((option) => option.value === value);
}

export function getRecruitmentType(
  job: CandidateTrackingJobDescriptionDto,
): Exclude<RecruitmentType, 'all'> {
  if (
    job.status === 'filled' ||
    (job.hiringTarget !== null && job.onboardedCount >= job.hiringTarget)
  ) {
    return 'filled';
  }
  if (job.status === 'published') return 'recruiting';
  if (job.status === 'offline' || job.status === 'archived') return 'closed';
  return 'preparing';
}

export function recruitmentProgressLabel(
  job: CandidateTrackingJobDescriptionDto,
  hiringGap: number | null,
): string {
  const type = getRecruitmentType(job);
  if (type === 'filled') return '已完成招聘目标';
  if (type === 'closed') return '已停止招聘';
  if (type === 'preparing') return '招聘准备中';
  return hiringGap === null ? '招聘目标未设置' : `缺口 ${hiringGap} 人`;
}
