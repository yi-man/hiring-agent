import type {
  CompanyWorkLocationInput,
  CompanyWorkLocationKind,
  NormalizedCompanyWorkLocationInput,
  UpsertCompanyProfileParams,
} from './types';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanOptionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function isLocationKind(value: unknown): value is CompanyWorkLocationKind {
  return value === 'office' || value === 'remote';
}

function parseLocation(value: unknown): CompanyWorkLocationInput | null {
  if (!isRecord(value) || !isLocationKind(value.kind)) {
    return null;
  }

  if (value.kind === 'remote') {
    return {
      kind: 'remote',
      label: '远程',
      city: null,
      address: null,
    };
  }

  const label = cleanText(value.label);
  if (!label) {
    return null;
  }

  return {
    kind: 'office',
    label,
    city: cleanOptionalText(value.city),
    address: cleanOptionalText(value.address),
  };
}

export function normalizeCompanyWorkLocations(
  locations: CompanyWorkLocationInput[],
): NormalizedCompanyWorkLocationInput[] {
  const seen = new Set<string>();
  const normalized: CompanyWorkLocationInput[] = [];

  for (const location of locations) {
    const next =
      location.kind === 'remote'
        ? {
            kind: 'remote' as const,
            label: '远程',
            city: null,
            address: null,
          }
        : {
            kind: 'office' as const,
            label: location.label.trim(),
            city: location.city?.trim() || null,
            address: location.address?.trim() || null,
          };

    if (!next.label || seen.has(next.label)) {
      continue;
    }

    seen.add(next.label);
    normalized.push(next);
  }

  return normalized.map((location, sortOrder) => ({ ...location, sortOrder }));
}

export function parseCompanyProfilePayload(
  body: unknown,
): ValidationResult<Omit<UpsertCompanyProfileParams, 'userId'>> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const name = cleanText(body.name);
  if (!name) {
    return { ok: false, error: 'company name is required' };
  }

  if (!Array.isArray(body.locations) || body.locations.length === 0) {
    return { ok: false, error: 'at least one work location is required' };
  }

  const locations = body.locations
    .map((location) => parseLocation(location))
    .filter((location): location is CompanyWorkLocationInput => location !== null);
  const normalized = normalizeCompanyWorkLocations(locations).map((location) => ({
    kind: location.kind,
    label: location.label,
    city: location.city,
    address: location.address,
  }));

  if (normalized.length === 0) {
    return { ok: false, error: 'at least one work location is required' };
  }

  return {
    ok: true,
    value: {
      name,
      locations: normalized,
    },
  };
}
