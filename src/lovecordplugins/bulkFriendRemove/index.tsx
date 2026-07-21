/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * BulkFriendRemove — Remove multiple friends at once with a selection UI.
 * Only uses Discord's own REST API. Zero external connections.
 */

import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { React, RelationshipStore, RestAPI, UserStore, useState } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function BulkRemoveModal({ rootProps }: { rootProps: any }) {
    const friendIds: string[] = (RelationshipStore as any).getFriendIDs?.() ?? [];
    const [sel, setSel]       = useState<Set<string>>(new Set());
    const [running, setRun]   = useState(false);
    const [done, setDone]     = useState(0);
    const [log, setLog]       = useState<string[]>([]);
    const [confirmed, setCon] = useState(false);
    const [search, setSearch] = useState("");

    const filtered = search
        ? friendIds.filter(id => { const u = UserStore.getUser(id); return u && (u.globalName || u.username)?.toLowerCase().includes(search.toLowerCase()); })
        : friendIds;

    function toggle(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
    function toggleFiltered() {
        const n = new Set(sel);
        const allSel = filtered.every(id => sel.has(id));
        filtered.forEach(id => allSel ? n.delete(id) : n.add(id));
        setSel(n);
    }

    async function removeAll() {
        setRun(true); setLog([]); setDone(0);
        const ids = Array.from(sel);
        for (let i = 0; i < ids.length; i++) {
            const u = UserStore.getUser(ids[i]);
            const name = u ? (u.globalName || u.username) : ids[i];
            try {
                await RestAPI.del({ url: `/users/@me/relationships/${ids[i]}` });
                setLog(l => [...l, `✅ Removed: ${name}`]);
            } catch (e: any) {
                setLog(l => [...l, `❌ ${name}: ${e?.status ?? "error"}`]);
            }
            setDone(i + 1);
            await sleep(400);
        }
        setRun(false);
    }

    const finished = !running && done > 0;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>👥 Bulk Friend Remove</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {!running && !finished && <>
                    <input placeholder="Search friends..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "6px 10px", fontSize: 13 }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{sel.size} selected</span>
                        <button onClick={toggleFiltered} style={{ background: "none", border: "none", color: "var(--text-link)", cursor: "pointer", fontSize: 12 }}>
                            {filtered.every(id => sel.has(id)) ? "Deselect visible" : "Select visible"}
                        </button>
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                        {filtered.length === 0 && <span style={{ opacity: .6, fontSize: 13 }}>No friends found.</span>}
                        {filtered.map(id => {
                            const u = UserStore.getUser(id);
                            const name = u ? (u.globalName || u.username) : id;
                            return (
                                <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, padding: "3px 0" }}>
                                    <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
                                    {name}
                                </label>
                            );
                        })}
                    </div>
                    {sel.size > 0 && (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", background: "rgba(237,66,69,.08)", borderRadius: 6, padding: "8px 12px" }}>
                            <input type="checkbox" checked={confirmed} onChange={e => setCon(e.target.checked)} />
                            I understand this will remove {sel.size} friend{sel.size !== 1 ? "s" : ""} permanently
                        </label>
                    )}
                </>}
                {(running || finished) && (
                    <div style={{ maxHeight: 280, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {log.map((l, i) => <span key={i}>{l}</span>)}
                        {running && <span style={{ opacity: .6 }}>Processing...</span>}
                    </div>
                )}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {!running && !finished && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                    <button disabled={sel.size === 0 || !confirmed}
                        onClick={removeAll}
                        style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: (sel.size === 0 || !confirmed) ? 0.5 : 1 }}>
                        Remove {sel.size} friend{sel.size !== 1 ? "s" : ""}
                    </button>
                </>}
                {finished && <button onClick={rootProps.onClose} style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff" }}>Done</button>}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "BulkFriendRemove",
    description: "Remove multiple friends at once with a searchable selection UI and confirmation.",
    authors: [{ name: "Lovecord", id: 0n }],

    toolboxActions: {
        "Bulk Friend Remove"() { openModal(p => <BulkRemoveModal rootProps={p} />); }
    },

    start() { },
    stop() { },
});
