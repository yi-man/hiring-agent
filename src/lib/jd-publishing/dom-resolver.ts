import type { Locator, Page } from 'playwright';
import type {
  BrowserResolveOptions,
  BrowserTargetInput,
  DomCandidate,
  LocatorMatchReport,
  StructuredDomSnapshot,
  TargetDescriptor,
} from './types';

type ResolverStatus = LocatorMatchReport['status'];

type ResolverStrategy =
  | 'stable_attr:testId'
  | 'stable_attr:id'
  | 'stable_attr:name'
  | 'stable_attr:ariaLabel'
  | 'stable_attr:autocomplete'
  | 'role_name'
  | 'label'
  | 'placeholder'
  | 'semantic_proximity'
  | 'text'
  | 'safe_css'
  | 'legacy_locator'
  | 'xpath_diagnostic';

type CandidateMatch = DomCandidate & {
  locator: Locator;
  strategy: ResolverStrategy;
  score: number;
  scopeKind?: string;
  scopeName?: string;
};

export type ResolveTargetResult = {
  locator: Locator | null;
  report: LocatorMatchReport;
};

const FIELD_SELECTOR =
  'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]';
const BUTTON_SELECTOR =
  'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]';
const LINK_SELECTOR = 'a[href], [role="link"]';
const CLEAR_SCORE_MARGIN = 12;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function includesName(candidate: string | undefined, target: TargetDescriptor): boolean {
  const candidateText = normalizeText(candidate);
  const targetText = normalizeText(target.name);
  if (!candidateText || !targetText) return false;
  return target.exact ? candidateText === targetText : candidateText.includes(targetText);
}

function cssAttr(name: string, value: string): string {
  return `[${name}=${JSON.stringify(value)}]`;
}

function inferKindFromAction(action: BrowserResolveOptions['action']): TargetDescriptor['kind'] {
  if (action === 'fill' || action === 'add_keywords') return 'field';
  if (action === 'click') return 'button';
  if (action === 'wait_for_text' || action === 'check') return 'text';
  return 'container';
}

export function targetFromLegacyLocator(
  locator: string,
  kind: TargetDescriptor['kind'] = 'field',
): TargetDescriptor {
  const role =
    kind === 'field'
      ? 'textbox'
      : kind === 'button'
        ? 'button'
        : kind === 'link'
          ? 'link'
          : undefined;
  return {
    kind,
    role,
    name: locator.trim(),
    exact: false,
  };
}

function normalizeTarget(
  input: BrowserTargetInput,
  options: BrowserResolveOptions,
): { target: TargetDescriptor; legacyLocator?: string } {
  if (typeof input !== 'string') return { target: input };
  return {
    target: targetFromLegacyLocator(input, inferKindFromAction(options.action)),
    legacyLocator: input,
  };
}

function candidateEvidence(candidate: CandidateMatch): DomCandidate {
  return {
    tag: candidate.tag,
    role: candidate.role,
    accessibleName: candidate.accessibleName,
    label: candidate.label,
    placeholder: candidate.placeholder,
    id: candidate.id,
    name: candidate.name,
    testId: candidate.testId,
    text: candidate.text,
    visible: candidate.visible,
    enabled: candidate.enabled,
    editable: candidate.editable,
    cssPath: candidate.cssPath,
  };
}

function inferRoleFromCandidate(candidate: DomCandidate): string | undefined {
  if (candidate.role) return candidate.role;
  if (candidate.tag === 'textarea') return 'textbox';
  if (candidate.tag === 'select') return 'combobox';
  if (candidate.tag === 'button') return 'button';
  if (candidate.tag === 'a') return 'link';
  if (candidate.tag === 'form') return 'form';
  if (candidate.tag === 'input') return candidate.editable ? 'textbox' : undefined;
  return undefined;
}

function matchesExpectedKind(candidate: DomCandidate, target: TargetDescriptor): boolean {
  const role = inferRoleFromCandidate(candidate);
  if (target.kind === 'field') {
    return (
      candidate.editable ||
      role === 'textbox' ||
      role === 'combobox' ||
      ['input', 'textarea', 'select'].includes(candidate.tag)
    );
  }
  if (target.kind === 'button') {
    return role === 'button' || candidate.tag === 'button';
  }
  if (target.kind === 'link') {
    return role === 'link' || candidate.tag === 'a';
  }
  if (target.kind === 'text') {
    return Boolean(candidate.text || candidate.accessibleName);
  }
  return true;
}

