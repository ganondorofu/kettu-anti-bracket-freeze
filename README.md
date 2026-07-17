# kettu-anti-bracket-freeze

A [Kettu](https://github.com/C0C0B01/Kettu) plugin that blocks potentially ReDoS-triggering content at the Flux layer before Discord's Markdown renderer can process it.

This is the Kettu (mobile) rewrite of [vencord-anti-bracket-freeze](https://github.com/ganondorofu/vencord-anti-bracket-freeze).

## What it does

Discord's Markdown renderer is vulnerable to ReDoS (Regular Expression Denial of Service) attacks. Certain crafted strings — such as a large number of consecutive `[` brackets, pipe characters, backticks, or Unicode combining characters — can cause the renderer to hang, freezing the client.

This plugin patches two things (via Kettu's legacy `vendetta`-compat API):

- `FluxDispatcher.dispatch` — sanitizes incoming/loaded content before it reaches the Flux store / renderer: message content (`MESSAGE_CREATE`, `MESSAGE_UPDATE`, `LOAD_MESSAGES_SUCCESS`), channel names/topics (`CHANNEL_CREATE`, `CHANNEL_UPDATE`), and server names/descriptions/role names/channel lists (`GUILD_CREATE`, `GUILD_UPDATE`, `CONNECTION_OPEN`).
- `MessageActions.sendMessage` / `editMessage` — blocks your own outgoing dangerous content before it's sent at all. This is necessary because the client renders your own sent message optimistically through the send call, not through `FluxDispatcher.dispatch`, so the dispatch patch alone doesn't catch your own messages.

Blocked message content is replaced with a placeholder string. The original content is written to the plugin's logger and kept in `globalThis.__antiBFLog` for debugging, and can also be viewed in-app: long-press a blocked message and tap **Show Original** in the action sheet. This renders the raw text directly via `ReactNative.Text` in a custom alert — deliberately *not* using Discord's built-in Alert `content`/`body` prop, since that gets run through the same Markdown renderer this plugin exists to protect against (which is also why an earlier version of this reveal felt slow on large payloads). The preview is also capped at 2000 characters to avoid laying out huge blobs of text.

Since `showCustomAlert` renders the component bare (no backdrop, card, or close button of its own), the view builds all of that itself: a dimmed backdrop, a dark card behind the monospace text so it's readable, and an explicit **Close** button that calls the underlying alert module's `close()`.

> The long-press "Show Original" button patches Discord's `MessageLongPressActionSheet` (found via `findByProps("openLazy", "hideActionSheet")`), based on a pattern used by other published Kettu plugins. It hasn't been verified against every Discord client build — if the row doesn't appear, the block/placeholder behavior still works regardless, and blocked content remains available via `globalThis.__antiBFLog`.

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

This transpiles `index.ts` and wraps it into `index.js` as a single JS expression:

```js
(function(vendetta){ /* transpiled body */ return { onLoad, onUnload }; })(vendetta)
```

which is exactly what Kettu's single-plugin installer expects — it fetches `<url>manifest.json` and `<url>index.js`, then evaluates the JS as `vendetta => { return <index.js content> }` (see `src/core/vendetta/plugins.ts` in Kettu). The build script also (re)computes `manifest.json`'s `hash` field from the built output.

## Installing in Kettu

1. Push this repo to GitHub so `manifest.json` and `index.js` are served at the root, e.g.
   `https://raw.githubusercontent.com/ganondorofu/kettu-anti-bracket-freeze/master/`
2. In Kettu, go to Plugins → install/add a plugin, and paste that base URL **with a trailing slash**.
3. Enable **AntiBracketFreeze**.

## Debugging

Blocked entries are logged via the plugin logger and accessible at runtime via:

```js
globalThis.__antiBFLog
```

## License

MIT
