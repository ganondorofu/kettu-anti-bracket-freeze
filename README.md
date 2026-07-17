# kettu-anti-bracket-freeze

A [Kettu](https://github.com/C0C0B01/Kettu) plugin that blocks potentially ReDoS-triggering content at the Flux layer before Discord's Markdown renderer can process it.

This is the Kettu (mobile) rewrite of [vencord-anti-bracket-freeze](https://github.com/ganondorofu/vencord-anti-bracket-freeze).

## What it does

Discord's Markdown renderer is vulnerable to ReDoS (Regular Expression Denial of Service) attacks. Certain crafted strings — such as a large number of consecutive `[` brackets, pipe characters, backticks, or Unicode combining characters — can cause the renderer to hang, freezing the client.

This plugin uses Kettu's `bunny.api.flux.intercept` API to sanitize dangerous content before it reaches the Flux store / renderer:

- Message content (`MESSAGE_CREATE`, `MESSAGE_UPDATE`, `LOAD_MESSAGES_SUCCESS`)
- Channel names and topics (`CHANNEL_CREATE`, `CHANNEL_UPDATE`)
- Server names, descriptions, role names, and channel/thread lists (`GUILD_CREATE`, `GUILD_UPDATE`, `CONNECTION_OPEN`)

Blocked message content is replaced with a placeholder string; the original content is written to the plugin's logger and kept in `globalThis.__antiBFLog` for debugging.

### Detection thresholds

| Pattern | Threshold |
|---|---|
| Consecutive `[` | 21+ characters |
| Consecutive `\|` | 42+ characters |
| Consecutive backticks | 50+ characters |
| Unicode combining characters (U+0300–U+036F etc.) | 50+ characters |

## Building

```bash
npm install
npm run build
```

This bundles `index.ts` into `index.js` (IIFE, `plugin` global) via esbuild, matching the format Kettu's plugin loader expects:

```js
(bunny, definePlugin) => { /* index.js contents */ ; return plugin?.default ?? plugin; }
```

## Installing in Kettu

1. Host this repo's raw files somewhere reachable (e.g. GitHub Pages, or a raw GitHub URL) with `manifest.json` and the built `index.js` at the root.
2. In Kettu, go to Plugins and add the plugin repo URL (the URL to `manifest.json`).
3. Enable **AntiBracketFreeze**.

## Debugging

Blocked entries are logged via the plugin logger and accessible at runtime via:

```js
globalThis.__antiBFLog
```

## License

MIT
