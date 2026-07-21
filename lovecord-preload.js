/*
 * Lovecord — A custom client modification fork built upon Equicord
 * Based on Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * lovecord-preload.js
 * Executed in the renderer's Node.js preload context before any web content loads.
 * Responsibilities:
 *   1. Extend Module.globalPaths so Discord's native modules are resolvable.
 *   2. Expose the VencordNative API surface to the renderer via contextBridge.
 *   3. Inject the Lovecord renderer bundle via webFrame.executeJavaScript.
 */
"use strict";

// ─── Phase 1: Extend global module resolution paths ───────────────────────────
// Discord ships native modules (discord_voice, discord_krisp, etc.) in
// AppData\Roaming\discord\module_data\. Without these paths in globalPaths,
// asar-isolated renderer contexts cannot resolve them.
(function extendGlobalPaths() {
    const Module = require("module");
    const path   = require("path");
    const fs     = require("fs");

    const appData       = process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming");
    const moduleDataPath = path.join(appData, "discord", "module_data");

    // Use a Set for O(1) duplicate detection before mutating the array
    const seenPaths = new Set(Module.globalPaths);

    function addGlobalPath(p) {
        if (seenPaths.has(p)) return;
        seenPaths.add(p);
        Module.globalPaths.push(p);
    }

    addGlobalPath(moduleDataPath);
    try {
        for (const modName of fs.readdirSync(moduleDataPath)) {
            const modDir = path.join(moduleDataPath, modName);
            try {
                if (!fs.statSync(modDir).isDirectory()) continue;
                for (const ver of fs.readdirSync(modDir)) {
                    const verDir = path.join(modDir, ver);
                    try { if (fs.statSync(verDir).isDirectory()) addGlobalPath(verDir); } catch { /* skip */ }
                }
            } catch { /* skip unreadable directories */ }
        }
    } catch { /* module_data may not exist on a fresh install */ }

    // Patch Module._resolveLookupPaths to inject globalPaths into asar-isolated
    // contexts where parent.paths is empty (those contexts bypass Node's own injection).
    const globalPathsSnapshot = Module.globalPaths.slice();
    const globalPathsSet      = new Set(globalPathsSnapshot);
    const originalResolve     = Module._resolveLookupPaths;

    Module._resolveLookupPaths = function resolveLookupPaths(request, parent) {
        if (parent) {
            if (!parent.paths || parent.paths.length === 0) {
                // Completely empty — replace with the full global paths snapshot
                parent.paths = globalPathsSnapshot.slice();
            } else {
                // Partially populated — append any missing global paths
                const existing = new Set(parent.paths);
                for (const p of globalPathsSet) {
                    if (!existing.has(p)) parent.paths.push(p);
                }
            }
        }
        return originalResolve.call(this, request, parent);
    };
}());

// ─── Phase 2: Build and expose the VencordNative API surface ─────────────────
// All IPC calls are routed through ipcRenderer.invoke (async) or sendSync.
// contextBridge.exposeInMainWorld is the only safe way to bridge these to
// the renderer without granting full Node.js access.
const { ipcRenderer, contextBridge, webFrame } = require("electron");
try {
    const m = T("VencordGetPluginIpcMethodMap") || {};
    for (const [e, o] of Object.entries(m)) {
        const t = S[e] = {};
        for (const [s, R] of Object.entries(o)) t[s] = (...C) => r(R, ...C);
    }
} catch (e) { }

