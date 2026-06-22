/*
Quick Capture to Notepad
Short description: Quickly capture ideas and send them to Beat's notepad without breaking your flow.
Copyright: Bode Pickman
<Description>
  <p>"Quick Capture to Notepad" is a handy Beat plugin that allows you to quickly capture ideas without taking your hands off the keyboard or navigating away from the editor. Simply launch the plugin using a keyboard shortcut (⌘ ⌥ 2), type your idea, and hit Send (or press ⌘ + ⏎). The note will be conveniently stored in Beat's Notepad for future reference.</p>
  <p>Features include quick sending, color categorization, keyboard shortcuts (⌘ ⌥ 2 to toggle the plugin, ⌘ + ⏎ to send), and a minimalist user interface.</p>
</Description>
Image: capture_to_notepad.png
Compatibility: 1.999.10
Version: 1.2
*/

const html = Beat.assetAsString("ui.html")
const notepad = Beat.notepad

// --- FULLSCREEN & POSITION MEMORY CONTROLLER STATE ---
let isPanelVisible = true;
let savedPanelX = null;
let savedPanelY = null;

// Set up the panel
let panel = Beat.htmlWindow(html, 400, 200, null, { utility: false });
panel.stayInMemory = true; // Keep the panel in memory even when closed
let frame = panel.getFrame()
panel.setFrame(frame.x, frame.y - 200, frame.width, frame.height)

// Custom methods
Beat.custom = {
    // FIXED: Uses your 0x0 structural collapse routine to completely bypass full-screen jumps
    toggleQuickCaptureWindow: function() {
        if (panel) {
            isPanelVisible = !isPanelVisible;
            
            if (!isPanelVisible) {
                // 1. MEMORY CHECK: Capture the custom dragged coordinates right before collapsing
                if (typeof panel.getFrame === "function") {
                    const frameBeforeHide = panel.getFrame();
                    savedPanelX = frameBeforeHide.x;
                    savedPanelY = frameBeforeHide.y;
                }
                
                // 2. INVISIBLE STATE: Collapse window bounds to 0x0 right where it sits
                if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
                    panel.setFrame(savedPanelX, savedPanelY, 0, 0);
                } else {
                    panel.hide();
                }
            } else {
                // 3. RESTORE STATE: Instant size expansion directly at the user's custom location
                if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
                    panel.setFrame(savedPanelX, savedPanelY, 400, 200);
                } else if (typeof panel.show === "function") {
                    panel.show();
                }
                
                // Automatically clear and focus input textarea field on wake
                clearTextarea();
            }
        }
    },

    captureIdea: function (idea, color) {
        if (idea == "") return;
        let noteColor = color === 'default' ? null : color;
        notepad.replaceRange(notepad.string.length, 0, idea + "\n\n", noteColor)
        
        // Use the new toggle method to close cleanly instead of panel.hide()
        Beat.custom.toggleQuickCaptureWindow();
    },

    close: function () {
        // Use the new toggle method to close cleanly instead of panel.hide()
        Beat.custom.toggleQuickCaptureWindow();
    },

    show: function () {
        if (!isPanelVisible) {
            Beat.custom.toggleQuickCaptureWindow();
        } else {
            if (panel && typeof panel.show === "function") panel.show();
            clearTextarea();
        }
    }
}

function clearTextarea() {
    panel.runJS("clear()");
}

// --- UNIFIED NATIVE MENU SHORTCUT REGISTER (NO DUPLICATION) ---

// Create exactly ONE menu item mapped to your custom action hook (CMD+ALT+2)
const menuItem = Beat.menuItem(
    "Capture to Notepad", 
    ["cmd", "alt", "2"], 
    Beat.custom.toggleQuickCaptureWindow
);

// Bind the menu configuration container using your unified naming convention
const menu = Beat.menu("Quick Capture", [menuItem]);
