/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LeaveAllServers — Bulk guild leave with confirmation UI
 * Only uses Discord's own REST API.
 */

import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Forms, GuildStore, React, RestAPI, showToast, Toasts, useEffect, useState } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function LeaveModal({ rootProps }: { rootProps: any }) {
    const allGuilds = Object.values(GuildStore.getGuilds()) as any[];
    const [sel, setSel]     = useState<Set<string>>(new Set());
    const [running, setRun] = useState(false);
    const [done, setDone]   = useState(0);
    const [log, setLog]     = useState<string[]>([]);
    const [confirmed, setCon] = useState(false);

    function toggle(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
    function toggleAll() { setSel(sel.size === allGuilds.length ? new Set() : new Set(allGuilds.map(g => g.id))); }

    async function leaveAll() {
        setRun(true); setLog([]); setDone(0);
        const ids = Array.from(sel);
        for (let i = 0; i < ids.length; i++) {
            const g = GuildStore.getGuild(ids[i]);
            try {
                await RestAPI.del({ url: `/users/@me/guilds/${ids[i]}` });
                setLog(l => [...l, `✅ Left: ${g?.name ?? ids[i]}`]);
            } catch (e: any) {
                setLog(l => [...l, `❌ ${g?.name ?? ids[i]}: ${e?.status ?? "error"}`]);
            }
            setDone(i + 1);
            await sleep(600);
        }
        setRun(false);
    }

    const finished = !running && done > 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>🚪 Leave All Servers</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {!running && !finished && <>
                    <div style={{ background: "rgba(237,66,69,.12)", border: "1px solid rgba(237,66,69,.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                        ⚠️ You cannot rejoin servers you don't have an invite link for.
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Forms.FormTitle tag="h5" style={{ margin: 0 }}>Select servers ({sel.size}/{allGuilds.length})</Forms.FormTitle>
                        <button onClick={toggleAll} style={{ background: "none", border: "none", color: "var(--text-link)", cursor: "pointer", fontSize: 12 }}>
                            {sel.size === allGuilds.length ? "Deselect all" : "Select all"}
                        </button>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                        {allGuilds.map(guild => (
                            <label key={guild.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, padding: "4px 0" }}>
                                <input type="checkbox" checked={sel.has(guild.id)} onChange={() => toggle(guild.id)} />
                                {guild.name}
                            </label>
                        ))}
                    </div>
                    {sel.size > 0 && !confirmed && (
                        <div style={{ background: "rgba(237,66,69,.08)", borderRadius: 6, padding: "8px 12px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                                <input type="checkbox" checked={confirmed} onChange={e => setCon(e.target.checked)} />
                                I understand this action cannot be easily undone
                            </label>
                        </div>
                    )}
                </>}
                {(running || finished) && <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{done}/{sel.size} processed</span>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {log.map((l, i) => <span key={i}>{l}</span>)}
                        {running && <span style={{ opacity: .6 }}>Processing...</span>}
                    </div>
                </>}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {!running && !finished && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                    <button disabled={sel.size === 0 || !confirmed}
                        onClick={leaveAll}
                        style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: (sel.size === 0 || !confirmed) ? 0.5 : 1 }}>
                        Leave {sel.size} server{sel.size !== 1 ? "s" : ""}
                    </button>
                </>}
                {finished && <button onClick={rootProps.onClose} style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff" }}>Done</button>}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "LeaveAllServers",
    description: "Bulk leave multiple servers with a confirmation UI. Accessible via User Settings.",
    authors: [{ name: "Lovecord", id: 0n }],

    toolboxActions: {
        "Leave All Servers"() { openModal(p => <LeaveModal rootProps={p} />); }
    },

    start() { },
    stop() { },
});
