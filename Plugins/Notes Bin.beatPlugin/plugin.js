/*

Plugin name: Notes Bin
Version: 0.1.0
Copyright: 2025 gfrancine
Image: Notes Bin.png

<Description>
  <p>A Highland 2-like container for storing and organizing your notes in snippets.</p>
  <h2>Features</h2>
  <ul>
    <li>Drag and drop text from anywhere to create notes or drag notes out of the bin</li>
    <li>Import and export to text (<code>.txt</code>) files</li>
    <li>Text search</li>
    <li>Cut or copy directly from selection</li>
  </ul>
  <h2>Shortcuts</h2>
  <ul>
    <li><code>Cmd + Opt + Z</code> — Toggle window</li>
    <li><code>Cmd + Opt + X</code> — Cut selection to bin</li>
    <li><code>Cmd + Opt + C</code> — Copy selection to bin</li>
  </ul>
</Description>

*/

const APP_VERSION = "0.1.0";

// Window

// Window positioning

const DEFAULT_WINDOW_POS = { x: 60, y: 60, width: 300, height: 800 };

const htmlWindow = Beat.htmlWindow(
  Beat.assetAsString("index.html"),
  DEFAULT_WINDOW_POS.width,
  DEFAULT_WINDOW_POS.height,
  () => {
    // save position
    const windowPosition = htmlWindow.getFrame();
    Beat.setUserDefault("windowPosition", windowPosition);
    setWindowOpen(false); // update menu item state
  },
);

htmlWindow.stayInMemory = true;
htmlWindow.title = "Notes Bin " + APP_VERSION;

// Restore position
const windowPosition =
  Beat.getUserDefault("windowPosition") || DEFAULT_WINDOW_POS;

if (windowPosition) {
  htmlWindow.setFrame(
    windowPosition.x,
    windowPosition.y,
    windowPosition.width,
    windowPosition.height,
  );
}

// Window open/close

let windowOpen = true;

const showWindowMenuItem = Beat.menuItem(
  "Show Window",
  ["cmd", "alt", "z"],
  () => {
    setWindowOpen(!windowOpen);
  },
);

function setWindowOpen(value /* boolean */) {
  windowOpen = value;
  showWindowMenuItem.on = windowOpen;

  if (windowOpen) {
    htmlWindow.show();
  } else {
    htmlWindow.hide();
  }
}

setWindowOpen(windowOpen);

// Menu

const menu = Beat.menu("Notes Bin", [
  showWindowMenuItem,
  Beat.separatorMenuItem(),
  // https://highland-kb.quoteunquoteapps.com/kb/sidebar/bin
  Beat.menuItem("Cut to Bin", ["cmd", "alt", "x"], () =>
    htmlWindow.runJS(`PluginGlobals.onCutToBin()`),
  ),
  Beat.menuItem("Copy to Bin", ["cmd", "alt", "c"], () =>
    htmlWindow.runJS(`PluginGlobals.onCopyToBin()`),
  ),
]);

Beat.custom = {
  // Beat doesn't have an async API so we have to rely on "pub-sub"
  promptImportFile: () => {
    Beat.openFile(["txt"], (path) => {
      if (!path || path.length <= 0) return;
      const contents = Beat.fileToString(path);
      htmlWindow.runJS(
        `PluginGlobals.onPromptImportFileResult(${JSON.stringify(contents)})`,
      );
    });
  },
};
