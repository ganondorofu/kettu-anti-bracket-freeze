// Kettu / Bunny "vendetta-compat" plugin body.
// This file's contents get wrapped by build.mjs into:
//   (function(vendetta){ <transpiled body> return { onLoad, onUnload }; })(vendetta)
// which is exactly what Kettu's legacy single-plugin installer expects at
// `<repoUrl>/index.js` (see src/core/vendetta/plugins.ts: evalPlugin).
declare const vendetta: any;

const FluxDispatcher = vendetta.metro.common.FluxDispatcher;
const logger = vendetta.logger;

const COMBINING_TEST = /[̀-ͯ҃-҉᷀-᷿⃐-⃿]{50,}/;

function isDangerous(content: unknown): boolean {
    if (typeof content !== "string" || content.length === 0) return false;
    if (/\[{21,}/.test(content)) return true;
    if (/\|{42,}/.test(content)) return true;
    if (/`{50,}/.test(content)) return true;
    if (COMBINING_TEST.test(content)) return true;
    return false;
}

const BLOCK_PLACEHOLDER = "⚠️ Message blocked by AntiBracketFreeze (possible ReDoS payload)";

const sanitizeLog: { type: string; field: string; preview: string; }[] = [];

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

let origDispatch: Function | null = null;

function patchedDispatch(this: any, action: any) {
    try {
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
    } catch (e) {
        logger?.error("[AntiBracketFreeze] dispatch error:", e);
    }
    return origDispatch!.call(this, action);
}

function onLoad() {
    origDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
    FluxDispatcher.dispatch = patchedDispatch;
    (globalThis as any).__antiBFLog = sanitizeLog;
}

function onUnload() {
    if (origDispatch) {
        FluxDispatcher.dispatch = origDispatch;
        origDispatch = null;
    }
    sanitizeLog.length = 0;
}
