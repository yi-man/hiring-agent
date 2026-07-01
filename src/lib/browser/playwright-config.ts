type PlaywrightEnv = Record<string, string | undefined>;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function parseOptionalBoolean(value: string | undefined, name: string): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`${name} must be one of: true, false, 1, 0, yes, no, on, off`);
}

export function resolvePlaywrightHeadlessOption(
  headless: boolean | undefined,
  env: PlaywrightEnv = process.env,
): boolean {
  if (typeof headless === 'boolean') return headless;
  return parseOptionalBoolean(env.PLAYWRIGHT_HEADLESS, 'PLAYWRIGHT_HEADLESS') ?? false;
}