function matchesScope(candidate: CandidateMatch, target: TargetDescriptor): boolean {
  if (!target.scope || target.scope.kind === 'page') return true;
  if (candidate.scopeKind !== target.scope.kind) return false;
  if (!target.scope.name) return true;
  return includesName(candidate.scopeName, {
    kind: target.scope.kind === 'form' ? 'container' : target.kind,
    name: target.scope.name,
    exact: target.exact,
  });
}

function actionRequiresEditable(options: BrowserResolveOptions): boolean {
  return Boolean(
    options.requireEditable || options.action === 'fill' || options.action === 'add_keywords',
  );
}

function filterCandidates(
  candidates: CandidateMatch[],
  target: TargetDescriptor,
  options: BrowserResolveOptions,
): CandidateMatch[] {
  return candidates
    .filter((candidate) => candidate.visible)
    .filter((candidate) => candidate.enabled)
    .filter((candidate) => (actionRequiresEditable(options) ? candidate.editable : true))
    .filter((candidate) => matchesExpectedKind(candidate, target))
    .filter((candidate) => matchesScope(candidate, target));
}

function scoreCandidate(
  candidate: CandidateMatch,
  target: TargetDescriptor,
  baseScore: number,
): CandidateMatch {
  let score = baseScore;
  if (includesName(candidate.accessibleName, { ...target, exact: true })) score += 8;
  if (includesName(candidate.label, { ...target, exact: true })) score += 6;
  if (target.scope && matchesScope(candidate, target)) score += 4;
  if (target.role && inferRoleFromCandidate(candidate) === target.role) score += 3;
  if (candidate.testId || candidate.id || candidate.name) score += 2;
  return { ...candidate, score };
}

function decideMatch(params: {
  target: TargetDescriptor;
  strategy: ResolverStrategy;
  candidates: CandidateMatch[];
  strategiesTried?: ResolverStrategy[];
}): ResolveTargetResult {
  const { target, strategy } = params;
  const candidates = [...params.candidates].sort((left, right) => right.score - left.score);
  const evidence = candidates.map(candidateEvidence);
  const strategiesTried = params.strategiesTried ?? [strategy];

  if (candidates.length === 0) {
    return {
      locator: null,
      report: {
        target,
        status: 'not_found',
        strategy,
        strategiesTried,
        candidateCount: 0,
        confidence: 0,
        candidates: [],
        reason: `No candidate matched ${target.kind} "${target.name}"`,
      },
    };
  }

  const [chosen, runnerUp] = candidates;
  const confidence = Math.min(1, chosen.score / 100);
  const clearMargin = !runnerUp || chosen.score - runnerUp.score >= CLEAR_SCORE_MARGIN;
  const status: ResolverStatus =
    candidates.length === 1 ? 'unique' : clearMargin ? 'unique' : 'ambiguous';

  return {
    locator: status === 'ambiguous' ? null : chosen.locator,
    report: {
      target,
      status,
      strategy,
      strategiesTried,
      candidateCount: candidates.length,
      confidence: status === 'ambiguous' ? Math.min(confidence, 0.69) : confidence,
      chosen: status === 'ambiguous' ? undefined : candidateEvidence(chosen),
      candidates: evidence,
      reason:
        status === 'ambiguous'
          ? `Multiple candidates matched ${target.kind} "${target.name}" without a clear score margin`
          : undefined,
    },
  };
}

