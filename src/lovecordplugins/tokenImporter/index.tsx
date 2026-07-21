/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * TokenImporter — clean multi-account switcher
 * ─────────────────────────────────────────────────────────────────
 * Allows users to manually paste and validate Discord tokens,
 * store them encrypted locally, and switch between accounts.
 *
 * SECURITY: NO automatic filesystem scanning, NO DPAPI token
 * harvesting, NO external server communication. All data stays
 * local and encrypted via Electron safeStorage.
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import { PluginNative } from "@utils/types";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { Forms, IconUtils, React, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.TokenImporter as PluginNative<typeof import("./native")>;
const STORE_KEY = "lovecord_TokenImporter_accounts";
const ENCRYPT_PREFIX = "lc_enc:";

// ── Types ──────────────────────────────────────────────────────────────────
interface SavedAccount {
    id: string;
    token: string;          // stored encrypted
    username: string;
    discriminator: string;
    avatar: string;
}

interface TokenResult {
    token: string;
    status: "pending" | "checking" | "valid" | "invalid" | "error" | "rate_limited";
    username?: string;
    avatar?: string;
    id?: string;
}

// ── Regex that matches Discord token format ────────────────────────────────
const TOKEN_REGEX = /(?:mfa\.[\w-]{84}|[\w-]{24,26}\.[\w-]{4,7}\.[\w-]{27,40})/g;

function extractTokens(raw: string): string[] {
    const found = new Set<string>();
    TOKEN_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_REGEX.exec(raw)) !== null) found.add(m[0]);
    return Array.from(found);
}

// ── Account persistence (with encryption) ─────────────────────────────────
let accountsCache: SavedAccount[] | null = null;
let loadPromise: Promise<SavedAccount[]> | null = null;

function getAccounts(): Promise<SavedAccount[]> {
    if (accountsCache !== null) return Promise.resolve(accountsCache);
    if (!loadPromise) {
        loadPromise = DataStore.get<SavedAccount[]>(STORE_KEY).then(async stored => {
            const raw = stored ?? [];
            const decrypted: SavedAccount[] = [];
            for (const acc of raw) {
                let tok = acc.token;
                if (tok.startsWith(ENCRYPT_PREFIX)) {
                    const dec = await Native.decryptToken(tok).catch(() => null);
                    if (dec) tok = dec;
                }
                decrypted.push({ ...acc, token: tok });
            }
            accountsCache = decrypted;
            loadPromise = null;
            return accountsCache;
        });
    }
    return loadPromise;
}

async function saveAccounts(accounts: SavedAccount[]): Promise<void> {
    // Deduplicate by id
    const map = new Map<string, SavedAccount>();
    for (const a of accounts) if (!map.has(a.id)) map.set(a.id, a);
    const deduped = Array.from(map.values());
    accountsCache = deduped;

    const toStore: SavedAccount[] = [];
    for (const a of deduped) {
        let tok = a.token;
        if (!tok.startsWith(ENCRYPT_PREFIX)) {
            const enc = await Native.encryptToken(tok).catch(() => null);
            if (enc) tok = enc;
        }
        toStore.push({ ...a, token: tok });
    }
    await DataStore.set(STORE_KEY, toStore);
}

// ── Account switching ──────────────────────────────────────────────────────
function switchToAccount(token: string) {
    try {
        const TokenStore = findByProps("getToken", "setToken");
        if (TokenStore?.setToken) (TokenStore as any).setToken(token);

        window.localStorage.setItem("token", `"${token}"`);

        // Inject via hidden iframe for cross-context access
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        try { (iframe as any).contentWindow.localStorage.token = `"${token}"`; } catch {}
        document.body.removeChild(iframe);

        setTimeout(() => location.reload(), 350);
    } catch (err) {
        console.error("[Lovecord/TokenImporter] Switch failed:", err);
        location.reload();
    }
}

