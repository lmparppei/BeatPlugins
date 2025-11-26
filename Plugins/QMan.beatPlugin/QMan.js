/*

Name: QMan
Copyright: Nicola Marra de Scisciolo, 2025
Description: Manage technical cues (SOUND, LIGHT, MUSIC, VIDEO, etc.) with dynamic detection and auto-update
Version: 1.2
Type: Tool
Compatibility: 2.1.2

<Description>
	<p>Dynamically detects and manages all technical cues in your screenplay. Features include: dark/light/system themes, instant-apply settings, auto-update on document changes, color-coded cue types, tab filtering, sequential renumbering with dynamic button coloring, CSV/HTML/QLab export, click-to-navigate, customizable highlighting, and screenplay visibility control. Note: Scene context display is an experimental feature currently under development.</p>
</Description>

*/

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escapes a string for safe use in JavaScript code
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeForJS(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Escapes HTML special characters
 * @param {string} str - String to escape
 * @returns {string} HTML-safe string
 */
function escapeHTML(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Safely parses JSON with fallback
 * @param {string} json - JSON string to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
function safeJSONParse(json, defaultValue = null) {
  try {
    return JSON.parse(json);
  } catch (e) {
    Beat.log("JSON parse error: " + e);
    return defaultValue;
  }
}

/**
 * Validates preferences object structure
 * @param {Object} prefs - Preferences object to validate
 * @returns {boolean} True if valid
 */
function validatePreferences(prefs) {
  if (!prefs || typeof prefs !== "object") return false;

  // Check for required properties
  if (prefs.theme && !["dark", "light", "system"].includes(prefs.theme)) {
    return false;
  }

  // Validate cue type preferences
  for (const key in prefs) {
    if (
      key === "theme" ||
      key === "showSceneContext" ||
      key === "globalHighlight" ||
      key === "globalHide"
    ) {
      continue;
    }

    const pref = prefs[key];
    if (pref && typeof pref === "object") {
      if (pref.color && typeof pref.color !== "string") return false;
      if (pref.enabled !== undefined && typeof pref.enabled !== "boolean")
        return false;
      if (pref.highlight !== undefined && typeof pref.highlight !== "boolean")
        return false;
      if (pref.hide !== undefined && typeof pref.hide !== "boolean")
        return false;
    }
  }

  return true;
}

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let htmlWindow = null;
let collectedCues = [];
let prefsWindow = null;
let changeTimer = null;
let detectedCueTypes = [];

// Initialize Beat.custom if needed
if (!Beat.custom) Beat.custom = {};

// Default cue type preferences
let cuePreferences = {
  theme: "system",
  showSceneContext: false,
  globalHighlight: false,
  globalHide: false,
  SOUND: { color: "#3498db", enabled: true, highlight: false, hide: false },
  LIGHT: { color: "#f39c12", enabled: true, highlight: false, hide: false },
  MUSIC: { color: "#e74c3c", enabled: true, highlight: false, hide: false },
  VIDEO: { color: "#9b59b6", enabled: true, highlight: false, hide: false },
  PROJECTION: {
    color: "#1abc9c",
    enabled: true,
    highlight: false,
    hide: false,
  },
};

// Predefined color palette for consistent color generation
const COLOR_PALETTE = [
  "#3498db",
  "#e74c3c",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#16a085",
  "#27ae60",
  "#2980b9",
  "#8e44ad",
  "#c0392b",
  "#d35400",
  "#f39c12",
  "#2ecc71",
  "#3498db",
];

// ============================================================================
// PREFERENCES MANAGEMENT
// ============================================================================

/**
 * Loads preferences from storage with validation
 */
function loadPreferences() {
  try {
    const stored = Beat.getUserDefault("qman_preferences");
    if (stored) {
      const parsed = safeJSONParse(stored);
      if (parsed && validatePreferences(parsed)) {
        // Merge with defaults to ensure all required properties exist
        cuePreferences = { ...cuePreferences, ...parsed };
        Beat.log("Preferences loaded successfully");
      } else {
        Beat.log("Invalid preferences structure, using defaults");
      }
    }
  } catch (e) {
    Beat.log("Error loading preferences: " + e);
  }
}

/**
 * Saves preferences to storage
 */
function savePreferences() {
  try {
    Beat.setUserDefault("qman_preferences", JSON.stringify(cuePreferences));
  } catch (e) {
    Beat.log("Error saving preferences: " + e);
  }
}

// ============================================================================
// CUE DETECTION
// ============================================================================

/**
 * Detects and collects all cues from the document
 * @returns {{detectedTypes: string[], allCues: Array}} Object containing detected types and all cues
 */
function detectAndCollectCues() {
  const detectedTypes = [];
  const allCues = [];
  const cuePattern =
    /^!?([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)$/;
  const noteCuePattern =
    /^\[\[\s*!?([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)\s*\]\]$/;

  let currentScene = "Unknown";

  try {
    for (const line of Beat.lines()) {
      const lineString = line.string.trim();

      // Skip empty lines
      if (!lineString) continue;

      // Early exit optimization - only process lines that could be cues or scenes
      if (!/^[\[\!A-Z\.]/.test(lineString)) continue;

      // Detect scene headings using Beat's type detection first
      // `line.type` is numeric; use numeric check or `line.typeAsString()`
      if (
        line.type === 2 ||
        (typeof line.typeAsString === "function" &&
          line.typeAsString() === "heading")
      ) {
        currentScene = lineString;
        continue;
      }

      // Fallback: Check for Fountain scene heading patterns
      const upperLine = lineString.toUpperCase();
      if (
        upperLine.startsWith("INT.") ||
        upperLine.startsWith("EXT.") ||
        upperLine.startsWith("INT/EXT") ||
        upperLine.startsWith("EXT/INT") ||
        upperLine.startsWith("I/E") ||
        (lineString.startsWith(".") &&
          lineString.length > 1 &&
          lineString.charAt(1) !== ".")
      ) {
        currentScene = lineString.startsWith(".")
          ? lineString.substring(1).trim()
          : lineString;
        continue;
      }

      // Try to match cue patterns
      let match = lineString.match(cuePattern);
      let isWrapped = false;

      // Check if cue is wrapped in notes [[ ]]
      if (!match) {
        match = lineString.match(noteCuePattern);
        if (match) {
          isWrapped = true;
        }
      }

      if (match) {
        const cueType = match[1];

        // Validate cue type (must be all uppercase)
        if (cueType !== cueType.toUpperCase() || /[a-z]/.test(cueType))
          continue;

        const cueNumber = match[2] || "N/A";
        const cueName = (match[3] || "").trim();

        // Add to detected types if new
        if (detectedTypes.indexOf(cueType) === -1) {
          detectedTypes.push(cueType);

          // Initialize preferences for new cue types
          if (!cuePreferences[cueType]) {
            cuePreferences[cueType] = {
              color: getDefaultColorForType(cueType),
              enabled: true,
              highlight: cuePreferences.globalHighlight || false,
              hide: cuePreferences.globalHide || false,
            };
            savePreferences();
          }
        }

        allCues.push({
          type: cueType,
          number: cueNumber,
          name: cueName,
          lineIndex: line.position,
          scene: currentScene,
          isWrapped: isWrapped,
        });
      }
    }
  } catch (e) {
    Beat.log("Error detecting cues: " + e);
    Beat.alert("Error", "Failed to detect cues: " + e.message);
  }

  // Save detected types globally so other windows (preferences) can be updated
  detectedCueTypes = detectedTypes;
  return { detectedTypes: detectedTypes, allCues: allCues };
}

// ============================================================================
// COLOR MANAGEMENT
// ============================================================================

/**
 * Gets default color for a cue type using consistent hashing
 * @param {string} type - Cue type name
 * @returns {string} Hex color code
 */
function getDefaultColorForType(type) {
  const defaultColors = {
    SOUND: "#3498db",
    LIGHT: "#f39c12",
    MUSIC: "#e74c3c",
    VIDEO: "#9b59b6",
    PROJECTION: "#1abc9c",
  };

  if (defaultColors[type]) return defaultColors[type];

  // Generate consistent color using hash
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }

  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

/**
 * Updates cues list in the main window
 * @param {Array} cues - Array of cue objects
 */
function updateCuesListInWindow(cues) {
  if (!htmlWindow) return;

  try {
    // Update showSceneContext preference
    const showScene =
      cuePreferences.showSceneContext !== undefined
        ? cuePreferences.showSceneContext
        : false;

    htmlWindow.runJS("showSceneContext = " + showScene);

    // Set the cues list
    const jsonData = JSON.stringify(cues);
    const escapedJson = escapeForJS(jsonData);
    htmlWindow.runJS("setCuesList(JSON.parse('" + escapedJson + "'))");
    // Also refresh preferences window if it's open so new cue types appear immediately
    if (prefsWindow) {
      try {
        const detectedJson = JSON.stringify(detectedCueTypes || []);
        const escapedDetected = escapeForJS(detectedJson);
        const prefsJson = JSON.stringify(cuePreferences || {});
        const escapedPrefs = escapeForJS(prefsJson);

        prefsWindow.runJS(
          "detectedTypes = JSON.parse('" +
            escapedDetected +
            "'); prefs = JSON.parse('" +
            escapedPrefs +
            "'); renderCueTypes(); init();"
        );
      } catch (err) {
        Beat.log("Error updating preferences window: " + err);
      }
    }
    // Ensure main window redraws after updating the cues list
    try {
      htmlWindow.runJS("refreshDisplay()");
    } catch (e) {
      /* ignore if not available */
    }
  } catch (e) {
    Beat.log("Error updating cues list in window: " + e);
  }
}

/**
 * Creates the main QMan window
 * @param {Array} detectedTypes - Array of detected cue type names
 */
function createWindow(detectedTypes) {
  const themePreference = cuePreferences.theme || "system";
  const html = `<!DOCTYPE html>
<html data-theme="${themePreference}">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

/* Dark theme (default) */
:root, [data-theme="dark"] {
  --bg-primary: #1c1c1e;
  --bg-secondary: rgba(255,255,255,0.05);
  --bg-hover: rgba(255,255,255,0.08);
  --border-color: rgba(255,255,255,0.1);
  --border-subtle: rgba(255,255,255,0.08);
  --text-primary: #fff;
  --text-secondary: rgba(255,255,255,0.85);
  --text-tertiary: rgba(255,255,255,0.7);
  --text-muted: rgba(255,255,255,0.4);
  --shadow: rgba(0,0,0,0.2);
  --scrollbar: rgba(255,255,255,0.2);
  --scrollbar-hover: rgba(255,255,255,0.3);
  --accent-color: #0a84ff;
}

/* Light theme */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: rgba(0,0,0,0.03);
  --bg-hover: rgba(0,0,0,0.06);
  --border-color: rgba(0,0,0,0.12);
  --border-subtle: rgba(0,0,0,0.08);
  --text-primary: #000;
  --text-secondary: rgba(0,0,0,0.85);
  --text-tertiary: rgba(0,0,0,0.7);
  --text-muted: rgba(0,0,0,0.5);
  --shadow: rgba(0,0,0,0.1);
  --scrollbar: rgba(0,0,0,0.2);
  --scrollbar-hover: rgba(0,0,0,0.3);
  --accent-color: #007aff;
}

/* System theme detection */
@media (prefers-color-scheme: light) {
  [data-theme="system"] {
    --bg-primary: #ffffff;
    --bg-secondary: rgba(0,0,0,0.04);
    --bg-hover: rgba(0,0,0,0.08);
    --bg-tertiary: rgba(0,0,0,0.02);
    --border-color: rgba(0,0,0,0.15);
    --border-subtle: rgba(0,0,0,0.08);
    --text-primary: #000000;
    --text-secondary: rgba(0,0,0,0.85);
    --text-tertiary: rgba(0,0,0,0.65);
    --text-muted: rgba(0,0,0,0.45);
    --shadow: rgba(0,0,0,0.12);
    --shadow-strong: rgba(0,0,0,0.2);
    --scrollbar: rgba(0,0,0,0.25);
    --scrollbar-hover: rgba(0,0,0,0.35);
    --accent-color: #007aff;
    --separator: rgba(0,0,0,0.1);
  }
}

@media (prefers-color-scheme: dark) {
  [data-theme="system"] {
    --bg-primary: #1e1e1e;
    --bg-secondary: rgba(255,255,255,0.08);
    --bg-hover: rgba(255,255,255,0.12);
    --bg-tertiary: rgba(255,255,255,0.04);
    --border-color: rgba(255,255,255,0.15);
    --border-subtle: rgba(255,255,255,0.08);
    --text-primary: #ffffff;
    --text-secondary: rgba(255,255,255,0.85);
    --text-tertiary: rgba(255,255,255,0.65);
    --text-muted: rgba(255,255,255,0.45);
    --shadow: rgba(0,0,0,0.3);
    --shadow-strong: rgba(0,0,0,0.5);
    --scrollbar: rgba(255,255,255,0.25);
    --scrollbar-hover: rgba(255,255,255,0.35);
    --accent-color: #0a84ff;
    --separator: rgba(255,255,255,0.1);
  }
}

body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif; background: var(--bg-primary); color: var(--text-primary); display: flex; flex-direction: column; height: 100vh; overflow: hidden; transition: background 0.25s ease, color 0.25s ease; -webkit-font-smoothing: antialiased; }
.header { flex-shrink: 0; background: var(--bg-primary); padding: 16px 20px 12px 20px; border-bottom: 0.5px solid var(--separator, var(--border-color)); backdrop-filter: saturate(180%) blur(20px); position: sticky; top: 0; z-index: 100; }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 12px; letter-spacing: -0.4px; color: var(--text-primary); }
.controls { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; align-items: center; }
.search-box { flex: 1; max-width: 320px; padding: 7px 12px; background: var(--bg-secondary); border: 0.5px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 13px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.search-box::placeholder { color: var(--text-muted); }
.search-box:focus { outline: none; border-color: var(--accent-color); background: var(--bg-hover); box-shadow: 0 0 0 4px rgba(10,132,255,0.12); }
.btn { padding: 7px 16px; background: var(--accent-color); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); letter-spacing: -0.15px; white-space: nowrap; }
.btn:hover { opacity: 0.85; transform: scale(1.01); box-shadow: 0 4px 12px var(--shadow); }
.btn:active { transform: scale(0.98); opacity: 0.7; }
.btn-secondary { background: var(--bg-secondary); border: 0.5px solid var(--border-color); color: var(--text-primary); }
.btn-secondary:hover { background: var(--bg-hover); box-shadow: 0 3px 10px var(--shadow); }
.icon-btn { width: 32px; height: 32px; cursor: pointer; fill: var(--text-tertiary); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 6px; padding: 6px; }
.icon-btn:hover { fill: var(--text-primary); background: var(--bg-secondary); }
.icon-btn:active { transform: scale(0.92); background: var(--bg-hover); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.export-menu { display: none; position: absolute; top: 100%; right: 0; background: var(--bg-primary); border: 0.5px solid var(--border-color); border-radius: 8px; margin-top: 8px; min-width: 180px; z-index: 150; box-shadow: 0 10px 30px var(--shadow-strong, var(--shadow)), 0 0 0 0.5px var(--border-subtle); backdrop-filter: saturate(180%) blur(20px); overflow: hidden; }
.export-menu.show { display: block; animation: menuSlideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes menuSlideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.export-item { padding: 10px 14px; cursor: pointer; font-size: 13px; transition: background 0.15s ease; color: var(--text-primary); }
.export-item:hover { background: var(--accent-color); color: white; }
.tabs { display: flex; gap: 0; border-bottom: 0.5px solid var(--separator, var(--border-color)); flex-shrink: 0; background: var(--bg-primary); padding: 0 20px; backdrop-filter: saturate(180%) blur(20px); position: sticky; top: 0; z-index: 50; }
.tab { padding: 10px 16px; background: transparent; color: var(--text-muted); border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -0.5px; font-size: 13px; font-weight: 500; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); letter-spacing: -0.15px; position: relative; }
.tab:hover { color: var(--text-secondary); background: var(--bg-tertiary, var(--bg-secondary)); }
.tab.active { color: var(--accent-color); border-bottom-color: var(--accent-color); font-weight: 600; }
.badge { background: var(--bg-secondary); padding: 2px 6px; border-radius: 8px; font-size: 11px; margin-left: 5px; font-weight: 600; min-width: 20px; text-align: center; }
.tab.active .badge { background: rgba(10,132,255,0.15); color: var(--accent-color); }
.content { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 20px 20px 20px; }
.content::-webkit-scrollbar { width: 10px; }
.content::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
.content::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 10px; border: 2px solid var(--bg-primary); }
.content::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }
.cue-list { display: flex; flex-direction: column; gap: 8px; }
.cue-item { background: var(--bg-secondary); border: 0.5px solid var(--border-subtle); border-radius: 8px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
.cue-item:hover { background: var(--bg-hover); border-color: var(--border-color); transform: scale(1.01); box-shadow: 0 4px 12px var(--shadow); }
.cue-item:active { transform: scale(0.99); box-shadow: 0 2px 6px var(--shadow); }
.cue-number { font-weight: 600; min-width: 40px; font-size: 13px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.cue-type { font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 5px; line-height: 1; white-space: nowrap; letter-spacing: 0.2px; text-transform: uppercase; }
.cue-name { flex: 1; color: var(--text-secondary); line-height: 1.4; font-size: 13px; letter-spacing: -0.1px; }
.cue-scene { font-size: 11px; color: var(--text-muted); margin-top: 4px; font-style: italic; letter-spacing: -0.05px; font-weight: 400; }
.empty { text-align: center; padding: 80px 20px; color: var(--text-muted); font-size: 14px; font-weight: 400; }
.progress-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 200; backdrop-filter: saturate(180%) blur(20px); }
.progress-overlay.show { display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.progress-message { background: var(--accent-color); color: white; padding: 18px 32px; border-radius: 10px; font-size: 14px; font-weight: 500; box-shadow: 0 10px 40px rgba(10,132,255,0.5); animation: pulse 1.5s ease-in-out infinite; letter-spacing: -0.2px; }
@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.02); opacity: 1; } }
.btn.processing { opacity: 0.5; pointer-events: none; }
.footer { flex-shrink: 0; background: var(--bg-primary); padding: 10px 20px; border-top: 0.5px solid var(--separator, var(--border-color)); backdrop-filter: saturate(180%) blur(20px); display: flex; justify-content: flex-end; }
</style>
</head>
<body>
<div class="progress-overlay" id="progressOverlay">
  <div class="progress-message">Processing...</div>
</div>
<div class="header">
  <h1>QMan</h1>
  <div class="controls">
    <button class="btn" id="renumberBtn" onclick="renumber()" title="Renumber selected cues (Ctrl+R)">Renumber All</button>
    <input type="text" class="search-box" id="searchBox" placeholder="Search cues... (Ctrl+F)" oninput="searchCues(this.value)">
    <div style="position: relative; z-index: 200;">
      <svg class="icon-btn" viewBox="0 0 46.900390625 58.73828125" onclick="toggleExportMenu()" title="Export"><path d="M23.482421875 22.150390625C23.76171875 22.150390625 23.998046875 22.408203125 23.998046875 22.6875L23.998046875 47.953125L23.9765625 50.875L26.833984375 47.99609375L31.259765625 43.5703125C31.3671875 43.462890625 31.5390625 43.376953125 31.66796875 43.376953125C31.904296875 43.376953125 32.140625 43.61328125 32.140625 43.892578125C32.140625 44.021484375 32.076171875 44.12890625 31.96875 44.236328125L23.84765625 52.400390625C23.740234375 52.486328125 23.611328125 52.55078125 23.482421875 52.55078125C23.353515625 52.55078125 23.203125 52.486328125 23.1171875 52.400390625L14.953125 44.236328125C14.845703125 44.12890625 14.78125 44.021484375 14.78125 43.892578125C14.78125 43.61328125 14.99609375 43.376953125 15.25390625 43.376953125C15.404296875 43.376953125 15.5546875 43.462890625 15.662109375 43.5703125L20.087890625 47.99609375L22.966796875 50.896484375L22.9453125 47.953125L22.9453125 22.6875C22.9453125 22.408203125 23.181640625 22.150390625 23.482421875 22.150390625ZM11.0 6.1875L35.900390625 6.1875C39.509765625 6.1875 41.421875 8.1640625 41.421875 11.708984375L41.421875 34.71875C41.421875 38.263671875 39.509765625 40.240234375 35.900390625 40.240234375L29.498046875 40.240234375L29.498046875 39.1875L35.8359375 39.1875C38.71484375 39.1875 40.369140625 37.640625 40.369140625 34.654296875L40.369140625 11.751953125C40.369140625 8.787109375 38.71484375 7.240234375 35.8359375 7.240234375L11.04296875 7.240234375C8.078125 7.240234375 6.53125 8.787109375 6.53125 11.751953125L6.53125 34.654296875C6.53125 37.640625 8.078125 39.1875 11.04296875 39.1875L17.4453125 39.1875L17.4453125 40.240234375L11.0 40.240234375C7.390625 40.240234375 5.478515625 38.328125 5.478515625 34.71875L5.478515625 11.708984375C5.478515625 8.099609375 7.390625 6.1875 11.0 6.1875Z" transform="scale(1,-1) translate(0,-58.73828125)"/></svg>
        <div class="export-menu" id="exportMenu">
          <div class="export-item" onclick="exportToCSV()">Export to CSV</div>
          <div class="export-item" onclick="exportToHTML()">Export to HTML</div>
          <div class="export-item" onclick="exportToQLab()">Export to QLab (AppleScript)</div>
        </div>
      </div>
    </div>
  </div>
  <div class="tabs" id="tabs"></div>
</div>
<div class="content">
  <div class="cue-list" id="cueList"><div class="empty">Loading...</div></div>
</div>
<div class="footer">
  <svg class="icon-btn" viewBox="0 0 91 76" onclick="openManual()" title="Manual" aria-hidden="false" role="img">
    <g transform="matrix(1,0,0,1,-887.34448,-689.921168)">
      <g transform="matrix(1,0,0,1,876.968504,695.821233)">
        <path d="M10.376,62.907L10.376,7.69C10.376,7.338 10.403,7.012 10.457,6.714C10.512,6.415 10.647,6.09 10.864,5.737C12.085,3.649 13.869,1.723 16.215,-0.041C18.561,-1.804 21.328,-3.221 24.516,-4.293C27.703,-5.364 31.169,-5.9 34.912,-5.9C39.334,-5.9 43.369,-5.107 47.017,-3.52C50.666,-1.933 53.521,0.122 55.583,2.645C57.617,0.122 60.459,-1.933 64.107,-3.52C67.756,-5.107 71.804,-5.9 76.253,-5.9C79.97,-5.9 83.421,-5.364 86.609,-4.293C89.796,-3.221 92.57,-1.804 94.93,-0.041C97.29,1.723 99.067,3.649 100.26,5.737C100.477,6.09 100.613,6.415 100.667,6.714C100.722,7.012 100.749,7.338 100.749,7.69L100.749,62.907C100.749,64.589 100.288,65.782 99.365,66.488C98.443,67.193 97.385,67.546 96.191,67.546C95.486,67.546 94.808,67.376 94.157,67.037C93.506,66.698 92.801,66.284 92.041,65.796C89.789,64.277 87.328,63.076 84.656,62.195C81.984,61.313 79.237,60.886 76.416,60.913C73.459,60.94 70.577,61.496 67.769,62.581C64.962,63.666 62.419,65.308 60.14,67.505C59.272,68.319 58.478,68.882 57.76,69.194C57.041,69.505 56.315,69.661 55.583,69.661C54.823,69.661 54.091,69.505 53.385,69.194C52.68,68.882 51.88,68.319 50.985,67.505C48.706,65.308 46.163,63.666 43.355,62.581C40.548,61.496 37.679,60.94 34.749,60.913C31.901,60.886 29.141,61.313 26.469,62.195C23.797,63.076 21.335,64.277 19.084,65.796C18.324,66.284 17.619,66.698 16.968,67.037C16.317,67.376 15.652,67.546 14.974,67.546C13.753,67.546 12.682,67.193 11.759,66.488C10.837,65.782 10.376,64.589 10.376,62.907ZM16.927,59.448C19.07,57.902 21.715,56.668 24.862,55.745C28.008,54.823 31.359,54.362 34.912,54.362C37.164,54.362 39.361,54.613 41.504,55.115C43.647,55.617 45.634,56.302 47.465,57.17C49.296,58.038 50.903,59.028 52.287,60.14L52.287,8.87C50.849,6.375 48.557,4.381 45.41,2.889C42.263,1.397 38.764,0.651 34.912,0.651C32.389,0.651 29.968,0.983 27.649,1.648C25.33,2.313 23.234,3.242 21.362,4.435C19.491,5.629 18.012,7.026 16.927,8.626L16.927,59.448ZM58.838,60.14C60.221,59.028 61.835,58.038 63.68,57.17C65.525,56.302 67.512,55.617 69.641,55.115C71.771,54.613 73.975,54.362 76.253,54.362C79.78,54.362 83.116,54.823 86.263,55.745C89.41,56.668 92.055,57.902 94.198,59.448L94.198,8.626C93.113,7.026 91.634,5.629 89.762,4.435C87.891,3.242 85.795,2.313 83.476,1.648C81.156,0.983 78.749,0.651 76.253,0.651C72.374,0.651 68.861,1.397 65.715,2.889C62.568,4.381 60.276,6.375 58.838,8.87L58.838,60.14Z" style="fill-rule:nonzero;" fill="currentColor"/>
      </g>
    </g>
  </svg>
  <svg class="icon-btn" viewBox="0 0 54.892578125 62.1328125" onclick="openPreferences()" title="Preferences"><path d="M27.435546875 10.09765625C28.166015625 10.09765625 28.896484375 10.140625 29.583984375 10.248046875L30.63671875 8.25C30.830078125 7.86328125 31.044921875 7.755859375 31.58203125 7.8203125C32.076171875 7.86328125 32.205078125 8.03515625 32.26953125 8.55078125L32.591796875 10.763671875C33.966796875 11.0859375 35.341796875 11.580078125 36.609375 12.224609375L38.263671875 10.763671875C38.54296875 10.44140625 38.80078125 10.419921875 39.294921875 10.634765625C39.66015625 10.828125 39.74609375 11.04296875 39.66015625 11.580078125L39.23046875 13.728515625C40.412109375 14.5234375 41.5078125 15.42578125 42.517578125 16.5L44.537109375 15.662109375C44.90234375 15.404296875 45.16015625 15.46875 45.568359375 15.919921875C45.955078125 16.28515625 45.955078125 16.521484375 45.611328125 16.9296875L44.451171875 18.8203125C45.2890625 19.98046875 46.041015625 21.248046875 46.599609375 22.515625L48.833984375 22.408203125C49.328125 22.365234375 49.521484375 22.515625 49.650390625 22.966796875C49.822265625 23.439453125 49.736328125 23.654296875 49.349609375 23.955078125L47.630859375 25.3515625C48.017578125 26.68359375 48.232421875 28.123046875 48.33984375 29.583984375L50.4453125 30.25C50.91796875 30.421875 51.046875 30.615234375 51.046875 31.087890625C51.046875 31.5390625 50.91796875 31.732421875 50.4453125 31.92578125L48.33984375 32.591796875C48.232421875 34.052734375 47.99609375 35.470703125 47.630859375 36.82421875L49.349609375 38.220703125C49.71484375 38.45703125 49.7578125 38.671875 49.650390625 39.166015625C49.521484375 39.638671875 49.328125 39.767578125 48.833984375 39.74609375L46.599609375 39.66015625C46.01953125 40.94921875 45.2890625 42.1953125 44.451171875 43.35546875L45.611328125 45.224609375C45.912109375 45.611328125 45.912109375 45.869140625 45.568359375 46.212890625C45.16015625 46.685546875 44.90234375 46.728515625 44.537109375 46.4921875L42.517578125 45.67578125C41.5078125 46.70703125 40.412109375 47.630859375 39.23046875 48.42578125L39.66015625 50.552734375C39.74609375 51.08984375 39.66015625 51.3046875 39.294921875 51.498046875C38.80078125 51.755859375 38.5859375 51.734375 38.263671875 51.390625L36.609375 49.951171875C35.341796875 50.552734375 33.966796875 51.046875 32.591796875 51.369140625L32.26953125 53.603515625C32.205078125 54.119140625 32.0546875 54.26953125 31.560546875 54.333984375C31.044921875 54.376953125 30.830078125 54.26953125 30.63671875 53.92578125L29.583984375 51.90625C28.896484375 51.970703125 28.166015625 52.03515625 27.435546875 52.03515625C26.748046875 52.03515625 26.0390625 51.970703125 25.330078125 51.90625L24.27734375 53.92578125C24.10546875 54.26953125 23.890625 54.376953125 23.33203125 54.333984375C22.837890625 54.26953125 22.708984375 54.119140625 22.64453125 53.603515625L22.322265625 51.412109375C20.947265625 51.046875 19.572265625 50.57421875 18.3046875 49.951171875L16.671875 51.369140625C16.306640625 51.69140625 16.091796875 51.712890625 15.640625 51.498046875C15.25390625 51.3046875 15.16796875 51.08984375 15.25390625 50.552734375L15.68359375 48.42578125C14.501953125 47.630859375 13.40625 46.70703125 12.41796875 45.67578125L10.3984375 46.4921875C10.01171875 46.728515625 9.775390625 46.685546875 9.345703125 46.212890625C9.001953125 45.869140625 9.001953125 45.611328125 9.28125 45.267578125L10.484375 43.35546875C9.646484375 42.1953125 8.916015625 40.94921875 8.3359375 39.66015625L6.080078125 39.74609375C5.5859375 39.767578125 5.4140625 39.638671875 5.263671875 39.166015625C5.048828125 38.671875 5.134765625 38.45703125 5.564453125 38.220703125L7.283203125 36.82421875C6.939453125 35.470703125 6.681640625 34.052734375 6.57421875 32.61328125L4.46875 31.92578125C3.974609375 31.75390625 3.845703125 31.58203125 3.845703125 31.087890625C3.845703125 30.59375 3.974609375 30.400390625 4.46875 30.25L6.57421875 29.5625C6.681640625 28.123046875 6.896484375 26.68359375 7.283203125 25.3515625L5.564453125 23.955078125C5.177734375 23.697265625 5.11328125 23.482421875 5.263671875 22.966796875C5.4140625 22.515625 5.5859375 22.365234375 6.080078125 22.408203125L8.3359375 22.515625C8.873046875 21.248046875 9.646484375 19.98046875 10.44140625 18.8203125L9.302734375 16.9296875C8.98046875 16.521484375 8.98046875 16.28515625 9.345703125 15.919921875C9.775390625 15.46875 10.01171875 15.404296875 10.3984375 15.662109375L12.41796875 16.5C13.40625 15.42578125 14.501953125 14.5234375 15.68359375 13.728515625L15.25390625 11.580078125C15.16796875 11.04296875 15.25390625 10.828125 15.640625 10.634765625C16.134765625 10.419921875 16.328125 10.44140625 16.671875 10.763671875L18.283203125 12.224609375C19.572265625 11.580078125 20.947265625 11.0859375 22.322265625 10.7421875L22.64453125 8.55078125C22.708984375 8.03515625 22.837890625 7.86328125 23.353515625 7.8203125C23.890625 7.755859375 24.10546875 7.86328125 24.27734375 8.25L25.330078125 10.248046875C25.99609375 10.140625 26.748046875 10.09765625 27.435546875 10.09765625ZM32.09765625 31.646484375C31.775390625 33.859375 29.841796875 35.599609375 27.5 35.599609375C26.876953125 35.599609375 26.318359375 35.470703125 25.78125 35.234375L17.982421875 48.619140625C20.775390625 50.14453125 23.998046875 51.00390625 27.435546875 51.00390625C38.28515625 51.00390625 46.8359375 42.5390625 47.115234375 31.646484375ZM7.798828125 31.087890625C7.798828125 38.263671875 11.38671875 44.47265625 16.865234375 47.953125L24.642578125 34.611328125C23.546875 33.7734375 22.837890625 32.419921875 22.837890625 30.9375C22.837890625 29.34765625 23.6328125 27.951171875 24.8359375 27.11328125L17.015625 14.09375C11.4296875 17.595703125 7.798828125 23.84765625 7.798828125 31.087890625ZM24.041015625 30.9375C24.041015625 32.828125 25.609375 34.353515625 27.5 34.353515625C29.369140625 34.353515625 30.9375 32.828125 30.9375 30.9375C30.9375 29.046875 29.369140625 27.478515625 27.5 27.478515625C25.609375 27.478515625 24.041015625 29.046875 24.041015625 30.9375ZM27.435546875 11.12890625C24.0625 11.12890625 20.904296875 11.966796875 18.1328125 13.44921875L25.974609375 26.51171875C26.447265625 26.361328125 26.94140625 26.275390625 27.5 26.275390625C29.94921875 26.275390625 31.8828125 28.080078125 32.119140625 30.421875L47.115234375 30.421875C46.771484375 19.572265625 38.2421875 11.12890625 27.435546875 11.12890625Z" transform="scale(1,-1) translate(0,-62.1328125)"/></svg>
  </div>

<script>
let allCues = [];
let currentFilter = 'ALL';
let searchQuery = '';
let showSceneContext = false;

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'f') {
      e.preventDefault();
      document.getElementById('searchBox').focus();
    } else if (e.key === 'r') {
      e.preventDefault();
      renumber();
    } else if (e.key === 'e') {
      e.preventDefault();
      exportToCSV();
    }
  }
});

const cueColors = {
  'SOUND': { border: '#3498db', bg: '#3498db40', text: '#5dade2' },
  'LIGHT': { border: '#f39c12', bg: '#f39c1240', text: '#f5b041' },
  'MUSIC': { border: '#e74c3c', bg: '#e74c3c40', text: '#ec7063' },
  'VIDEO': { border: '#9b59b6', bg: '#9b59b640', text: '#c39bd3' },
  'PROJECTION': { border: '#1abc9c', bg: '#1abc9c40', text: '#52be80' },
  'DEFAULT': { border: '#7f8c8d', bg: '#7f8c8d40', text: '#95a5a6' }
};

function getColorForType(type) {
  if (cueColors[type]) return cueColors[type];
  
  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = type.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const border = 'hsl(' + hue + ', 60%, 55%)';
  const bg = 'hsla(' + hue + ', 60%, 55%, 0.25)';
  const text = 'hsl(' + hue + ', 50%, 70%)';
  
  cueColors[type] = { border, bg, text };
  return cueColors[type];
}

function updateCueColors(preferences) {
  for (const type in preferences) {
    if (preferences[type] && preferences[type].color) {
      const border = preferences[type].color;
      cueColors[type] = {
        border: border,
        bg: border + '40',
        text: border
      };
    }
  }
}

function setCuesList(cues) {
  allCues = cues || [];
  updateTabs();
  displayCues();
}

function refreshDisplay() {
  updateTabs();
  updateRenumberButtonColor();
  displayCues();
}

function updateTabs() {
  const types = {};
  allCues.forEach(c => types[c.type] = (types[c.type] || 0) + 1);
  
  let html = '<button class="tab' + (currentFilter === 'ALL' ? ' active' : '') + '" onclick="filterTab(\\'ALL\\', event)">All<span class="badge">' + allCues.length + '</span></button>';
  Object.keys(types).sort().forEach(t => {
    html += '<button class="tab' + (currentFilter === t ? ' active' : '') + '" onclick="filterTab(\\'' + t + '\\', event)">' + t + '<span class="badge">' + types[t] + '</span></button>';
  });
  document.getElementById('tabs').innerHTML = html;
}

function updateRenumberButtonColor() {
  const btn = document.getElementById('renumberBtn');
  if (!btn) return;
  
  if (currentFilter === 'ALL') {
    btn.style.background = '';
    btn.style.borderColor = '';
  } else {
    const colors = getColorForType(currentFilter);
    btn.style.background = colors.border;
    btn.style.borderColor = colors.border;
  }
}

function filterTab(type, event) {
  currentFilter = type;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (event && event.target) {
    const target = event.target.closest('.tab');
    if (target) target.classList.add('active');
  }

  const btn = document.getElementById('renumberBtn');
  if (btn) {
    btn.textContent = type === 'ALL' ? 'Renumber All' : 'Renumber ' + type;
  }

  updateRenumberButtonColor();
  displayCues();
}

function searchCues(query) {
  searchQuery = query.toLowerCase();
  displayCues();
}

function displayCues() {
  let filtered = currentFilter === 'ALL' ? allCues : allCues.filter(c => c.type === currentFilter);
  
  if (searchQuery) {
    filtered = filtered.filter(c => 
      c.type.toLowerCase().includes(searchQuery) ||
      c.name.toLowerCase().includes(searchQuery) ||
      c.number.toString().includes(searchQuery)
    );
  }
  
  const list = document.getElementById('cueList');
  
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">No cues found</div>';
    return;
  }
  
  let html = '';
  filtered.forEach(c => {
    const name = String(c.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const scene = c.scene ? String(c.scene).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    const colors = getColorForType(c.type);
    
    html += '<div class="cue-item" onclick="goTo(' + c.lineIndex + ')">';
    html += '<div class="cue-number">#' + c.number + '</div>';
    html += '<div class="cue-type" style="background: ' + colors.bg + '; color: ' + colors.text + '; border: 0.5px solid ' + colors.border + '40">' + c.type + '</div>';
    html += '<div class="cue-name">' + name;
    if (scene && showSceneContext) {
      html += '<div class="cue-scene">' + scene + '</div>';
    }
    html += '</div>';
    html += '</div>';
  });
  list.innerHTML = html;
}

function showProgress() { 
  const overlay = document.getElementById('progressOverlay');
  if (overlay) overlay.classList.add('show'); 
  document.querySelectorAll('.btn').forEach(b => b.classList.add('processing'));
}

function hideProgress() { 
  const overlay = document.getElementById('progressOverlay');
  if (overlay) overlay.classList.remove('show'); 
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('processing'));
}

function toggleExportMenu() {
  const menu = document.getElementById('exportMenu');
  menu.classList.toggle('show');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.export-menu') && !e.target.closest('svg[onclick="toggleExportMenu()"]')) {
    const menu = document.getElementById('exportMenu');
    if (menu) menu.classList.remove('show');
  }
});

function renumber() { 
  showProgress(); 
  setTimeout(() => Beat.call((filter) => { Beat.custom.renumber(filter); }, currentFilter), 50);
}

function exportToCSV() { 
  document.getElementById('exportMenu').classList.remove('show');
  Beat.call((filter) => { Beat.custom.exportToCSV(filter); }, currentFilter);
}

function exportToHTML() {
  document.getElementById('exportMenu').classList.remove('show');
  Beat.call((filter) => { Beat.custom.exportToHTML(filter); }, currentFilter);
}

function exportToQLab() {
  document.getElementById('exportMenu').classList.remove('show');
  Beat.call((filter) => { Beat.custom.exportToAppleScript(filter); }, currentFilter);
}

function goTo(idx) { Beat.call((i) => { Beat.custom.goTo(i); }, idx); }
function openPreferences() { Beat.call(() => { Beat.custom.openPreferences(); }); }
function openManual() { Beat.call(() => { Beat.custom.openManual(); }); }
</script>
</body>
</html>`;

  try {
    htmlWindow = Beat.htmlWindow(html, 700, 600, function () {
      // Cleanup on window close
      if (changeTimer) {
        changeTimer.stop();
        changeTimer = null;
      }
      collectedCues = [];
      htmlWindow = null;
      Beat.end();
    });

    Beat.timer(0.3, function () {
      try {
        const prefsForWindow = JSON.stringify(cuePreferences);
        const escapedPrefs = escapeForJS(prefsForWindow);
        htmlWindow.runJS("updateCueColors(JSON.parse('" + escapedPrefs + "'))");
        updateCuesListInWindow(collectedCues);
      } catch (e) {
        Beat.log("Error initializing window: " + e);
      }
    });
  } catch (e) {
    Beat.log("Error creating window: " + e);
    Beat.alert("Error", "Failed to create QMan window: " + e.message);
  }
}

// ============================================================================
// CUE OPERATIONS
// ============================================================================

/**
 * Renumbers cues based on the current filter
 * @param {string} filterType - Type filter ('ALL' or specific cue type)
 */
Beat.custom.renumber = function (filterType) {
  try {
    const pattern =
      /^(!?)([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)$/;
    const noteCuePattern =
      /^\[\[\s*(!?)([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)\s*\]\]$/;

    // Filter cues based on selected tab
    const cuesToRenumber =
      filterType === "ALL"
        ? collectedCues
        : collectedCues.filter(function (c) {
            return c.type === filterType;
          });

    if (cuesToRenumber.length === 0) {
      htmlWindow.runJS("hideProgress()");
      Beat.log("No cues to renumber");
      return;
    }

    // Process in reverse order to avoid position shifts
    const lines = Beat.lines();
    for (let i = cuesToRenumber.length - 1; i >= 0; i--) {
      const cueNumber = i + 1; // Sequential numbering: 1, 2, 3...

      // Find the line at this position
      for (const line of lines) {
        if (line.position === cuesToRenumber[i].lineIndex) {
          const rawLine = line.string;
          const lineString = rawLine.trim();
          const match = lineString.match(pattern);
          const wrappedMatch = lineString.match(noteCuePattern);

          let newLine = null;

          if (match) {
            // Unwrapped cue - preserve ! prefix if present
            const forceAction = match[1];
            const cueType = match[2];
            const description = match[4];
            newLine =
              forceAction +
              cueType +
              " (cue " +
              cueNumber +
              "): " +
              description;
          } else if (wrappedMatch) {
            // Wrapped cue - maintain the [[ ]] wrapper and preserve ! prefix
            const forceAction = wrappedMatch[1];
            const cueType = wrappedMatch[2];
            const description = wrappedMatch[4];
            newLine =
              "[[" +
              forceAction +
              cueType +
              " (cue " +
              cueNumber +
              "): " +
              description +
              "]]";
          }

          if (newLine !== null) {
            // Determine replacement length including the line break.
            let lineLength;
            if (line && line.range && line.range.length) {
              lineLength = line.range.length;
            } else {
              const idx = lines.findIndex((l) => l.position === line.position);
              if (idx >= 0 && idx < lines.length - 1) {
                lineLength = lines[idx + 1].position - line.position;
              } else {
                lineLength = rawLine.length;
              }
            }

            // Preserve original line ending (if any) by reading from document text
            let lineEnding = "";
            try {
              const docText = Beat.getText();
              const start = line.position + rawLine.length;
              if (start < docText.length) {
                const end = Math.min(
                  line.position + lineLength,
                  docText.length
                );
                lineEnding = docText.substring(start, end);
              }
            } catch (e) {
              lineEnding = "";
            }

            const replacement = newLine + lineEnding;
            Beat.replaceRange(line.position, lineLength, replacement);
          }
          break;
        }
      }
    }

    // Refresh cue list
    const result = detectAndCollectCues();
    collectedCues = result.allCues;
    updateCuesListInWindow(collectedCues);

    if (htmlWindow) {
      htmlWindow.runJS("hideProgress()");
    }

    Beat.log("Renumbered " + cuesToRenumber.length + " cues");
  } catch (e) {
    Beat.log("Error during renumbering: " + e);
    if (htmlWindow) {
      htmlWindow.runJS("hideProgress()");
    }
    Beat.alert("Error", "Failed to renumber cues: " + e.message);
  }
};

/**
 * Scrolls to a cue in the document
 * @param {number} lineIndex - Line position to scroll to
 */
Beat.custom.goTo = function (lineIndex) {
  try {
    // Set selection first so the editor focuses the line, then scroll.
    try {
      if (typeof Beat.setSelectedRange === "function") {
        Beat.setSelectedRange(lineIndex, 0);
      }
    } catch (e) {}

    if (typeof Beat.timer === "function") {
      // schedule small timer to allow editor layout to settle
      try {
        Beat.timer(0.02, function () {
          try {
            Beat.scrollTo(lineIndex);
          } catch (e) {}
          try {
            Beat.timer(0.06, function () {
              try {
                Beat.scrollTo(lineIndex);
              } catch (e) {}
            });
          } catch (e) {}
        });
      } catch (e) {
        try {
          Beat.scrollTo(lineIndex);
        } catch (e) {}
      }
    } else {
      try {
        Beat.scrollTo(lineIndex);
      } catch (e) {}
      try {
        setTimeout(function () {
          try {
            Beat.scrollTo(lineIndex);
          } catch (e) {}
        }, 80);
      } catch (e) {}
    }
  } catch (e) {
    Beat.log("Error scrolling to cue: " + e);
  }
};

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Exports cues to CSV format
 * @param {string} filterType - Type filter for export
 */
Beat.custom.exportToCSV = function (filterType) {
  try {
    if (collectedCues.length === 0) {
      Beat.alert("No Cues", "No cues found to export.");
      return;
    }

    let cuesToExport =
      filterType === "ALL"
        ? collectedCues
        : collectedCues.filter(function (c) {
            return c.type === filterType;
          });

    if (cuesToExport.length === 0) {
      Beat.alert("No Cues", "No cues found in the selected filter.");
      return;
    }

    Beat.saveFile("csv", function (filePath) {
      if (!filePath) return;

      try {
        // Create CSV content with proper escaping
        let csvContent = "Number,Type,Note\n";

        cuesToExport.forEach(function (cue) {
          const number = String(cue.number).replace(/"/g, '""');
          const type = String(cue.type).replace(/"/g, '""');
          const note = String(cue.name).replace(/"/g, '""');

          csvContent += '"' + number + '","' + type + '","' + note + '"\n';
        });

        Beat.writeToFile(filePath, csvContent);
        const filterMsg =
          filterType === "ALL" ? "All cues" : filterType + " cues";
        Beat.alert(
          "Export Complete",
          filterMsg + " (" + cuesToExport.length + ") exported to " + filePath
        );
      } catch (e) {
        Beat.log("Error writing CSV: " + e);
        Beat.alert("Error", "Failed to write CSV file: " + e.message);
      }
    });
  } catch (e) {
    Beat.log("Error exporting to CSV: " + e);
    Beat.alert("Error", "Failed to export to CSV: " + e.message);
  }
};

/**
 * Exports cues to HTML format
 * @param {string} filterType - Type filter for export
 */
Beat.custom.exportToHTML = function (filterType) {
  try {
    if (collectedCues.length === 0) {
      Beat.alert("No Cues", "No cues found to export.");
      return;
    }

    let cuesToExport =
      filterType === "ALL"
        ? collectedCues
        : collectedCues.filter(function (c) {
            return c.type === filterType;
          });

    if (cuesToExport.length === 0) {
      Beat.alert("No Cues", "No cues found in the selected filter.");
      return;
    }

    Beat.saveFile("html", function (filePath) {
      if (!filePath) return;

      try {
        let htmlContent =
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QMan Cue List</title>';
        htmlContent +=
          "<style>body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5;}";
        htmlContent +=
          "h1{color:#333;}table{width:100%;border-collapse:collapse;background:white;box-shadow:0 2px 4px rgba(0,0,0,0.1);}";
        htmlContent +=
          "th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd;}";
        htmlContent += "th{background:#007acc;color:white;font-weight:600;}";
        htmlContent += "tr:hover{background:#f9f9f9;}";
        htmlContent +=
          ".cue-type{display:inline-block;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;}";
        htmlContent += "</style></head><body>";
        htmlContent += "<h1>QMan Cue List</h1>";
        htmlContent +=
          "<table><thead><tr><th>Number</th><th>Type</th><th>Note</th></tr></thead><tbody>";

        cuesToExport.forEach(function (cue) {
          const number = escapeHTML(String(cue.number));
          const type = escapeHTML(String(cue.type));
          const note = escapeHTML(String(cue.name));

          htmlContent +=
            "<tr><td>" +
            number +
            '</td><td><span class="cue-type">' +
            type +
            "</span></td><td>" +
            note +
            "</td></tr>";
        });

        htmlContent += "</tbody></table></body></html>";

        Beat.writeToFile(filePath, htmlContent);
        const filterMsg =
          filterType === "ALL" ? "All cues" : filterType + " cues";
        Beat.alert(
          "Export Complete",
          filterMsg + " (" + cuesToExport.length + ") exported to " + filePath
        );
      } catch (e) {
        Beat.log("Error writing HTML: " + e);
        Beat.alert("Error", "Failed to write HTML file: " + e.message);
      }
    });
  } catch (e) {
    Beat.log("Error exporting to HTML: " + e);
    Beat.alert("Error", "Failed to export to HTML: " + e.message);
  }
};

/**
 * Exports cues to QLab AppleScript format
 * @param {string} filterType - Type filter for export
 */
Beat.custom.exportToAppleScript = function (filterType) {
  try {
    if (collectedCues.length === 0) {
      Beat.alert("No Cues", "No cues found to export.");
      return;
    }

    let cuesToExport =
      filterType === "ALL"
        ? collectedCues
        : collectedCues.filter(function (c) {
            return c.type === filterType;
          });

    if (cuesToExport.length === 0) {
      Beat.alert("No Cues", "No cues found in the selected filter.");
      return;
    }

    Beat.saveFile("scpt", function (filePath) {
      if (!filePath) return;

      try {
        // Map cue types to QLab cue types
        function getQLabCueType(cueOrType) {
          // Accept either a cue object or a cue type string
          let cueType = null;
          let cueText = null;
          if (typeof cueOrType === "string") {
            cueType = cueOrType;
          } else if (cueOrType && typeof cueOrType === "object") {
            cueType = cueOrType.type;
            cueText = String(cueOrType.name || "").toLowerCase();
          }

          // If the cue text explicitly contains stop/fade variants, prefer QLab Fade type
          if (
            cueText &&
            /\b(?:stop|fade(?:-?in|-?out)?|fadein|fadeout|fade\s+in|fade\s+out|crossfade)\b/.test(
              cueText
            )
          ) {
            return "Fade";
          }

          const mapping = {
            SOUND: "Audio",
            MUSIC: "Audio",
            VIDEO: "Video",
            LIGHT: "Light",
            PROJECTION: "Video",
          };
          return mapping[cueType] || "Memo";
        }

        // Generate AppleScript
        let scriptContent = "-- QMan to QLab Import Script\n";
        scriptContent += "-- Generated: " + new Date().toLocaleString() + "\n";
        scriptContent += "-- Cue Type Filter: " + filterType + "\n\n";
        scriptContent += 'tell application "QLab"\n';
        scriptContent += "\tactivate\n";
        scriptContent += "\ttell front workspace\n";
        scriptContent += "\t\t-- Create cues\n";

        cuesToExport.forEach(function (cue) {
          const qLabType = getQLabCueType(cue);
          const cueNumber = String(cue.number)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"');
          const cueName = String(cue.name)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"');
          const notes =
            "Type: " +
            cue.type +
            (cue.scene
              ? " | Scene: " +
                String(cue.scene).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
              : "");

          scriptContent += '\t\tmake type "' + qLabType + '"\n';
          scriptContent +=
            '\t\tset q number of last item of (selected as list) to "' +
            cueNumber +
            '"\n';
          scriptContent +=
            '\t\tset q name of last item of (selected as list) to "' +
            cueName +
            '"\n';
          scriptContent +=
            '\t\tset notes of last item of (selected as list) to "' +
            notes +
            '"\n';
        });

        scriptContent += "\tend tell\n";
        scriptContent += "end tell\n\n";
        scriptContent +=
          "-- Import complete: " + cuesToExport.length + " cues created\n";
        scriptContent +=
          'display notification "' +
          cuesToExport.length +
          ' cues imported to QLab" with title "QMan Export"';

        Beat.writeToFile(filePath, scriptContent);
        const filterMsg =
          filterType === "ALL" ? "All cues" : filterType + " cues";
        Beat.alert(
          "Export Complete",
          filterMsg +
            " (" +
            cuesToExport.length +
            ") exported to " +
            filePath +
            "\n\nTo import into QLab:\n1. Make sure QLab is running\n2. Double-click the .scpt file\n3. Or open in Script Editor and click Run"
        );
      } catch (e) {
        Beat.log("Error writing AppleScript: " + e);
        Beat.alert("Error", "Failed to write AppleScript file: " + e.message);
      }
    });
  } catch (e) {
    Beat.log("Error exporting to AppleScript: " + e);
    Beat.alert("Error", "Failed to export to AppleScript: " + e.message);
  }
};

/**
 * Opens the plugin README/manual in a new HTML window
 */
Beat.custom.openManual = function () {
  try {
    // Load README.html bundled with the plugin
    const manualHtml = Beat.assetAsString("README.html");
    if (!manualHtml) {
      Beat.alert("Error", "Manual not found in plugin assets (README.html).");
      return;
    }

    // Open a resizable window for the manual
    let manualWindow = null;
    try {
      manualWindow = Beat.htmlWindow(manualHtml, 700, 560, function () {
        // noop on close
      });
    } catch (e) {
      Beat.log("Error creating manual window: " + e);
      // Fallback: try smaller size
      try {
        manualWindow = Beat.htmlWindow(manualHtml, 600, 480);
      } catch (e2) {
        Beat.alert("Error", "Failed to open manual window: " + e2.message);
      }
    }
  } catch (e) {
    Beat.log("openManual error: " + e);
    Beat.alert("Error", "Failed to open manual: " + e.message);
  }
};

// ============================================================================
// DOCUMENT CHANGE LISTENER
// ============================================================================

/**
 * Sets up listener for document changes with debouncing
 */
function setupDocumentChangeListener() {
  Beat.onTextChange(function () {
    if (changeTimer) {
      changeTimer.stop();
    }

    changeTimer = Beat.timer(1.5, function () {
      try {
        if (htmlWindow) {
          const result = detectAndCollectCues();
          collectedCues = result.allCues;
          updateCuesListInWindow(collectedCues);
          applyHighlighting();
        }
      } catch (e) {
        Beat.log("Error in document change handler: " + e);
      } finally {
        changeTimer = null;
      }
    });
  });
}

// ============================================================================
// HIGHLIGHTING
// ============================================================================

/**
 * Applies highlighting to cues in the document based on preferences
 */

// Compute a readable foreground color (black or white) for a given background hex
function readableTextColor(hex) {
  try {
    if (!hex) return "#000000";
    hex = String(hex).replace("#", "").trim();
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map(function (c) {
          return c + c;
        })
        .join("");
    }
    if (hex.length !== 6) return "#000000";
    var r = parseInt(hex.substr(0, 2), 16) / 255;
    var g = parseInt(hex.substr(2, 2), 16) / 255;
    var b = parseInt(hex.substr(4, 2), 16) / 255;
    // Relative luminance
    var L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Threshold chosen for readable contrast; return black for light backgrounds
    return L > 0.6 ? "#000000" : "#FFFFFF";
  } catch (e) {
    return "#000000";
  }
}

function applyHighlighting() {
  try {
    // Temporarily disable text change listener to avoid infinite loop
    Beat.onTextChangeDisabled = true;

    // Clear all existing highlighting
    const text = Beat.getText();
    if (text && text.length > 0) {
      Beat.reformatRange(0, text.length);
    }

    // Check if highlighting is enabled
    const shouldHighlight =
      cuePreferences.globalHighlight ||
      Object.keys(cuePreferences).some(function (key) {
        return cuePreferences[key] && cuePreferences[key].highlight;
      });

    if (shouldHighlight) {
      const cuePattern =
        /^!?([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)$/;
      const noteCuePattern =
        /^\[\[\s*!?([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)\s*\]\]$/;

      // Cache lines to avoid repeated API calls
      const lines = Beat.lines();

      collectedCues.forEach(function (cue) {
        const prefs = cuePreferences[cue.type];
        if (prefs && prefs.highlight && prefs.color) {
          // Find the line and highlight just the cue type name
          for (const line of lines) {
            if (line.position === cue.lineIndex) {
              const lineString = line.string.trim();
              const match = lineString.match(cuePattern);
              const wrappedMatch = lineString.match(noteCuePattern);

              if (match) {
                // Unwrapped cue
                const cueTypeName = match[1];
                const cueTypeLength = cueTypeName.length;
                const offset = line.string.indexOf(cueTypeName);
                if (offset >= 0) {
                  Beat.textBackgroundHighlight(
                    prefs.color,
                    line.position + offset,
                    cueTypeLength
                  );
                  try {
                    var fg = readableTextColor(prefs.color);
                    if (typeof Beat.textHighlight === "function") {
                      Beat.textHighlight(
                        fg,
                        line.position + offset,
                        cueTypeLength
                      );
                    }
                  } catch (e) {
                    // ignore if textHighlight is not supported
                  }
                }
              } else if (wrappedMatch) {
                // Wrapped cue
                const cueTypeName = wrappedMatch[1];
                const cueTypeLength = cueTypeName.length;
                const offset = line.string.indexOf(cueTypeName);
                if (offset >= 0) {
                  Beat.textBackgroundHighlight(
                    prefs.color,
                    line.position + offset,
                    cueTypeLength
                  );
                  try {
                    var fg = readableTextColor(prefs.color);
                    if (typeof Beat.textHighlight === "function") {
                      Beat.textHighlight(
                        fg,
                        line.position + offset,
                        cueTypeLength
                      );
                    }
                  } catch (e) {
                    // ignore if textHighlight is not supported
                  }
                }
              }
              break;
            }
          }
        }
      });
    }
  } catch (e) {
    Beat.log("Error applying highlighting: " + e);
  } finally {
    // Re-enable text change listener
    Beat.onTextChangeDisabled = false;
    // Force a small scroll to current selection to trigger editor redraw (fixes stale rendering on some Beat builds)
    try {
      if (
        typeof Beat.selectedRange === "function" &&
        typeof Beat.scrollTo === "function"
      ) {
        const sel = Beat.selectedRange();
        const loc = sel && typeof sel.location === "number" ? sel.location : 0;
        // Use a tiny timer to avoid interfering with immediate text-change handling
        try {
          Beat.timer(0.05, function () {
            try {
              Beat.scrollTo(loc);
            } catch (e) {
              /* ignore */
            }
          });
        } catch (e) {
          // fallback to immediate scroll if timer unavailable
          try {
            Beat.scrollTo(loc);
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }
}

// ============================================================================
// PREFERENCES WINDOW
// ============================================================================

/**
 * Creates the preferences window
 */
function createPreferencesWindow() {
  try {
    // Get currently detected cue types from document
    const result = detectAndCollectCues();
    const detectedTypes = result.detectedTypes;

    // Build JSON for detected types with default colors
    const typesWithDefaults = {};
    detectedTypes.forEach(function (type) {
      typesWithDefaults[type] = getDefaultColorForType(type);
    });

    const detectedTypesJson = escapeForJS(JSON.stringify(detectedTypes));
    const defaultColorsJson = escapeForJS(JSON.stringify(typesWithDefaults));
    const currentPrefsJson = escapeForJS(JSON.stringify(cuePreferences));
    const currentTheme = cuePreferences.theme || "system";

    const html = `<!DOCTYPE html>
<html data-theme="${currentTheme}">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

/* Dark theme (default) */
:root, [data-theme="dark"] {
  --bg-primary: #1c1c1e;
  --bg-secondary: rgba(255,255,255,0.05);
  --bg-hover: rgba(255,255,255,0.08);
  --border-color: rgba(255,255,255,0.1);
  --border-subtle: rgba(255,255,255,0.08);
  --text-primary: #fff;
  --text-secondary: rgba(255,255,255,0.85);
  --text-tertiary: rgba(255,255,255,0.7);
  --text-muted: rgba(255,255,255,0.4);
  --shadow: rgba(0,0,0,0.2);
  --scrollbar: rgba(255,255,255,0.2);
  --scrollbar-hover: rgba(255,255,255,0.3);
  --accent-color: #0a84ff;
}

/* Light theme */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: rgba(0,0,0,0.04);
  --bg-hover: rgba(0,0,0,0.08);
  --bg-tertiary: rgba(0,0,0,0.02);
  --border-color: rgba(0,0,0,0.15);
  --border-subtle: rgba(0,0,0,0.08);
  --text-primary: #000000;
  --text-secondary: rgba(0,0,0,0.85);
  --text-tertiary: rgba(0,0,0,0.65);
  --text-muted: rgba(0,0,0,0.45);
  --shadow: rgba(0,0,0,0.12);
  --shadow-strong: rgba(0,0,0,0.2);
  --scrollbar: rgba(0,0,0,0.25);
  --scrollbar-hover: rgba(0,0,0,0.35);
  --accent-color: #007aff;
  --separator: rgba(0,0,0,0.1);
}

/* System theme detection */
@media (prefers-color-scheme: light) {
  [data-theme="system"] {
    --bg-primary: #ffffff;
    --bg-secondary: rgba(0,0,0,0.04);
    --bg-hover: rgba(0,0,0,0.08);
    --bg-tertiary: rgba(0,0,0,0.02);
    --border-color: rgba(0,0,0,0.15);
    --border-subtle: rgba(0,0,0,0.08);
    --text-primary: #000000;
    --text-secondary: rgba(0,0,0,0.85);
    --text-tertiary: rgba(0,0,0,0.65);
    --text-muted: rgba(0,0,0,0.45);
    --shadow: rgba(0,0,0,0.12);
    --shadow-strong: rgba(0,0,0,0.2);
    --scrollbar: rgba(0,0,0,0.25);
    --scrollbar-hover: rgba(0,0,0,0.35);
    --accent-color: #007aff;
    --separator: rgba(0,0,0,0.1);
  }
}

@media (prefers-color-scheme: dark) {
  [data-theme="system"] {
    --bg-primary: #1e1e1e;
    --bg-secondary: rgba(255,255,255,0.08);
    --bg-hover: rgba(255,255,255,0.12);
    --bg-tertiary: rgba(255,255,255,0.04);
    --border-color: rgba(255,255,255,0.15);
    --border-subtle: rgba(255,255,255,0.08);
    --text-primary: #ffffff;
    --text-secondary: rgba(255,255,255,0.85);
    --text-tertiary: rgba(255,255,255,0.65);
    --text-muted: rgba(255,255,255,0.45);
    --shadow: rgba(0,0,0,0.3);
    --shadow-strong: rgba(0,0,0,0.5);
    --scrollbar: rgba(255,255,255,0.25);
    --scrollbar-hover: rgba(255,255,255,0.35);
    --accent-color: #0a84ff;
    --separator: rgba(255,255,255,0.1);
  }
}

body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif; background: var(--bg-primary); color: var(--text-primary); display: flex; flex-direction: column; height: 100vh; margin: 0; padding: 0; overflow: hidden; transition: background 0.25s ease, color 0.25s ease; -webkit-font-smoothing: antialiased; }
.header-section { flex-shrink: 0; background: var(--bg-primary); padding: 16px 20px 12px 20px; border-bottom: 0.5px solid var(--separator, var(--border-color)); backdrop-filter: saturate(180%) blur(20px); }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 16px; letter-spacing: -0.4px; color: var(--text-primary); }
.content-wrapper { flex: 1; padding: 16px 20px 20px 20px; overflow-y: auto; overflow-x: hidden; min-height: 0; }
.content-wrapper::-webkit-scrollbar { width: 10px; }
.content-wrapper::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
.content-wrapper::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 10px; border: 2px solid var(--bg-primary); }
.content-wrapper::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-hover); }
.section { margin-bottom: 24px; }
.cue-types-list { display: flex; flex-direction: column; gap: 8px; padding-bottom: 10px; }
.cue-type-item { background: var(--bg-secondary); border: 0.5px solid var(--border-subtle); border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: row; align-items: center; gap: 14px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); min-height: 48px; }
.cue-type-item:hover { background: var(--bg-hover); border-color: var(--border-color); }
.cue-type-name { flex: 1; font-weight: 500; font-size: 13px; letter-spacing: -0.15px; min-width: 0; color: var(--text-primary); }
.color-picker-wrapper { display: flex; align-items: center; flex-shrink: 0; }
.color-picker { width: 30px; height: 30px; border: 0.5px solid var(--border-color); border-radius: 6px; cursor: pointer; background: transparent; padding: 0; box-shadow: 0 2px 6px var(--shadow); transition: all 0.2s ease; }
.color-picker:hover { transform: scale(1.05); box-shadow: 0 3px 10px var(--shadow); }
.color-picker::-webkit-color-swatch-wrapper { padding: 2px; }
.color-picker::-webkit-color-swatch { border: none; border-radius: 4px; }
.toggle-wrapper { display: flex; flex-direction: column; align-items: center; gap: 3px; flex-shrink: 0; min-width: 48px; }
.toggle { position: relative; width: 40px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(120,120,128,0.32); transition: .25s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 24px; }
.toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .25s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 50%; box-shadow: 0 2px 4px var(--shadow); }
.toggle input:checked + .toggle-slider { background-color: var(--accent-color); }
.toggle input:checked + .toggle-slider:before { transform: translateX(16px); }
.toggle-label { font-size: 10px; color: var(--text-muted); font-weight: 500; letter-spacing: 0.1px; text-transform: uppercase; text-align: center; }
.global-settings-plate { background: var(--bg-secondary); border: 0.5px solid var(--border-subtle); border-radius: 10px; overflow: hidden; margin-bottom: 16px; }
.global-toggle { padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s ease; border-bottom: 0.5px solid var(--border-subtle); }
.global-toggle:last-child { border-bottom: none; }
.global-toggle:hover { background: var(--bg-hover); }
.global-toggle-label { font-weight: 500; font-size: 13px; letter-spacing: -0.15px; color: var(--text-primary); }
.theme-selector { display: flex; gap: 6px; }
.theme-btn { padding: 6px 14px; background: var(--bg-tertiary, var(--bg-secondary)); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); color: var(--text-secondary); }
.theme-btn:hover { background: var(--bg-hover); border-color: var(--accent-color); transform: scale(1.02); }
.theme-btn.active { background: var(--accent-color); border-color: var(--accent-color); color: white; }
.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 13px; }
.progress-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 200; align-items: center; justify-content: center; backdrop-filter: saturate(180%) blur(20px); }
.progress-overlay.show { display: flex; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.progress-message { background: var(--accent-color); color: white; padding: 16px 28px; border-radius: 10px; font-size: 14px; font-weight: 500; box-shadow: 0 10px 40px rgba(10,132,255,0.5); animation: pulse 1.5s ease-in-out infinite; letter-spacing: -0.2px; }
@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.02); opacity: 1; } }
</style>
</head>
<body>
<div class="progress-overlay" id="progressOverlay">
  <div class="progress-message" id="progressMessage">Processing...</div>
</div>

<div class="header-section">
  <h1>Settings</h1>
  <div class="global-settings-plate">
    <div class="global-toggle">
      <span class="global-toggle-label">Theme</span>
      <div class="theme-selector">
        <button class="theme-btn" id="theme-system" onclick="setTheme('system')">System</button>
        <button class="theme-btn" id="theme-light" onclick="setTheme('light')">Light</button>
        <button class="theme-btn" id="theme-dark" onclick="setTheme('dark')">Dark</button>
      </div>
    </div>
    <div class="global-toggle">
      <span class="global-toggle-label">Highlight All Cues</span>
      <label class="toggle">
        <input type="checkbox" id="globalHighlight" onchange="toggleGlobalHighlight(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="global-toggle">
      <span class="global-toggle-label">Hide All Cues</span>
      <label class="toggle">
        <input type="checkbox" id="globalHide" onchange="toggleGlobalHide(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="global-toggle">
      <span class="global-toggle-label">Show Scene Context</span>
      <label class="toggle">
        <input type="checkbox" id="showSceneContext" onchange="toggleSceneContext(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>
</div>

<div class="content-wrapper">
  <div class="cue-types-list" id="cueTypesList"></div>
</div>

<script>
let prefs = JSON.parse('${currentPrefsJson}');
let detectedTypes = JSON.parse('${detectedTypesJson}');
let defaultColors = JSON.parse('${defaultColorsJson}');

function setTheme(theme) {
  prefs.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  
  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('theme-' + theme).classList.add('active');
  
  Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), false);
}

function init() {
  const currentTheme = prefs.theme || 'system';
  document.getElementById('theme-' + currentTheme).classList.add('active');
  
  const globalCheckbox = document.getElementById('globalHighlight');
  if (globalCheckbox && prefs.globalHighlight !== undefined) {
    globalCheckbox.checked = prefs.globalHighlight;
  }
  
  const globalHideCheckbox = document.getElementById('globalHide');
  if (globalHideCheckbox && prefs.globalHide !== undefined) {
    globalHideCheckbox.checked = prefs.globalHide;
  }
  
  const sceneContextCheckbox = document.getElementById('showSceneContext');
  if (sceneContextCheckbox) {
    sceneContextCheckbox.checked = prefs.showSceneContext !== undefined ? prefs.showSceneContext : false;
  }
  
  renderCueTypes();
}

function renderCueTypes() {
  const list = document.getElementById('cueTypesList');
  
  if (detectedTypes.length === 0) {
    list.innerHTML = '<div class="empty">No cues detected in the document</div>';
    return;
  }
  
  let html = '';
  detectedTypes.sort().forEach(type => {
    const color = (prefs[type] && prefs[type].color) || defaultColors[type] || '#7f8c8d';
    const highlight = prefs[type] && prefs[type].highlight !== undefined ? prefs[type].highlight : false;
    const hide = prefs[type] && prefs[type].hide !== undefined ? prefs[type].hide : false;
    html += '<div class="cue-type-item">';
    html += '<div class="cue-type-name">' + type + '</div>';
    html += '<div class="color-picker-wrapper">';
    html += '<input type="color" class="color-picker" value="' + color + '" onchange="updateColor(\\'' + type + '\\', this.value)" />';
    html += '</div>';
    html += '<div class="toggle-wrapper">';
    html += '<label class="toggle">';
    html += '<input type="checkbox" ' + (highlight ? 'checked' : '') + ' onchange="toggleHighlight(\\'' + type + '\\', this.checked)">';
    html += '<span class="toggle-slider"></span>';
    html += '</label>';
    html += '<span class="toggle-label">Highlight</span>';
    html += '</div>';
    html += '<div class="toggle-wrapper">';
    html += '<label class="toggle">';
    html += '<input type="checkbox" ' + (hide ? 'checked' : '') + ' onchange="toggleHide(\\'' + type + '\\', this.checked)">';
    html += '<span class="toggle-slider"></span>';
    html += '</label>';
    html += '<span class="toggle-label">Hide</span>';
    html += '</div>';
    html += '</div>';
  });
  list.innerHTML = html;
}

function updateColor(type, color) {
  if (!prefs[type]) prefs[type] = {};
  prefs[type].color = color;
  prefs[type].enabled = true;
  renderCueTypes();
  
  Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), false);
}

function toggleHighlight(type, enabled) {
  if (!prefs[type]) prefs[type] = {};
  prefs[type].highlight = enabled;
  
  Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), false);
}

function toggleGlobalHighlight(enabled) {
  prefs.globalHighlight = enabled;
  detectedTypes.forEach(type => {
    if (!prefs[type]) prefs[type] = {};
    prefs[type].highlight = enabled;
  });
  renderCueTypes();
  
  Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), false);
}

function toggleHide(type, enabled) {
  if (!prefs[type]) prefs[type] = {};
  prefs[type].hide = enabled;
  
  showProgress('Processing...');
  setTimeout(function() {
    Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), true);
  }, 50);
}

function toggleGlobalHide(enabled) {
  prefs.globalHide = enabled;
  detectedTypes.forEach(type => {
    if (!prefs[type]) prefs[type] = {};
    prefs[type].hide = enabled;
  });
  renderCueTypes();
  
  showProgress('Processing...');
  setTimeout(function() {
    Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), true);
  }, 50);
}

function toggleSceneContext(enabled) {
  prefs.showSceneContext = enabled;
  Beat.call((prefsJson, checkHide) => { Beat.custom.applyPreferences(prefsJson, checkHide); }, JSON.stringify(prefs), false);
}

function showProgress(message) {
  const overlay = document.getElementById('progressOverlay');
  const messageEl = document.getElementById('progressMessage');
  if (messageEl) messageEl.textContent = message || 'Processing...';
  if (overlay) overlay.classList.add('show');
}

function hideProgress() {
  const overlay = document.getElementById('progressOverlay');
  if (overlay) overlay.classList.remove('show');
}

init();
</script>
</body>
</html>`;

    prefsWindow = Beat.htmlWindow(html, 600, 500, function () {
      prefsWindow = null;
    });
  } catch (e) {
    Beat.log("Error creating preferences window: " + e);
    Beat.alert("Error", "Failed to open preferences: " + e.message);
  }
}

/**
 * Opens the preferences window
 */
Beat.custom.openPreferences = function () {
  if (prefsWindow) return; // Already open
  createPreferencesWindow();
};

/**
 * Closes the preferences window
 */
Beat.custom.closePreferences = function () {
  if (prefsWindow) {
    prefsWindow.close();
    prefsWindow = null;
  }
};

/**
 * Gets current preferences
 * @returns {Object} Current preferences object
 */
Beat.custom.getPreferences = function () {
  return cuePreferences;
};

/**
 * Applies preferences with optional hide change checking
 * @param {string} prefsJson - JSON string of preferences
 * @param {boolean} checkHideChanges - Whether to check for hide setting changes
 */
Beat.custom.applyPreferences = function (prefsJson, checkHideChanges) {
  try {
    const oldPrefs = JSON.parse(JSON.stringify(cuePreferences));
    const newPrefs = safeJSONParse(prefsJson);

    if (!newPrefs || !validatePreferences(newPrefs)) {
      Beat.log("Invalid preferences received");
      if (prefsWindow) {
        prefsWindow.runJS("hideProgress()");
      }
      return;
    }

    cuePreferences = newPrefs;
    savePreferences();

    // Check if any hide settings changed
    let hideChanged = false;
    if (checkHideChanges) {
      for (const type in cuePreferences) {
        if (
          type === "globalHighlight" ||
          type === "globalHide" ||
          type === "theme" ||
          type === "showSceneContext"
        )
          continue;

        const oldHide = oldPrefs[type] && oldPrefs[type].hide;
        const newHide = cuePreferences[type] && cuePreferences[type].hide;
        if (oldHide !== newHide) {
          hideChanged = true;
          break;
        }
      }
    }

    // Wrap or unwrap cues if hide settings changed
    if (hideChanged) {
      wrapUnwrapCuesByType(oldPrefs, cuePreferences);
    }

    // Apply highlighting
    applyHighlighting();

    // Refresh main window
    if (htmlWindow) {
      const prefsForWindow = JSON.stringify(cuePreferences);
      const escapedPrefs = escapeForJS(prefsForWindow);
      htmlWindow.runJS("updateCueColors(JSON.parse('" + escapedPrefs + "'))");

      const showScene =
        cuePreferences.showSceneContext !== undefined
          ? cuePreferences.showSceneContext
          : false;
      htmlWindow.runJS("showSceneContext = " + showScene);
      htmlWindow.runJS("refreshDisplay()");

      const newTheme = cuePreferences.theme || "system";
      htmlWindow.runJS(
        "document.documentElement.setAttribute('data-theme', '" +
          newTheme +
          "')"
      );
    }

    // Hide progress indicator
    if (prefsWindow) {
      prefsWindow.runJS("hideProgress()");
    }
  } catch (e) {
    Beat.log("Error applying preferences: " + e);
    if (prefsWindow) {
      prefsWindow.runJS("hideProgress()");
    }
    Beat.alert("Error", "Failed to apply preferences: " + e.message);
  }
};

/**
 * Wraps or unwraps cues based on hide preference changes
 * @param {Object} oldPrefs - Previous preferences
 * @param {Object} newPrefs - New preferences
 */
function wrapUnwrapCuesByType(oldPrefs, newPrefs) {
  try {
    Beat.onTextChangeDisabled = true;

    const cuePattern =
      /^!?([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)$/;
    const noteCuePattern =
      /^\[\[\s*!?([A-Z][A-Z0-9]*)\s*(?:\((?:cue\s+)?(\d+)\))?\s*:\s*(.*)\s*\]\]$/;

    const lines = Beat.lines();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const rawLine = line.string;
      const lineString = rawLine.trim();

      // Skip empty lines
      if (!lineString) continue;

      const match = lineString.match(cuePattern);
      const wrappedMatch = lineString.match(noteCuePattern);

      if (match || wrappedMatch) {
        const cueType = match ? match[1] : wrappedMatch[1];

        // Validate cue type
        if (cueType !== cueType.toUpperCase() || /[a-z]/.test(cueType))
          continue;

        const oldHide = oldPrefs[cueType] && oldPrefs[cueType].hide;
        const newHide = newPrefs[cueType] && newPrefs[cueType].hide;

        // If hide setting changed for this type
        if (oldHide !== newHide) {
          if (newHide && match && !wrappedMatch) {
            // Wrap: Add [[ ]] if not already wrapped
            const newString = "[[" + lineString + "]]";
            let lineLength;
            if (line && line.range && line.range.length) {
              lineLength = line.range.length;
            } else {
              const idx = lines.findIndex((l) => l.position === line.position);
              if (idx >= 0 && idx < lines.length - 1) {
                lineLength = lines[idx + 1].position - line.position;
              } else {
                lineLength = rawLine.length;
              }
            }

            let lineEnding = "";
            try {
              const docText = Beat.getText();
              const start = line.position + rawLine.length;
              if (start < docText.length) {
                const end = Math.min(
                  line.position + lineLength,
                  docText.length
                );
                lineEnding = docText.substring(start, end);
              }
            } catch (e) {
              lineEnding = "";
            }

            Beat.replaceRange(
              line.position,
              lineLength,
              newString + lineEnding
            );
          } else if (!newHide && wrappedMatch) {
            // Unwrap: Remove [[ ]] if wrapped
            const unwrapped = lineString
              .substring(2, lineString.length - 2)
              .trim();
            let lineLength;
            if (line && line.range && line.range.length) {
              lineLength = line.range.length;
            } else {
              const idx = lines.findIndex((l) => l.position === line.position);
              if (idx >= 0 && idx < lines.length - 1) {
                lineLength = lines[idx + 1].position - line.position;
              } else {
                lineLength = rawLine.length;
              }
            }

            let lineEnding = "";
            try {
              const docText = Beat.getText();
              const start = line.position + rawLine.length;
              if (start < docText.length) {
                const end = Math.min(
                  line.position + lineLength,
                  docText.length
                );
                lineEnding = docText.substring(start, end);
              }
            } catch (e) {
              lineEnding = "";
            }

            Beat.replaceRange(
              line.position,
              lineLength,
              unwrapped + lineEnding
            );
          }
        }
      }
    }

    // Refresh cue list after wrapping/unwrapping
    const result = detectAndCollectCues();
    collectedCues = result.allCues;
    updateCuesListInWindow(collectedCues);
  } catch (e) {
    Beat.log("Error wrapping/unwrapping cues: " + e);
    Beat.alert("Error", "Failed to update cue visibility: " + e.message);
  } finally {
    Beat.onTextChangeDisabled = false;
  }
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

/**
 * Main entry point for the plugin
 */
function main() {
  try {
    Beat.log("=== QMan Starting v1.2.0 ===");

    // Load preferences first
    loadPreferences();

    // Detect and collect cues
    const result = detectAndCollectCues();
    collectedCues = result.allCues;
    Beat.log(
      "Found " +
        collectedCues.length +
        " cues in " +
        result.detectedTypes.length +
        " types"
    );

    // Create main window
    createWindow(result.detectedTypes);

    // Setup document change listener
    setupDocumentChangeListener();

    // Apply highlighting on initial load
    Beat.timer(0.5, function () {
      try {
        applyHighlighting();
        Beat.log("Initial highlighting applied");

        // Force a small focus/scroll to ensure the script window repaints on startup
        try {
          if (typeof Beat.selectedRange === "function") {
            const sel = Beat.selectedRange();
            const loc =
              sel && typeof sel.location === "number" ? sel.location : 0;
            try {
              if (typeof Beat.setSelectedRange === "function") {
                Beat.setSelectedRange(loc, 0);
              }
            } catch (e) {}
            try {
              if (typeof Beat.timer === "function") {
                Beat.timer(0.02, function () {
                  try {
                    Beat.scrollTo(loc);
                  } catch (e) {}
                  try {
                    Beat.timer(0.06, function () {
                      try {
                        Beat.scrollTo(loc);
                      } catch (e) {}
                    });
                  } catch (e) {}
                });
              } else {
                try {
                  Beat.scrollTo(loc);
                } catch (e) {}
                try {
                  setTimeout(function () {
                    try {
                      Beat.scrollTo(loc);
                    } catch (e) {}
                  }, 80);
                } catch (e) {}
              }
            } catch (e) {}
          }
        } catch (e) {}
      } catch (e) {
        Beat.log("Error applying initial highlighting: " + e);
      }
    });

    Beat.log("=== QMan initialized successfully ===");
  } catch (e) {
    Beat.log("=== QMan failed to start: " + e + " ===");
    Beat.alert("Error", "Failed to start QMan: " + e.message);
  }
}

// Start the plugin
main();