async function candidateFromLocator(params: {
  locator: Locator;
  strategy: ResolverStrategy;
  score: number;
}): Promise<CandidateMatch | null> {
  const { locator, strategy, score } = params;
  const attached = await locator
    .count()
    .then((count) => count > 0)
    .catch(() => false);
  if (!attached) return null;

  const [visible, enabled, editable, dom] = await Promise.all([
    locator.isVisible().catch(() => false),
    locator.isEnabled().catch(() => true),
    locator.isEditable().catch(() => false),
    locator.evaluate(
      /* istanbul ignore next -- serialized into the browser context. */
      (element) => {
        function textOf(node: Element | null): string | undefined {
          const text = (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
          return text || undefined;
        }

        function cssPathFor(elementNode: Element): string {
          const stableId = elementNode.getAttribute('id');
          if (stableId) return `[id=${JSON.stringify(stableId)}]`;
          const stableTestId =
            elementNode.getAttribute('data-testid') ?? elementNode.getAttribute('data-e2e');
          if (stableTestId) return `[data-testid=${JSON.stringify(stableTestId)}]`;
          const stableName = elementNode.getAttribute('name');
          if (stableName)
            return `${elementNode.tagName.toLowerCase()}[name=${JSON.stringify(stableName)}]`;
          const parts: string[] = [];
          let current: Element | null = elementNode;
          while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
            const tag = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              parts.unshift(tag);
              break;
            }
            const siblings = (Array.from(parent.children) as Element[]).filter(
              (child) => child.tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            parts.unshift(`${tag}:nth-of-type(${index})`);
            current = parent;
          }
          return parts.join(' > ');
        }

        function labelTextFor(elementNode: Element): string | undefined {
          const control = elementNode as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          const labels = 'labels' in control ? Array.from(control.labels ?? []) : [];
          const label = labels.map(textOf).find(Boolean);
          if (label) return label;
          const labelledBy = elementNode.getAttribute('aria-labelledby');
          if (labelledBy) {
            return labelledBy
              .split(/\s+/)
              .map((id) => textOf(document.getElementById(id)))
              .filter(Boolean)
              .join(' ');
          }
          return undefined;
        }

        function inferRole(elementNode: Element): string | undefined {
          const explicitRole = elementNode.getAttribute('role');
          if (explicitRole) return explicitRole;
          const tag = elementNode.tagName.toLowerCase();
          if (tag === 'textarea') return 'textbox';
          if (tag === 'select') return 'combobox';
          if (tag === 'button') return 'button';
          if (tag === 'a') return 'link';
          if (tag === 'form') return 'form';
          if (tag === 'input') {
            const type = (elementNode.getAttribute('type') ?? 'text').toLowerCase();
            if (['button', 'submit', 'reset'].includes(type)) return 'button';
            return 'textbox';
          }
          return undefined;
        }

        function formName(form: Element | null): string | undefined {
          if (!form) return undefined;
          const labelledBy = form.getAttribute('aria-labelledby');
          return (
            form.getAttribute('aria-label') ??
            (labelledBy ? textOf(document.getElementById(labelledBy)) : undefined) ??
            textOf(form.querySelector('h1,h2,h3,legend')) ??
            textOf(form.closest('main,body')?.querySelector('h1,h2,h3') ?? null)
          );
        }

        const htmlElement = element as HTMLElement;
        const tag = element.tagName.toLowerCase();
        const label = labelTextFor(element);
        const text = textOf(element);
        const ariaLabel = element.getAttribute('aria-label') ?? undefined;
        const placeholder = element.getAttribute('placeholder') ?? undefined;
        const accessibleName = ariaLabel ?? label ?? placeholder ?? text;
        const closestDialog = element.closest('dialog,[role="dialog"]');
        const closestForm = element.closest('form');
        const closestSection = element.closest('section');
        const scopeElement = closestForm ?? closestDialog ?? closestSection;
        const scopeKind = closestForm
          ? 'form'
          : closestDialog
            ? 'dialog'
            : closestSection
              ? 'section'
              : undefined;
        const scopeName =
          scopeKind === 'form'
            ? formName(scopeElement)
            : (scopeElement?.getAttribute('aria-label') ??
              textOf(scopeElement?.querySelector('h1,h2,h3') ?? null));

        return {
          tag,
          role: inferRole(element),
          accessibleName,
          label,
          placeholder,
          id: element.getAttribute('id') ?? undefined,
          name: element.getAttribute('name') ?? undefined,
          testId:
            element.getAttribute('data-testid') ?? element.getAttribute('data-e2e') ?? undefined,
          text,
          cssPath: cssPathFor(element),
          scopeKind,
          scopeName,
          visibleByDom: Boolean(
            htmlElement.offsetWidth ||
            htmlElement.offsetHeight ||
            htmlElement.getClientRects().length,
          ),
        };
      },
    ),
  ]);

  return {
    ...dom,
    locator,
    visible: visible || dom.visibleByDom,
    enabled,
    editable,
    strategy,
    score,
  };
}

