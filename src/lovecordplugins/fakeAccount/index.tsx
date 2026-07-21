/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FakeAccount — Local profile appearance switcher
 * Locally spoofs your visible profile (username, avatar, bio).
 * Nothing is sent to Discord's servers — pure client-side UI patch.
 * Zero external connections.
 */

import { DataStore } from "@api/index";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { FluxDispatcher, React, UserStore, useEffect, useState } from "@webpack/common";

const DS_KEY = "lovecord_fakeaccount_presets";

interface Preset { id: string; label: string; username: string; globalName?: string; avatar?: string; bio?: string; accentColor?: number; }

let activePreset: Preset | null = null;
let realSnapshot: any = null;

// ── Profile patch helpers ──────────────────────────────────────────────────────
function applyPreset(preset: Preset) {
    const me = UserStore.getCurrentUser();
    if (!me) return;
    if (!realSnapshot) {
        realSnapshot = {
            username: me.username, globalName: (me as any).globalName,
            avatar: me.avatar, bio: (me as any).bio, accentColor: (me as any).accentColor,
        };
    }
    activePreset = preset;
    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: {
            id: me.id, username: preset.username,
            global_name: preset.globalName ?? preset.username,
            avatar: preset.avatar ?? me.avatar,
            bio: preset.bio ?? "",
            accent_color: preset.accentColor ?? null,
            discriminator: me.discriminator ?? "0", flags: (me as any).flags ?? 0,
        },
    });
    try { FluxDispatcher.dispatch({ type: "CURRENT_USER_UPDATE", user: { ...UserStore.getCurrentUser() } }); } catch { }
}

function restoreReal() {
    if (!realSnapshot) return;
    const me = UserStore.getCurrentUser();
    if (!me) return;
    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: { id: me.id, username: realSnapshot.username, global_name: realSnapshot.globalName ?? realSnapshot.username, avatar: realSnapshot.avatar, bio: realSnapshot.bio ?? "", accent_color: realSnapshot.accentColor ?? null, discriminator: me.discriminator ?? "0" },
    });
    activePreset = null; realSnapshot = null;
    try { FluxDispatcher.dispatch({ type: "CURRENT_USER_UPDATE", user: { ...UserStore.getCurrentUser() } }); } catch { }
}

// ── UI ────────────────────────────────────────────────────────────────────────
function PersonIcon() {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>;
}

function PresetForm({ preset, onSave, onCancel }: { preset?: Partial<Preset>; onSave: (p: Preset) => void; onCancel: () => void; }) {
    const [label, setLabel]       = useState(preset?.label ?? "");
    const [username, setUsername] = useState(preset?.username ?? "");
    const [globalName, setGN]     = useState(preset?.globalName ?? "");
    const [bio, setBio]           = useState(preset?.bio ?? "");
    function save() {
        if (!label || !username) return;
        onSave({ id: preset?.id ?? Date.now().toString(), label, username, globalName: globalName || username, bio });
    }
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[["Label (for reference)", label, setLabel], ["Username", username, setUsername], ["Display Name (optional)", globalName, setGN], ["Bio (optional)", bio, setBio]] as any}
            {([["Label", label, setLabel], ["Username", username, setUsername], ["Display Name", globalName, setGN], ["Bio", bio, setBio]] as const).map(([l, v, fn]) => (
                <div key={l}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: .5 }}>{l}</p>
                    <input value={v} onChange={e => (fn as any)(e.target.value)} placeholder={`Enter ${l.toLowerCase()}...`}
                        style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "6px 10px", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
                </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={onCancel} style={{ flex: 1, background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 0", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                <button onClick={save} disabled={!label || !username}
                    style={{ flex: 1, background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 0", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: (!label || !username) ? 0.5 : 1 }}>Save</button>
            </div>
        </div>
    );
}

function FakeAccountModal({ rootProps }: { rootProps: any }) {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [adding, setAdding]   = useState(false);
    const [active, setActive]   = useState<Preset | null>(activePreset);

    useEffect(() => {
        DataStore.get<Preset[]>(DS_KEY).then(v => setPresets(v ?? []));
    }, []);

    async function save(list: Preset[]) { setPresets(list); await DataStore.set(DS_KEY, list); }

    function apply(p: Preset) { applyPreset(p); setActive(p); }
    function restore() { restoreReal(); setActive(null); }
    function deletePreset(id: string) { save(presets.filter(p => p.id !== id)); }
    function addPreset(p: Preset) { save([...presets, p]); setAdding(false); }

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>🎭 Fake Account Switcher</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--background-secondary)", borderRadius: 4, padding: "6px 10px" }}>
                    ℹ️ All changes are client-side only. Your real account is never modified on Discord's servers.
                </div>
                {active && (
                    <div style={{ background: "rgba(87,242,135,.1)", border: "1px solid rgba(87,242,135,.3)", borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--text-positive)" }}>✅ Active preset: <strong>{active.label}</strong></span>
                        <button onClick={restore} style={{ background: "var(--status-danger)", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", color: "#fff", fontSize: 12 }}>Restore Real</button>
                    </div>
                )}
                {adding
                    ? <PresetForm onSave={addPreset} onCancel={() => setAdding(false)} />
                    : <>
                        {presets.length === 0 && <span style={{ opacity: .5, fontSize: 13 }}>No presets yet. Create one below.</span>}
                        {presets.map(p => (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--background-secondary)", borderRadius: 6, padding: "8px 12px" }}>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--header-primary)" }}>{p.label}</span>
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>@{p.username}</span>
                                </div>
                                <button onClick={() => apply(p)} style={{ background: "var(--brand-500)", border: "none", borderRadius: 4, padding: "4px 12px", cursor: "pointer", color: "#fff", fontSize: 12 }}>Apply</button>
                                <button onClick={() => deletePreset(p.id)} style={{ background: "var(--status-danger)", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: "#fff", fontSize: 12 }}>🗑</button>
                            </div>
                        ))}
                        <button onClick={() => setAdding(true)} style={{ background: "var(--background-secondary)", border: "1px dashed var(--background-modifier-accent)", borderRadius: 6, padding: "10px", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
                            + New preset
                        </button>
                    </>
                }
            </ModalContent>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "FakeAccount",
    description: "Locally switch your visible profile to a preset appearance. Client-side only — nothing sent to Discord servers.",
    authors: [{ name: "Lovecord", id: 0n }],
    dependencies: ["HeaderBarAPI"],

    start() {
        addHeaderBarButton("lc-fakeaccount", () => (
            <HeaderBarButton icon={PersonIcon} tooltip="Fake Account Switcher"
                onClick={() => openModal(p => <FakeAccountModal rootProps={p} />)} />
        ), 6);
    },
    stop() {
        removeHeaderBarButton("lc-fakeaccount");
        if (activePreset) restoreReal();
    },
});
