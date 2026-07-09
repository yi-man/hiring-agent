import type { EvaluationSchema, SearchPlan } from './types';
import { buildCalibrationProfileFromJd, buildScoringQualityPolicy } from './calibration';
import {
  buildSearchKeywordsFromProfile,
  extractAtomicKeywords,
  isConciseSearchPhrase,
  normalizeJDSearchProfile,
  uniqueSearchValues,
} from '@/lib/jd/search-profile';
import type { JobDescriptionDto } from '@/types';

function buildSearchKeywords(jobDescription: JobDescriptionDto, skills: string[]): string[] {
  const searchProfile = normalizeJDSearchProfile(jobDescription.generationMeta?.searchProfile);
  if (searchProfile) {
    const profileKeywords = buildSearchKeywordsFromProfile(searchProfile);
    if (profileKeywords.length > 0) return profileKeywords;
  }

  const primarySourceText = uniqueSearchValues([...skills, ...jobDescription.content.bonus]);
  const secondarySourceText = uniqueSearchValues([
    jobDescription.position,
    jobDescription.content.title,
    jobDescription.positionDescription,
    jobDescription.content.summary,
    ...jobDescription.content.responsibilities,
    ...jobDescription.content.highlights,
  ]);
  const conciseKeywords = uniqueSearchValues([
    jobDescription.position,
    jobDescription.content.title,
    ...jobDescription.content.bonus,
  ]).filter(isConciseSearchPhrase);
  const atomicKeywords = uniqueSearchValues([
    ...extractAtomicKeywords(primarySourceText),
    ...extractAtomicKeywords(secondarySourceText),
  ]);
  const keywords = uniqueSearchValues([...atomicKeywords, ...conciseKeywords]);

  return keywords.length > 0 ? keywords : uniqueSearchValues([jobDescription.position, ...skills]);
}

export function buildScreeningPlanFromJd(jobDescription: JobDescriptionDto): {
  searchPlan: SearchPlan;
  evaluationSchema: EvaluationSchema;
} {
  const skills = uniqueSearchValues(jobDescription.content.requirements);
  const domainKnowledge = uniqueSearchValues([
    jobDescription.department,
    ...jobDescription.content.responsibilities,
    ...jobDescription.content.highlights,
  ]);
  const generalAbility = uniqueSearchValues([
    jobDescription.positionDescription,
    jobDescription.content.summary,
    ...jobDescription.content.bonus,
  ]);
  const risk = ['简历信息不完整', '岗位经验不匹配', '稳定性风险'];
  const keywords = buildSearchKeywords(jobDescription, skills);
  const retrievalQuery = uniqueSearchValues([
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
      priorityTags: uniqueSearchValues([...skills, ...jobDescription.content.highlights]),
      retrievalQuery,
    },
    evaluationSchema: {
      skills,
      domainKnowledge,
      generalAbility,
      risk,
      calibrationProfile: buildCalibrationProfileFromJd(jobDescription),
      qualityPolicy: buildScoringQualityPolicy(),
    },
  };
}