async function collectFromLocator(params: {
  locator: Locator;
  strategy: ResolverStrategy;
  score: number;
  target: TargetDescriptor;
  options: BrowserResolveOptions;
}): Promise<CandidateMatch[]> {
  const count = await params.locator.count().catch(() => 0);
  const candidates: CandidateMatch[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = await candidateFromLocator({
      locator: params.locator.nth(index),
      strategy: params.strategy,
      score: params.score,
    });
    if (candidate) {
      candidates.push(scoreCandidate(candidate, params.target, params.score));
    }
  }
  return filterCandidates(candidates, params.target, params.options);
}

async function collectBySelector(params: {
  page: Page;
  selector: string;
  strategy: ResolverStrategy;
  score: number;
  target: TargetDescriptor;
  options: BrowserResolveOptions;
}): Promise<CandidateMatch[]> {
  try {
    return collectFromLocator({
      locator: params.page.locator(params.selector),
      strategy: params.strategy,
      score: params.score,
      target: params.target,
      options: params.options,
    });
  } catch {
    return [];
  }
}

function stableAttrSelectors(target: TargetDescriptor): Array<{
  selector: string;
  strategy: ResolverStrategy;
  score: number;
}> {
  const attrs = target.stableAttrs ?? {};
  const selectors: Array<{ selector: string; strategy: ResolverStrategy; score: number }> = [];
  if (attrs.testId) {
    selectors.push({
      selector: `${cssAttr('data-testid', attrs.testId)}, ${cssAttr('data-e2e', attrs.testId)}`,
      strategy: 'stable_attr:testId',
      score: 98,
    });
  }
  if (attrs.id) {
    selectors.push({ selector: cssAttr('id', attrs.id), strategy: 'stable_attr:id', score: 96 });
  }
  if (attrs.name) {
    selectors.push({
      selector: cssAttr('name', attrs.name),
      strategy: 'stable_attr:name',
      score: 94,
    });
  }
  if (attrs.ariaLabel) {
    selectors.push({
      selector: cssAttr('aria-label', attrs.ariaLabel),
      strategy: 'stable_attr:ariaLabel',
      score: 92,
    });
  }
  if (attrs.autocomplete) {
    selectors.push({
      selector: cssAttr('autocomplete', attrs.autocomplete),
      strategy: 'stable_attr:autocomplete',
      score: 90,
    });
  }
  return selectors;
}

async function resolveWithStrategy(params: {
  page: Page;
  target: TargetDescriptor;
  options: BrowserResolveOptions;
  legacyLocator?: string;
}): Promise<ResolveTargetResult> {
  const { page, target, options, legacyLocator } = params;
  const strategiesTried: ResolverStrategy[] = [];

  for (const stable of stableAttrSelectors(target)) {
    strategiesTried.push(stable.strategy);
    const candidates = await collectBySelector({
      page,
      selector: stable.selector,
      strategy: stable.strategy,
      score: stable.score,
      target,
      options,
    });
    if (candidates.length > 0) {
      return decideMatch({ target, strategy: stable.strategy, candidates, strategiesTried });
    }
  }

  if (target.role) {
    strategiesTried.push('role_name');
    const candidates = await collectFromLocator({
      locator: page.getByRole(target.role, { name: target.name, exact: target.exact ?? false }),
      strategy: 'role_name',
      score: 86,
      target,
      options,
    });
    if (candidates.length > 0) {
      return decideMatch({ target, strategy: 'role_name', candidates, strategiesTried });
    }
  }

  if (target.kind === 'field') {
    strategiesTried.push('label');
    const candidates = await collectFromLocator({
      locator: page.getByLabel(target.name, { exact: target.exact ?? false }),
      strategy: 'label',
      score: 78,
      target,
      options,
    });
    if (candidates.length > 0) {
      return decideMatch({ target, strategy: 'label', candidates, strategiesTried });
    }
  }

  if (target.kind === 'field') {
    strategiesTried.push('placeholder');
    const candidates = await collectFromLocator({
      locator: page.getByPlaceholder(target.name, { exact: target.exact ?? false }),
      strategy: 'placeholder',
      score: 70,
      target,
      options,
    });
    if (candidates.length > 0) {
      return decideMatch({ target, strategy: 'placeholder', candidates, strategiesTried });
    }
  }

  if (target.kind === 'text') {
    strategiesTried.push('text');
    const candidates = await collectFromLocator({
      locator: page.getByText(target.name, { exact: target.exact ?? false }),
      strategy: 'text',
      score: 66,
      target,
      options,
    });
    if (candidates.length > 0) {
      return decideMatch({ target, strategy: 'text', candidates, strategiesTried });
    }
  }

  strategiesTried.push('semantic_proximity');
  const proximityCandidates = await collectSemanticProximity(page, target, options);
  if (proximityCandidates.length > 0) {
    return decideMatch({
      target,
      strategy: 'semantic_proximity',
      candidates: proximityCandidates,
      strategiesTried,
    });
  }

  strategiesTried.push('safe_css');
  const safeCssCandidates = await collectSafeCss(page, target, options);
  if (safeCssCandidates.length > 0) {
    return decideMatch({
      target,
      strategy: 'safe_css',
      candidates: safeCssCandidates,
      strategiesTried,
    });
  }

  if (legacyLocator) {
    strategiesTried.push('legacy_locator');
    const candidates = await collectBySelector({
      page,
      selector: legacyLocator,
      strategy: 'legacy_locator',
      score: 54,
      target,
      options,
    });
    if (candidates.length > 0) {
      return decideMatch({ target, strategy: 'legacy_locator', candidates, strategiesTried });
    }
  }

  strategiesTried.push('xpath_diagnostic');
  return decideMatch({ target, strategy: 'xpath_diagnostic', candidates: [], strategiesTried });
}

