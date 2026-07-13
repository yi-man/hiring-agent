type JobDescriptionTitleSource = {
  position: string;
  content?: {
    title?: string | null;
  } | null;
};

export function getJobDescriptionDisplayTitle(jobDescription: JobDescriptionTitleSource): string {
  const title = jobDescription.content?.title?.trim() ?? '';
  if (title) return title;
  return jobDescription.position.trim();
}
