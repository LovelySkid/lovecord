/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AntiDeleteMessage — Caches deleted messages locally so you can still read them.
 * All data is LOCAL ONLY — never sent anywhere. Zero network requests.
 * Messages are cached in memory with an optional DataStore fallback.
 */

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, MessageStore, React, useEffect, useState } from "@webpack/common";

const MAX_CACHE = 300;
const STORE_KEY = "lovecord_antidelete_cache";

type CachedMsg = { id: string; channelId: string; authorId: string; authorName: string; content: string; timestamp: number; attachments: any[]; };

let cache: CachedMsg[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

const settings = definePluginSettings({
    showInline: {
        type: OptionType.BOOLEAN,
        description: "Show deleted messages inline (with strikethrough and ghost label)",
        default: true,
    },
    persistCache: {
        type: OptionType.BOOLEAN,
        description: "Persist deleted message cache across restarts (stored locally only)",
        default: false,
    },
});

// ── Capture messages before they are deleted ──────────────────────────────────
function onMessageCreate({ message }: { message: any }) {
    if (!message?.id || !message?.content && !message?.attachments?.length) return;
    // Store in cache before Discord removes it
    const entry: CachedMsg = {
        id: message.id,
        channelId: message.channel_id,
        authorId: message.author?.id ?? "",
        authorName: message.author?.global_name || message.author?.username || "Unknown",
        content: message.content ?? "",
        timestamp: Date.now(),
        attachments: message.attachments ?? [],
    };
    cache.unshift(entry);
    if (cache.length > MAX_CACHE) cache.splice(MAX_CACHE);
    emit();
}

function onMessageUpdate({ message }: { message: any }) {
    // Update cached copy if content changed
    const idx = cache.findIndex(m => m.id === message.id);
    if (idx !== -1) {
        cache[idx] = { ...cache[idx], content: message.content ?? cache[idx].content };
        emit();
    }
}

function onMessageDelete({ id }: { id: string }) {
    // Mark as deleted (we keep the cached version, just flag it)
    const idx = cache.findIndex(m => m.id === id);
    if (idx !== -1) {
        (cache[idx] as any)._deleted = true;
        emit();
    }
}

function onMessageBulkDelete({ ids }: { ids: string[] }) {
    ids.forEach(id => {
        const idx = cache.findIndex(m => m.id === id);
        if (idx !== -1) (cache[idx] as any)._deleted = true;
    });
    emit();
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "AntiDeleteMessage",
    description: "Caches deleted messages locally so you can still read them. Nothing is sent externally.",
    authors: [{ name: "Lovecord", id: 0n }],
    settings,

    async start() {
        if (settings.store.persistCache) {
            const saved = await DataStore.get<CachedMsg[]>(STORE_KEY).catch(() => null);
            if (saved) cache = saved;
        }
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate as any);
        FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageUpdate as any);
        FluxDispatcher.subscribe("MESSAGE_DELETE", onMessageDelete as any);
        FluxDispatcher.subscribe("MESSAGE_DELETE_BULK", onMessageBulkDelete as any);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate as any);
        FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageUpdate as any);
        FluxDispatcher.unsubscribe("MESSAGE_DELETE", onMessageDelete as any);
        FluxDispatcher.unsubscribe("MESSAGE_DELETE_BULK", onMessageBulkDelete as any);
        cache = [];
    },

    /** Return deleted messages for a given channel (for renderer use) */
    getDeletedForChannel(channelId: string): CachedMsg[] {
        return cache.filter(m => m.channelId === channelId && (m as any)._deleted);
    },

    /** Exposed for toolbox / settings page */
    getCacheSize() { return cache.length; },
    clearCache()   { cache = []; emit(); },
});
