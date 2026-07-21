/*
 * Lovecord - Local Security Sandbox
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { THREAT_PATTERNS } from "./patterns";
import type { AttachmentSnippet, ThreatMatch, ThreatReport, ThreatSeverity, UrlSnippet } from "./types";
import {
    buildAttachmentSnippet,
    buildUrlSnippet,
    extractExtension,
    isDangerousExtension,
    parseUrlSafely,
} from "./urlUtils";

const SEVERITY_RANK: Record<ThreatSeverity, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
};

function maxSeverity(current: ThreatSeverity, next: ThreatSeverity): ThreatSeverity {
    return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current;
}

function summarize(matches: ThreatMatch[]): string {
    if (matches.length === 0) return "No local heuristic matches. The destination may still be unsafe.";
    if (matches.some(match => match.severity === "critical")) {
        return "Critical indicators detected. Strongly recommended to stay on Discord.";
    }
    if (matches.some(match => match.severity === "high")) {
        return "High-risk indicators detected. Proceed only if you fully trust the sender.";
    }
    if (matches.some(match => match.severity === "medium")) {
        return "Some suspicious traits were found. Review the analysis before proceeding.";
    }
    return "Minor caution flags detected.";
}

export interface ExternalScanConfig {
    enabled: boolean;
    provider: "virustotal" | "urlscan" | "none";
    apiKey: string;
}

export interface ExternalScanResult {
    provider: string;
    status: "disabled" | "not_implemented" | "skipped";
    message: string;
}

/**
 * Regex-based local threat scanner. Designed for offline, zero-leak analysis.
 */
export class ThreatScanner {
    scanUrl(rawUrl: string): ThreatReport {
        const normalized = rawUrl.trim();
        const parsed = parseUrlSafely(normalized);
        const hostname = parsed?.hostname.toLowerCase() ?? "";
        const pathname = parsed?.pathname.toLowerCase() ?? normalized.toLowerCase();
        const extension = extractExtension(pathname);

        const matches: ThreatMatch[] = [];

        for (const pattern of THREAT_PATTERNS) {
            let hit = false;

            if (pattern.url && pattern.url.test(normalized.toLowerCase())) hit = true;
            if (!hit && pattern.hostname && hostname && pattern.hostname.test(hostname)) hit = true;
            if (!hit && pattern.pathname && pattern.pathname.test(pathname)) hit = true;
            if (!hit && pattern.extension && pattern.extension.test(extension)) hit = true;

            if (hit) {
                matches.push({
                    id: pattern.id,
                    label: pattern.label,
                    severity: pattern.severity,
                    detail: pattern.detail,
                });
            }
        }

        let severity: ThreatSeverity = "none";
        for (const match of matches) severity = maxSeverity(severity, match.severity);

        return { severity, matches, summary: summarize(matches) };
    }

    scanAttachment(rawUrl: string, meta?: { filename?: string; contentType?: string; size?: number; }): ThreatReport {
        const snippet = buildAttachmentSnippet(rawUrl, meta);
        const urlReport = this.scanUrl(rawUrl);
        const matches = [...urlReport.matches];

        if (isDangerousExtension(snippet.extension)) {
            matches.push({
                id: "attachment-dangerous-extension",
                label: "Executable attachment",
                severity: "critical",
                detail: `Attachment uses a high-risk extension (${snippet.extension}).`,
            });
        }

        if (snippet.contentType && /script|executable|octet-stream|x-msdownload/i.test(snippet.contentType)) {
            matches.push({
                id: "attachment-content-type",
                label: "Risky content type",
                severity: "high",
                detail: `MIME type "${snippet.contentType}" is commonly used for executables.`,
            });
        }

        let severity: ThreatSeverity = urlReport.severity;
        for (const match of matches) severity = maxSeverity(severity, match.severity);

        return { severity, matches, summary: summarize(matches) };
    }

    analyzeUrlSnippet(rawUrl: string): UrlSnippet | null {
        return buildUrlSnippet(rawUrl);
    }

    analyzeAttachmentSnippet(
        rawUrl: string,
        meta?: { filename?: string; contentType?: string; size?: number; }
    ): AttachmentSnippet {
        return buildAttachmentSnippet(rawUrl, meta);
    }

    /**
     * Placeholder for future VirusTotal / URLScan integration.
     * Intentionally does not perform network I/O until explicitly wired up.
     */
    async scanWithExternalApi(_rawUrl: string, config: ExternalScanConfig): Promise<ExternalScanResult> {
        if (!config.enabled || config.provider === "none") {
            return {
                provider: config.provider,
                status: "disabled",
                message: "External scan API is disabled. Only local heuristics were used.",
            };
        }

        if (!config.apiKey.trim()) {
            return {
                provider: config.provider,
                status: "skipped",
                message: "External scan is enabled but no API key is configured.",
            };
        }

        return {
            provider: config.provider,
            status: "not_implemented",
            message: `${config.provider} integration hook is reserved for a future release. No data was transmitted.`,
        };
    }
}

export const threatScanner = new ThreatScanner();
