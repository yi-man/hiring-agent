import type { EvaluationSchema, SearchPlan } from './types';
import type { JobDescriptionDto } from '@/types';

type SearchKeywordPattern = {
  keyword: string;
  pattern: RegExp;
};

const TECH_KEYWORD_PATTERNS: SearchKeywordPattern[] = [
  { keyword: 'TypeScript', pattern: /\bTypeScript\b/i },
  { keyword: 'JavaScript', pattern: /\bJavaScript\b/i },
  { keyword: 'React', pattern: /\bReact\b/i },
  { keyword: 'Vue', pattern: /\bVue(?:\.js)?\b/i },
  { keyword: 'Next.js', pattern: /\bNext(?:\.js|JS)\b/i },
  { keyword: 'Node.js', pattern: /\bNode(?:\.js|JS)\b/i },
  { keyword: 'Python', pattern: /\bPython\b/i },
  { keyword: 'Java', pattern: /(^|[^A-Za-z])Java(?=$|[^A-Za-z])/i },
  { keyword: 'Go', pattern: /(^|[^A-Za-z])Go(?=$|[^A-Za-z])/i },
  { keyword: 'Spring Boot', pattern: /\bSpring\s+Boot\b/i },
  { keyword: 'Spring', pattern: /\bSpring\b/i },
  { keyword: 'Django', pattern: /\bDjango\b/i },
  { keyword: 'Flask', pattern: /\bFlask\b/i },
  { keyword: 'PostgreSQL', pattern: /\bPostgreSQL\b/i },
  { keyword: 'MySQL', pattern: /\bMySQL\b/i },
  { keyword: 'MongoDB', pattern: /\bMongoDB\b/i },
  { keyword: 'Redis', pattern: /\bRedis\b/i },
  { keyword: 'NoSQL', pattern: /\bNoSQL\b/i },
  { keyword: 'SQL', pattern: /(^|[^A-Za-z])SQL(?=$|[^A-Za-z])/i },
  { keyword: 'RESTful API', pattern: /\bRESTful\s+API\b/i },
  { keyword: 'GraphQL', pattern: /\bGraphQL\b/i },
  { keyword: 'LangChain', pattern: /\bLangChain\b/i },
  { keyword: 'LLM', pattern: /(^|[^A-Za-z])LLMs?(?=$|[^A-Za-z])/i },
  { keyword: 'AI', pattern: /(^|[^A-Za-z])AI(?=$|[^A-Za-z])/i },
  { keyword: 'Kubernetes', pattern: /\bKubernetes\b/i },
  { keyword: 'Docker', pattern: /\bDocker\b/i },
  { keyword: '微服务', pattern: /微服务/ },
  { keyword: '消息队列', pattern: /消息队列/ },
  { keyword: '高并发', pattern: /高并发/ },
  { keyword: '系统架构', pattern: /系统架构/ },
  { keyword: '性能优化', pattern: /性能优化/ },
];

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

function isConciseSearchPhrase(value: string): boolean {
  const phrase = clean(value);
  if (!phrase) return false;
  if (phrase.length > 18) return false;
  if (/[，。；：,.]/.test(phrase)) return false;
  if (/[()（）]/.test(phrase)) return false;
  return !/(经验|熟悉|掌握|理解|负责|确保|以上|年以上|本科|相关专业)/.test(phrase);
}

function extractAtomicKeywords(values: string[]): string[] {
  const keywords: string[] = [];

  values
    .map(clean)
    .filter(Boolean)
    .forEach((value) => {
      TECH_KEYWORD_PATTERNS.forEach((item) => {
        if (item.pattern.test(value)) {
          keywords.push(item.keyword);
        }
      });
    });

  return unique(keywords);
}

function buildSearchKeywords(jobDescription: JobDescriptionDto, skills: string[]): string[] {
  const primarySourceText = unique([...skills, ...jobDescription.content.bonus]);
  const secondarySourceText = unique([
    jobDescription.position,
    jobDescription.content.title,
    jobDescription.positionDescription,
    jobDescription.content.summary,
    ...jobDescription.content.responsibilities,
    ...jobDescription.content.highlights,
  ]);
  const conciseKeywords = unique([
    jobDescription.position,
    jobDescription.content.title,
    ...jobDescription.content.bonus,
  ]).filter(isConciseSearchPhrase);
  const atomicKeywords = unique([
    ...extractAtomicKeywords(primarySourceText),
    ...extractAtomicKeywords(secondarySourceText),
  ]);
  const keywords = unique([...atomicKeywords, ...conciseKeywords]);

  return keywords.length > 0 ? keywords : unique([jobDescription.position, ...skills]);
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
  const keywords = buildSearchKeywords(jobDescription, skills);
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
