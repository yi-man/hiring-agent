import type { EvaluationSchema, SearchPlan } from './types';
import type { JobDescriptionDto } from '@/types';

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values
    .map(clean)
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(value);
    });

  return result;
}

export function buildScreeningPlanFromJd(jobDescription: JobDescriptionDto): {
  searchPlan: SearchPlan;
  evaluationSchema: EvaluationSchema;
} {
  const skills = unique(jobDescription.content.requirements);
  const domainKnowledge = unique([
    jobDescription.department,
    ...jobDescription.content.responsibilities,
    ...jobDescription.content.highlights,
  ]);
  const generalAbility = unique([
    jobDescription.positionDescription,
    jobDescription.content.summary,
    ...jobDescription.content.bonus,
  ]);
  const risk = ['简历信息不完整', '岗位经验不匹配', '稳定性风险'];
  const keywords = unique([
    jobDescription.position,
    jobDescription.content.title,
    ...skills,
    ...jobDescription.content.bonus,
  ]);
  const retrievalQuery = unique([
    jobDescription.position,
    jobDescription.department,
    jobDescription.positionDescription,
    jobDescription.content.summary,
    ...skills,
  ]).join(' ');

  return {
    searchPlan: {
      keywords,
      filters: {},
      priorityTags: unique([...skills, ...jobDescription.content.highlights]),
      retrievalQuery,
    },
    evaluationSchema: {
      skills,
      domainKnowledge,
      generalAbility,
      risk,
    },
  };
}
