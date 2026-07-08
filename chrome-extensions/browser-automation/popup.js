const bridgeBaseUrl = document.getElementById('bridgeBaseUrl');
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
  bridgeBaseUrl.value = config.bridgeBaseUrl || 'http://127.0.0.1:4100';
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
        bridgeBaseUrl: bridgeBaseUrl.value,
        enabled: enabled.checked,
      },
    }),
  );
});

refresh.addEventListener('click', refreshStatus);
enabled.addEventListener('change', async () => {
  render(
    await send({
      type: enabled.checked ? 'START_POLLING' : 'STOP_POLLING',
    }),
  );
});

void refreshStatus();
