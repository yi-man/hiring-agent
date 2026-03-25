import { extractJsonObject, jdJsonSchema } from '@/lib/jd-agent/json-schemas';

describe('json-schemas', () => {
  it('extracts JSON from fenced block', () => {
    const raw =
      'prefix\n```json\n{"title":"a","summary":"b","responsibilities":[],"requirements":[],"bonus":[],"highlights":[]}\n```';
    const extracted = extractJsonObject(raw);
    expect(jdJsonSchema.parse(JSON.parse(extracted)).title).toBe('a');
  });

  it('extracts JSON object from surrounding text', () => {
    const raw =
      'here: {"title":"x","summary":"y","responsibilities":[],"requirements":[],"bonus":[],"highlights":[]} end';
    const extracted = extractJsonObject(raw);
    expect(jdJsonSchema.parse(JSON.parse(extracted)).title).toBe('x');
  });
});
