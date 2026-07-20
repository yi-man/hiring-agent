import type { JDStatus, JobDescriptionDto } from '@/types';

const publishableStatuses = new Set<JDStatus>(['created', 'ready_to_publish', 'publish_failed']);

export function getJobDescriptionPublishConflict(
  jobDescription: Pick<JobDescriptionDto, 'hiringTarget' | 'onboardedCount' | 'status'>,
): string | null {
  if (!publishableStatuses.has(jobDescription.status)) {
    return `job description cannot be published from status ${jobDescription.status}`;
  }
  if (jobDescription.hiringTarget === null) {
    return 'hiring target is required before publishing';
  }
  if (jobDescription.onboardedCount >= jobDescription.hiringTarget) {
    return 'hiring target has already been reached';
  }
  return null;
}
