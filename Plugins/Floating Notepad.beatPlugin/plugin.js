/*
Floating Notepad
Short description: Quickly access and edit Beat's notepad in a floating window with keyboard shortcuts.
Copyright: Bode
<Description>
  <p>The Floating Notepad plugin provides a convenient way to access and edit Beat's notepad from a floating window.
  <br><br>
  Open the section menu with OPT+CMD+UP and OPT+CMD+DOWN.
  <br><br>
  Jump sections with OPT+UP and OPT+DOWN.
  <br><br>
  Fold and unfold Markdown or Fountain scene sections with the arrows beside their headings.
  <br><br>
  Use CMD+UP to fold and CMD+DOWN to unfold the current section.
  <br><br>
  Enable Typewriter mode to keep the current line centered while editing.
  <br><br>
  Toggle the window with OPT+CMD+3.
  <br><br>
  ⚠️WARNING: This plugin does not support color. If your notes are color-coordinated, do not use this plugin, as it will remove all colors upon launch.
  </p>
</Description>
Image: floating_notepad.png
Version: 3.1
*/

const html = Beat.assetAsString("ui.html");
const panel = Beat.htmlWindow(html, 2000, 600, null, { utility: false });
panel.stayInMemory = true;

let panelVisible = true;
let savedFrame = null;
let beatThemePoller = null;
let isSyncingFromPanel = false;
let lastBeatForcedAppearance = null;
let lastBeatDarkMode = null;
let beatThemeIsDark = false;
let beatThemeInitialized = false;
let windowAppearanceForcedDark = false;
let themeMode = Beat.getUserDefault("floatingNotepadTheme") || "beat";
let systemDarkMode = false;
let systemDarkModeKnown = false;

if (!["beat", "system", "light", "dark"].includes(themeMode)) {
    themeMode = "beat";
}

const initialFrame = panel.getFrame();
panel.setFrame(initialFrame.x, initialFrame.y - 300, initialFrame.width, initialFrame.height);

Beat.custom = {
    syncNotepad(content) {
        if (typeof content !== "string") {
            throw new TypeError("Floating Notepad content must be a string.");
        }
        isSyncingFromPanel = true;
        try {
            Beat.notepad.string = content;
        } finally {
            isSyncingFromPanel = false;
        }
    }
};

function refreshNotepad() {
    const text = Beat.notepad.string || "";
    panel.call(() => {
        if (typeof window.refreshFloatingNotepad === "function") {
            window.refreshFloatingNotepad(text);
            return;
        }
        const editor = document.getElementById("editor");
        if (editor && editor.value !== text) editor.value = text;
    });
}

Beat.onNotepadChange(() => {
    if (!isSyncingFromPanel) refreshNotepad();
});

function getBeatForcedAppearance() {
    const appearance = Number(Beat.getRawUserDefault("Forced Appearance") || 0);
    if (![0, 1, 2].includes(appearance)) {
        throw new Error("Unsupported Beat forced appearance value: " + appearance);
    }
    return appearance;
}

function isBeatDark() {
    const appearance = getBeatForcedAppearance();
    if (appearance === 0 && !systemDarkModeKnown && !beatThemeInitialized) {
        return beatThemeIsDark;
    }
    if (!beatThemeInitialized || appearance !== lastBeatForcedAppearance) {
        if (appearance === 1) beatThemeIsDark = true;
        else if (appearance === 2) beatThemeIsDark = false;
        else if (lastBeatForcedAppearance === 1) beatThemeIsDark = false;
        else if (lastBeatForcedAppearance === 2) beatThemeIsDark = true;
        else beatThemeIsDark = systemDarkMode;
        lastBeatForcedAppearance = appearance;
        beatThemeInitialized = true;
    }
    return beatThemeIsDark;
}

function isThemeDark() {
    if (themeMode === "dark") return true;
    if (themeMode === "light") return false;
    if (themeMode === "beat") return isBeatDark();
    return systemDarkMode;
}

function applyAppearance() {
    if (!panel) return;
    applyWindowAppearance();
    const theme = themeMode === "beat"
        ? isBeatDark() ? "dark" : "light"
        : themeMode;
    if (typeof panel.runJS === "function") {
        panel.runJS("window.setBeatTheme(" + JSON.stringify(theme) + ", " + JSON.stringify(themeMode) + ")");
    } else {
        panel.call((selectedTheme, selectedMode) => {
            window.setBeatTheme(selectedTheme, selectedMode);
        }, theme, themeMode);
    }
}