// ── Icons ──────────────────────────────────────────────────────────────────
function FolderIcon({ width = 20, height = 20, style }: { width?: number; height?: number; style?: React.CSSProperties; }) {
    return <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor" style={style}><path d="M2 5a3 3 0 0 1 3-3h3.93a2 2 0 0 1 1.66.9L12 5h7a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5Z" /></svg>;
}
function TrashIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.1l-.9 12.1A3 3 0 0 1 17 23H7a3 3 0 0 1-3-2.9L3.1 8H2a1 1 0 0 1 0-2h4V4Zm2 0v2h6V4H9ZM5.1 8l.9 11.9a1 1 0 0 0 1 .1h6a1 1 0 0 0 1-.1L14.9 8H5.1Z" /></svg>;
}
function CheckIcon() {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>;
}
function CrossIcon() {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 17.59 13.41 12 19 6.41z" /></svg>;
}

// ── Modal ──────────────────────────────────────────────────────────────────
function TokenModal({ rootProps }: { rootProps: any; }) {
    const [accounts, setAccounts] = useState<SavedAccount[]>(() => accountsCache ?? []);
    const [loaded, setLoaded] = useState(() => accountsCache !== null);
    const [tab, setTab] = useState<"saved" | "add">("saved");
    const [pasteValue, setPaste] = useState("");
    const [detectedCount, setDetectedCount] = useState(0);
    const [results, setResults] = useState<TokenResult[]>([]);
    const [checking, setChecking] = useState(false);
    const [done, setDone] = useState(false);
    const [search, setSearch] = useState("");
    const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (accountsCache !== null) { setAccounts(accountsCache); setLoaded(true); return; }
        let cancelled = false;
        getAccounts().then(v => { if (!cancelled) { setAccounts(v); setLoaded(true); } });
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return accounts;
        const q = search.toLowerCase();
        return accounts.filter(a => a.username.toLowerCase().includes(q) || a.id.includes(q));
    }, [accounts, search]);

    async function removeAccount(id: string) {
        const updated = accounts.filter(a => a.id !== id);
        setAccounts(updated);
        await saveAccounts(updated);
    }

    async function processTokens(raw: string) {
        const tokens = extractTokens(raw);
        if (!tokens.length) { setResults([{ token: "No valid tokens found", status: "invalid" }]); return; }
        const initial: TokenResult[] = tokens.map(t => ({ token: t, status: "pending" as const }));
        setResults(initial); setChecking(true); setDone(false);
        const updated = [...initial];
        const existing = await getAccounts();
        for (let i = 0; i < tokens.length; i++) {
            updated[i] = { ...updated[i], status: "checking" };
            setResults([...updated]);
            try {
                const result = await Native.checkToken(tokens[i]);
                if (result.valid && result.user) {
                    const u = result.user;
                    const av = u.avatar
                        ? (IconUtils?.getUserAvatarURL({ id: u.id, avatar: u.avatar } as any, false, 64) ?? "")
                        : (IconUtils?.getDefaultAvatarURL?.(u.id) ?? "");
                    if (!existing.find(a => a.id === u.id)) {
                        existing.push({ id: u.id, token: tokens[i], username: u.global_name || u.username, discriminator: u.discriminator ?? "0", avatar: av });
                        await saveAccounts(existing);
                        setAccounts([...existing]);
                    }
                    updated[i] = { ...updated[i], status: "valid", username: u.global_name || u.username, id: u.id, avatar: av };
                } else {
                    updated[i] = { ...updated[i], status: (result as any).error === "rate_limited" ? "rate_limited" : "invalid" };
                }
            } catch { updated[i] = { ...updated[i], status: "error" }; }
            setResults([...updated]);
            await new Promise(r => setTimeout(r, 200));
        }
        setChecking(false); setDone(true);
    }

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <FolderIcon width={16} height={16} /> Token Importer
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="ti-content">
                <div className="ti-tabs">
                    <button className={`ti-tab ${tab === "saved" ? "ti-tab--active" : ""}`} onClick={() => setTab("saved")}>
                        Saved accounts {accounts.length > 0 && <span className="ti-tab-count">{accounts.length}</span>}
                    </button>
                    <button className={`ti-tab ${tab === "add" ? "ti-tab--active" : ""}`} onClick={() => setTab("add")}>
                        Add token
                    </button>
                </div>

                {tab === "saved" && (
                    <>
                        <div className="ti-bar">
                            <input className="ti-search-input" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        {!loaded
                            ? <div className="ti-empty">Loading...</div>
                            : accounts.length === 0
                                ? <div className="ti-empty">No accounts saved. Use the "Add token" tab.</div>
                                : filtered.length === 0
                                    ? <div className="ti-empty">No accounts match your search.</div>
                                    : <div className="ti-list">
                                        {filtered.map(a => (
                                            <div key={a.id} className="ti-row ti-row--idle">
                                                {a.avatar
                                                    ? <img src={a.avatar} className="ti-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                                    : <div className="ti-avatar ti-avatar--ph">{a.username?.[0]?.toUpperCase() ?? "?"}</div>
                                                }
                                                <div className="ti-row-info">
                                                    <span className="ti-username">{a.username}{a.discriminator && a.discriminator !== "0" ? `#${a.discriminator}` : ""}</span>
                                                    <span className="ti-token-hidden" title="Stored encrypted locally">••••••••••••••••••••••••</span>
                                                </div>
                                                <div className="ti-row-actions">
                                                    <button className="ti-switch-btn" onClick={() => switchToAccount(a.token)}>Switch</button>
                                                    <button className="ti-del-btn" title="Remove account" onClick={() => removeAccount(a.id)}><TrashIcon /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                        }
                    </>
                )}

                {tab === "add" && (
                    <div className="ti-add-body">
                        <p className="ti-hint">Paste your token below. It will be validated against Discord's API and stored encrypted locally. Nothing is sent to external servers.</p>
                        <textarea
                            className="ti-textarea"
                            placeholder="Paste Discord token(s) here — one per line or all together"
                            value={pasteValue}
                            onChange={e => {
                                const val = e.target.value;
                                setPaste(val);
                                if (detectTimer.current) clearTimeout(detectTimer.current);
                                detectTimer.current = setTimeout(() => setDetectedCount(extractTokens(val).length), 150);
                            }}
                            autoFocus
                        />
                        <div className="ti-add-footer">
                            <span className="ti-detected">{detectedCount} token{detectedCount !== 1 ? "s" : ""} detected</span>
                            <button className="ti-submit-btn" disabled={checking || detectedCount === 0} onClick={() => processTokens(pasteValue)}>
                                {checking ? "Checking..." : "Verify & Add"}
                            </button>
                        </div>
                        {results.length > 0 && (
                            <div className="ti-results">
                                {done && (() => {
                                    const ok = results.filter(r => r.status === "valid").length;
                                    const bad = results.filter(r => r.status !== "valid").length;
                                    return <div className="ti-results-summary">
                                        <div className="ti-summary-pill ti-summary-pill--ok"><CheckIcon /><span>{ok} valid</span></div>
                                        <div className="ti-summary-pill ti-summary-pill--bad"><CrossIcon /><span>{bad} invalid</span></div>
                                    </div>;
                                })()}
                                <div className="ti-list">
                                    {results.map((r, i) => (
                                        <div key={i} className={`ti-row ti-row--${r.status === "valid" ? "valid" : r.status === "checking" ? "idle" : "invalid"}`}>
                                            {r.status === "valid" && r.avatar ? <img src={r.avatar} className="ti-avatar" alt="" /> : <div className="ti-avatar ti-avatar--ph">{r.status === "checking" ? "…" : "?"}</div>}
                                            <div className="ti-row-info">
                                                {r.status === "valid" ? <span className="ti-username">{r.username}</span> : <span className="ti-token-hidden">••••••••••••••••••••••••</span>}
                                            </div>
                                            <span className={`ti-badge ti-badge--${r.status === "valid" ? "valid" : r.status === "checking" ? "idle" : "invalid"}`}>
                                                {r.status === "valid" ? <CheckIcon /> : r.status === "checking" ? "…" : <CrossIcon />}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

// ── Plugin ─────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "TokenImporter",
    description: "Manually add and switch between Discord accounts. Tokens are stored encrypted locally.",
    authors: [{ name: "Lovecord", id: 0n }],
    dependencies: ["HeaderBarAPI"],

    start() {
        addHeaderBarButton("lovecord-token-importer", () => (
            <HeaderBarButton
                icon={FolderIcon}
                tooltip="Token Importer"
                onClick={() => openModal(props => <TokenModal rootProps={props} />)}
            />
        ), 10);
    },

    stop() {
        removeHeaderBarButton("lovecord-token-importer");
        accountsCache = null;
    },
});
