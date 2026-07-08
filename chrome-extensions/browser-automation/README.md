# Hiring Agent Browser Automation Extension

This unpacked Chrome extension executes the shared Hiring Agent
`http-command` browser adapter in a real Chrome tab.

## Local Setup

1. Start the bridge:

   ```bash
   bun run browser:chrome-bridge
   ```

2. Open `chrome://extensions`, enable Developer Mode, and load this folder as
   an unpacked extension:

   ```text
   chrome-extensions/browser-automation
   ```

3. Configure the app:

   ```bash
   BROWSER_EXECUTOR=http-command
   BROWSER_COMMAND_ENDPOINT=http://127.0.0.1:4100/browser-command
   ```

The extension polls `http://127.0.0.1:4100` by default. Use the popup to change
the bridge URL or pause polling.
