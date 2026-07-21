/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * wordBomb — Word-game suggestion helper
 * Shows word suggestions based on a required letter sequence.
 * NO mouse automation, NO input injection — the user types manually.
 * Uses a built-in word list — zero network requests.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React, useEffect, useState } from "@webpack/common";

// ── Compact built-in word corpus (common English words ≤ 12 chars) ────────────
// This is a small seed list. For production, import a larger dictionary bundle.
const WORD_LIST: string[] = [
    "apple","application","apply","approach","appropriate","aptitude","arbitrary","archive",
    "article","aspect","assert","assign","attempt","attend","author","average","avoid",
    "backbone","balance","bearing","become","before","behind","belong","beneath","beside",
    "between","beyond","binary","branch","bridge","broken","burden","button","cancel",
    "canvas","capture","castle","center","change","chapter","charge","choice","circle",
    "clarity","classic","clean","clever","client","clone","close","cloud","cluster",
    "collect","column","combat","combine","command","common","compile","compute","concern",
    "concrete","connect","control","convert","create","credit","custom","damage","danger",
    "debug","declare","default","define","delete","depend","deploy","design","detect",
    "device","divide","domain","double","download","driven","dynamic","easily","editor",
    "effect","element","empty","enable","engine","enhance","entire","entry","equal",
    "error","escape","event","every","expand","export","extend","factor","failed","faster",
    "feature","field","filter","finish","follow","format","forward","frame","frozen",
    "gather","generate","global","handle","handle","header","hidden","higher","include",
    "inject","inner","insert","install","instance","invoke","kernel","launch","layout",
    "leader","likely","limit","listen","locate","manage","method","mirror","module",
    "monitor","motion","native","object","obtain","option","output","panel","parent",
    "parse","patch","permit","player","policy","portal","prefix","project","prompt",
    "proxy","public","query","queue","quick","rather","really","record","reduce","reflect",
    "remove","render","repeat","replace","replay","report","request","resolve","restore",
    "result","return","reverse","review","rotate","router","schema","screen","search",
    "select","server","session","signal","simple","single","source","stable","status",
    "stream","string","struct","system","target","thread","timing","toggle","token",
    "trace","transfer","trigger","tunnel","unique","update","upload","vector","verify",
    "window","worker","wrapper","client","access","action","active","anchor","append",
    "basis","batch","build","cache","chain","close","commit","content","context","create",
    "cursor","cycle","data","defer","digest","drain","draw","driver","emit","event",
    "execute","expire","file","final","first","fixed","flush","focus","force","free",
    "gateway","grant","guard","group","hash","heap","host","index","input","iterate",
    "label","layer","link","lock","loop","mark","match","message","model","name",
    "network","node","open","page","path","pipe","plan","pool","port","print",
    "process","range","read","ready","release","request","reset","resolve","route","run",
    "safe","save","scope","send","service","set","share","shell","size","skip",
    "slice","snapshot","socket","sort","span","split","stack","start","state","step",
    "stop","store","stub","sync","task","test","time","timeout","tree","type",
    "unit","use","value","view","wait","warn","write","yield",
];

// ── Settings ──────────────────────────────────────────────────────────────────
const settings = definePluginSettings({
    maxSuggestions: {
        type: OptionType.NUMBER,
        description: "Maximum word suggestions to show",
        default: 20,
    },
    minLength: {
        type: OptionType.NUMBER,
        description: "Minimum word length to show",
        default: 3,
    },
});

// ── Core word-matching logic ──────────────────────────────────────────────────
function findWords(query: string, minLen: number, max: number): string[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    // Strategy: word must CONTAIN the query as a substring
    const contains = WORD_LIST.filter(w => w.length >= minLen && w.includes(q));

    // Sort: shorter words first, then alphabetically (easier to type fast)
    contains.sort((a, b) => a.length - b.length || a.localeCompare(b));

    return contains.slice(0, max);
}

// ── Overlay Component ─────────────────────────────────────────────────────────
let overlayVisible = false;
const overlaySubs = new Set<() => void>();
const emitOverlay = () => overlaySubs.forEach(f => f());

