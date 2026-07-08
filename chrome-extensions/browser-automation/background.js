const DEFAULT_SERVER_BASE_URL = 'http://localhost:3000';
const SOCKET_PATH = '/api/browser-automation/socket';
const SESSION_COOKIE_NAME = 'hiring-agent.session';
const RECONNECT_DELAY_MS = 1000;
const CONTENT_SCRIPT_FILE = 'content-script.js';

let connectInFlight = false;
let reconnectTimer = null;
let activeSocket = null;
let activeTabId = null;
let lastStatus = {
  state: 'starting',
  serverBaseUrl: DEFAULT_SERVER_BASE_URL,
  updatedAt: new Date().toISOString(),
};

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

function normalizeServerBaseUrl(value) {
  const raw = String(value || DEFAULT_SERVER_BASE_URL).trim();
  const url = new URL(raw || DEFAULT_SERVER_BASE_URL);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname
    .replace(/\/api\/browser-automation\/socket\/?$/, '')
    .replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

function socketUrl(serverBaseUrl) {
  const url = new URL(normalizeServerBaseUrl(serverBaseUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = SOCKET_PATH;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function getConfig() {
  const stored = await chromeCall((done) =>
    chrome.storage.local.get(['serverBaseUrl', 'bridgeBaseUrl', 'enabled'], done),
  );
  return {
    serverBaseUrl: normalizeServerBaseUrl(
      stored.serverBaseUrl || stored.bridgeBaseUrl || DEFAULT_SERVER_BASE_URL,
    ),
    enabled: stored.enabled !== false,
  };
}

async function setConfig(nextConfig) {
  const current = await getConfig();
  const merged = {
    ...current,
    ...nextConfig,
    serverBaseUrl: normalizeServerBaseUrl(nextConfig.serverBaseUrl || current.serverBaseUrl),
  };
  await chromeCall((done) =>
    chrome.storage.local.set(
      {
        serverBaseUrl: merged.serverBaseUrl,
        enabled: merged.enabled,
      },
      done,
    ),
  );
  await updateStatus({ state: merged.enabled ? 'configured' : 'paused', ...merged });
  restartConnection();
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

async function getSessionToken(serverBaseUrl) {
  const cookie = await chromeCall((done) =>
    chrome.cookies.get(
      {
        url: normalizeServerBaseUrl(serverBaseUrl),
        name: SESSION_COOKIE_NAME,
      },
      done,
    ),
  );
  if (!cookie?.value) {
    throw new Error('not_logged_in_to_hiring_agent');
  }
  return cookie.value;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeActiveSocket() {
  const socket = activeSocket;
  activeSocket = null;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    socket.close();
  }
}

function scheduleReconnect() {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    void startConnection();
  }, RECONNECT_DELAY_MS);
  chrome.alarms.create('browser-automation-reconnect', {
    when: Date.now() + RECONNECT_DELAY_MS,
  });
}

function restartConnection() {
  clearReconnectTimer();
  closeActiveSocket();
  void startConnection();
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

function sendSocketMessage(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

async function handleSocketMessage(socket, config, event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    await updateStatus({
      state: 'protocol_error',
      serverBaseUrl: config.serverBaseUrl,
      lastError: 'invalid_server_message',
    });
    return;
  }

  if (message?.type === 'ready') {
    await updateStatus({
      state: 'connected',
      serverBaseUrl: config.serverBaseUrl,
      userId: message.userId,
      socketUrl: socketUrl(config.serverBaseUrl),
      lastError: undefined,
    });
    return;
  }

  if (message?.type !== 'command' || !message.command?.id) {
    await updateStatus({
      state: 'protocol_error',
      serverBaseUrl: config.serverBaseUrl,
      lastError: 'unsupported_server_message',
    });
    return;
  }

  const command = message.command;
  await updateStatus({
    state: 'running',
    serverBaseUrl: config.serverBaseUrl,
    lastCommandId: command.id,
    lastAction: command.action,
    lastError: undefined,
  });
  const result = await executeCommand(command);
  sendSocketMessage(socket, { type: 'result', result });
  await updateStatus({
    state: result.success ? 'connected' : 'command_failed',
    serverBaseUrl: config.serverBaseUrl,
    lastCommandId: command.id,
    lastAction: command.action,
    lastError: result.error,
  });
}

async function startConnection() {
  if (connectInFlight) return;
  if (
    activeSocket &&
    (activeSocket.readyState === WebSocket.OPEN || activeSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  connectInFlight = true;
  try {
    const config = await getConfig();
    if (!config.enabled) {
      closeActiveSocket();
      await updateStatus({ state: 'paused', serverBaseUrl: config.serverBaseUrl });
      return;
    }

    const sessionToken = await getSessionToken(config.serverBaseUrl);
    const nextSocketUrl = socketUrl(config.serverBaseUrl);
    const socket = new WebSocket(nextSocketUrl);
    activeSocket = socket;
    await updateStatus({
      state: 'connecting',
      serverBaseUrl: config.serverBaseUrl,
      socketUrl: nextSocketUrl,
    });

    socket.addEventListener('open', () => {
      sendSocketMessage(socket, { type: 'hello', sessionToken });
      void updateStatus({ state: 'authenticating', serverBaseUrl: config.serverBaseUrl });
    });

    socket.addEventListener('message', (event) => {
      void handleSocketMessage(socket, config, event);
    });

    socket.addEventListener('error', () => {
      void updateStatus({
        state: 'connection_error',
        serverBaseUrl: config.serverBaseUrl,
        socketUrl: nextSocketUrl,
        lastError: 'websocket_error',
      });
    });

    socket.addEventListener('close', () => {
      if (activeSocket === socket) {
        activeSocket = null;
      }
      void updateStatus({
        state: 'disconnected',
        serverBaseUrl: config.serverBaseUrl,
        socketUrl: nextSocketUrl,
      });
      scheduleReconnect();
    });
  } catch (error) {
    const config = await getConfig().catch(() => ({
      serverBaseUrl: DEFAULT_SERVER_BASE_URL,
      enabled: true,
    }));
    await updateStatus({
      state:
        error instanceof Error && error.message === 'not_logged_in_to_hiring_agent'
          ? 'auth_required'
          : 'server_unavailable',
      serverBaseUrl: config.serverBaseUrl,
      lastError: error instanceof Error ? error.message : String(error),
    });
    scheduleReconnect();
  } finally {
    connectInFlight = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void setConfig({ enabled: true });
  chrome.alarms.create('browser-automation-reconnect', { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(startConnection);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'browser-automation-reconnect') {
    void startConnection();
  }
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
    if (message?.type === 'START_CONNECTION' || message?.type === 'START_POLLING') {
      const config = await setConfig({ enabled: true });
      return { config, status: lastStatus };
    }
    if (message?.type === 'STOP_CONNECTION' || message?.type === 'STOP_POLLING') {
      const config = await setConfig({ enabled: false });
      return { config, status: lastStatus };
    }
    return { error: 'unknown_message' };
  })()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

void startConnection();
