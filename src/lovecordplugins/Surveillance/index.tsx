/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Surveillance — Local user-activity monitor
 * Tracks publicly-visible Discord events (status, voice, messages)
 * for specific users. ALL data stays LOCAL — zero network requests
 * beyond Discord's own API, zero external telemetry.
 */

import { definePluginSettings } from "@api/Settings";
import { DataStore } from "@api/index";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, React, UserStore, useEffect, useState } from "@webpack/common";

// ── Types ─────────────────────────────────────────────────────────────────────
type EventKind = "status" | "voice" | "message_send" | "message_edit" | "message_delete" | "activity";

interface ActivityEvent {
    kind: EventKind;
    userId: string;
    timestamp: number;
    detail: string;
}

const STORE_KEY = "lovecord_surveillance_log";
const MAX_EVENTS = 500; // Rolling window

// ── In-memory log ─────────────────────────────────────────────────────────────
let events: ActivityEvent[] = [];
let trackedIds: Set<string> = new Set();
const logSubs = new Set<() => void>();
const notifyLog = () => logSubs.forEach(f => f());

function pushEvent(ev: ActivityEvent) {
    events.unshift(ev);
    if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS);
    notifyLog();
    // Persist asynchronously — fire and forget
    DataStore.set(STORE_KEY, events.slice(0, 100)).catch(() => { });
}

// ── Settings ──────────────────────────────────────────────────────────────────
const settings = definePluginSettings({
    trackedUsers: {
        type: OptionType.STRING,
        description: "Comma-separated Discord user IDs to monitor (publicly visible data only)",
        default: "",
    },
    logStatus: {
        type: OptionType.BOOLEAN,
        description: "Log online status changes",
        default: true,
    },
    logVoice: {
        type: OptionType.BOOLEAN,
        description: "Log voice channel join/leave events",
        default: true,
    },
    logMessages: {
        type: OptionType.BOOLEAN,
        description: "Log message sends/edits/deletes in channels you can see",
        default: true,
    },
});

function getTracked(): Set<string> {
    return new Set(
        (settings.store.trackedUsers ?? "")
            .split(",").map((s: string) => s.trim()).filter(Boolean)
    );
}

// ── Flux handlers ─────────────────────────────────────────────────────────────
function onPresenceUpdate({ updates }: { updates: Array<{ user: { id: string }; status: string; }> }) {
    if (!settings.store.logStatus) return;
    for (const u of updates) {
        if (!trackedIds.has(u.user.id)) continue;
        const user = UserStore.getUser(u.user.id);
        const name = user?.username ?? u.user.id;
        pushEvent({ kind: "status", userId: u.user.id, timestamp: Date.now(), detail: `${name} → ${u.status}` });
    }
}

function onVoiceStateUpdate({ userId, channelId, guildId }: { userId: string; channelId: string | null; guildId: string; }) {
    if (!settings.store.logVoice) return;
    if (!trackedIds.has(userId)) return;
    const user = UserStore.getUser(userId);
    const name = user?.username ?? userId;
    const detail = channelId ? `${name} joined voice channel ${channelId} (guild: ${guildId})` : `${name} left voice`;
    pushEvent({ kind: "voice", userId, timestamp: Date.now(), detail });
}

function onMessage({ message }: { message: { author: { id: string }; channel_id: string; content: string; id: string; } }) {
    if (!settings.store.logMessages) return;
    if (!trackedIds.has(message.author.id)) return;
    const user = UserStore.getUser(message.author.id);
    const name = user?.username ?? message.author.id;
    pushEvent({ kind: "message_send", userId: message.author.id, timestamp: Date.now(), detail: `${name}: ${message.content.slice(0, 100)}` });
}

function onMessageUpdate({ message }: { message: { author: { id: string }; content: string; } }) {
    if (!settings.store.logMessages) return;
    if (!trackedIds.has(message.author.id)) return;
    const user = UserStore.getUser(message.author.id);
    const name = user?.username ?? message.author.id;
    pushEvent({ kind: "message_edit", userId: message.author.id, timestamp: Date.now(), detail: `${name} edited: ${message.content.slice(0, 100)}` });
}

function onActivity({ userId, activity }: { userId: string; activity: null | { name: string; type: number; } }) {
    if (!trackedIds.has(userId)) return;
    if (!activity) return;
    const user = UserStore.getUser(userId);
    const name = user?.username ?? userId;
    pushEvent({ kind: "activity", userId, timestamp: Date.now(), detail: `${name} started: ${activity.name}` });
}

