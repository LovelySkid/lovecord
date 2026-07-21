/*
 * Lovecord - Local Security Sandbox
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    interceptLinks: {
        type: OptionType.BOOLEAN,
        description: "Intercept external link clicks and show the security modal.",
        default: true,
    },
    interceptAttachments: {
        type: OptionType.BOOLEAN,
        description: "Intercept attachment download/open actions for dangerous file types.",
        default: true,
    },
    confirmAllExternalLinks: {
        type: OptionType.BOOLEAN,
        description: "Show the modal for every external link, not only suspicious ones.",
        default: true,
    },
    allowTrustedDiscordHosts: {
        type: OptionType.BOOLEAN,
        description: "Skip interception for trusted Discord-owned domains.",
        default: true,
    },
    blockCriticalThreats: {
        type: OptionType.BOOLEAN,
        description: "Disable Proceed Anyway when critical threats are detected.",
        default: false,
    },
    enableExternalScanApi: {
        type: OptionType.BOOLEAN,
        description: "Enable future external scan API integration (VirusTotal / URLScan). Currently local-only.",
        default: false,
    },
    externalScanProvider: {
        type: OptionType.SELECT,
        description: "External scan provider to use when integration is enabled.",
        options: [
            { label: "None", value: "none", default: true },
            { label: "VirusTotal (future)", value: "virustotal" },
            { label: "URLScan.io (future)", value: "urlscan" },
        ],
    },
    externalScanApiKey: {
        type: OptionType.STRING,
        description: "API key for the selected external scanner. Stored locally; never sent unless integration is enabled.",
        default: "",
        placeholder: "Paste API key here",
    },
});
