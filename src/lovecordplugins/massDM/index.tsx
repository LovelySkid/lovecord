/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * massDM — Friend-list bulk DM
 * Only calls discord.com/api — zero external connections.
 * ⚠️  Use responsibly; bulk DMs can violate Discord ToS.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Menu, React, RelationshipStore, RestAPI, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";
import { UserStore } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Shared send state (persists while modal is backgrounded) ──────────────────
interface State {
    running: boolean; aborted: boolean;
    done: number; total: number; log: string[]; delayMs: number;
}
let g: State = { running: false, aborted: false, done: 0, total: 0, log: [], delayMs: 1500 };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

function resetState() { g = { running: false, aborted: false, done: 0, total: 0, log: [], delayMs: 1500 }; emit(); }

function getFriendIds(): string[] {
    try { return (RelationshipStore as any).getFriendIDs?.() ?? []; } catch { return []; }
}

async function runSend(ids: string[], msg: string, delayMs: number) {
    if (g.running) return;
    g = { running: true, aborted: false, done: 0, total: ids.length, log: [], delayMs };
    emit();

    for (const id of ids) {
        if (g.aborted) { g.log.push("⛔ Stopped."); emit(); break; }
        const user = UserStore.getUser(id);
        const tag  = user ? (user.globalName || user.username) : id;
        const body = msg.replace(/\{user\}/g, `<@${id}>`);
        try {
            const ch = await RestAPI.post({ url: "/users/@me/channels", body: { recipient_id: id } });
            if (!ch?.body?.id) { g.log.push(`🔒 ${tag} — DMs closed`); }
            else {
                await RestAPI.post({ url: `/channels/${ch.body.id}/messages`, body: { content: body, tts: false } });
                g.log.push(`✅ ${tag}`);
            }
        } catch (e: any) {
            if (e?.status === 429) { g.log.push(`⏳ ${tag} — rate limited`); await sleep(5000); }
            else g.log.push(`❌ ${tag} — error`);
        }
        g.done++;
        emit();
        if (!g.aborted) await sleep(delayMs);
    }
    g.running = false;
    emit();
}

// ── Modal ────────────────────────────────────────────────────────────────────
function MassDMModal({ rootProps }: { rootProps: any; }) {
    const [, tick] = useState(0);
    useEffect(() => { subs.add(() => tick(n => n + 1)); return () => { subs.forEach(f => { if (f.toString() === tick.toString()) subs.delete(f); }); }; }, []);
    const friends = getFriendIds();
    const [sel, setSel] = useState<Set<string>>(new Set(friends));
    const [msg, setMsg]     = useState("");
    const [delay, setDelay] = useState(1.5);
    const logRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [g.log.length]);

    const idle     = !g.running && g.done === 0;
    const finished = !g.running && g.done > 0;
    const pct      = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;

    function toggle(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
    function toggleAll() { setSel(sel.size === friends.length ? new Set() : new Set(friends)); }

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>📨 Mass DM</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {idle && <>
                    <div style={{ background: "rgba(250,166,26,.12)", border: "1px solid rgba(250,166,26,.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                        ⚠️ Bulk DMs may violate Discord's ToS. Use responsibly.
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>Message <span style={{ fontWeight: 400, opacity: .7, fontSize: 12 }}>(use {"{user}"} for @mention)</span></p>
                        <textarea rows={4} value={msg} onChange={e => setMsg(e.target.value)}
                            placeholder="Type your message..."
                            style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: 8, resize: "vertical", fontFamily: "inherit", fontSize: 14 }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <label>Delay between sends:</label>
                        <input type="number" min={0.5} max={60} step={0.1} value={delay}
                            onChange={e => setDelay(Math.max(0.5, parseFloat(e.target.value) || 1.5))}
                            style={{ width: 60, background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "2px 6px" }} />
                        <span>s</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <p style={{ fontWeight: 600 }}>Friends ({sel.size}/{friends.length})</p>
                        <button onClick={toggleAll} style={{ background: "none", border: "none", color: "var(--text-link)", cursor: "pointer", fontSize: 12 }}>
                            {sel.size === friends.length ? "Deselect all" : "Select all"}
                        </button>
                    </div>
                    <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                        {friends.length === 0 && <span style={{ opacity: .6, fontSize: 13 }}>No friends in cache.</span>}
                        {friends.map(id => {
                            const u = UserStore.getUser(id);
                            const name = u ? (u.globalName || u.username) : id;
                            return (
                                <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                                    <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
                                    {name}
                                </label>
                            );
                        })}
                    </div>
                </>}
                {(g.running || finished) && <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{g.done} / {g.total} processed</span><span>{pct}%</span>
                    </div>
                    <div style={{ background: "var(--background-secondary)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{ background: "var(--brand-500)", height: "100%", width: `${pct}%`, transition: "width .3s" }} />
                    </div>
                    <div ref={logRef} style={{ maxHeight: 220, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {g.log.map((l, i) => <span key={i}>{l}</span>)}
                    </div>
                </>}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {idle && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                    <button disabled={sel.size === 0 || !msg.trim()}
                        onClick={() => runSend(Array.from(sel), msg, Math.round(delay * 1000))}
                        style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: (sel.size === 0 || !msg.trim()) ? 0.5 : 1 }}>
                        Send to {sel.size} friend{sel.size !== 1 ? "s" : ""}
                    </button>
                </>}
                {g.running && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Background</button>
                    <button onClick={() => { g.aborted = true; }} style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600 }}>⛔ Stop</button>
                </>}
                {finished && <button onClick={() => { resetState(); rootProps.onClose(); }} style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600 }}>Done</button>}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "MassDM",
    description: "Send a DM to multiple friends at once with built-in rate-limiting. Only uses Discord's own API.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() {
        addContextMenuPatch("guild-context", this.guildCtx);
    },
    stop() {
        removeContextMenuPatch("guild-context", this.guildCtx);
        if (g.running) g.aborted = true;
    },

    guildCtx(children: any[]) {
        children.push(
            <Menu.MenuItem id="lc-massdm" label="Mass DM (Friends)"
                action={() => openModal(p => <MassDMModal rootProps={p} />)} />
        );
    },
});
