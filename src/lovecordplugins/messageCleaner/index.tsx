/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MessageCleaner — Bulk delete YOUR OWN messages from a channel.
 * Right-click a channel → "Clean my messages".
 * Fetches message history, filters to own, deletes with rate-limiting.
 * Zero external connections — only Discord's own REST API.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, React, RestAPI, UserStore, useEffect, useState } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

interface MCState { running: boolean; aborted: boolean; deleted: number; scanned: number; log: string[]; }
let g: MCState = { running: false, aborted: false, deleted: 0, scanned: 0, log: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

async function fetchOwnMessagesPage(channelId: string, before?: string): Promise<any[]> {
    const url = `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`;
    const res = await RestAPI.get({ url });
    return res?.body ?? [];
}

async function runClean(channelId: string, maxDelete: number) {
    if (g.running) return;
    const me = UserStore.getCurrentUser();
    if (!me) return;
    g = { running: true, aborted: false, deleted: 0, scanned: 0, log: [] };
    emit();

    const now = Date.now();
    let before: string | undefined;
    let reachedMax = false;

    outer: while (!reachedMax && !g.aborted) {
        let page: any[];
        try { page = await fetchOwnMessagesPage(channelId, before); }
        catch (e: any) { g.log.push(`❌ Fetch error: ${e?.status ?? e?.message}`); emit(); break; }
        if (!page.length) break;

        before = page[page.length - 1]?.id;
        const mine = page.filter(m => m.author?.id === me.id);
        g.scanned += page.length;
        emit();

        for (const msg of mine) {
            if (g.aborted || g.deleted >= maxDelete) { reachedMax = true; break outer; }

            // Discord won't let you bulk-delete messages older than 14 days
            const tooOld = now - new Date(msg.timestamp).getTime() > TWO_WEEKS_MS;
            if (tooOld) { g.log.push(`⏩ Skipped (>14d old): ${msg.content?.slice(0, 30) || "[no text]"}`); continue; }

            try {
                await RestAPI.del({ url: `/channels/${channelId}/messages/${msg.id}` });
                g.deleted++;
                g.log.push(`🗑 Deleted [${g.deleted}/${maxDelete}]: ${msg.content?.slice(0, 40) || "[no text]"}`);
            } catch (e: any) {
                if (e?.status === 429) { g.log.push("⏳ Rate limited — waiting 5 s"); await sleep(5000); }
                else g.log.push(`❌ Error on ${msg.id}: ${e?.status ?? e?.message}`);
            }
            emit();
            await sleep(600);
        }
        // Small delay between pages
        await sleep(300);
    }

    if (g.aborted) g.log.push("⛔ Stopped by user.");
    else g.log.push(`✅ Done — ${g.deleted} message${g.deleted !== 1 ? "s" : ""} deleted.`);
    g.running = false;
    emit();
}

function CleanerModal({ rootProps, channelId }: { rootProps: any; channelId: string }) {
    const [, tick] = useState(0);
    useEffect(() => { const fn = () => tick(n => n + 1); subs.add(fn); return () => { subs.delete(fn); }; }, []);

    const channel = ChannelStore.getChannel(channelId);
    const [maxDel, setMaxDel] = useState(50);

    const idle     = !g.running && g.deleted === 0 && !g.log.length;
    const finished = !g.running && g.log.length > 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>🗑 Message Cleaner — #{channel?.name ?? channelId}</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {idle && <>
                    <div style={{ background: "rgba(250,166,26,.12)", border: "1px solid rgba(250,166,26,.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                        ⚠️ Only deletes YOUR OWN messages. Messages older than 14 days are skipped (Discord API limit).
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Maximum messages to delete</p>
                        <input type="number" min={1} max={1000} value={maxDel}
                            onChange={e => setMaxDel(Math.max(1, Math.min(1000, parseInt(e.target.value) || 50)))}
                            style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "6px 10px" }} />
                    </div>
                </>}
                {(g.running || finished) && <>
                    <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                        <span>Scanned: <strong>{g.scanned}</strong></span>
                        <span>Deleted: <strong>{g.deleted}</strong></span>
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {g.log.map((l, i) => <span key={i}>{l}</span>)}
                        {g.running && <span style={{ opacity: .6 }}>Running...</span>}
                    </div>
                </>}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {idle && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                    <button onClick={() => runClean(channelId, maxDel)}
                        style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600 }}>
                        🗑 Clean My Messages
                    </button>
                </>}
                {g.running && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Background</button>
                    <button onClick={() => { g.aborted = true; }} style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600 }}>⛔ Stop</button>
                </>}
                {finished && !g.running && (
                    <button onClick={() => { g = { running: false, aborted: false, deleted: 0, scanned: 0, log: [] }; emit(); }}
                        style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff" }}>Done</button>
                )}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "MessageCleaner",
    description: "Bulk delete your own messages from a channel. Right-click a channel to open. Rate-limited to avoid bans.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() { addContextMenuPatch("channel-context", this.ctxPatch); },
    stop()  { removeContextMenuPatch("channel-context", this.ctxPatch); if (g.running) g.aborted = true; },

    ctxPatch(children: any[], { channel }: { channel?: any }) {
        if (!channel || channel.type === 4) return;
        children.push(
            <Menu.MenuItem id="lc-messagecleaner" label="🗑 Clean My Messages"
                action={() => openModal(p => <CleanerModal rootProps={p} channelId={channel.id} />)} />
        );
    },
});
