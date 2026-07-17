// Kettu (Bunny-fork) native plugin. Runs against the `bunny` global injected
// by the plugin loader: (bunny, definePlugin) => { <this file>; return plugin?.default ?? plugin; }
declare const bunny: any;
declare const definePlugin: <T extends Record<string, any>>(p: T) => T;

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
let logger: any;

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

function onDispatch(payload: any) {
    try {
        switch (payload?.type) {
            case "MESSAGE_CREATE":
            case "MESSAGE_UPDATE":
                patchMessage(payload.message);
                break;
            case "LOAD_MESSAGES_SUCCESS":
                payload.messages?.forEach?.(patchMessage);
                break;
            case "GUILD_CREATE":
            case "GUILD_UPDATE":
                patchGuild(payload.guild);
                break;
            case "CHANNEL_CREATE":
            case "CHANNEL_UPDATE":
                patchChannel(payload.channel);
                break;
            case "CONNECTION_OPEN":
                payload.guilds?.forEach?.(patchGuild);
                break;
        }
    } catch (e) {
        logger?.error("[AntiBracketFreeze] intercept error:", e);
    }
    // undefined => leave dispatch as-is (we already mutated the payload in place)
    return undefined;
}

let unintercept: (() => void) | null = null;

export default definePlugin({
    start() {
        logger = bunny.plugin.logger;
        unintercept = bunny.api.flux.intercept(onDispatch);
        // Exposed for debugging, mirrors the old Vencord build's window.__antiBFLog
        (globalThis as any).__antiBFLog = sanitizeLog;
    },

    stop() {
        unintercept?.();
        unintercept = null;
        sanitizeLog.length = 0;
    },
});