async function collectSemanticProximity(
  page: Page,
  target: TargetDescriptor,
  options: BrowserResolveOptions,
): Promise<CandidateMatch[]> {
  if (target.kind !== 'field') return [];
  const cssPaths = await page.evaluate(
    /* istanbul ignore next -- serialized into the browser context. */
    ({ name, exact, fieldSelector }) => {
      function normalize(value: string | null | undefined): string {
        return (value ?? '').replace(/\s+/g, ' ').trim();
      }

      function matches(value: string | null | undefined): boolean {
        const source = normalize(value);
        const wanted = normalize(name);
        return exact ? source === wanted : source.includes(wanted);
      }

      function cssPathFor(elementNode: Element): string {
        const stableId = elementNode.getAttribute('id');
        if (stableId) return `[id=${JSON.stringify(stableId)}]`;
        const stableName = elementNode.getAttribute('name');
        if (stableName)
          return `${elementNode.tagName.toLowerCase()}[name=${JSON.stringify(stableName)}]`;
        const parts: string[] = [];
        let current: Element | null = elementNode;
        while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
          const tag = current.tagName.toLowerCase();
          const parent: Element | null = current.parentElement;
          if (!parent) {
            parts.unshift(tag);
            break;
          }
          const siblings = (Array.from(parent.children) as Element[]).filter(
            (child) => child.tagName === current?.tagName,
          );
          parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
          current = parent;
        }
        return parts.join(' > ');
      }

      const labelNodes = Array.from(document.querySelectorAll('label,*[aria-label],span,div,p'))
        .filter((element) => matches(element.getAttribute('aria-label') ?? element.textContent))
        .slice(0, 20);
      const paths: string[] = [];
      for (const label of labelNodes) {
        const nested = label.querySelector(fieldSelector);
        const sibling = label.nextElementSibling;
        const control = nested ?? (sibling?.matches(fieldSelector) ? sibling : null);
        if (control) paths.push(cssPathFor(control));
      }
      return Array.from(new Set(paths));
    },
    {
      name: target.name,
      exact: target.exact ?? false,
      fieldSelector: FIELD_SELECTOR,
    },
  );

  const candidates: CandidateMatch[] = [];
  for (const cssPath of cssPaths) {
    candidates.push(
      ...(await collectBySelector({
        page,
        selector: cssPath,
        strategy: 'semantic_proximity',
        score: 62,
        target,
        options,
      })),
    );
  }
  return candidates;
}

