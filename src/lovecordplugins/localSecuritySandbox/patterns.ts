/*
 * Lovecord - Local Security Sandbox
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ThreatMatch } from "./types";

/** Local-only regex rules. No network calls, no dynamic code execution. */
export interface ThreatPattern {
    id: string;
    label: string;
    severity: ThreatMatch["severity"];
    /** Applied to the full URL string (lowercased). */
    url?: RegExp;
    /** Applied to hostname only (lowercased). */
    hostname?: RegExp;
    /** Applied to pathname only (lowercased). */
    pathname?: RegExp;
    /** Applied to file extension including the dot, e.g. ".exe". */
    extension?: RegExp;
    detail: string;
}

export const TRUSTED_HOST_SUFFIXES = [
    "discord.com",
    "discordapp.com",
    "discordapp.net",
    "discord.gg",
    "discord.media",
    "discord.co",
    "discord.design",
    "discord.dev",
    "discord.new",
    "discord.gift",
    "discordstatus.com",
    "discord-activities.com",
    "discordactivities.com",
    "lovecord.gg",
    "source.lovecord.gg",
] as const;

export const DANGEROUS_EXTENSIONS = [
    ".exe", ".scr", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".js", ".jse",
    ".wsf", ".wsh", ".msi", ".msp", ".com", ".pif", ".hta", ".dll", ".lnk",
    ".jar", ".reg", ".inf", ".cpl", ".iso", ".img", ".vhd", ".vhdx",
] as const;

const extensionPattern = new RegExp(
    `(?:${DANGEROUS_EXTENSIONS.map(ext => ext.replace(".", "\\.")).join("|")})$`,
    "i"
);

export const THREAT_PATTERNS: ThreatPattern[] = [
    {
        id: "typosquat-discord",
        label: "Discord typosquat",
        severity: "critical",
        hostname: /(?:^|\.)disc[0o]rd(?:app|gift|nitro|support|login|verify|security|team|staff|help)?\./,
        detail: "Hostname mimics Discord branding with character substitution.",
    },
    {
        id: "typosquat-steam",
        label: "Steam typosquat",
        severity: "high",
        hostname: /(?:^|\.)ste[a4]m(?:community|powered|login|guard|support)?\./,
        detail: "Hostname mimics Steam with character substitution.",
    },
    {
        id: "credential-harvest",
        label: "Credential harvest keyword",
        severity: "high",
        url: /(?:password|passwd|login|signin|verify|validation|secure-?update|account-?recovery|2fa|mfa|token|auth)/,
        detail: "URL contains common credential-harvesting keywords.",
    },
    {
        id: "stealer-keyword",
        label: "Stealer / grabber keyword",
        severity: "critical",
        url: /(?:stealer|grabber|logger|keylog|ratware|infostealer|tokenlog|discord-?token)/,
        detail: "URL references malware families commonly used to steal accounts.",
    },
    {
        id: "ip-literal",
        label: "Raw IP address host",
        severity: "medium",
        hostname: /^(?:\d{1,3}\.){3}\d{1,3}$/,
        detail: "Link points to a numeric IP instead of a named domain.",
    },
    {
        id: "excessive-subdomains",
        label: "Excessive subdomains",
        severity: "low",
        hostname: /(?:[^.]+\.){4,}/,
        detail: "Unusually deep subdomain chain, sometimes used to hide the real destination.",
    },
    {
        id: "data-uri",
        label: "Data URI scheme",
        severity: "high",
        url: /^data:/,
        detail: "Data URIs can embed executable payloads inline.",
    },
    {
        id: "file-uri",
        label: "Local file URI",
        severity: "critical",
        url: /^file:/,
        detail: "File URIs can reference local filesystem paths.",
    },
    {
        id: "dangerous-extension",
        label: "Dangerous file extension",
        severity: "critical",
        extension: extensionPattern,
        detail: "File extension is commonly associated with malware or script execution.",
    },
    {
        id: "double-extension",
        label: "Double extension trick",
        severity: "high",
        pathname: /\.(?:pdf|doc|docx|txt|png|jpg|jpeg|gif|zip|rar|mp4|mp3)\.(?:exe|scr|bat|cmd|ps1|js|vbs|msi|com)$/i,
        detail: "Filename uses a benign extension followed by an executable extension.",
    },
    {
        id: "punycode-domain",
        label: "Internationalized (punycode) domain",
        severity: "medium",
        hostname: /^xn--/,
        detail: "Punycode domains can visually impersonate trusted brands.",
    },
    {
        id: "url-shortener",
        label: "URL shortener",
        severity: "low",
        hostname: /(?:^|\.)(?:bit\.ly|t\.co|tinyurl\.com|goo\.gl|is\.gd|ow\.ly|rb\.gy|cutt\.ly|shorturl\.at)$/,
        detail: "Short links hide the final destination until opened.",
    },
];
