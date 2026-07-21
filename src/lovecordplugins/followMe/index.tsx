/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FollowMe — Invite friends to join your current voice channel via DM link.
 * Right-click a user → send them a voice invite.
 * Uses only Discord's own REST API. Zero external connections.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, React, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";
import { findStoreLazy } from "@webpack";

const VoiceStateStore = findStoreLazy("VoiceStateStore");

async function sendVoiceInvite(targetUserId: string, channelId: string) {
    try {
        // Create DM channel
        const dmRes = await RestAPI.post({ url: "/users/@me/channels", body: { recipient_id: targetUserId } });
        if (!dmRes?.body?.id) { showToast("Could not open DM (blocked?)", Toasts.Type.FAILURE); return; }

        const dmChannelId = dmRes.body.id;

        // Create a voice channel invite
        const inviteRes = await RestAPI.post({
            url: `/channels/${channelId}/invites`,
            body: { max_age: 3600, max_uses: 1, temporary: false },
        });

        const code = inviteRes?.body?.code;
        if (!code) { showToast("Could not create invite", Toasts.Type.FAILURE); return; }

        const me = UserStore.getCurrentUser();
        const ch = ChannelStore.getChannel(channelId);
        const msg = `${me?.globalName || me?.username || "Someone"} invited you to join their voice channel${ch?.name ? ` (#${ch.name})` : ""}!\nhttps://discord.gg/${code}`;

        await RestAPI.post({ url: `/channels/${dmChannelId}/messages`, body: { content: msg, tts: false } });
        showToast("Voice invite sent!", Toasts.Type.SUCCESS);
    } catch (e: any) {
        showToast(`Failed: ${e?.message ?? e?.status ?? "unknown error"}`, Toasts.Type.FAILURE);
    }
}

export default definePlugin({
    name: "FollowMe",
    description: "Right-click a user → send them a voice channel invite via DM. Uses only Discord's own API.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() { addContextMenuPatch("user-context", this.ctxPatch); },
    stop()  { removeContextMenuPatch("user-context", this.ctxPatch); },

    ctxPatch(children: any[], { user }: { user?: any }) {
        if (!user) return;

        // Find current user's voice channel
        const me = UserStore.getCurrentUser();
        if (!me) return;
        const voiceState = VoiceStateStore?.getVoiceStateForUser?.(me.id);
        const channelId  = voiceState?.channelId;
        if (!channelId) return; // Not in a voice channel — hide menu item

        const ch = ChannelStore.getChannel(channelId);
        children.push(
            <Menu.MenuItem
                id="lc-followme"
                label={`📢 Invite to ${ch?.name ?? "Voice Channel"}`}
                action={() => sendVoiceInvite(user.id, channelId)}
            />
        );
    },
});
