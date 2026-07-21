/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MutualScanner — Shows mutual servers and mutual friends for any user.
 * Uses only Discord's own API (/users/{id}/profile).
 * Zero external connections.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { GuildStore, Menu, React, RestAPI, UserStore, useEffect, useState } from "@webpack/common";

function MutualModal({ rootProps, userId }: { rootProps: any; userId: string }) {
    const [loading, setLoading] = useState(true);
    const [mutualGuilds, setMG] = useState<any[]>([]);
    const [mutualFriends, setMF] = useState<any[]>([]);
    const [error, setError]      = useState<string | null>(null);
    const user = UserStore.getUser(userId);

    useEffect(() => {
        let cancelled = false;
        RestAPI.get({ url: `/users/${userId}/profile?with_mutual_guilds=true&with_mutual_friends=true` })
            .then(res => {
                if (cancelled) return;
                setMG(res.body?.mutual_guilds ?? []);
                setMF(res.body?.mutual_friends ?? []);
                setLoading(false);
            })
            .catch(e => { if (!cancelled) { setError(`Error: ${e?.status ?? e?.message ?? "unknown"}`); setLoading(false); } });
        return () => { cancelled = true; };
    }, [userId]);

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>
                    🔍 Mutual Info — {user?.globalName || user?.username || userId}
                </span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {loading && <span style={{ opacity: .6 }}>Loading...</span>}
                {error && <span style={{ color: "var(--status-danger)" }}>{error}</span>}
                {!loading && !error && <>
                    <section>
                        <p style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: .5, color: "var(--text-muted)" }}>
                            Mutual Servers ({mutualGuilds.length})
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                            {mutualGuilds.length === 0 && <span style={{ opacity: .5, fontSize: 13 }}>No mutual servers.</span>}
                            {mutualGuilds.map((mg: any) => {
                                const guild = GuildStore.getGuild(mg.id);
                                return (
                                    <div key={mg.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--background-secondary)", borderRadius: 4, padding: "5px 10px", fontSize: 13 }}>
                                        {guild?.icon
                                            ? <img src={`https://cdn.discordapp.com/icons/${mg.id}/${guild.icon}.webp?size=32`} width={20} height={20} style={{ borderRadius: "50%" }} alt="" />
                                            : <div style={{ width: 20, height: 20, background: "var(--brand-500)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>{guild?.name?.[0] ?? "?"}</div>
                                        }
                                        {guild?.name ?? mg.id}
                                        {mg.nick && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>(nick: {mg.nick})</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                    <section>
                        <p style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: .5, color: "var(--text-muted)" }}>
                            Mutual Friends ({mutualFriends.length})
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                            {mutualFriends.length === 0 && <span style={{ opacity: .5, fontSize: 13 }}>No mutual friends.</span>}
                            {mutualFriends.map((mf: any) => {
                                const u = UserStore.getUser(mf.id);
                                return (
                                    <div key={mf.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--background-secondary)", borderRadius: 4, padding: "5px 10px", fontSize: 13 }}>
                                        {u?.avatar
                                            ? <img src={`https://cdn.discordapp.com/avatars/${mf.id}/${u.avatar}.webp?size=32`} width={20} height={20} style={{ borderRadius: "50%" }} alt="" />
                                            : <div style={{ width: 20, height: 20, background: "var(--brand-experiment)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>{(u?.globalName || u?.username || "?")?.[0]?.toUpperCase()}</div>
                                        }
                                        {u?.globalName || u?.username || mf.id}
                                        {u?.username && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>@{u.username}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </>}
            </ModalContent>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "MutualScanner",
    description: "Right-click a user → view mutual servers and mutual friends. Uses Discord's own profile API.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() { addContextMenuPatch("user-context", this.ctxPatch); },
    stop()  { removeContextMenuPatch("user-context", this.ctxPatch); },

    ctxPatch(children: any[], { user }: { user?: any }) {
        if (!user) return;
        children.push(
            <Menu.MenuItem id="lc-mutualscanner" label="🔍 Mutual Info"
                action={() => openModal(p => <MutualModal rootProps={p} userId={user.id} />)} />
        );
    },
});
