/*
 * Lovecord - Local Security Sandbox
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ResourceKind = "link" | "attachment";

export type ThreatSeverity = "none" | "low" | "medium" | "high" | "critical";

export type UserDecision = "cancel" | "proceed" | "analyze";

export interface ThreatMatch {
    id: string;
    label: string;
    severity: ThreatSeverity;
    detail: string;
}

export interface ThreatReport {
    severity: ThreatSeverity;
    matches: ThreatMatch[];
    summary: string;
}

export interface UrlSnippet {
    protocol: string;
    hostname: string;
    port: string;
    pathname: string;
    extension: string;
    queryKeys: string[];
    isIpAddress: boolean;
    isPunycode: boolean;
    length: number;
}

export interface AttachmentSnippet {
    filename: string;
    extension: string;
    contentType: string | null;
    sizeLabel: string | null;
    sourceHost: string | null;
}

export interface SecurityContext {
    kind: ResourceKind;
    rawTarget: string;
    displayLabel: string;
    report: ThreatReport;
    urlSnippet?: UrlSnippet;
    attachmentSnippet?: AttachmentSnippet;
}

export interface InterceptResult {
    intercepted: boolean;
    decision?: UserDecision;
}
