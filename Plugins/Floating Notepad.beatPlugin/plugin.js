/*
Floating Notepad
Short description: Quickly access and edit Beat's notepad in a floating window with keyboard shortcuts.
Copyright: Bode
<Description>
  <p>The Floating Notepad plugin provides a convenient way to access and edit Beat's notepad from a floating window.
  <br><br>
  Open the section menu with CMD+UP and CMD+DOWN.
  <br><br>
  Jump sections with OPT+UP and OPT+DOWN.
  <br><br>
  Toggle the window with OPT+CMD+3.
  <br><br>
  ⚠️WARNING: This plugin does not support color. If your notes are color-coordinated, do not use this plugin, as it will remove all colors upon launch.
  </p>
</Description>
Image: floating_notepad.png
Version: 3.0
*/

const html = Beat.assetAsString("ui.html");
const panel = Beat.htmlWindow(html, 2000, 600, null, { utility: false });
panel.stayInMemory = true;

let panelVisible = true;
let savedFrame = null;
let beatThemePoller = null;
let lastForcedAppearance = null;
let panelWasForcedDark = false;
let isSyncingFromPanel = false;

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

function getForcedAppearance() {
    const appearance = Number(Beat.getRawUserDefault("Forced Appearance") || 0);
    if (![0, 1, 2].includes(appearance)) {
        throw new Error("Unsupported Beat forced appearance value: " + appearance);
    }
    return appearance;
}

function applyAppearance(appearance) {
    const theme = appearance === 1 ? "dark" : appearance === 2 ? "light" : "system";
    if (appearance === 1) {
        panel.dark = true;
        panelWasForcedDark = true;
    } else if (panelWasForcedDark) {
        panel.dark = false;
        panelWasForcedDark = false;
    }

    panel.call(() => {
        document.documentElement.dataset.theme = theme;
    });
}

function checkAppearance() {
    const appearance = getForcedAppearance();
    if (appearance !== lastForcedAppearance) {
        lastForcedAppearance = appearance;
        applyAppearance(appearance);
    }
}

function startAppearanceWatcher() {
    if (beatThemePoller && typeof beatThemePoller.stop === "function") {
        beatThemePoller.stop();
    }
    lastForcedAppearance = null;
    checkAppearance();
    scheduleAppearanceCheck();
}

function scheduleAppearanceCheck() {
    beatThemePoller = Beat.timer(1.5, () => {
        checkAppearance();
        scheduleAppearanceCheck();
    });
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

startAppearanceWatcher();

const menuItem = Beat.menuItem("Floating Notepad", ["cmd", "alt", "3"], togglePanelVisibility);
Beat.menu("Floating Notepad", [menuItem]);