// ── UI ────────────────────────────────────────────────────────────────────────
const KIND_ICON: Record<EventKind, string> = {
    status: "🔵", voice: "🎙️", message_send: "💬", message_edit: "✏️", message_delete: "🗑️", activity: "🎮",
};

function SurveillanceModal({ rootProps }: { rootProps: any }) {
    const [log, setLog] = useState<ActivityEvent[]>(events);
    const [filter, setFilter] = useState<EventKind | "all">("all");
    useEffect(() => {
        const fn = () => setLog([...events]);
        logSubs.add(fn);
        return () => { logSubs.delete(fn); };
    }, []);

    const shown = filter === "all" ? log : log.filter(e => e.kind === filter);

    return (
        <ModalRoot {...rootProps} size="large">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>👁 Activity Monitor</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--background-secondary)", borderRadius: 4, padding: "6px 10px" }}>
                    Watching: {trackedIds.size} user{trackedIds.size !== 1 ? "s" : ""} · {events.length} events logged (local only — nothing sent externally)
                </div>
                {/* Filter bar */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(["all", "status", "voice", "message_send", "message_edit", "activity"] as const).map(k => (
                        <button key={k} onClick={() => setFilter(k)}
                            style={{ background: filter === k ? "var(--brand-500)" : "var(--background-secondary)", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", color: filter === k ? "#fff" : "var(--text-muted)", fontSize: 12 }}>
                            {k === "all" ? "All" : KIND_ICON[k] + " " + k}
                        </button>
                    ))}
                    <button onClick={() => { events = []; notifyLog(); }}
                        style={{ marginLeft: "auto", background: "var(--status-danger)", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", color: "#fff", fontSize: 12 }}>
                        Clear log
                    </button>
                </div>
                {/* Event list */}
                <div style={{ flex: 1, maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                    {shown.length === 0 && <span style={{ opacity: .5, fontSize: 13, margin: "auto" }}>No events yet. Start tracking users via plugin settings.</span>}
                    {shown.map((ev, i) => (
                        <div key={i} style={{ background: "var(--background-secondary)", borderRadius: 4, padding: "5px 10px", fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <span style={{ flexShrink: 0 }}>{KIND_ICON[ev.kind]}</span>
                            <span style={{ color: "var(--text-muted)", flexShrink: 0, fontFamily: "monospace" }}>
                                {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                            <span style={{ color: "var(--text-normal)" }}>{ev.detail}</span>
                        </div>
                    ))}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "Surveillance",
    description: "Locally monitor publicly-visible Discord activity for specific users. All data stays local — zero external connections.",
    authors: [{ name: "Lovecord", id: 0n }],
    settings,

    contextMenus: {
        "user-context"(children: any[], { user }: { user: any }) {
            if (!user) return;
            children.push(
                <import("@webpack/common").Menu.MenuItem
                    id="lc-surveillance-toggle"
                    label={trackedIds.has(user.id) ? "🔕 Stop tracking" : "👁 Track activity"}
                    action={() => {
                        if (trackedIds.has(user.id)) trackedIds.delete(user.id);
                        else trackedIds.add(user.id);
                    }}
                />
            );
        }
    },

    async start() {
        // Restore persisted log
        const saved = await DataStore.get<ActivityEvent[]>(STORE_KEY).catch(() => null);
        if (saved) events = saved;

        // Build tracked set from settings
        trackedIds = getTracked();

        FluxDispatcher.subscribe("PRESENCE_UPDATES", onPresenceUpdate as any);
        FluxDispatcher.subscribe("VOICE_STATE_UPDATE", onVoiceStateUpdate as any);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage as any);
        FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageUpdate as any);
        FluxDispatcher.subscribe("GAME_ACTIVITY_UPDATE", onActivity as any);
    },

    stop() {
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", onPresenceUpdate as any);
        FluxDispatcher.unsubscribe("VOICE_STATE_UPDATE", onVoiceStateUpdate as any);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage as any);
        FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageUpdate as any);
        FluxDispatcher.unsubscribe("GAME_ACTIVITY_UPDATE", onActivity as any);
        trackedIds.clear();
    },

    // Expose modal for use from settings button
    openModal() {
        openModal(p => <SurveillanceModal rootProps={p} />);
    }
});
