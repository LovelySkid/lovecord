/*
 * Lovecord — A custom client modification fork built upon Equicord
 * Based on Vencord by Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */


export const enum IpcEvents {
    INIT_FILE_WATCHERS = "VencordInitFileWatchers",
    QUICK_CSS_UPDATE = "VencordQuickCssUpdate",
    OPEN_QUICKCSS = "VencordOpenQuickCss",
    GET_QUICK_CSS = "VencordGetQuickCss",
    SET_QUICK_CSS = "VencordSetQuickCss",
    UPLOAD_THEME = "VencordUploadTheme",
    DELETE_THEME = "VencordDeleteTheme",
    GET_THEMES_DIR = "VencordGetThemesDir",
    GET_THEMES_LIST = "VencordGetThemesList",
    GET_THEME_DATA = "VencordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "VencordGetThemeSystemValues",
    GET_SETTINGS_DIR = "VencordGetSettingsDir",
    GET_SETTINGS = "VencordGetSettings",
    SET_SETTINGS = "VencordSetSettings",
    THEME_UPDATE = "VencordThemeUpdate",
    OPEN_EXTERNAL = "VencordOpenExternal",
    GET_UPDATES = "VencordGetUpdates",
    GET_REPO = "VencordGetRepo",
    UPDATE = "VencordUpdate",
    BUILD = "VencordBuild",
    OPEN_MONACO_EDITOR = "VencordOpenMonacoEditor",
    GET_MONACO_THEME = "VencordGetMonacoTheme",
    GET_INSTALLER_PREFS = "LovecordGetInstallerPrefs",

    GET_PLUGIN_IPC_METHOD_MAP = "VencordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "VencordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "VencordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "VencordCspRequestAddOverride",

    OPEN_THEMES_FOLDER = "VencordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "VencordOpenSettingsFolder",
    GET_RENDERER_CSS = "VencordGetRendererCss",
    RENDERER_CSS_UPDATE = "VencordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "VencordPreloadGetRendererJs",

    SET_TRAY_UPDATE_STATE = "VencordSetTrayUpdateState",
    TRAY_REPAIR = "VencordTrayRepair",
    TRAY_CHECK_UPDATES = "VencordTrayCheckUpdates",
    TRAY_ABOUT = "VencordTrayAbout",

    GET_DESKTOP_SOURCES = "VencordGetDesktopSources",

    // Lovecord: window background material control
    SET_WINDOW_BACKGROUND_MATERIAL = "LovecordSetWindowBackgroundMaterial",

    // SoundCord Player — thumbnail toolbar integration (Windows)
    SET_THUMBAR_BUTTONS = "SoundCordSetThumbarButtons",
    THUMBAR_BUTTON_CLICK = "SoundCordThumbarButtonClick",

    // Lovecord Updater — download and launch the installer exe
    LOVECORD_DOWNLOAD_AND_RUN = "LovecordDownloadAndRun",

    // VB-Audio Virtual Cable (Windows only)
    CHECK_VB_CABLE = "LovecordCheckVBCable",
    INSTALL_VB_CABLE = "LovecordInstallVBCable",

    // Relaunch the Electron application
    RELAUNCH_APP = "LovecordRelaunchApp",

    // Mellowtel bandwidth-sharing SDK consent (opt-in onboarding)
    MELLOWTEL_SET_CONSENT = "LovecordMellowtelSetConsent",
    MELLOWTEL_GET_CONSENT = "LovecordMellowtelGetConsent",

    // Global content-protection toggle (e.g. hide from screen capture)
    SET_CONTENT_PROTECTION = "LovecordSetContentProtection"
}