async function collectSafeCss(
  page: Page,
  target: TargetDescriptor,
  options: BrowserResolveOptions,
): Promise<CandidateMatch[]> {
  const selectors = [
    cssAttr('aria-label', target.name),
    target.kind === 'field' ? cssAttr('placeholder', target.name) : '',
    target.kind === 'field' ? cssAttr('name', target.name) : '',
  ].filter(Boolean);
  const candidates: CandidateMatch[] = [];
  for (const selector of selectors) {
    candidates.push(
      ...(await collectBySelector({
        page,
        selector,
        strategy: 'safe_css',
        score: 58,
        target,
        options,
      })),
    );
  }
  return candidates;
}

export async function resolveTarget(
  page: Page,
  input: BrowserTargetInput,
  options: BrowserResolveOptions = {},
): Promise<ResolveTargetResult> {
  const normalized = normalizeTarget(input, options);
  return resolveWithStrategy({
    page,
    target: normalized.target,
    options,
    legacyLocator: normalized.legacyLocator,
  });
}

export function classifyStructuredSnapshot(
  snapshot: Pick<StructuredDomSnapshot, 'forms' | 'headings' | 'links' | 'textBlocks'>,
): StructuredDomSnapshot['pageState'] {
  const allFields = snapshot.forms.flatMap((form) => form.fields);
  const allButtons = snapshot.forms.flatMap((form) => form.buttons);
  const allText = [
    ...snapshot.headings,
    ...snapshot.links,
    ...snapshot.textBlocks,
    ...allFields,
    ...allButtons,
  ]
    .map((candidate) =>
      [
        candidate.accessibleName,
        candidate.label,
        candidate.placeholder,
        candidate.name,
        candidate.text,
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(' ');

  const hasLoginUser = allFields.some((field) =>
    /用户名|账号|username|email/i.test(
      [field.accessibleName, field.label, field.placeholder, field.name].filter(Boolean).join(' '),
    ),
  );
  const hasPassword = allFields.some((field) =>
    /密码|password/i.test(
      [field.accessibleName, field.label, field.placeholder, field.name].filter(Boolean).join(' '),
    ),
  );
  const hasLoginButton = allButtons.some((button) =>
    /登录|login/i.test(button.accessibleName ?? button.text ?? ''),
  );
  if (hasLoginUser && hasPassword && hasLoginButton) return 'login';

  const publishFieldNames = ['职位名称', '公司名称', '薪资范围', '工作地点', '职位描述'];
  const hasPublishFields = publishFieldNames.every((name) => allText.includes(name));
  const hasPublishButton = allButtons.some((button) =>
    /发布职位/.test(button.accessibleName ?? button.text ?? ''),
  );
  if (hasPublishFields && hasPublishButton) return 'publish_form';

  if (/职位列表|我的职位|employer\/jobs|jobs list/i.test(allText)) return 'list';

  return 'unknown';
}

export async function createStructuredDomSnapshot(page: Page): Promise<StructuredDomSnapshot> {
  const [url, title, dom] = await Promise.all([
    Promise.resolve(page.url()),
    page.title().catch(() => ''),
    page.evaluate(
      /* istanbul ignore next -- serialized into the browser context. */
      ({ fieldSelector, buttonSelector, linkSelector }) => {
        type SnapshotCandidate = DomCandidate;

        function normalize(value: string | null | undefined): string | undefined {
          const text = (value ?? '').replace(/\s+/g, ' ').trim();
          return text || undefined;
        }

        function textOf(node: Element | null): string | undefined {
          return normalize(node?.textContent);
        }

        function cssPathFor(elementNode: Element): string {
          const stableId = elementNode.getAttribute('id');
          if (stableId) return `[id=${JSON.stringify(stableId)}]`;
          const stableTestId =
            elementNode.getAttribute('data-testid') ?? elementNode.getAttribute('data-e2e');
          if (stableTestId) return `[data-testid=${JSON.stringify(stableTestId)}]`;
          const stableName = elementNode.getAttribute('name');
          if (stableName)
            return `${elementNode.tagName.toLowerCase()}[name=${JSON.stringify(stableName)}]`;
          const parts: string[] = [];
          let current: Element | null = elementNode;
          while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
            const tag = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              parts.unshift(tag);
              break;
            }
            const siblings = (Array.from(parent.children) as Element[]).filter(
              (child) => child.tagName === current?.tagName,
            );
            parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
            current = parent;
          }
          return parts.join(' > ');
        }

        function labelTextFor(elementNode: Element): string | undefined {
          const control = elementNode as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          const labels = 'labels' in control ? Array.from(control.labels ?? []) : [];
          const label = labels.map(textOf).find(Boolean);
          if (label) return label;
          const labelledBy = elementNode.getAttribute('aria-labelledby');
          if (labelledBy) {
            return normalize(
              labelledBy
                .split(/\s+/)
                .map((id) => textOf(document.getElementById(id)))
                .filter(Boolean)
                .join(' '),
            );
          }
          return undefined;
        }

        function inferRole(elementNode: Element): string | undefined {
          const explicitRole = elementNode.getAttribute('role');
          if (explicitRole) return explicitRole;
          const tag = elementNode.tagName.toLowerCase();
          if (tag === 'textarea') return 'textbox';
          if (tag === 'select') return 'combobox';
          if (tag === 'button') return 'button';
          if (tag === 'a') return 'link';
          if (tag === 'form') return 'form';
          if (tag === 'input') {
            const type = (elementNode.getAttribute('type') ?? 'text').toLowerCase();
            if (['button', 'submit', 'reset'].includes(type)) return 'button';
            return 'textbox';
          }
          return undefined;
        }

        function candidateFor(elementNode: Element): SnapshotCandidate {
          const htmlElement = elementNode as HTMLElement;
          const tag = elementNode.tagName.toLowerCase();
          const label = labelTextFor(elementNode);
          const text = textOf(elementNode);
          const ariaLabel = elementNode.getAttribute('aria-label') ?? undefined;
          const placeholder = elementNode.getAttribute('placeholder') ?? undefined;
          const disabled =
            'disabled' in htmlElement && Boolean((htmlElement as HTMLButtonElement).disabled);
          const readOnly =
            'readOnly' in htmlElement && Boolean((htmlElement as HTMLInputElement).readOnly);
          const editable = elementNode.matches(fieldSelector) && !disabled && !readOnly;
          return {
            tag,
            role: inferRole(elementNode),
            accessibleName: ariaLabel ?? label ?? placeholder ?? text,
            label,
            placeholder,
            id: elementNode.getAttribute('id') ?? undefined,
            name: elementNode.getAttribute('name') ?? undefined,
            testId:
              elementNode.getAttribute('data-testid') ??
              elementNode.getAttribute('data-e2e') ??
              undefined,
            text,
            visible: Boolean(
              htmlElement.offsetWidth ||
              htmlElement.offsetHeight ||
              htmlElement.getClientRects().length,
            ),
            enabled: !disabled,
            editable,
            cssPath: cssPathFor(elementNode),
          };
        }

        function formName(form: Element): string | undefined {
          const labelledBy = form.getAttribute('aria-labelledby');
          return (
            form.getAttribute('aria-label') ??
            (labelledBy ? textOf(document.getElementById(labelledBy)) : undefined) ??
            textOf(form.querySelector('h1,h2,h3,legend')) ??
            textOf(form.closest('main,body')?.querySelector('h1,h2,h3') ?? null)
          );
        }

        const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
          name: formName(form),
          fields: Array.from(form.querySelectorAll(fieldSelector)).map(candidateFor),
          buttons: Array.from(form.querySelectorAll(buttonSelector)).map(candidateFor),
        }));

        return {
          headings: Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]')).map(
            candidateFor,
          ),
          forms,
          links: Array.from(document.querySelectorAll(linkSelector)).map(candidateFor),
          textBlocks: Array.from(
            document.querySelectorAll('main p, main article, main li, main div'),
          )
            .map(candidateFor)
            .filter((candidate) => Boolean(candidate.text))
            .slice(0, 80),
        };
      },
      {
        fieldSelector: FIELD_SELECTOR,
        buttonSelector: BUTTON_SELECTOR,
        linkSelector: LINK_SELECTOR,
      },
    ),
  ]);

  const snapshotWithoutState = {
    url,
    title,
    pageState: 'unknown' as const,
    headings: dom.headings,
    forms: dom.forms,
    links: dom.links,
    textBlocks: dom.textBlocks,
  };
  return {
    ...snapshotWithoutState,
    pageState: classifyStructuredSnapshot(snapshotWithoutState),
  };
}
