/*
 * Lovecord — A custom client modification fork built upon Equicord
 * Based on Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, net, protocol } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";

import { initCsp } from "./csp";
import { ensureSafePath } from "./ipcMain";
import { applyStoredMellowtelConsent } from "./mellowtel";
import { RendererSettings } from "./settings";
import { IS_VANILLA, THEMES_DIR } from "./utils/constants";
import { installExt } from "./utils/extensions";

/** Source map files the protocol handler is allowed to serve. */
const ALLOWED_SOURCE_MAPS = new Set(["renderer.js.map", "preload.js.map", "patcher.js.map", "main.js.map"]);

/**
 * Factory that builds an Electron protocol handler for a given custom scheme.
 * Both `vencord://` and `equicord://` behave identically — this eliminates
 * the copy-paste duplication that previously existed between the two handlers.
 *
 * Supported URL shapes:
 *   - `<scheme>:///themes/<filename>` — Serves a CSS theme file from THEMES_DIR
 *     with path traversal protection via ensureSafePath.
 *   - `<scheme>:///<name>.js.map`    — Serves a source map from __dirname.
 *   - Everything else returns HTTP 404.
 */
function createProtocolHandler(scheme: string): Parameters<typeof protocol.handle>[1] {
    const prefix = `${scheme}://`;
    return ({ url: unsafeUrl }) => {
        // Decode and strip the scheme prefix + optional cache-busting query string
        let url = decodeURI(unsafeUrl).slice(prefix.length).replace(/\?v=\d+$/, "");
        if (url.endsWith("/")) url = url.slice(0, -1);

        if (url.startsWith("/themes/")) {
            const theme   = url.slice("/themes/".length);
            const safeUrl = ensureSafePath(THEMES_DIR, theme);
            // ensureSafePath returns null for path-traversal attempts
            if (!safeUrl) return new Response(null, { status: 404 });
            return net.fetch(pathToFileURL(safeUrl).toString());
        }

        // Source Maps: served so DevTools can display readable stack traces.
        // The renderer is executed from a string so inline source maps are not viable.
        if (ALLOWED_SOURCE_MAPS.has(url)) {
            return net.fetch(pathToFileURL(join(__dirname, url)).toString());
        }

        return new Response(null, { status: 404 });
    };
}

if (!IS_VANILLA && !IS_EXTENSION) {
    app.whenReady().then(() => {
        // Register both schemes — Discord may reference either depending on the build
        protocol.handle("vencord",   createProtocolHandler("vencord"));
        protocol.handle("equicord",  createProtocolHandler("equicord"));

        // Install React DevTools if enabled (non-blocking — failure is logged, not thrown)
        try {
            if (RendererSettings.store.enableReactDevtools) {
                installExt("fmkadmapgofadopljbjfkapdkoienihi")
                    .then(() => console.info("[Lovecord] React Developer Tools installed."))
                    .catch(err => console.error("[Lovecord] React Developer Tools install failed:", err));
            }
        } catch { /* RendererSettings may not be ready in all environments */ }

        initCsp();

        applyStoredMellowtelConsent().catch(err =>
            console.error("[Lovecord] Failed to apply stored Mellowtel consent:", err)
        );
    });
}

if (IS_DISCORD_DESKTOP) {
    require("./patcher");
}

