import type { JD, JDSearchProfile, JobSchema } from '@/types';

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function cleanSearchValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function uniqueSearchValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values
    .map(cleanSearchValue)
    .filter(Boolean)
    .forEach((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(value);
    });

  return result;
}

export function isConciseSearchPhrase(value: string): boolean {
  const phrase = cleanSearchValue(value);
  if (!phrase) return false;
  if (phrase.length > 18) return false;
  if (/[，。；：,.]/.test(phrase)) return false;
  if (/[()（）]/.test(phrase)) return false;
  return !/(经验|熟悉|掌握|理解|负责|确保|以上|年以上|本科|相关专业)/.test(phrase);
}

export function extractAtomicKeywords(values: string[]): string[] {
  const keywords: string[] = [];

  values
    .map(cleanSearchValue)
    .filter(Boolean)
    .forEach((value) => {
      TECH_KEYWORD_PATTERNS.forEach((item) => {
        if (item.pattern.test(value)) {
          keywords.push(item.keyword);
        }
      });
    });

  return uniqueSearchValues(keywords);
}

function normalizeTitleKeyword(value?: string): string | null {
  if (!value) return null;
  const title = cleanSearchValue(value)
    .replace(/[（(].*?[）)]/g, '')
    .trim();
  return isConciseSearchPhrase(title) ? title : null;
}

function extractSeniority(jd: JD, schema?: JobSchema): string | null {
  if (schema?.seniority?.trim()) return cleanSearchValue(schema.seniority);

  const text = [jd.title, jd.summary, ...jd.requirements].join(' ');
  if (/资深|专家|高级|Senior/i.test(text)) return '高级';
  if (/初级|Junior/i.test(text)) return '初级';
  if (/中级|Mid/i.test(text)) return '中级';
  return null;
}

function buildProfileQueries(
  mustHaveKeywords: string[],
  niceToHaveKeywords: string[],
  broadKeywords: string[],
): string[] {
  const queries = [
    uniqueSearchValues([...broadKeywords.slice(0, 1), ...mustHaveKeywords.slice(0, 3)]).join(' '),
    mustHaveKeywords.slice(0, 4).join(' '),
    uniqueSearchValues([...broadKeywords.slice(0, 1), ...niceToHaveKeywords.slice(0, 2)]).join(' '),
  ];

  return uniqueSearchValues(queries);
}

export function buildJDSearchProfile(params: { jd: JD; schema?: JobSchema }): JDSearchProfile {
  const { jd, schema } = params;
  const mustHaveSource = uniqueSearchValues([...(schema?.skills ?? []), ...jd.requirements]);
  const niceToHaveSource = uniqueSearchValues(jd.bonus);
  const titleKeywords = uniqueSearchValues(
    [normalizeTitleKeyword(schema?.title), normalizeTitleKeyword(jd.title)].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const mustHaveKeywords = extractAtomicKeywords(mustHaveSource);
  const niceToHaveKeywords = uniqueSearchValues([
    ...extractAtomicKeywords(niceToHaveSource),
    ...niceToHaveSource.filter(isConciseSearchPhrase),
  ]).filter(
    (keyword) => !mustHaveKeywords.some((must) => must.toLowerCase() === keyword.toLowerCase()),
  );
  const broadKeywords = titleKeywords;

  return {
    mustHaveKeywords,
    niceToHaveKeywords,
    broadKeywords,
    negativeKeywords: [],
    seniority: extractSeniority(jd, schema),
    searchQueries: buildProfileQueries(mustHaveKeywords, niceToHaveKeywords, broadKeywords),
  };
}

export function normalizeJDSearchProfile(value: unknown): JDSearchProfile | null {
  if (!value || typeof value !== 'object') return null;

  const profile = value as Partial<JDSearchProfile>;
  if (
    !isStringArray(profile.mustHaveKeywords) ||
    !isStringArray(profile.niceToHaveKeywords) ||
    !isStringArray(profile.broadKeywords) ||
    !isStringArray(profile.negativeKeywords) ||
    !isStringArray(profile.searchQueries)
  ) {
    return null;
  }

  const normalized: JDSearchProfile = {
    mustHaveKeywords: uniqueSearchValues(profile.mustHaveKeywords),
    niceToHaveKeywords: uniqueSearchValues(profile.niceToHaveKeywords),
    broadKeywords: uniqueSearchValues(profile.broadKeywords),
    negativeKeywords: uniqueSearchValues(profile.negativeKeywords),
    seniority:
      typeof profile.seniority === 'string' && profile.seniority.trim()
        ? cleanSearchValue(profile.seniority)
        : null,
    searchQueries: uniqueSearchValues(profile.searchQueries),
  };
  const keywordCount =
    normalized.mustHaveKeywords.length +
    normalized.niceToHaveKeywords.length +
    normalized.broadKeywords.length;

  return keywordCount > 0 ? normalized : null;
}

export function buildSearchKeywordsFromProfile(profile: JDSearchProfile): string[] {
  return uniqueSearchValues([
    ...profile.mustHaveKeywords,
    ...profile.niceToHaveKeywords,
    ...profile.broadKeywords,
  ]).filter((keyword) => {
    return isConciseSearchPhrase(keyword) || extractAtomicKeywords([keyword]).includes(keyword);
  });
}
