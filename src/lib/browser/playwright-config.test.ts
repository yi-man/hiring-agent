/**
 * @jest-environment node
 */
import { resolvePlaywrightHeadlessOption } from './playwright-config';

describe('resolvePlaywrightHeadlessOption', () => {
  it('defaults runtime Playwright flows to headed browsers', () => {
    expect(resolvePlaywrightHeadlessOption(undefined, {})).toBe(false);
  });

  it('allows explicit test code to opt into headless mode', () => {
    expect(resolvePlaywrightHeadlessOption(true, {})).toBe(true);
    expect(resolvePlaywrightHeadlessOption(false, { PLAYWRIGHT_HEADLESS: 'true' })).toBe(false);
  });

  it('reads PLAYWRIGHT_HEADLESS only when no explicit option is provided', () => {
    expect(resolvePlaywrightHeadlessOption(undefined, { PLAYWRIGHT_HEADLESS: 'true' })).toBe(true);
    expect(resolvePlaywrightHeadlessOption(undefined, { PLAYWRIGHT_HEADLESS: '1' })).toBe(true);
    expect(resolvePlaywrightHeadlessOption(undefined, { PLAYWRIGHT_HEADLESS: 'no' })).toBe(false);
  });

  it('rejects invalid PLAYWRIGHT_HEADLESS values', () => {
    expect(() =>
      resolvePlaywrightHeadlessOption(undefined, { PLAYWRIGHT_HEADLESS: 'maybe' }),
    ).toThrow(/PLAYWRIGHT_HEADLESS/);
  });
});
