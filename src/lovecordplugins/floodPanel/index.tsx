/*
 * Lovecord - A custom client modification fork built upon Equicord
 * Based on Equicord/Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FloodPanel — Scheduled / rapid channel message sender
 * Sends a configurable message with a configurable delay.
 * Accessible via right-click on any text channel.
 * Only uses Discord's own REST API — zero external connections.
 */

import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, React, RestAPI, useEffect, useState } from "@webpack/common";

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const MIN_DELAY_MS = 500; // Never allow below 500 ms to reduce ban risk

interface FPState { running: boolean; aborted: boolean; sent: number; log: string[]; }
let g: FPState = { running: false, aborted: false, sent: 0, log: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

async function runFlood(channelId: string, messages: string[], count: number, delayMs: number) {
    if (g.running) return;
    g = { running: true, aborted: false, sent: 0, log: [] };
    emit();

    const safeDelay = Math.max(MIN_DELAY_MS, delayMs);

    for (let i = 0; i < count; i++) {
        if (g.aborted) { g.log.push("⛔ Stopped."); emit(); break; }
        const content = messages[i % messages.length];
        try {
            await RestAPI.post({ url: `/channels/${channelId}/messages`, body: { content, tts: false } });
            g.sent++;
            g.log.push(`✅ [${g.sent}/${count}] ${content.slice(0, 40)}`);
        } catch (e: any) {
            if (e?.status === 429) { g.log.push(`⏳ Rate limited — waiting 5 s`); await sleep(5000); }
            else g.log.push(`❌ Error: ${e?.message ?? e?.status ?? "unknown"}`);
        }
        emit();
        if (!g.aborted) await sleep(safeDelay);
    }

    g.running = false;
    emit();
}

function FloodModal({ rootProps, channelId }: { rootProps: any; channelId: string }) {
    const [, tick] = useState(0);
    useEffect(() => { const fn = () => tick(n => n + 1); subs.add(fn); return () => { subs.delete(fn); }; }, []);

    const channel  = ChannelStore.getChannel(channelId);
    const [msgRaw, setMsgRaw] = useState("");
    const [count, setCount]   = useState(5);
    const [delay, setDelay]   = useState(1.0);

    const idle     = !g.running && g.sent === 0;
    const finished = !g.running && g.sent > 0;
    const pct      = count > 0 ? Math.round((g.sent / count) * 100) : 0;

    // Parse individual messages (one per line)
    const messages = msgRaw.split("\n").map(s => s.trim()).filter(Boolean);

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>⚡ Flood Panel — #{channel?.name ?? channelId}</span>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {idle && <>
                    <div style={{ background: "rgba(250,166,26,.12)", border: "1px solid rgba(250,166,26,.3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                        ⚠️ Minimum delay is {MIN_DELAY_MS} ms. Sending too fast can get your account flagged.
                    </div>
                    <div>
                        <p style={{ fontWeight: 600, marginBottom: 6 }}>Messages <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)" }}>(one per line — cycles if count &gt; lines)</span></p>
                        <textarea rows={5} value={msgRaw} onChange={e => setMsgRaw(e.target.value)}
                            placeholder="Message 1&#10;Message 2&#10;..."
                            style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: 8, resize: "vertical", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }} />
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Total sends</p>
                            <input type="number" min={1} max={500} value={count}
                                onChange={e => setCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                                style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "6px 10px" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Delay (seconds)</p>
                            <input type="number" min={0.5} max={60} step={0.1} value={delay}
                                onChange={e => setDelay(Math.max(0.5, parseFloat(e.target.value) || 1))}
                                style={{ width: "100%", background: "var(--input-background)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "var(--text-normal)", padding: "6px 10px" }} />
                        </div>
                    </div>
                </>}
                {(g.running || finished) && <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{g.sent}/{count} sent</span><span>{pct}%</span>
                    </div>
                    <div style={{ background: "var(--background-secondary)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{ background: "var(--brand-500)", height: "100%", width: `${pct}%`, transition: "width .3s" }} />
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto", background: "var(--background-secondary)", borderRadius: 4, padding: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                        {g.log.map((l, i) => <span key={i}>{l}</span>)}
                    </div>
                </>}
            </ModalContent>
            <ModalFooter style={{ gap: 8 }}>
                {idle && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Cancel</button>
                    <button disabled={messages.length === 0}
                        onClick={() => runFlood(channelId, messages, count, Math.round(delay * 1000))}
                        style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, opacity: messages.length === 0 ? 0.5 : 1 }}>
                        ⚡ Start
                    </button>
                </>}
                {g.running && <>
                    <button onClick={rootProps.onClose} style={{ background: "var(--button-secondary-background)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "var(--text-normal)" }}>Background</button>
                    <button onClick={() => { g.aborted = true; }} style={{ background: "var(--status-danger)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff", fontWeight: 600 }}>⛔ Stop</button>
                </>}
                {finished && <button onClick={() => { g = { running: false, aborted: false, sent: 0, log: [] }; emit(); }} style={{ background: "var(--brand-500)", border: "none", borderRadius: 3, padding: "8px 16px", cursor: "pointer", color: "#fff" }}>Reset</button>}
            </ModalFooter>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "FloodPanel",
    description: "Send one or more messages to a channel repeatedly with configurable delay. Right-click a channel to open.",
    authors: [{ name: "Lovecord", id: 0n }],

    start() { addContextMenuPatch("channel-context", this.ctxPatch); },
    stop()  { removeContextMenuPatch("channel-context", this.ctxPatch); if (g.running) g.aborted = true; },

    ctxPatch(children: any[], { channel }: { channel?: any }) {
        if (!channel || channel.type === 4) return;
        children.push(
            <Menu.MenuItem id="lc-floodpanel" label="Flood Panel"
                action={() => openModal(p => <FloodModal rootProps={p} channelId={channel.id} />)} />
        );
    },
});