function applyWindowAppearance() {
    const shouldForceDark = themeMode === "dark" ||
        (themeMode === "beat" && isBeatDark());
    if (shouldForceDark) {
        if (!windowAppearanceForcedDark) {
            panel.dark = true;
            windowAppearanceForcedDark = true;
        }
    } else if (windowAppearanceForcedDark) {
        panel.dark = false;
        windowAppearanceForcedDark = false;
    }
}

Beat.custom.editorReady = function() {
    applyAppearance();
};

Beat.custom.setThemeMode = function(mode) {
    if (!["beat", "system", "light", "dark"].includes(mode)) {
        Beat.log("Floating Notepad: Ignoring unsupported theme mode: " + mode);
        return;
    }
    themeMode = mode;
    Beat.setUserDefault("floatingNotepadTheme", mode);
    startBeatThemeWatcher();
    applyAppearance();
};

Beat.custom.setLightMode = function() {
    Beat.custom.setThemeMode("light");
};

Beat.custom.setDarkMode = function() {
    Beat.custom.setThemeMode("dark");
};

Beat.custom.setSystemMode = function() {
    Beat.custom.setThemeMode("system");
};

Beat.custom.setSystemDarkMode = function(isDark) {
    const wasDark = themeMode === "beat" ? lastBeatDarkMode : isThemeDark();
    systemDarkMode = Boolean(isDark);
    systemDarkModeKnown = true;
    const isNowDark = isThemeDark();
    applyWindowAppearance();
    if (wasDark !== isNowDark) {
        lastBeatDarkMode = isNowDark;
        applyAppearance();
    }
};

Beat.custom.toggleLightDark = function() {
    if (isThemeDark()) {
        Beat.custom.setLightMode();
    } else {
        Beat.custom.setDarkMode();
    }
};

function scheduleBeatThemeCheck() {
    if (themeMode !== "beat") {
        beatThemePoller = null;
        return;
    }
    beatThemePoller = Beat.timer(1.5, function() {
        const previousAppearance = lastBeatForcedAppearance;
        const appearance = getBeatForcedAppearance();
        const isDark = isBeatDark();
        const appearanceChanged = appearance !== previousAppearance;
        const themeChanged = isDark !== lastBeatDarkMode;
        lastBeatDarkMode = isDark;

        if (appearanceChanged) applyWindowAppearance();
        if (themeChanged) applyAppearance();
        scheduleBeatThemeCheck();
    });
}

function startBeatThemeWatcher() {
    if (beatThemePoller && typeof beatThemePoller.stop === "function") {
        beatThemePoller.stop();
    }
    if (themeMode !== "beat") {
        beatThemePoller = null;
        return;
    }
    lastBeatForcedAppearance = getBeatForcedAppearance();
    lastBeatDarkMode = isBeatDark();
    scheduleBeatThemeCheck();
}

function togglePanelVisibility() {
    panelVisible = !panelVisible;
    if (!panelVisible) {
        if (typeof panel.getFrame === "function") savedFrame = panel.getFrame();
        if (savedFrame && typeof panel.setFrame === "function") {
            panel.setFrame(savedFrame.x, savedFrame.y, 0, 0);
        } else if (typeof panel.hide === "function") {
            panel.hide();
        }
        return;
    }

    if (savedFrame && typeof panel.setFrame === "function") {
        panel.setFrame(savedFrame.x, savedFrame.y, savedFrame.width, savedFrame.height);
    } else if (typeof panel.show === "function") {
        panel.show();
    }
    refreshNotepad();
}

panel.call(() => {
    window.addEventListener("focus", refreshNotepad);
});

startBeatThemeWatcher();
applyAppearance();

const menuItem = Beat.menuItem("Floating Notepad", ["cmd", "alt", "3"], togglePanelVisibility);
const toggleThemeMenuItem = Beat.menuItem("Toggle Theme", ["cmd", "ctrl", "0"], () => Beat.custom.toggleLightDark());
Beat.menu("Floating Notepad", [menuItem, toggleThemeMenuItem]);
