/*
Floating Notepad
Short description: Quickly access and edit Beat's notepad in a floating window with keyboard shortcuts.
Copyright: Bode Pickman
<Description>
  <p>The Floating Notepad plugin provides a convenient way to access and edit Beat's notepad from a floating window. This allows users to keep their notes easily accessible while working on their screenplay, without the need to switch tabs or panels.
  <p>⚠️WARNING: This plugin does not support color. If your notes are color-coordinated, do not use this plugin, as it will remove all colors upon launch.</p>
  <p>Features:</p>
  <ul>
    <li>Floating Window: Displays the notepad in a floating window that can be moved and resized independently of the main application window.</li>
    <li>Keyboard Shortcuts: Toggle the visibility of the floating notepad using the keyboard shortcut ⌘⌥ 3.</li>
    <li>Navigate Headings: Use ⌥↑ and ⌥↓ to cycle through heading sections. This allows for quickly moving between different parts of your notes, enabling efficient organization and easy access to important information.</li>
    <li>Markdown Support: Supports limited Markdown rendering, allowing users to format their notes effectively.</li>
    <li>Real-time Synchronization: Automatically synchronizes changes between the floating notepad and the main notepad panel.</li>
    <li>Search Functionality: Easily search through your notes with the built-in search bar, allowing for quick access to specific information.</li>
    <li>Zoom In/Out: Adjust the font size of your notes for better readability with zoom in and out controls.</li>
  </ul>
</Description>
Image: floating_notepad.png
Compatibility: 1.999.10
Version: 1.3
*/

const html = Beat.assetAsString("ui.html");
const notepad = Beat.notepad;

// Set up the panel
const panel = Beat.htmlWindow(html, 2000, 600);
panel.stayInMemory = true; // Keep the panel in memory even when closed
const frame = panel.getFrame();
panel.setFrame(frame.x, frame.y - 300, frame.width, frame.height);

// Disable full-screen, minimize, and maximize for the panel
panel.disableFullScreen = true;
panel.disableMinimize = true;
panel.disableMaximize = true;

// Variable to track the panel's visibility state
let isPanelVisible = true;

// Variable to track if the update is programmatic
let isProgrammaticUpdate = false;

// Create a menu item to toggle the panel visibility when needed
const menuItem = Beat.menuItem("Floating Notepad", ["cmd", "alt", "3"], togglePanelVisibility);
const menu = Beat.menu("Floating Notepad", [menuItem]);

// Custom methods
Beat.custom = {
    syncNotepad(content) {
        console.log("Syncing notepad content programmatically.");
        notepad.string = content;
    }
};

// Refresh the notepad content when the main notepad changes
Beat.onNotepadChange(() => {
    if (!isProgrammaticUpdate) {
        console.log("Notepad changed, refreshing notepad.");
        refreshNotepad();
    } else {
        console.log("Notepad changed, but skipping due to programmatic update.");
    }
});

// Function to toggle the panel visibility
function togglePanelVisibility() {
    if (isPanelVisible) {
        panel.hide();
    } else {
        panel.show();
    }
    isPanelVisible = !isPanelVisible;
}

// Function to refresh the notepad content
function refreshNotepad() {
    const text = Beat.notepad.string;
    console.log("Refreshing notepad with content:", text);
    panel.call(() => {
        if (typeof simplemde === 'undefined') {
            console.log("Initializing editor with content:", text);
            initializeEditor(text);
        } else {
            console.log("Updating editor content programmatically.");
            isProgrammaticUpdate = true;
            simplemde.value(text);
            isProgrammaticUpdate = false;
        }
    });
}

// Function to synchronize the notepad content with the main notepad
function syncNotepadToMain() {
    const content = simplemde.value();
    console.log("Syncing notepad to main with content:", content);
    isProgrammaticUpdate = true;
    Beat.call(
        (arg) => {
            Beat.custom.syncNotepad(arg);
            isProgrammaticUpdate = false;
        },
        content
    );
}

// Debounce function to limit the frequency of sync operations
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Function to initialize the editor
function initializeEditor(content) {
    simplemde = new SimpleMDE({
        element: document.getElementById("notepadTextarea"),
        initialValue: content,
        spellChecker: false,
        autosave: {
            enabled: true,
            uniqueId: "floating-notepad",
            delay: 1000,
        },
        toolbar: false,
        status: false,
        previewRender: (plainText) => {
            const modifiedText = plainText.replace(/^(#+)([^#\s])/gm, '$1 $2');
            return this.parent.markdown(modifiedText);
        },
        parsingConfig: {
            allowAtxHeaderWithoutSpace: true
        },
        codeMirror: {
            mode: {
                name: "gfm",
                highlightFormatting: true,
                underscoresBreakWords: false,
                emoji: true,
            }
        }
    });

    simplemde.codemirror.on("change", debounce(() => {
        if (!isProgrammaticUpdate) {
            console.log("Editor content changed, syncing to main.");
            syncNotepadToMain();
        } else {
            console.log("Editor content changed, but skipping due to programmatic update.");
        }
    }, 500));

    // Add custom key bindings
    simplemde.codemirror.addKeyMap({
        "Alt-Down": (cm) => navigateToNextHeading(cm, 1),
        "Alt-Up": (cm) => navigateToPreviousHeading(cm, 1),
        "Alt-Ctrl-Down": (cm) => navigateToNextHeading(cm, 2),
        "Alt-Ctrl-Up": (cm) => navigateToPreviousHeading(cm, 2)
    });

    // Add custom handling for the return key
    simplemde.codemirror.addKeyMap({
        "Enter": (cm) => {
            if (!isProgrammaticUpdate) {
                console.log("Return key pressed, syncing to main.");
                syncNotepadToMain();
            } else {
                console.log("Return key pressed, but skipping due to programmatic update.");
            }
            cm.execCommand("newlineAndIndent");
        }
    });
}

// Function to navigate to the next heading of a given level
function navigateToNextHeading(cm, level) {
    const cursor = cm.getCursor();
    const lineCount = cm.lineCount();
    const headingRegex = new RegExp(`^#{${level}}\\s*[^#]`);
    for (let i = cursor.line + 1; i < lineCount; i++) {
        const lineText = cm.getLine(i);
        if (headingRegex.test(lineText)) {
            cm.setCursor({ line: i, ch: 0 });
            break;
        }
    }
}

// Function to navigate to the previous heading of a given level
function navigateToPreviousHeading(cm, level) {
    const cursor = cm.getCursor();
    const headingRegex = new RegExp(`^#{${level}}\\s*[^#]`);
    for (let i = cursor.line - 1; i >= 0; i--) {
        const lineText = cm.getLine(i);
        if (headingRegex.test(lineText)) {
            cm.setCursor({ line: i, ch: 0 });
            break;
        }
    }
}

// Sync notepad content when the panel is shown
panel.call(() => {
    document.addEventListener('DOMContentLoaded', refreshNotepad);
    document.addEventListener('focus', refreshNotepad);
});
