const DEFAULT_BRIDGE_BASE_URL = 'http://127.0.0.1:4100';
const POLL_IDLE_DELAY_MS = 250;
const POLL_ERROR_DELAY_MS = 1000;
const CONTENT_SCRIPT_FILE = 'content-script.js';

let pollLoopActive = false;
let activeTabId = null;
let lastStatus = {
  state: 'starting',
  bridgeBaseUrl: DEFAULT_BRIDGE_BASE_URL,
  updatedAt: new Date().toISOString(),
};

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function chromeCall(fn) {
  return new Promise((resolve, reject) => {
    fn((value) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(value);
    });
  });
}

function normalizeBridgeBaseUrl(value) {
  const raw = String(value || DEFAULT_BRIDGE_BASE_URL).trim();
  const url = new URL(raw || DEFAULT_BRIDGE_BASE_URL);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/browser-command\/?$/, '').replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

function endpoint(baseUrl, path) {
  return `${normalizeBridgeBaseUrl(baseUrl)}${path}`;
}

async function getConfig() {
  const stored = await chromeCall((done) =>
    chrome.storage.local.get(['bridgeBaseUrl', 'enabled'], done),
  );
  return {
    bridgeBaseUrl: normalizeBridgeBaseUrl(stored.bridgeBaseUrl || DEFAULT_BRIDGE_BASE_URL),
    enabled: stored.enabled !== false,
  };
}

async function setConfig(nextConfig) {
  const current = await getConfig();
  const merged = {
    ...current,
    ...nextConfig,
    bridgeBaseUrl: normalizeBridgeBaseUrl(nextConfig.bridgeBaseUrl || current.bridgeBaseUrl),
  };
  await chromeCall((done) => chrome.storage.local.set(merged, done));
  await updateStatus({ state: merged.enabled ? 'configured' : 'paused', ...merged });
  if (merged.enabled) startPolling();
  return merged;
}

async function updateStatus(patch) {
  lastStatus = {
    ...lastStatus,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await chromeCall((done) => chrome.storage.local.set({ lastStatus }, done)).catch(() => {});
}

async function getTab(tabId) {
  if (!tabId) return null;
  try {
    return await chromeCall((done) => chrome.tabs.get(tabId, done));
  } catch {
    return null;
  }
}

async function createOrUpdateTab(url) {
  const existing = await getTab(activeTabId);
  if (existing) {
    const tab = await chromeCall((done) =>
      chrome.tabs.update(existing.id, { active: true, url }, done),
    );
    activeTabId = tab.id;
    return tab;
  }
  const tab = await chromeCall((done) => chrome.tabs.create({ active: true, url }, done));
  activeTabId = tab.id;
  return tab;
}

async function requireActiveTab() {
  const controlled = await getTab(activeTabId);
  if (controlled && /^https?:/.test(controlled.url || '')) return controlled;

  const tabs = await chromeCall((done) =>
    chrome.tabs.query({ active: true, currentWindow: true }, done),
  );
  const active = Array.isArray(tabs) ? tabs.find((tab) => /^https?:/.test(tab.url || '')) : null;
  if (!active?.id) {
    throw new Error('No controlled http(s) tab. Run navigate before DOM actions.');
  }
  activeTabId = active.id;
  return active;
}

async function waitForTabLoad(tabId, timeoutMs) {
  const current = await getTab(tabId);
  if (current?.status === 'complete') return current;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`tab load timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForUrl(tabId, expected, timeoutMs) {
  const current = await getTab(tabId);
  if (current?.url?.includes(expected)) return current;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`url wait timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) return;
      const nextUrl = changeInfo.url || tab.url || '';
      if (nextUrl.includes(expected)) {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function injectContentScript(tabId) {
  await chromeCall((done) =>
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [CONTENT_SCRIPT_FILE],
      },
      done,
    ),
  ).catch(() => {});
}

