/*
 * Lovecord - Local Security Sandbox
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DANGEROUS_EXTENSIONS, TRUSTED_HOST_SUFFIXES } from "./patterns";
import type { AttachmentSnippet, UrlSnippet } from "./types";

const SENSITIVE_QUERY_KEYS = new Set([
    "token", "auth", "key", "api_key", "apikey", "password", "pass", "secret", "session",
]);

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function truncateForDisplay(value: string, max = 120): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

export function extractExtension(pathname: string): string {
    const base = pathname.split("/").pop() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) return "";
    return base.slice(dot).toLowerCase();
}

export function parseUrlSafely(raw: string): URL | null {
    try {
        const url = new URL(raw);
        if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:" && url.protocol !== "data:") {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

export function isTrustedHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return TRUSTED_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}

export function isDangerousExtension(extension: string): boolean {
    if (!extension) return false;
    return DANGEROUS_EXTENSIONS.includes(extension.toLowerCase() as typeof DANGEROUS_EXTENSIONS[number]);
}

export function buildUrlSnippet(raw: string): UrlSnippet | null {
    const parsed = parseUrlSafely(raw);
    if (!parsed) {
        return {
            protocol: "unknown",
            hostname: "invalid-url",
            port: "",
            pathname: truncateForDisplay(raw, 200),
            extension: extractExtension(raw),
            queryKeys: [],
            isIpAddress: false,
            isPunycode: false,
            length: raw.length,
        };
    }

    const hostname = parsed.hostname.toLowerCase();
    const queryKeys = [...parsed.searchParams.keys()]
        .map(key => (SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) ? `${key} (redacted)` : key))
        .slice(0, 12);

    return {
        protocol: parsed.protocol.replace(":", ""),
        hostname,
        port: parsed.port,
        pathname: truncateForDisplay(parsed.pathname, 200),
        extension: extractExtension(parsed.pathname),
        queryKeys,
        isIpAddress: IPV4_PATTERN.test(hostname),
        isPunycode: hostname.startsWith("xn--"),
        length: raw.length,
    };
}

export function buildAttachmentSnippet(
    raw: string,
    meta?: { filename?: string; contentType?: string; size?: number; }
): AttachmentSnippet {
    const parsed = parseUrlSafely(raw);
    const pathname = parsed?.pathname ?? raw;
    const filename = meta?.filename ?? pathname.split("/").pop() ?? "unknown";
    const extension = extractExtension(filename || pathname);

    let sizeLabel: string | null = null;
    if (typeof meta?.size === "number" && Number.isFinite(meta.size)) {
        if (meta.size >= 1_048_576) sizeLabel = `${(meta.size / 1_048_576).toFixed(2)} MB`;
        else if (meta.size >= 1024) sizeLabel = `${(meta.size / 1024).toFixed(1)} KB`;
        else sizeLabel = `${meta.size} B`;
    }

    return {
        filename: truncateForDisplay(filename, 80),
        extension,
        contentType: meta?.contentType ?? null,
        sizeLabel,
        sourceHost: parsed?.hostname ?? null,
    };
}

export function isDiscordCdnUrl(raw: string): boolean {
    const parsed = parseUrlSafely(raw);
    if (!parsed) return false;
    return /(?:^|\.)discord(?:app)?\.(?:com|net)$/.test(parsed.hostname)
        && parsed.pathname.includes("/attachments/");
}
