/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * SilentDelete — Delete your own messages with a right-click shortcut.
 * Adds a cleaner UX for message deletion. Uses only Discord's REST API.
 * Zero external connections.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu, React, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

export default definePlugin({
    name: "SilentDelete",
    description: "Right-click your own messages → quick Delete shortcut with no confirmation dialog.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() {
        addContextMenuPatch("message", this.ctxPatch);
    },
    stop() {
        removeContextMenuPatch("message", this.ctxPatch);
    },

    ctxPatch(children: any[], { message, channel }: { message: any; channel: any }) {
        const me = UserStore.getCurrentUser();
        if (!me || message?.author?.id !== me.id) return; // Only own messages
        children.push(
            <Menu.MenuItem
                id="lc-silentdelete"
                label="⚡ Quick Delete"
                color="danger"
                action={async () => {
                    try {
                        await RestAPI.del({ url: `/channels/${channel.id}/messages/${message.id}` });
                    } catch (e: any) {
                        showToast(`Delete failed: ${e?.status ?? "error"}`, Toasts.Type.FAILURE);
                    }
                }}
            />
        );
    },
});
