export type ReturnTarget = {
  href: string;
  label: string;
};

type ReturnSearchParams = Pick<URLSearchParams, 'get' | 'toString'>;

const RETURN_TO_PARAM = 'returnTo';
const RETURN_LABEL_PARAM = 'returnLabel';
const FALLBACK_RETURN_LABEL = '返回';

function isSafeInternalHref(value: string | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}

function normalizeReturnLabel(value: string | null, fallbackLabel: string) {
  const trimmed = value?.trim();
  if (!trimmed) return fallbackLabel;
  return trimmed.length > 32 ? trimmed.slice(0, 32) : trimmed;
}

export function getOptionalReturnTarget(
  searchParams: ReturnSearchParams,
  fallbackLabel = FALLBACK_RETURN_LABEL,
): ReturnTarget | null {
  const returnTo = searchParams.get(RETURN_TO_PARAM);
  if (!isSafeInternalHref(returnTo)) return null;

  return {
    href: returnTo.trim(),
    label: normalizeReturnLabel(searchParams.get(RETURN_LABEL_PARAM), fallbackLabel),
  };
}

export function getReturnTarget(
  searchParams: ReturnSearchParams,
  fallback: ReturnTarget,
): ReturnTarget {
  return getOptionalReturnTarget(searchParams, fallback.label) ?? fallback;
}

export function withReturnTarget(href: string, target: ReturnTarget | null | undefined) {
  if (!target || !isSafeInternalHref(target.href) || !isSafeInternalHref(href)) return href;

  const url = new URL(href, 'http://localhost');
  url.searchParams.set(RETURN_TO_PARAM, target.href.trim());
  url.searchParams.set(RETURN_LABEL_PARAM, target.label.trim() || FALLBACK_RETURN_LABEL);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function currentPathWithSearch(pathname: string, searchParams: ReturnSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