async function sendContentCommand(tabId, command) {
  await injectContentScript(tabId);
  return chromeCall((done) =>
    chrome.tabs.sendMessage(
      tabId,
      {
        type: 'BROWSER_AUTOMATION_COMMAND',
        command,
      },
      done,
    ),
  );
}

function failure(command, error) {
  return {
    commandId: command.id,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function executeCommand(command) {
  try {
    if (command.action === 'navigate') {
      const url = String(command.params.url || '');
      if (!url) throw new Error('navigate command requires params.url');
      const tab = await createOrUpdateTab(url);
      await waitForTabLoad(tab.id, command.timeoutMs);
      await injectContentScript(tab.id);
      return { commandId: command.id, success: true };
    }

    const tab = await requireActiveTab();
    if (command.action === 'wait_for_url') {
      const url = String(command.params.url || '');
      if (!url) throw new Error('wait_for_url command requires params.url');
      await waitForUrl(tab.id, url, command.timeoutMs);
      return { commandId: command.id, success: true };
    }

    const result = await sendContentCommand(tab.id, command);
    if (!result || result.commandId !== command.id) {
      return {
        commandId: command.id,
        success: false,
        error: 'chrome_extension_result_mismatch',
      };
    }
    return result;
  } catch (error) {
    return failure(command, error);
  }
}

async function postResult(baseUrl, result) {
  const response = await fetch(endpoint(baseUrl, '/browser-command/result'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(result),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`bridge rejected result with HTTP ${response.status}`);
  }
}

async function pollOnce(config) {
  const response = await fetch(endpoint(config.bridgeBaseUrl, '/browser-command/next'), {
    method: 'GET',
    cache: 'no-store',
  });
  if (response.status === 204) {
    await updateStatus({ state: 'idle', bridgeBaseUrl: config.bridgeBaseUrl });
    await delay(POLL_IDLE_DELAY_MS);
    return;
  }
  if (!response.ok) {
    throw new Error(`bridge returned HTTP ${response.status}`);
  }

  const command = await response.json();
  await updateStatus({
    state: 'running',
    bridgeBaseUrl: config.bridgeBaseUrl,
    lastCommandId: command.id,
    lastAction: command.action,
  });
  const result = await executeCommand(command);
  await postResult(config.bridgeBaseUrl, result);
  await updateStatus({
    state: result.success ? 'idle' : 'command_failed',
    bridgeBaseUrl: config.bridgeBaseUrl,
    lastCommandId: command.id,
    lastAction: command.action,
    lastError: result.error,
  });
}

async function pollLoop() {
  if (pollLoopActive) return;
  pollLoopActive = true;
  try {
    while (true) {
      const config = await getConfig();
      if (!config.enabled) {
        await updateStatus({ state: 'paused', bridgeBaseUrl: config.bridgeBaseUrl });
        return;
      }
      try {
        await pollOnce(config);
      } catch (error) {
        await updateStatus({
          state: 'bridge_unavailable',
          bridgeBaseUrl: config.bridgeBaseUrl,
          lastError: error instanceof Error ? error.message : String(error),
        });
        await delay(POLL_ERROR_DELAY_MS);
      }
    }
  } finally {
    pollLoopActive = false;
  }
}

function startPolling() {
  void pollLoop();
}

chrome.runtime.onInstalled.addListener(() => {
  void setConfig({ bridgeBaseUrl: DEFAULT_BRIDGE_BASE_URL, enabled: true });
  chrome.alarms.create('browser-automation-poll', { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(startPolling);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'browser-automation-poll') startPolling();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    if (message?.type === 'GET_STATUS') {
      const config = await getConfig();
      return { config, status: lastStatus };
    }
    if (message?.type === 'SAVE_CONFIG') {
      const config = await setConfig(message.config || {});
      return { config, status: lastStatus };
    }
    if (message?.type === 'START_POLLING') {
      await setConfig({ enabled: true });
      return { status: lastStatus };
    }
    if (message?.type === 'STOP_POLLING') {
      await setConfig({ enabled: false });
      return { status: lastStatus };
    }
    return { error: 'unknown_message' };
  })()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

startPolling();
