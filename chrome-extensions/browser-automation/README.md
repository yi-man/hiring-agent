# Hiring Agent Browser Automation Extension

This unpacked Chrome extension executes Hiring Agent browser automation commands in the
user's real Chrome tab. The extension connects to the Hiring Agent app over the app's
existing WebSocket route:

```text
/api/browser-automation/socket
```

No extra local bridge port is required for the product flow.

## Local Setup

1. Start the app with the WebSocket browser executor enabled:

   ```bash
   BROWSER_EXECUTOR=websocket-command bun run dev
   ```

   You can also put `BROWSER_EXECUTOR=websocket-command` in your local `.env` before
   running `bun run dev`.

2. Open `http://localhost:3000` and sign in.

3. Open `chrome://extensions`, enable Developer Mode, and load this folder as
   an unpacked extension:

   ```text
   chrome-extensions/browser-automation
   ```

4. Open the extension popup and set Server URL to:

   ```text
   http://localhost:3000
   ```

The extension reads the app session cookie for the configured Server URL, sends a
`hello` message to the WebSocket route, receives `BrowserCommand` messages, runs them
in Chrome, and sends `BrowserCommandResult` messages back on the same connection.

The legacy `bun run browser:chrome-bridge` HTTP polling bridge remains available as a
development fallback for `BROWSER_EXECUTOR=http-command`.
