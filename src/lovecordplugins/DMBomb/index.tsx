/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * DMBomb — Server-member bulk DM tool
 * Only calls discord.com/api — zero external connections.
 * ⚠️  Use responsibly; bulk DMs can violate Discord ToS.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { GuildMemberStore, GuildRoleStore, GuildStore, Menu, React, RestAPI, Select, useEffect, useRef, useState } from "@webpack/common";
import { UserStore } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface DMBState { running: boolean; aborted: boolean; done: number; total: number; log: string[]; delayMs: number; }
let g: DMBState = { running: false, aborted: false, done: 0, total: 0, log: [], delayMs: 1500 };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

function getMembers(guildId: string): any[] {
    try { return Object.values((GuildMemberStore as any).getMembers(guildId) ?? {}); } catch { return []; }
}

async function run(guildId: string, roleId: string, msg: string, delayMs: number) {
    if (g.running) return;
    const meId = UserStore.getCurrentUser()?.id;
    let members = getMembers(guildId)
        .filter(m => { const u = UserStore.getUser(m.userId); return u && !u.bot && u.id !== meId; });
    if (roleId !== "all") members = members.filter(m => m.roles?.includes(roleId));
    if (!members.length) return;

    g = { running: true, aborted: false, done: 0, total: members.length, log: [], delayMs };
    emit();

    for (const m of members) {
        if (g.aborted) { g.log.push("⛔ Stopped."); emit(); break; }
        const user = UserStore.getUser(m.userId);
        const name = user ? (user.globalName || user.username) : m.userId;
        try {
            const ch = await RestAPI.post({ url: "/users/@me/channels", body: { recipient_id: m.userId } });
            if (!ch?.body?.id) { g.log.push(`🔒 ${name} — DMs closed`); }
            else {
                await RestAPI.post({ url: `/channels/${ch.body.id}/messages`, body: { content: msg, tts: false } });
                g.log.push(`✅ ${name}`);
            }
        } catch (e: any) {
            if (e?.status === 429) { g.log.push(`⏳ ${name} — rate limited`); await sleep(5000); }
            else g.log.push(`❌ ${name} — error`);
        }
        g.done++;
        emit();
        if (!g.aborted) await sleep(delayMs);
    }
    g.running = false;
    emit();
}

function DMBombModal({ rootProps, guildId }: { rootProps: any; guildId: string }) {
    const [, tick] = useState(0);
    useEffect(() => { const fn = () => tick(n => n + 1); subs.add(fn); return () => { subs.delete(fn); }; }, []);
    const guild   = GuildStore.getGuild(guildId);
    const roles   = guild ? (GuildRoleStore as any).getSortedRoles(guildId) : [];
    const meId    = UserStore.getCurrentUser()?.id;
    const members = getMembers(guildId).filter(m => { const u = UserStore.getUser(m.userId); return u && !u.bot && u.id !== meId; });
    const countByRole: Record<string, number> = {};
    members.forEach(m => m.roles?.forEach((r: string) => { countByRole[r] = (countByRole[r] || 0) + 1; }));

    const [msg, setMsg]       = useState("");
    const [role, setRole]     = useState("all");
    const [delay, setDelay]   = useState(1.5);
    const logRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [g.log.length]);

    const idle     = !g.running && g.done === 0;
    const finished = !g.running && g.done > 0;
    const pct      = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>💥 DM Bomb — {guild?.name ?? guildId}</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {idle && <>
                    <div style={{ background: "rgba(237,66,69,.12)", border: "1px solid rgba(237,66,69,.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                        ⚠️ Bulk DMs may violate Discord's ToS. Use responsibly.
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>Target role</p>
                        <Select options={[
                            { label: `All members [${members.length}]`, value: "all" },
                            ...roles.map((r: any) => ({ label: `@${r.name} [${countByRole[r.id] ?? 0}]`, value: r.id }))
                        ]} select={setRole} serialize={(v: string) => v} isSelected={(v: string) => v === role} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>Message</p>
                        <textarea rows={4} value={msg} onChange={e => setMsg(e.target.value)}
                            placeholder="Type your message..."
                            style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: 8, resize: "vertical", fontFamily: "inherit", fontSize: 14 }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <label>Delay:</label>
                        <input type="number" min={0.5} max={60} step={0.1} value={delay}
                            onChange={e => setDelay(Math.max(0.5, parseFloat(e.target.value) || 1.5))}
                            style={{ width: 60, background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "2px 6px" }} />
                        <span>s</span>
                    </div>
                </>}
                {(g.running || finished) && <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{g.done}/{g.total}</span><span>{pct}%</span>
                    </div>
                    <div style={{ background: "var(--background-secondary)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{ background: "var(--status-danger)", height: "100%", width: `${pct}%`, transition: "width .3s" }} />
                    </div>
                    {finished && <p style={{ color: "var(--text-positive)", fontSize: 13 }}>✅ Done — {g.done} DMs sent.</p>}
                    <div ref={logRef} style={{ maxHeight: 200, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {g.log.map((l, i) => <span key={i}>{l}</span>)}
                    </div>
                </>}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {idle && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                    <button disabled={!msg.trim()}
                        onClick={() => run(guildId, role, msg, Math.round(delay * 1000))}
                        style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: !msg.trim() ? 0.5 : 1 }}>
                        💥 Bombard
                    </button>
                </>}
                {g.running && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Background</button>
                    <button onClick={() => { g.aborted = true; }} style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600 }}>⛔ Stop</button>
                </>}
                {finished && <button onClick={() => { g = { running: false, aborted: false, done: 0, total: 0, log: [], delayMs: 1500 }; emit(); }} style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff" }}>New Bomb</button>}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "DMBomb",
    description: "Send a DM to all server members or a specific role via right-click. Built-in rate limiting. Only uses Discord's own API.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() { addContextMenuPatch("guild-context", this.guildCtx); },
    stop()  { removeContextMenuPatch("guild-context", this.guildCtx); if (g.running) g.aborted = true; },

    guildCtx(children: any[], { guild }: { guild?: any }) {
        if (!guild) return;
        children.push(
            <Menu.MenuItem id="lc-dmbomb" label="DM Bomb Members"
                action={() => openModal(p => <DMBombModal rootProps={p} guildId={guild.id} />)} />
        );
    },
});