function WordBombOverlay() {
    const [visible, setVisible] = useState(overlayVisible);
    const [query, setQuery]     = useState("");
    const [copied, setCopied]   = useState<string | null>(null);
    const maxSug = settings.store.maxSuggestions;
    const minLen = settings.store.minLength;
    const words  = findWords(query, minLen, maxSug);

    useEffect(() => {
        const fn = () => setVisible(overlayVisible);
        overlaySubs.add(fn);
        return () => { overlaySubs.delete(fn); };
    }, []);

    if (!visible) return null;

    function copyWord(w: string) {
        navigator.clipboard.writeText(w).catch(() => { });
        setCopied(w);
        setTimeout(() => setCopied(null), 1200);
    }

    return (
        <div style={{
            position: "fixed", top: 80, right: 20, zIndex: 9999,
            background: "var(--background-floating)", border: "1px solid var(--background-modifier-accent)",
            borderRadius: 8, padding: 12, width: 260,
            boxShadow: "0 8px 32px rgba(0,0,0,.5)", fontFamily: "var(--font-primary)",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--header-primary)" }}>💣 Word Bomb Helper</span>
                <button onClick={() => { overlayVisible = false; emitOverlay(); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--interactive-normal)", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
            <input
                autoFocus
                placeholder="Enter required letters..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{
                    width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)",
                    borderRadius: 4, color: "var(--text-normal)", padding: "6px 10px", fontSize: 13, outline: "none", boxSizing: "border-box",
                }}
            />
            <div style={{ marginTop: 8, maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {query && words.length === 0 && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>No words found.</span>
                )}
                {words.map(w => {
                    const idx = w.indexOf(query.toLowerCase());
                    const before = w.slice(0, idx);
                    const match  = w.slice(idx, idx + query.length);
                    const after  = w.slice(idx + query.length);
                    return (
                        <button key={w} onClick={() => copyWord(w)}
                            title="Click to copy to clipboard"
                            style={{
                                background: copied === w ? "rgba(87,242,135,.15)" : "var(--background-secondary)",
                                border: "1px solid " + (copied === w ? "rgba(87,242,135,.4)" : "transparent"),
                                borderRadius: 4, padding: "4px 8px", cursor: "pointer",
                                color: "var(--text-normal)", fontSize: 13, textAlign: "left",
                                fontFamily: "inherit", transition: "all .15s",
                            }}>
                            {before}<strong style={{ color: "var(--brand-500)" }}>{match}</strong>{after}
                            {copied === w && <span style={{ float: "right", color: "var(--text-positive)", fontSize: 11 }}>copied!</span>}
                        </button>
                    );
                })}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, marginBottom: 0, lineHeight: 1.3 }}>
                Click a word to copy it. Then type it manually in the game.
            </p>
        </div>
    );
}

// ── Plugin ────────────────────────────────────────────────────────────────────
let container: HTMLDivElement | null = null;
let reactRoot: any = null;

function mountOverlay() {
    const { ReactDOM } = (window as any).__LOVECORD_MODS__ ?? {};
    const RD = (window as any).ReactDOM ?? ReactDOM;
    if (!RD || container) return;
    container = document.createElement("div");
    container.id = "lc-wordbomb-overlay";
    document.body.appendChild(container);
    if (RD.createRoot) { reactRoot = RD.createRoot(container); reactRoot.render(<WordBombOverlay />); }
    else if (RD.render) { RD.render(<WordBombOverlay />, container); }
}

function unmountOverlay() {
    try { reactRoot?.unmount(); } catch { }
    container?.remove();
    container = null; reactRoot = null;
}

export default definePlugin({
    name: "WordBomb",
    description: "Word-game suggestion helper. Type required letters → get suggestions to type manually. No input automation.",
    authors: [{ name: "Lovecord", id: 0n }],
    settings,

    start() {
        // Mount overlay once DOM is ready
        if (document.readyState === "complete") setTimeout(mountOverlay, 1000);
        else window.addEventListener("load", () => setTimeout(mountOverlay, 1000), { once: true });

        // Register keyboard shortcut: Ctrl+Shift+W
        this._keyHandler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.code === "KeyW") {
                e.preventDefault();
                overlayVisible = !overlayVisible;
                emitOverlay();
            }
        };
        document.addEventListener("keydown", this._keyHandler);
    },

    stop() {
        document.removeEventListener("keydown", this._keyHandler);
        unmountOverlay();
        overlayVisible = false;
    },

    _keyHandler: null as any,
});
