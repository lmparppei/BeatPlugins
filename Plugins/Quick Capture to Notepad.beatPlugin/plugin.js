/*
Quick Capture to Notepad
Short description: Quickly capture ideas and send them to Beat's notepad without breaking your flow.
Copyright: Bode Pickman
<Description>
  <p>We've all been there. You're working on a scene, deep in concentration, when suddenly a brilliant idea for another scene pops into your head. You don't want to lose the idea, but you also don't want to break your current flow and disrupt your productivity.</p>
  <p>That's where "Quick Capture to Notepad" comes in!</p>
  <p>"Quick Capture to Notepad" is a handy Beat plugin that allows you to quickly capture ideas without taking your hands off the keyboard or navigating away from the editor. Simply launch the plugin using a keyboard shortcut (⌘ ⌥ 2), type your idea, and hit Send (or press ⌘ + ⏎). The note will be conveniently stored in Beat's Notepad for future reference.</p>
  <p>With "Quick Capture to Notepad," your ideas are out of sight and out of mind, but never forgotten. You can stay focused on your current scene while ensuring that your stray ideas are safely captured and easily accessible later.</p>
  <p>Features:</p>
  <ul>
    <li>Quickly send notes to Beat's Notepad</li>
    <li>Choose from a variety of colors to categorize your notes</li>
    <li>Keyboard shortcuts for seamless integration (⌘ ⌥ 2 to launch, ⌘ + ⏎ to send)</li>
    <li>Minimalist and intuitive user interface</li>
  </ul>
  <p>Capture ideas on the fly without breaking your concentration!</p>
</Description>
Image: capture_to_notepad.png
Compatibility: 1.999.10
Version: 1.1
*/

const html = Beat.assetAsString("ui.html")
const notepad = Beat.notepad

// Set up the panel
let panel = Beat.htmlWindow(html, 400, 200, null, { utility: false });
panel.stayInMemory = true; // Keep the panel in memory even when closed
let frame = panel.getFrame()
panel.setFrame(frame.x, frame.y - 200, frame.width, frame.height)

// panel.disableFullScreen = true;

// Create a menu item to bring this panel up when needed
const menuItem = Beat.menuItem("Capture to Notepad", ["cmd", "alt", "2"], () => {
    panel.show()
    clearTextarea();
})
const menu = Beat.menu("Quick Capture", [menuItem])

// Custom methods
Beat.custom = {
    captureIdea: function (idea, color) {
        if (idea == "") return;
        let noteColor = color === 'default' ? null : color;
        notepad.replaceRange(notepad.string.length, 0, idea + "\n\n", noteColor)
        panel.hide()
    },

    close: function () {
        panel.hide()
    },

    show: function () {
        panel.show();
        clearTextarea();
    }
}

function clearTextarea() {
    panel.runJS("clear()");
}
