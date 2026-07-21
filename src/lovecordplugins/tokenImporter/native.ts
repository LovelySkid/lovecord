/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * TokenImporter native helpers
 * ─────────────────────────────────────────────────────────────────
 * SECURITY NOTICE: This module contains NO filesystem scanning,
 * NO DPAPI calls, NO AES token decryption from Chromium data files.
 * It only validates tokens against Discord's own API and provides
 * local encryption via Electron's safeStorage.
 */

import { safeStorage } from "electron";
import { request } from "https";

const DISCORD_API_HOST = "discord.com";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ENCRYPT_PREFIX = "lc_enc:";

/**
 * Validates a Discord token by calling /api/v9/users/@me.
 * Returns the user object on success, or an error string.
 */
export async function checkToken(
    _ipcEvent: any,
    token: string
): Promise<{ valid: boolean; user?: any; error?: string; }> {
    return new Promise(resolve => {
        const req = request(
            {
                hostname: DISCORD_API_HOST,
                path: "/api/v9/users/@me",
                method: "GET",
                headers: {
                    Authorization: token,
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/json",
                    Accept: "*/*",
                },
            },
            res => {
                let data = "";
                res.on("data", (c: Buffer) => { data += c.toString(); });
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        try { resolve({ valid: true, user: JSON.parse(data) }); }
                        catch { resolve({ valid: false, error: "parse_error" }); }
                    } else if (res.statusCode === 401 || res.statusCode === 403) {
                        resolve({ valid: false, error: "invalid_token" });
                    } else if (res.statusCode === 429) {
                        resolve({ valid: false, error: "rate_limited" });
                    } else {
                        resolve({ valid: false, error: `http_${res.statusCode}` });
                    }
                });
            }
        );
        req.on("error", (e: any) => resolve({ valid: false, error: e?.message ?? "network_error" }));
        req.setTimeout(12000, () => { req.destroy(); resolve({ valid: false, error: "timeout" }); });
        req.end();
    });
}

/**
 * Encrypts a token string using Electron's safeStorage (OS keychain/DPAPI).
 * Prefix "lc_enc:" marks encrypted values in the data store.
 */
export async function encryptToken(_: any, token: string): Promise<string | null> {
    try {
        if (!safeStorage.isEncryptionAvailable()) return null;
        const buf = safeStorage.encryptString(token);
        return ENCRYPT_PREFIX + buf.toString("base64");
    } catch {
        return null;
    }
}

/**
 * Decrypts a previously encrypted token.
 */
export async function decryptToken(_: any, encrypted: string): Promise<string | null> {
    try {
        if (!safeStorage.isEncryptionAvailable()) return null;
        if (!encrypted.startsWith(ENCRYPT_PREFIX)) return encrypted; // not encrypted
        const raw = Buffer.from(encrypted.slice(ENCRYPT_PREFIX.length), "base64");
        return safeStorage.decryptString(raw);
    } catch {
        return null;
    }
}
