/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ServerCloner — Clone a server's structure to another server you own.
 * Only calls discord.com/api — zero external connections.
 * Clones: categories, channels, roles (name/color/hoist), and basic settings.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { GuildStore, Menu, React, RestAPI, Select, showToast, Toasts, useEffect, useState } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface CloneState { running: boolean; log: string[]; done: number; total: number; }
let g: CloneState = { running: false, log: [], done: 0, total: 0 };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

// ── Fetch helpers (all go only to discord.com) ────────────────────────────────
async function fetchChannels(guildId: string): Promise<any[]> {
    const r = await RestAPI.get({ url: `/guilds/${guildId}/channels` });
    return r?.body ?? [];
}
async function fetchRoles(guildId: string): Promise<any[]> {
    const r = await RestAPI.get({ url: `/guilds/${guildId}/roles` });
    return r?.body ?? [];
}

// ── Clone logic ────────────────────────────────────────────────────────────────
async function runClone(srcId: string, dstId: string, opts: { roles: boolean; channels: boolean; }) {
    if (g.running) return;
    g = { running: true, log: [], done: 0, total: 0 };
    emit();

    const log = (msg: string) => { g.log.push(msg); emit(); };

    try {
        // ── 1. Clone roles ─────────────────────────────────────────────────
        const roleMap: Record<string, string> = {}; // srcId → newId
        if (opts.roles) {
            log("📋 Fetching source roles...");
            const srcRoles = (await fetchRoles(srcId))
                .filter(r => !r.managed && r.name !== "@everyone")
                .sort((a, b) => a.position - b.position);
            g.total += srcRoles.length;
            for (const role of srcRoles) {
                try {
                    const res = await RestAPI.post({
                        url: `/guilds/${dstId}/roles`,
                        body: { name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: role.permissions },
                    });
                    roleMap[role.id] = res.body.id;
                    log(`✅ Role: ${role.name}`);
                } catch (e: any) {
                    log(`❌ Role ${role.name}: ${e?.status ?? "error"}`);
                }
                g.done++;
                emit();
                await sleep(500); // respect rate limits
            }
        }

        // ── 2. Clone channels & categories ─────────────────────────────────
        if (opts.channels) {
            log("📋 Fetching source channels...");
            const srcChannels = await fetchChannels(srcId);
            // Sort: categories first (type 4), then children
            const categories = srcChannels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
            const topLevel   = srcChannels.filter(c => c.type !== 4 && !c.parent_id).sort((a, b) => a.position - b.position);
            const children   = srcChannels.filter(c => c.type !== 4 && c.parent_id).sort((a, b) => a.position - b.position);
            const catMap: Record<string, string> = {};

            g.total += categories.length + topLevel.length + children.length;

            const createChannel = async (ch: any, parentId?: string) => {
                try {
                    const body: any = { name: ch.name, type: ch.type, topic: ch.topic, nsfw: ch.nsfw, bitrate: ch.bitrate, user_limit: ch.user_limit, rate_limit_per_user: ch.rate_limit_per_user };
                    if (parentId) body.parent_id = parentId;
                    const res = await RestAPI.post({ url: `/guilds/${dstId}/channels`, body });
                    log(`✅ Channel: #${ch.name}`);
                    return res.body.id as string;
                } catch (e: any) {
                    log(`❌ Channel #${ch.name}: ${e?.status ?? "error"}`);
                    return null;
                } finally { g.done++; emit(); await sleep(400); }
            };

            for (const cat of categories) {
                const newId = await createChannel(cat);
                if (newId) catMap[cat.id] = newId;
            }
            for (const ch of topLevel)  { await createChannel(ch); }
            for (const ch of children)  { await createChannel(ch, catMap[ch.parent_id]); }
        }

        log("✅ Clone complete!");
    } catch (err: any) {
        log(`❌ Fatal: ${err?.message ?? "unknown error"}`);
    }

    g.running = false;
    emit();
}

// ── UI ────────────────────────────────────────────────────────────────────────
function ServerClonerModal({ rootProps, srcId }: { rootProps: any; srcId: string }) {
    const [, tick] = useState(0);
    useEffect(() => { const fn = () => tick(n => n + 1); subs.add(fn); return () => { subs.delete(fn); }; }, []);

    const allGuilds = Object.values(GuildStore.getGuilds()) as any[];
    // Show only guilds where user is an admin (manage_guild permission = 0x20)
    const ownedGuilds = allGuilds.filter(guild => guild.ownerId === (window as any).__LOVECORD_CURRENT_USER_ID__
        || (guild.permissions & BigInt("0x20")) === BigInt("0x20") // MANAGE_GUILD – best-effort
    );

    const [dst, setDst]         = useState<string>("");
    const [cloneRoles, setRoles] = useState(true);
    const [cloneCh, setCh]       = useState(true);

    const srcGuild = GuildStore.getGuild(srcId);
    const idle     = !g.running;
    const pct      = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>🗂 Server Cloner — {srcGuild?.name ?? srcId}</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "rgba(250,166,26,.12)", border: "1px solid rgba(250,166,26,.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                    ⚠️ Only clone servers you have permission to manage. Channels are rate-limited to avoid bans.
                </div>
                {idle ? <>
                    <div>
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>Destination server (you must be an admin)</p>
                        <Select
                            options={ownedGuilds.filter(g => g.id !== srcId).map(g => ({ label: g.name, value: g.id }))}
                            select={setDst} serialize={(v: string) => v} isSelected={(v: string) => v === dst}
                            placeholder="Select destination server..."
                        />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                            <input type="checkbox" checked={cloneRoles} onChange={e => setRoles(e.target.checked)} /> Clone Roles
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                            <input type="checkbox" checked={cloneCh} onChange={e => setCh(e.target.checked)} /> Clone Channels &amp; Categories
                        </label>
                    </div>
                </> : <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{g.done}/{g.total} items</span><span>{pct}%</span>
                    </div>
                    <div style={{ background: "var(--background-secondary)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{ background: "var(--brand-500)", height: "100%", width: `${pct}%`, transition: "width .3s" }} />
                    </div>
                    <div style={{ maxHeight: 240, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {g.log.map((l, i) => <span key={i}>{l}</span>)}
                    </div>
                </>}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {idle
                    ? <>
                        <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                        <button disabled={!dst || (!cloneRoles && !cloneCh)}
                            onClick={() => runClone(srcId, dst, { roles: cloneRoles, channels: cloneCh })}
                            style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: (!dst || (!cloneRoles && !cloneCh)) ? 0.5 : 1 }}>
                            Start Clone
                        </button>
                    </>
                    : <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Background</button>
                }
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "ServerCloner",
    description: "Clone a server's channels, categories, and roles to another server you own.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() { addContextMenuPatch("guild-context", this.ctxPatch); },
    stop()  { removeContextMenuPatch("guild-context", this.ctxPatch); },

    ctxPatch(children: any[], { guild }: { guild?: any }) {
        if (!guild) return;
        children.push(
            <Menu.MenuItem id="lc-servercloner" label="Clone Server Structure"
                action={() => openModal(p => <ServerClonerModal rootProps={p} srcId={guild.id} />)} />
        );
    },
});
