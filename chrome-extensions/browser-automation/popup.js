const serverBaseUrl = document.getElementById('serverBaseUrl');
const enabled = document.getElementById('enabled');
const state = document.getElementById('state');
const details = document.getElementById('details');
const save = document.getElementById('save');
const refresh = document.getElementById('refresh');

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

function render(payload) {
  const config = payload?.config || {};
  const status = payload?.status || {};
  serverBaseUrl.value = config.serverBaseUrl || 'http://localhost:3000';
  enabled.checked = config.enabled !== false;
  state.textContent = status.state || 'unknown';
  details.textContent = JSON.stringify(status, null, 2);
}

async function refreshStatus() {
  render(await send({ type: 'GET_STATUS' }));
}

save.addEventListener('click', async () => {
  render(
    await send({
      type: 'SAVE_CONFIG',
      config: {
        serverBaseUrl: serverBaseUrl.value,
        enabled: enabled.checked,
      },
    }),
  );
});

refresh.addEventListener('click', refreshStatus);
enabled.addEventListener('change', async () => {
  render(
    await send({
      type: enabled.checked ? 'START_CONNECTION' : 'STOP_CONNECTION',
    }),
  );
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.lastStatus) {
    void refreshStatus();
  }
});

void refreshStatus();
