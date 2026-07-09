(() => {
  if (globalThis.__hiringAgentBrowserAutomationContentLoaded) return;
  globalThis.__hiringAgentBrowserAutomationContentLoaded = true;

  const POLL_INTERVAL_MS = 50;
  const SNAPSHOT_TEXT_LIMIT = 300;

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function comparableText(value) {
    return cleanText(value)
      .replace(/\s*[＊*]\s*$/, '')
      .trim()
      .toLowerCase();
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
    const style = globalThis.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function implicitRole(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && element.getAttribute('href')) return 'link';
    if (tag === 'form') return 'form';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'button' || type === 'submit') return 'button';
      return 'textbox';
    }
    return element.getAttribute('role') || undefined;
  }

  function labelText(element) {
    if ('labels' in element && element.labels?.length) {
      return cleanText(
        Array.from(element.labels)
          .map((label) => label.textContent)
          .join(' '),
      );
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      return cleanText(
        labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || '')
          .join(' '),
      );
    }
    const wrappingLabel = element.closest('label');
    const wrappingText = cleanText(wrappingLabel?.textContent || '');
    if (wrappingText) return wrappingText;

    let previous = element.previousElementSibling;
    while (previous) {
      if (previous.tagName?.toLowerCase() === 'label') {
        const siblingText = cleanText(previous.textContent || '');
        if (siblingText) return siblingText;
      }
      if (previous.matches?.('input,textarea,select,button,[role="textbox"]')) break;
      previous = previous.previousElementSibling;
    }

    const parent = element.parentElement;
    if (parent) {
      const parentLabel = Array.from(parent.children).find(
        (child) => child !== element && child.tagName?.toLowerCase() === 'label',
      );
      const parentLabelText = cleanText(parentLabel?.textContent || '');
      if (parentLabelText) return parentLabelText;
    }

    return '';
  }

  function valueTextForName(element) {
    if (element instanceof HTMLInputElement) {
      const type = (element.type || 'text').toLowerCase();
      return ['button', 'submit', 'reset'].includes(type) ? element.value : '';
    }
    return element.getAttribute('value') || '';
  }

  function accessibleName(element) {
    return cleanText(
      element.getAttribute('aria-label') ||
        labelText(element) ||
        element.getAttribute('placeholder') ||
        element.getAttribute('title') ||
        element.textContent ||
        valueTextForName(element) ||
        '',
    );
  }

  function cssPath(element) {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${CSS.escape(current.id)}` : '';
      if (id) {
        parts.unshift(`${tag}${id}`);
        break;
      }
      const siblings = Array.from(current.parentElement?.children || []).filter(
        (sibling) => sibling.tagName === current.tagName,
      );
      const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
      parts.unshift(`${tag}${suffix}`);
      current = current.parentElement;
    }
    return parts.length ? parts.join(' > ') : undefined;
  }

  function isEditable(element) {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return !element.disabled;
    }
    if (element instanceof HTMLInputElement) {
      const type = (element.type || 'text').toLowerCase();
      return (
        !element.disabled && !['button', 'submit', 'reset', 'checkbox', 'radio'].includes(type)
      );
    }
    return element instanceof HTMLElement && element.isContentEditable;
  }

  function candidateFromElement(element) {
    const text = cleanText(element.textContent || '').slice(0, SNAPSHOT_TEXT_LIMIT);
    const label = labelText(element);
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || implicitRole(element),
      accessibleName: accessibleName(element),
      label: label || undefined,
      placeholder: element.getAttribute('placeholder') || undefined,
      id: element.id || undefined,
      name: element.getAttribute('name') || undefined,
      testId: element.getAttribute('data-testid') || undefined,
      text,
      visible: isVisible(element),
      enabled: !('disabled' in element && element.disabled),
      editable: isEditable(element),
      cssPath: cssPath(element),
    };
  }

  function publicCandidate(scored) {
    return scored.candidate;
  }

  function pageState() {
    const text = cleanText(document.body?.innerText || '');
    const url = location.href;
    const fields = Array.from(
      document.querySelectorAll('input,textarea,select,[contenteditable="true"]'),
    ).map(candidateFromElement);
    const buttons = Array.from(
      document.querySelectorAll('button,[role="button"],input[type="submit"]'),
    ).map(candidateFromElement);
    const fieldText = fields
      .map((field) =>
        [field.accessibleName, field.label, field.placeholder, field.name, field.text]
          .filter(Boolean)
          .join(' '),
      )
      .join(' ');
    const buttonText = buttons
      .map((button) => [button.accessibleName, button.text].filter(Boolean).join(' '))
      .join(' ');

    const publishFieldNames = ['职位名称', '公司名称', '薪资范围', '工作地点', '职位描述'];
    const hasPublishFields = publishFieldNames.every((name) => fieldText.includes(name));
    if (hasPublishFields && /发布职位/.test(buttonText)) return 'publish_form';

    const hasLoginUser = fields.some((field) =>
      /用户名|账号|username|email/i.test(
        [field.accessibleName, field.label, field.placeholder, field.name]
          .filter(Boolean)
          .join(' '),
      ),
    );
    const hasPassword = fields.some((field) =>
      /密码|password/i.test(
        [field.accessibleName, field.label, field.placeholder, field.name]
          .filter(Boolean)
          .join(' '),
      ),
    );
    const hasLoginButton = buttons.some((button) =>
      /登录|login/i.test(button.accessibleName || button.text || ''),
    );
    if ((hasLoginUser && hasPassword && hasLoginButton) || /login|signin|sign-in/i.test(url)) {
      return 'login';
    }
    if (/列表|岗位|jobs|list/i.test(text)) return 'list';
    return 'unknown';
  }

  function snapshotStructured() {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .filter(isVisible)
      .slice(0, 20)
      .map(candidateFromElement);
    const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
      name: accessibleName(form) || form.getAttribute('name') || undefined,
      fields: Array.from(form.querySelectorAll('input,textarea,select,[contenteditable="true"]'))
        .filter(isVisible)
        .map(candidateFromElement),
      buttons: Array.from(form.querySelectorAll('button,[role="button"],input[type="submit"]'))
        .filter(isVisible)
        .map(candidateFromElement),
    }));
    const links = Array.from(document.querySelectorAll('a,[role="link"]'))
      .filter(isVisible)
      .slice(0, 50)
      .map(candidateFromElement);
    const textBlocks = Array.from(document.querySelectorAll('p,span,div,label'))
      .filter((element) => isVisible(element) && cleanText(element.textContent).length > 0)
      .slice(0, 100)
      .map(candidateFromElement);

    return {
      url: location.href,
      title: document.title,
      pageState: pageState(),
      headings,
      forms,
      links,
      textBlocks,
    };
  }

  function elementsForTarget(target, action) {
    if (target?.stableAttrs?.testId) {
      const found = document.querySelector(
        `[data-testid="${CSS.escape(target.stableAttrs.testId)}"]`,
      );
      if (found) return [found];
    }
    if (target?.stableAttrs?.id) {
      const found = document.getElementById(target.stableAttrs.id);
      if (found) return [found];
    }
    if (target?.stableAttrs?.name) {
      const found = document.querySelector(`[name="${CSS.escape(target.stableAttrs.name)}"]`);
      if (found) return [found];
    }

    if (target?.kind === 'field' || action === 'fill' || action === 'add_keywords') {
      return Array.from(
        document.querySelectorAll('input,textarea,select,[contenteditable="true"]'),
      );
    }
    if (target?.kind === 'link') {
      return Array.from(document.querySelectorAll('a,[role="link"]'));
    }
    if (target?.kind === 'button' || action === 'click') {
      return Array.from(
        document.querySelectorAll(
          'button,[role="button"],input[type="button"],input[type="submit"],a,[role="link"]',
        ),
      );
    }
    return Array.from(document.querySelectorAll('body,body *'));
  }

  function textScore(value, targetName, exact) {
    const text = comparableText(value);
    const wanted = comparableText(targetName);
    if (!text || !wanted) return 0;
    if (exact) return text === wanted ? 1 : 0;
    if (text === wanted) return 1;
    if (text.includes(wanted)) return 0.85;
    if (wanted.includes(text) && text.length >= 2) return 0.55;
    return 0;
  }

  function scoreCandidate(candidate, target, action) {
    let score = 0;
    const strategies = [];
    const stableAttrs = target.stableAttrs || {};

    if (stableAttrs.testId && candidate.testId === stableAttrs.testId) {
      score += 1;
      strategies.push('stable_testid');
    }
    if (stableAttrs.id && candidate.id === stableAttrs.id) {
      score += 1;
      strategies.push('stable_id');
    }
    if (stableAttrs.name && candidate.name === stableAttrs.name) {
      score += 0.9;
      strategies.push('stable_name');
    }
    if (stableAttrs.ariaLabel && candidate.accessibleName === stableAttrs.ariaLabel) {
      score += 0.9;
      strategies.push('stable_aria_label');
    }

    const nameScores = [
      ['accessible_name', candidate.accessibleName],
      ['label', candidate.label],
      ['placeholder', candidate.placeholder],
      ['text', candidate.text],
      ['id', candidate.id],
      ['name', candidate.name],
      ['testid', candidate.testId],
    ].map(([strategy, value]) => [strategy, textScore(value, target.name, target.exact)]);
    const best = nameScores.sort((a, b) => b[1] - a[1])[0];
    if (best?.[1]) {
      score += best[1];
      strategies.push(best[0]);
    }

    if (target.role && candidate.role === target.role) score += 0.15;
    if ((action === 'fill' || action === 'add_keywords') && candidate.editable) score += 0.2;
    if ((action === 'click' || action === 'wait_for_text') && candidate.enabled) score += 0.1;
    if (!candidate.visible) score -= 1;
    if ((action === 'fill' || action === 'add_keywords') && !candidate.editable) score -= 1;

    return { score, strategies };
  }

  function resolveTarget(target, options = {}) {
    const action = options.action || 'click';
    const scored = elementsForTarget(target, action)
      .map((element) => {
        const candidate = candidateFromElement(element);
        const score = scoreCandidate(candidate, target, action);
        return { element, candidate, score: score.score, strategies: score.strategies };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const top = scored[0];
    const next = scored[1];
    let status = 'not_found';
    let reason = `No visible target matched "${target.name}"`;
    if (top) {
      if (top.score < 0.55) {
        status = 'low_confidence';
        reason = `Low confidence target match for "${target.name}"`;
      } else if (next && Math.abs(top.score - next.score) < 0.1) {
        status = 'ambiguous';
        reason = `Multiple targets matched "${target.name}"`;
      } else {
        status = 'unique';
        reason = undefined;
      }
    }

    return {
      element: status === 'unique' ? top.element : null,
      report: {
        target,
        status,
        strategy: top?.strategies[0] || 'extension_dom',
        strategiesTried: Array.from(new Set(scored.flatMap((item) => item.strategies))),
        candidateCount: scored.length,
        confidence: top ? Math.min(1, Number(top.score.toFixed(2))) : 0,
        chosen: top ? publicCandidate(top) : undefined,
        candidates: scored.map(publicCandidate),
        reason,
      },
    };
  }

  function targetFailure(command, report, failedTargetKey = 'target') {
    const errorCode =
      report.status === 'ambiguous'
        ? 'ambiguous_target'
        : report.status === 'low_confidence'
          ? 'low_confidence_target'
          : 'not_found_target';
    return {
      commandId: command.id,
      success: false,
      error: `${errorCode}: ${report.reason || report.target.name}`,
      domSnapshot: snapshotStructured(),
      match: report,
      failedTargetKey,
    };
  }

  async function resolveTargetForAction(target, action, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let resolved = resolveTarget(target, { action });
    while (resolved.report.status === 'not_found' && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      resolved = resolveTarget(target, { action });
    }
    return resolved;
  }

  function setElementValue(element, value) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      element.focus();
      if (valueSetter) {
        valueSetter.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (element instanceof HTMLSelectElement) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus();
      element.textContent = value;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      return;
    }
    throw new Error('Target is not editable');
  }

  function clickElement(element) {
    if (!(element instanceof HTMLElement)) throw new Error('Target is not clickable');
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
  }

  async function waitUntil(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    do {
      const value = predicate();
      if (value) return value;
      await sleep(POLL_INTERVAL_MS);
    } while (Date.now() < deadline);
    return null;
  }

  async function performTargetCommand(command, action) {
    const target = command.target;
    if (!target) throw new Error(`${action} command requires target`);
    const resolved = await resolveTargetForAction(target, action, command.timeoutMs);
    if (!resolved.element || resolved.report.status !== 'unique') {
      return targetFailure(command, resolved.report);
    }
    if (action === 'fill') {
      setElementValue(resolved.element, String(command.params.value || ''));
    } else if (action === 'click') {
      clickElement(resolved.element);
    }
    return { commandId: command.id, success: true, match: resolved.report };
  }

  async function waitForText(command) {
    const text = String(command.params.text || command.target?.name || '');
    const found = await waitUntil(() => {
      const bodyText = cleanText(document.body?.innerText || '');
      return bodyText.includes(text);
    }, command.timeoutMs);
    if (!found) {
      return {
        commandId: command.id,
        success: false,
        error: `wait_for_text timed out: ${text}`,
        domSnapshot: snapshotStructured(),
      };
    }
    return {
      commandId: command.id,
      success: true,
      match: resolveTarget({ kind: 'text', name: text, exact: false }, { action: 'wait_for_text' })
        .report,
    };
  }

  async function addKeywords(command) {
    const values = Array.isArray(command.params.values) ? command.params.values : [];
    const submitTarget = command.params.submitTarget;
    if (!submitTarget) throw new Error('add_keywords command requires params.submitTarget');
    for (const value of values) {
      if (!String(value).trim()) continue;
      const field = await performTargetCommand(
        { ...command, params: { value }, action: 'fill' },
        'fill',
      );
      if (!field.success) return field;
      const submit = await resolveTargetForAction(submitTarget, 'click', command.timeoutMs);
      if (!submit.element || submit.report.status !== 'unique') {
        return targetFailure(command, submit.report, 'submitTarget');
      }
      clickElement(submit.element);
    }
    return { commandId: command.id, success: true };
  }

  function check(command) {
    const checkInput = command.params.check || {};
    if (checkInput.type === 'url_contains') {
      return location.href.includes(String(checkInput.text || ''));
    }
    if (checkInput.type === 'dom_exists') {
      const element = checkInput.selector ? document.querySelector(checkInput.selector) : null;
      return Boolean(element && isVisible(element));
    }
    if (checkInput.type === 'text_contains') {
      return cleanText(document.body?.innerText || '').includes(String(checkInput.text || ''));
    }
    return false;
  }

  async function execute(command) {
    if (command.action === 'fill') return performTargetCommand(command, 'fill');
    if (command.action === 'click') return performTargetCommand(command, 'click');
    if (command.action === 'fill_selector') {
      const element = document.querySelector(String(command.params.selector || ''));
      if (!element) throw new Error('fill_selector target not found');
      setElementValue(element, String(command.params.value || ''));
      return { commandId: command.id, success: true };
    }
    if (command.action === 'click_selector') {
      const element = document.querySelector(String(command.params.selector || ''));
      if (!element) throw new Error('click_selector target not found');
      clickElement(element);
      return { commandId: command.id, success: true };
    }
    if (command.action === 'wait_for_text') return waitForText(command);
    if (command.action === 'add_keywords') return addKeywords(command);
    if (command.action === 'check') return { commandId: command.id, success: check(command) };
    if (command.action === 'snapshot') {
      return {
        commandId: command.id,
        success: true,
        htmlSnapshot: document.documentElement?.outerHTML || '',
      };
    }
    if (command.action === 'snapshot_structured') {
      return { commandId: command.id, success: true, domSnapshot: snapshotStructured() };
    }
    if (command.action === 'resolve_target') {
      const resolved = resolveTarget(command.target, command.params.options || {});
      return { commandId: command.id, success: true, match: resolved.report };
    }
    throw new Error(`unsupported content command: ${command.action}`);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'BROWSER_AUTOMATION_COMMAND') return false;
    const command = message.command;
    void execute(command)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          commandId: command.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          domSnapshot: snapshotStructured(),
        });
      });
    return true;
  });
})();