const VencordNative = {
    themes: {
        uploadTheme: async () => { throw new Error("uploadTheme is WEB only"); },
        deleteTheme: e => r("VencordDeleteTheme", e),
        getThemesDir: () => r("VencordGetThemesDir"),
        getThemesList: () => r("VencordGetThemesList"),
        getThemeData: e => r("VencordGetThemeData", e),
        getSystemValues: () => r("VencordGetThemeSystemValues"),
        openFolder: () => r("VencordOpenThemesFolder")
    },
    updater: {
        getUpdates: () => r("VencordGetUpdates"),
        update: () => r("VencordUpdate"),
        rebuild: () => r("VencordBuild"),
        getRepo: () => r("VencordGetRepo")
    },
    settings: {
        get: () => T("VencordGetSettings"),
        set: (e, o) => r("VencordSetSettings", e, o),
        getSettingsDir: () => r("VencordGetSettingsDir"),
        openFolder: () => r("VencordOpenSettingsFolder")
    },
    quickCss: {
        get: () => r("VencordGetQuickCss"),
        set: e => r("VencordSetQuickCss", e),
        addChangeListener(e) { ipcRenderer.on("VencordQuickCssUpdate", (o, t) => e(t)); },
        addThemeChangeListener(e) { ipcRenderer.on("VencordThemeUpdate", () => e()); },
        openFile: () => r("VencordOpenQuickCss"),
        openEditor: () => r("VencordOpenMonacoEditor"),
        getEditorTheme: () => T("VencordGetMonacoTheme")
    },
    native: {
        getVersions: () => process.versions,
        openExternal: e => r("VencordOpenExternal", e),
        getRendererCss: () => r("VencordGetRendererCss"),
        onRendererCssUpdate: () => { }
    },
    csp: {
        isDomainAllowed: (e, o) => r("VencordCspIsDomainAllowed", e, o),
        removeOverride: e => r("VencordCspRemoveOverride", e),
        requestAddOverride: (e, o, t) => r("VencordCspRequestAddOverride", e, o, t)
    },
    tray: {
        setUpdateState: e => ipcRenderer.send("VencordSetTrayUpdateState", e),
        onCheckUpdates: e => { ipcRenderer.on("VencordTrayCheckUpdates", e); },
        onRepair: e => { ipcRenderer.on("VencordTrayRepair", e); }
    },
    desktopCapture: { getSources: () => r("VencordGetDesktopSources") },
    pluginHelpers: S,
    worldBomb: {
        sequence: (word, lps, humanChance, targetX = -1, targetY = -1) =>
            r("WorldBombSequence", word, lps, humanChance, targetX, targetY),
        getCursorPos: () => r("WorldBombGetCursorPos"),
    },
    window: {
        setBackgroundMaterial: e => r("EquicordSetWindowBackgroundMaterial", e),
        setThumbarButtons: e => r("SoundCordSetThumbarButtons", e),
        onThumbarClick: e => { ipcRenderer.on("SoundCordThumbarButtonClick", (o, t) => e(t)); },
        removeThumbarClickListener: () => { ipcRenderer.removeAllListeners("SoundCordThumbarButtonClick"); }
    }
};

try {
    contextBridge.exposeInMainWorld("VencordNative", VencordNative);
} catch (e) {
    if (typeof window !== "undefined") window.VencordNative = VencordNative;
}

if (location.protocol !== "data:") {
    try { r("VencordInitFileWatchers"); } catch (e) { }

    // Injection du renderer.js via webFrame.executeJavaScript
    // Identique à l'original Equicord — c'est la méthode qui fonctionne
    try {
        let rendererJs;
        try {
            const rendererPath = path.join(__dirname, "renderer.js");
            if (fs.existsSync(rendererPath)) {
                rendererJs = fs.readFileSync(rendererPath, "utf-8");
            }
        } catch (_) {}
        if (!rendererJs) {
            rendererJs = T("VencordPreloadGetRendererJs");
        }
        if (rendererJs) {
            webFrame.executeJavaScript(rendererJs).catch(e => {
                console.error("[Lovecord] renderer inject failed:", e?.message);
            });
        }
    } catch (e) {
        console.error("[Lovecord] VencordPreloadGetRendererJs failed:", e);
    }

    if (process.env.DISCORD_PRELOAD) {
        try { require(process.env.DISCORD_PRELOAD); } catch (e) { }
    }
} else {
    if (typeof window !== "undefined") {
        window["setCss"] = (() => { let t; return e => { clearTimeout(t); t = setTimeout(() => VencordNative.quickCss.set(e), 300); }; })();
        window["getCurrentCss"] = VencordNative.quickCss.get;
        window["getTheme"] = VencordNative.quickCss.getEditorTheme;
    }
}
//# sourceURL=file:///VencordPreload
