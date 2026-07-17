// Kettu / Bunny "vendetta-compat" plugin body.
// This file's contents get wrapped by build.mjs into:
//   (function(vendetta){ <transpiled body> return { onLoad, onUnload }; })(vendetta)
// which is exactly what Kettu's legacy single-plugin installer expects at
// `<repoUrl>/index.js` (see src/core/vendetta/plugins.ts: evalPlugin).
declare const vendetta: any;

const FluxDispatcher = vendetta.metro.common.FluxDispatcher;
const React = vendetta.metro.common.React;
const ReactNative = vendetta.metro.common.ReactNative;
const logger = vendetta.logger;
const { findInReactTree } = vendetta.utils;
const { showCustomAlert } = vendetta.ui.alerts;
const { getAssetIDByName } = vendetta.ui.assets;
const { showToast } = vendetta.ui.toasts;

// Cap how much raw text we ever render in the "Show Original" view. Even
// without going through the Markdown parser, dumping tens of thousands of
// repeated characters into a single Text node can itself be slow to lay out.
const MAX_PREVIEW_LENGTH = 2000;

const COMBINING_TEST = /[̀-ͯ҃-҉᷀-᷿⃐-⃿]{50,}/;

function isDangerous(content: unknown): boolean {
    if (typeof content !== "string" || content.length === 0) return false;
    if (/\[{21,}/.test(content)) return true;
    if (/\|{42,}/.test(content)) return true;
    if (/`{50,}/.test(content)) return true;
    if (COMBINING_TEST.test(content)) return true;
    return false;
}

const BLOCK_PLACEHOLDER = "⚠️ Message blocked by AntiBracketFreeze — long-press → \"Show Original\" to view (possible ReDoS payload)";

const sanitizeLog: { type: string; field: string; preview: string; }[] = [];
// messageId -> original raw content, kept so the long-press action sheet can reveal it
const blockedContent = new Map<string, string>();

function log(type: string, field: string, content: string) {
    const entry = { type, field, preview: content.slice(0, 80) };
    sanitizeLog.push(entry);
    logger?.warn(`[AntiBracketFreeze] Blocked ${type}.${field}:`, entry.preview);
}

function sanitizeStr(obj: any, key: string, label: string) {
    if (!obj || !isDangerous(obj[key])) return;
    log(label, key, obj[key]);
    obj[key] = "";
}

function patchMessage(msg: any) {
    if (!msg?.id) return;
    if (isDangerous(msg.content)) {
        log("message", "content", msg.content);
        blockedContent.set(msg.id, msg.content);
        msg.content = BLOCK_PLACEHOLDER;
    }
}

function patchChannel(ch: any) {
    if (!ch) return;
    sanitizeStr(ch, "topic", "channel");
    sanitizeStr(ch, "name", "channel");
}

function patchGuild(guild: any) {
    if (!guild) return;
    sanitizeStr(guild, "description", "guild");
    sanitizeStr(guild, "name", "guild");
    guild.channels?.forEach?.(patchChannel);
    guild.threads?.forEach?.(patchChannel);
    guild.roles?.forEach?.((r: any) => sanitizeStr(r, "name", "role"));
}

function sanitizeDispatchAction(action: any) {
    switch (action?.type) {
        case "MESSAGE_CREATE":
        case "MESSAGE_UPDATE":
            patchMessage(action.message);
            break;
        case "LOAD_MESSAGES_SUCCESS":
            action.messages?.forEach?.(patchMessage);
            break;
        case "GUILD_CREATE":
        case "GUILD_UPDATE":
            patchGuild(action.guild);
            break;
        case "CHANNEL_CREATE":
        case "CHANNEL_UPDATE":
            patchChannel(action.channel);
            break;
        case "CONNECTION_OPEN":
            action.guilds?.forEach?.(patchGuild);
            break;
    }
}

let unpatchDispatch: (() => void) | null = null;

// Covers incoming/loaded content (messages from others, guild/channel data).
// This alone does NOT reliably catch your own outgoing messages, since the
// client renders its own sent message optimistically via sendMessage/editMessage
// before/without necessarily round-tripping through this dispatch — see
// patchOutgoing() below for that path.
function patchDispatch() {
    unpatchDispatch = vendetta.patcher.instead("dispatch", FluxDispatcher, (args: any[], orig: Function) => {
        try {
            sanitizeDispatchAction(args[0]);
        } catch (e) {
            logger?.error("[AntiBracketFreeze] dispatch error:", e);
        }
        return orig.apply(FluxDispatcher, args);
    });
}

let unpatchSend: (() => void) | null = null;
let unpatchEdit: (() => void) | null = null;

// Blocks your own outgoing dangerous content before it's ever sent.
function patchOutgoing() {
    const MessageActions = vendetta.metro.findByProps("sendMessage", "editMessage");
    if (!MessageActions) return;

    const blockOutgoing = (message: any) => {
        if (!message || !isDangerous(message.content)) return;
        log("outgoing", "content", message.content);
        message.content = "";
        showToast?.("Blocked a message containing a possible ReDoS payload");
    };

    if (typeof MessageActions.sendMessage === "function") {
        unpatchSend = vendetta.patcher.before("sendMessage", MessageActions, (args: any[]) => {
            blockOutgoing(args[1]);
        });
    }
    if (typeof MessageActions.editMessage === "function") {
        unpatchEdit = vendetta.patcher.before("editMessage", MessageActions, (args: any[]) => {
            blockOutgoing(args[2]);
        });
    }
}

// Same module `vendetta.ui.alerts.showCustomAlert` opens things through
// (found via the same findByProps signature used internally), kept around so
// we can dismiss the alert ourselves via its `close()`.
let AlertsModule: any = null;

// Plain-text viewer for blocked content. Deliberately renders via
// ReactNative.Text directly instead of passing the string into Discord's own
// Alert `content`/`body` prop — that prop gets run through Discord's Markdown
// renderer (the same one vulnerable to the ReDoS this plugin guards against),
// which defeats the purpose and is why the old confirmation-alert reveal felt
// heavy/slow on large blocked payloads. Since showCustomAlert renders the
// component bare (no backdrop/card/close button of its own), all of that is
// built here by hand.
function BlockedContentView({ content }: { content: string; }) {
    const truncated = content.length > MAX_PREVIEW_LENGTH;
    const shown = truncated ? content.slice(0, MAX_PREVIEW_LENGTH) : content;

    const close = () => {
        try {
            AlertsModule?.close?.();
        } catch { }
    };

    return React.createElement(
        ReactNative.View,
        { style: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 24 } },
        React.createElement(
            ReactNative.View,
            { style: { backgroundColor: "#2b2d31", borderRadius: 8, padding: 16, maxHeight: "80%" } },
            React.createElement(
                ReactNative.Text,
                { style: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 8 } },
                "Blocked Message"
            ),
            React.createElement(
                ReactNative.ScrollView,
                { style: { maxHeight: 360 } },
                React.createElement(
                    ReactNative.Text,
                    { selectable: true, style: { color: "#dcddde", fontFamily: "monospace", backgroundColor: "#1e1f22", padding: 8, borderRadius: 4 } },
                    shown + (truncated ? `\n…(${content.length - MAX_PREVIEW_LENGTH} more characters truncated)` : "")
                )
            ),
            React.createElement(
                ReactNative.TouchableOpacity,
                {
                    onPress: close,
                    style: { alignSelf: "flex-end", marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#4f545c", borderRadius: 4 },
                },
                React.createElement(ReactNative.Text, { style: { color: "white", fontWeight: "bold" } }, "Close")
            )
        )
    );
}

// Adds a "Show Original" row to the message long-press action sheet when the
// long-pressed message was blocked, letting the user view the raw (unrendered,
// so still ReDoS-safe) content on demand instead of losing it entirely.
function injectShowOriginalRow(sheetTree: any, content: string) {
    const rows = findInReactTree(sheetTree, (node: any) =>
        Array.isArray(node) && (
            node[0]?.type?.name === "ButtonRow"
            || node[0]?.type?.name === "ActionSheetRow"
            || node[0]?.type?.name === "TableRow"
        ));

    if (!rows || !Array.isArray(rows)) return sheetTree;

    const template = rows.find(Boolean);
    if (!template?.type) return sheetTree;

    const onPress = () => {
        try {
            LazyActionSheet?.hideActionSheet?.();
        } catch { }
        showCustomAlert(BlockedContentView, { content });
    };

    const row = React.createElement(template.type, {
        ...template.props,
        key: "anti-bracket-freeze-show-original",
        label: "Show Original",
        message: "Show Original",
        title: "Show Original",
        text: "Show Original",
        icon: getAssetIDByName?.("EyeIcon") ?? template.props?.icon,
        isDestructive: false,
        onPress,
        action: onPress,
    });

    rows.unshift(row);
    return sheetTree;
}

let LazyActionSheet: any = null;
let unpatchActionSheet: (() => void) | null = null;

function patchMessageLongPressSheet() {
    LazyActionSheet = vendetta.metro.findByProps("openLazy", "hideActionSheet");
    AlertsModule = vendetta.metro.findByProps("openLazy", "close");
    if (!LazyActionSheet || typeof LazyActionSheet.openLazy !== "function") return;

    unpatchActionSheet = vendetta.patcher.before("openLazy", LazyActionSheet, ([component, key, ctx]: any[]) => {
        const messageId = ctx?.message?.id;
        if (key !== "MessageLongPressActionSheet" || !messageId || !blockedContent.has(messageId)) return;

        const content = blockedContent.get(messageId)!;

        Promise.resolve(component).then((mod: any) => {
            if (!mod || typeof mod.default !== "function") return;

            const unpatchRender = vendetta.patcher.after("default", mod, (_args: any, sheetTree: any) => {
                React.useEffect(() => () => unpatchRender(), []);
                return injectShowOriginalRow(sheetTree, content);
            });
        }).catch(() => { });
    });
}

function onLoad() {
    patchDispatch();
    (globalThis as any).__antiBFLog = sanitizeLog;

    try {
        patchOutgoing();
    } catch (e) {
        logger?.error("[AntiBracketFreeze] failed to patch outgoing send/edit:", e);
    }

    try {
        patchMessageLongPressSheet();
    } catch (e) {
        logger?.error("[AntiBracketFreeze] failed to patch action sheet:", e);
    }
}

function onUnload() {
    unpatchDispatch?.();
    unpatchDispatch = null;
    unpatchSend?.();
    unpatchSend = null;
    unpatchEdit?.();
    unpatchEdit = null;
    unpatchActionSheet?.();
    unpatchActionSheet = null;
    sanitizeLog.length = 0;
    blockedContent.clear();
}
