import { z } from 'zod';

const jdScoreSchema = z.object({
  clarity: z.number(),
  completeness: z.number(),
  attractiveness: z.number(),
  specificity: z.number(),
});

export const jdJsonSchema = z.object({
  title: z.string(),
  summary: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  bonus: z.array(z.string()),
  highlights: z.array(z.string()),
});

export const evaluationJsonSchema = z.object({
  scores: jdScoreSchema,
  issues: z.array(z.string()),
  evidence: z.array(z.string()),
  suggestions: z.array(z.string()),
  rewrite_required: z.boolean(),
});

export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}
