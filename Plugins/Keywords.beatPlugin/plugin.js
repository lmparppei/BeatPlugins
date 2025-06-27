/*
Title: Keywords
Copyright: Bode Pickman
<Description>
Organize your ideas and easily navigate to specific notes in your document using hashtags (like #theme or #plot). It creates a clickable list of keywords so you can jump to them quickly, making it easier to organize, structure, and navigate your document.
Add a hashtag to any inline note: [[This will create a #tag]]
<br><br>

The Notes + Synopsis tab pulls every inline note, synopsis, omitted text, and Notepad entry into a searchable, filterable list. You can toggle which types to show, mark items as completed (striking them out), and click any entry to jump to its location in your document.<br><br>


Use `---` to group lines in Notepad or BONEYARD blocks. Everything between `---` markers is displayed as a single entry in the plugin. Ungrouped lines will appear as individual entries.

For example, this in the Notepad or the Boneyard:
<br>
---
<br>
Line 1.
<br> 
<br>  
Line 2.  
<br>
<br> 
Line 3.
<br>
---
<br>
…will appear as one grouped entry in the Notes + Synopsis list.
</Description>

Image: Keywords.png
Version: 2.2
*/

// --- Global plugin state --- //

// Dictionary: tagName -> array of occurrences
// Each occurrence = { lineIndex, absPos, matchLen, color, special }
let tagsByName = {};

// Flat list of all occurrences for easy removal of highlights
let allOccurrences = [];

// Remembers which occurrence index we’re currently on for each tag
let occurrenceIndex = {};

// Per-tag color dictionary, persisted in user defaults.
let tagColors = Beat.getUserDefault("tagColors") || {};

// Lightweight inline markdown parser for bold, italic, underline, code, and headers (h1-h3 only)
// Process input line by line to ensure headers only apply to lines starting with #, and do not affect surrounding lines.
function parseInlineMarkdown(text) {
  const lines = text.split("<br>");
  const parsedLines = lines.map(line => {
    if (/^###\s?[^\n#]/.test(line)) return line.replace(/^###\s?/, '<h3>') + '</h3>';
    if (/^##\s?[^\n#]/.test(line)) return line.replace(/^##\s?/, '<h2>') + '</h2>';
    if (/^#\s?[^\n#]/.test(line)) return line.replace(/^#\s?/, '<h1>') + '</h1>';
    return line;
  });
  const joined = parsedLines.join("<br>");
  return joined
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

// Array of favorite tag names, persisted in document-specific settings.
let favoriteTags = Beat.getDocumentSetting("favoriteTags") || [];

// Variables to track the tag being colored & the popup location
let activeTooltipTag = null;
let tagNameForColorPicker = null;
let colorPopupX = 0;
let colorPopupY = 0;

// Timer to refresh the tags
let timer = null;

// Reference to plugin window
let myWindow = null;
let isPluginVisible = true;

// Theme mode: "light", "dark", or "system" (default uses system preference)
let themeMode = Beat.getUserDefault("themePreference") || "system";

// --- Notes/Synopsis global state ---
// Initialize filter and tab preferences from persistent document settings
let activeTab = Beat.getDocumentSetting("activeTab") || 'keywords';
let showNotes = Beat.getDocumentSetting("showNotes");
if (showNotes === undefined) showNotes = true;
let showSynopsis = Beat.getDocumentSetting("showSynopsis");
if (showSynopsis === undefined) showSynopsis = true;
let showCompleted = Beat.getDocumentSetting("showCompleted");
if (showCompleted === undefined) showCompleted = true;
let showOmitted = Beat.getDocumentSetting("showOmitted");
if (showOmitted === undefined) showOmitted = true;
let showNotepad = Beat.getDocumentSetting("showNotepad");
if (showNotepad === undefined) showNotepad = true;
let notesAndSynopsis = [];
// Set of dismissed notes/synopsis entry keys (type:absPos)
let savedDismissed = Beat.getDocumentSetting("dismissedEntries") || [];
let dismissedEntries = new Set(savedDismissed);

/**
 * Darkens a given hex color by a specified factor (0.0 to 1.0).
 */
function darkenHexColor(hex, factor = 0.2) {
  hex = hex.replace(/^#/, "");
  let r = parseInt(hex.substr(0, 2), 16);
  let g = parseInt(hex.substr(2, 2), 16);
  let b = parseInt(hex.substr(4, 2), 16);

  r = Math.floor(r * (1 - factor));
  g = Math.floor(g * (1 - factor));
  b = Math.floor(b * (1 - factor));

  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);

  const newR = r.toString(16).padStart(2, "0");
  const newG = g.toString(16).padStart(2, "0");
  const newB = b.toString(16).padStart(2, "0");
  return `#${newR}${newG}${newB}`;
}

/**
 * Returns a contrasting text color (black or white) based on the brightness of the given hex color.
 */
function getContrastColor(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000' : '#fff';
}

/**
 * FLASH HIGHLIGHT FUNCTION
 * -------------------------
 * Alternates between applying a highlight and reformatting the range.
 * When cycles === 1, leaves the highlight visible.
 */
function flashHighlight(color, start, length, cycles) {
  if (cycles <= 0) return;
  if (cycles === 1) {
    Beat.textBackgroundHighlight(color, start, length);
    return;
  }
  Beat.textBackgroundHighlight(color, start, length);
  Beat.timer(0.25, function() {
    Beat.reformatRange(start, length);
    Beat.timer(0.25, function() {
      flashHighlight(color, start, length, cycles - 1);
    });
  });
}

/**
 * Blink a text range by alternating highlight on and off.
 * @param {number} start - Start position
 * @param {number} length - Length of range
 * @param {string} color - Highlight color
 * @param {number} numberOfTimes - Number of blinks (on/off pairs)
 * @param {number} interval - Interval in seconds between blinks
 * @param {boolean} persistent - If true, do not reformat (remove) highlight at end (for persistent highlights, e.g. keywords)
 */
function blinkRange(start, length, color, numberOfTimes, interval, persistent = false){
  let remove = false;

  doBlink();

  function doBlink(){
    if(remove) {
      if (!persistent) {
        Beat.reformatRange(start, length);
      }
      numberOfTimes--;
    } else {
      Beat.textBackgroundHighlight(color, start, length);
    }

    remove = !remove;

    if(numberOfTimes){
      Beat.timer(interval, doBlink);
    }
  }
}

/**
 * Plugin methods callable from HTML.
 */
Beat.custom = {
  refreshUI() {
    tagsByName = {};
    allOccurrences = [];
    occurrenceIndex = {};
    removeAllHighlights();
    gatherAllTags();
    gatherNotepadNotes();
    for (let i = favoriteTags.length - 1; i >= 0; i--) {
      const ftag = favoriteTags[i];
      if (!tagsByName[ftag]) {
        favoriteTags.splice(i, 1);
      }
    }
    Beat.setDocumentSetting("favoriteTags", favoriteTags);
    updateWindowUI();
  },

  scrollToNextOccurrence(tagName) {
    if (!tagsByName[tagName] || !tagsByName[tagName].length) return;
    if (occurrenceIndex[tagName] == null) {
      occurrenceIndex[tagName] = 0;
    }
    const occurrences = tagsByName[tagName];
    const index = occurrenceIndex[tagName] % occurrences.length;
    const occ = occurrences[index];
    const lines = Beat.lines();
    if (occ.lineIndex < lines.length) {
      Beat.scrollTo(lines[occ.lineIndex].position);
    }
    occurrenceIndex[tagName]++;
    // Trigger the blinking effect for this occurrence.
    flashHighlight(occ.color, occ.absPos, occ.matchLen, 3);
    updateWindowUI();
  },

  // Left-click: jump to next occurrence and persist tooltip until mouse leaves.
  handlePillClick(tagName) {
    activeTooltipTag = tagName;
    updateWindowUI();
    Beat.custom.scrollToNextOccurrence(tagName);
  },

  // Right-click: show color picker popup at mouse coordinates.
  handleTagRightClick(tagName, x, y) {
    tagNameForColorPicker = tagName;
    colorPopupX = x;
    colorPopupY = y;
    updateWindowUI();
  },

  finalizeTagColor(newColor) {
    if (!tagNameForColorPicker) return;
    tagColors[tagNameForColorPicker] = newColor;
    Beat.setUserDefault("tagColors", tagColors);
    removeAllHighlights();
    reapplyAllHighlights();
    tagNameForColorPicker = null;
    updateWindowUI();
  },

  previewTagColor(newColor) {
    if (!tagNameForColorPicker) return;
    tagColors[tagNameForColorPicker] = newColor;
    removeAllHighlights();
    reapplyAllHighlights();
  },

  onPillMouseLeave(tagName) {
    if (activeTooltipTag === tagName) {
      activeTooltipTag = null;
      updateWindowUI();
    }
  },

  dropToFavorites(tagName) {
    if (!favoriteTags.includes(tagName)) {
      favoriteTags.push(tagName);
      Beat.setDocumentSetting("favoriteTags", favoriteTags);
      updateWindowUI();
    }
  },

  dropToOthers(tagName) {
    const idx = favoriteTags.indexOf(tagName);
    if (idx >= 0) {
      favoriteTags.splice(idx, 1);
      Beat.setDocumentSetting("favoriteTags", favoriteTags);
      updateWindowUI();
    }
  },

  switchTab(tab) {
    activeTab = tab;
    if (tab === 'keywords') {
      reapplyAllHighlights();
    }
    Beat.setDocumentSetting("activeTab", tab);
    updateWindowUI();
  },

  toggleFilter(type) {
    if (type === 'notes') {
      showNotes = !showNotes;
      Beat.setDocumentSetting("showNotes", showNotes);
    }
    if (type === 'synopsis') {
      showSynopsis = !showSynopsis;
      Beat.setDocumentSetting("showSynopsis", showSynopsis);
    }
    if (type === 'omitted') {
      showOmitted = !showOmitted;
      Beat.setDocumentSetting("showOmitted", showOmitted);
    }
    if (type === 'notepad') {
      showNotepad = !showNotepad;
      Beat.setDocumentSetting("showNotepad", showNotepad);
    }
    updateWindowUI();
  },

  toggleShowCompleted() {
    showCompleted = !showCompleted;
    Beat.setDocumentSetting("showCompleted", showCompleted);
    updateWindowUI();
  },

  toggleTheme() {
    isDarkTheme = !isDarkTheme;
    Beat.setUserDefault("themePreference", isDarkTheme);
    updateWindowUI();
  },
  toggleDismissed(key) {
    if (dismissedEntries.has(key)) {
      dismissedEntries.delete(key);
    } else {
      dismissedEntries.add(key);
    }
    Beat.setDocumentSetting("dismissedEntries", Array.from(dismissedEntries));
    updateWindowUI();
  },
  scrollToMetaEntry(posStr) {
    const position = parseInt(posStr, 10);
    if (isNaN(position)) return;

    const lines = Beat.lines();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = line.position;
      const lineEnd = i < lines.length - 1 ? lines[i + 1].position : Infinity;

      if (position >= lineStart && position < lineEnd) {
        // Use line length minus 1 to avoid overlapping into next KW
        const rangeLength = Math.max(1, line.string.length - 1);
        blinkRange(lineStart, rangeLength, "#aad8ff", 3, 0.25, false);
        Beat.scrollTo(lineStart);
        // No Beat.reformatRange here to avoid interfering with persistent highlights
        break;
      }
    }
  },
  setLightMode() {
    themeMode = "light";
    Beat.setUserDefault("themePreference", themeMode);
    updateWindowUI();
  },
  setDarkMode() {
    themeMode = "dark";
    Beat.setUserDefault("themePreference", themeMode);
    updateWindowUI();
  },
  setSystemMode() {
    themeMode = "system";
    Beat.setUserDefault("themePreference", themeMode);
    updateWindowUI();
  },
};

function main() {
  gatherAllTags();
  gatherNotepadNotes();

  // --- Listen for Notepad changes and refresh UI in real time ---
  Beat.onNotepadChange(() => {
    Beat.custom.refreshUI();
  });

  if (!Object.keys(tagsByName).length) {
    Beat.alert("No Tags Found", "Try adding a hashtag within an inline note (e.g., [[This is a #tag]]).");
    Beat.end();
    return;
  }

  Beat.onTextChange(() => {
    timer?.stop();
    timer = Beat.timer(1.5, () => {
      Beat.custom.refreshUI();
    });
  });

  const ui = buildUIHtml();
  myWindow = Beat.htmlWindow(ui, 600, 500, onWindowClosed);

  // Disable maximize, full-screen, and minimize immediately
  myWindow.disableMaximize = true;
  myWindow.disableFullScreen = true;
  myWindow.disableMinimize = true;

  centerWindow(myWindow);
}

function gatherNotepadNotes() {
  // Remove any prior Notepad-based entries to prevent duplication or stale dismissal states
  notesAndSynopsis = notesAndSynopsis.filter(entry => !entry.key?.startsWith("notepad:"));

  const np = Beat.notepad?.string || '';
  if (!np) return;

  const lines = np.split(/\n/);
  let notes = [];
  let block = '';
  let blockStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      if (block.trim() !== '') {
        notes.push({ block, startIndex: blockStartIndex });
        block = '';
      }
      continue;
    }

    if (block === '') {
      blockStartIndex = i;
      block = line;
    } else {
      block += '\n' + line;
    }
  }

  if (block.trim() !== '') {
    notes.push({ block, startIndex: blockStartIndex });
  }

  for (let j = 0; j < notes.length; j++) {
    const { block, startIndex } = notes[j];
    const absPos = 90000000 + j;
    const key = `notepad:${j}`;
    notesAndSynopsis.push({
      type: 'note',
      content: block
        .split('\n')
        .filter(l => l.trim() !== '---')
        .join('<br>')
        .trim(),
      absPos,
      lineIndex: startIndex,
      key
    });
  }
}

function onWindowClosed() {
  removeAllHighlights();
  Beat.end();
}

/**
 * Gather all tags from the document.
 */
function gatherAllTags() {
  const regexNote = /\[\[(.*?)\]\]/g;
  const regexHash = /#([\p{L}\p{N}\p{Emoji_Presentation}\p{M}]+)/gu;
  const lines = Beat.lines();
  // Gather tags
  for (let i = 0; i < lines.length; i++) {
    const lineObj = lines[i];
    let noteMatch;
    while ((noteMatch = regexNote.exec(lineObj.string)) !== null) {
      const noteContent = noteMatch[1];
      let hashMatch;
      while ((hashMatch = regexHash.exec(noteContent)) !== null) {
        const tagName = hashMatch[1];
        if (/^[a-fA-F0-9]{6}$/.test(tagName)) continue;
        const absPos = lineObj.position + noteMatch.index + 2 + hashMatch.index;
        const matchLen = hashMatch[0].length;
        if (!alreadyHaveOccurrence(absPos, matchLen)) {
          addOccurrence(tagName, i, absPos, matchLen);
        }
      }
      const specialRegex = /^\s*(beat|storyline)\b\s*[:]?\s+(.*)$/i;
      const specialMatch = noteContent.match(specialRegex);
      if (specialMatch) {
        const tName = specialMatch[2].trim();
        const offsetInNote = noteContent.indexOf(tName);
        const absPos = lineObj.position + noteMatch.index + 2 + offsetInNote;
        const matchLen = tName.length;
        if (!alreadyHaveOccurrence(absPos, matchLen)) {
          addOccurrence(tName, i, absPos, matchLen, true);
        }
      }
    }
  }
  // Gather notes and synopsis lines
  notesAndSynopsis = [];
  for (let i = 0; i < lines.length; i++) {
    const lineObj = lines[i];
    const line = lineObj.string;
    let noteMatch;
    while ((noteMatch = regexNote.exec(line)) !== null) {
      const content = noteMatch[1];
      // Filter out hex color codes like #377BCD
      if (/^#[a-fA-F0-9]{6}$/.test(content.trim())) continue;
      const absPos = lineObj.position + noteMatch.index;
      // Skip if the entire inline note content is a hashtag (for Notes/Synopsis tab)
      const trimmed = content.trim();
      if (!/^#([\p{L}\p{N}\p{Emoji_Presentation}\p{M}]+)$/u.test(trimmed)) {
        notesAndSynopsis.push({ type: 'note', content, absPos, lineIndex: i });
      }
    }
    // Inserted logic to rename manual page breaks
    if (line.trim().toLowerCase() === "manual page break") {
      notesAndSynopsis.push({ type: 'synopsis', content: '**Forced Page Break**', absPos: lineObj.position, lineIndex: i });
      continue;
    }
    // Omitted scene block detection: treat all /* ... */ blocks as omitted scenes
    if (line.includes("/*")) {
      let j = i;
      let blockLines = [line];
      let foundEnd = line.includes("*/");

      while (!foundEnd && j + 1 < lines.length) {
        j++;
        blockLines.push(lines[j].string);
        if (lines[j].string.includes("*/")) {
          foundEnd = true;
        }
      }

      const fullBlock = blockLines.join("\n").trim();

      const previewText = fullBlock
        .replace(/^\/\*/, "")
        .replace(/\*\/$/, "")
        .trim()
        .slice(0, 100);

      notesAndSynopsis.push({
        type: 'omitted',
        content: '**Omitted Scene:** ' + previewText,
        absPos: lineObj.position,
        lineIndex: i,
        key: `omitted:${i}`
      });

      i = j; // Skip to the end of the omitted block
      continue;
    }
    const synMatch = line.match(/^=\s?(.*)/);
    // Detect BONEYARD block
    if (line.trim().toUpperCase().startsWith("#BONEYARD")) {
      let j = i + 1;
      let insideBlock = false;
      let block = '';
      let blockStartIndex = j;
      let blockStartPos = lines[j]?.position || 0;
      // --- Start of new grouping logic ---
      let ungrouped = '';
      let ungroupedStartIndex = null;
      let ungroupedStartPos = null;

      function pushBlock() {
        if (block.trim() !== '') {
          const cleaned = block
            .split('\n')
            .filter(l => l.trim() !== '---')
            .join('\n')
            .trim();

          notesAndSynopsis.push({
            type: 'omitted',
            content: cleaned
              .slice(0, 300)
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br>'),
            absPos: blockStartPos,
            lineIndex: blockStartIndex,
            key: `boneyard:${blockStartIndex}`
          });
          block = '';
        }
      }

      while (j < lines.length) {
        const lineStr = lines[j].string;
        const trimmed = lineStr.trim();

        if (trimmed.startsWith("#") && !trimmed.startsWith("##")) break; // Stop at next top-level header

        if (trimmed === "---") {
          if (insideBlock) {
            block += lineStr + '\n';
            pushBlock();
            insideBlock = false;
          } else {
            insideBlock = true;
            blockStartIndex = j;
            blockStartPos = lines[j].position;
            block = lineStr + '\n';
          }
          // If we encounter --- and there is accumulated ungrouped, push it
          if (ungrouped !== '') {
            notesAndSynopsis.push({
              type: 'omitted',
              content: ungrouped.trim().slice(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
              absPos: ungroupedStartPos,
              lineIndex: ungroupedStartIndex,
              key: `boneyard:${ungroupedStartIndex}`
            });
            ungrouped = '';
          }
        } else if (insideBlock) {
          block += lineStr + '\n';
        } else if (
          trimmed !== '' &&
          !trimmed.startsWith("##") &&
          !/^[=@]/.test(trimmed)
        ) {
          // Group consecutive non-blank, non-##, non-meta lines until blank line
          if (ungrouped === '') {
            ungroupedStartIndex = j;
            ungroupedStartPos = lines[j].position;
          }
          ungrouped += lineStr + '\n';
        } else if (ungrouped !== '') {
          // On blank or meta line, push accumulated ungrouped
          notesAndSynopsis.push({
            type: 'omitted',
            content: ungrouped.trim().slice(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
            absPos: ungroupedStartPos,
            lineIndex: ungroupedStartIndex,
            key: `boneyard:${ungroupedStartIndex}`
          });
          ungrouped = '';
        }

        j++;
      }

      // After the loop, push any remaining ungrouped content
      if (ungrouped !== '') {
        notesAndSynopsis.push({
          type: 'omitted',
          content: ungrouped.trim().slice(0, 300).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
          absPos: ungroupedStartPos,
          lineIndex: ungroupedStartIndex,
          key: `boneyard:${ungroupedStartIndex}`
        });
      }

      pushBlock();
      continue;
    }
    if (synMatch) {
      let content = synMatch[1];
      if (content.trim() === "==") content = "*Forced Page Break*";
      // Filter out hex color codes like #377BCD
      if (/^#[a-fA-F0-9]{6}$/.test(content.trim())) continue;
      const absPos = lineObj.position + line.indexOf('=');
      notesAndSynopsis.push({ type: 'synopsis', content, absPos, lineIndex: i });
    }
  }
}

function addOccurrence(tagName, lineIndex, absPos, matchLen, special = false) {
  const color = pickColorForTag(tagName);
  Beat.textBackgroundHighlight(color, absPos, matchLen);
  const occurrence = { tag: tagName, lineIndex, absPos, matchLen, color, special };
  if (!tagsByName[tagName]) {
    tagsByName[tagName] = [];
  }
  tagsByName[tagName].push(occurrence);
  allOccurrences.push(occurrence);
}

function alreadyHaveOccurrence(absPos, matchLen) {
  return allOccurrences.some(o => o.absPos === absPos && o.matchLen === matchLen);
}

/**
 * Return the assigned color for a tag or a fallback if not set.
 */
function pickColorForTag(tagName) {
  if (tagColors[tagName]) return tagColors[tagName];
  return "#687d9d";
}

/**
 * Reapply highlights using updated tagColors.
 */
function reapplyAllHighlights() {
  for (const occ of allOccurrences) {
    const color = pickColorForTag(occ.tag);
    Beat.textBackgroundHighlight(color, occ.absPos, occ.matchLen);
    occ.color = color;
  }
}

/// HTML UI

function buildUIHtml() {
  let popupStyle = "display:none;";
  let colorInputValue = "#fefbc0";
  if (tagNameForColorPicker) {
    popupStyle = `
      display:block;
      position:absolute;
      top:${colorPopupY}px;
      left:${colorPopupX}px;
      background:#444;
      padding:8px;
      border-radius:8px;
      z-index:999;
    `;
    colorInputValue = pickColorForTag(tagNameForColorPicker);
  }

  // --- CSS variable theme block ---
  let css;
  if (themeMode === "system") {
    css = `
    :root {
      --bodyBg: #fff;
      --bodyColor: #000;
      --headerColor: #666;
      --helpBg: #f1f1f1;
      --helpColor: #000;
      --searchBg: #fff;
      --searchColor: #000;
      --searchBorder: #ccc;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bodyBg: #333;
        --bodyColor: #fff;
        --headerColor: #ccc;
        --helpBg: #222;
        --helpColor: #fff;
        --searchBg: #222;
        --searchColor: #eee;
        --searchBorder: #555;
      }
    }`;
  } else if (themeMode === "light") {
    css = `
    :root {
      --bodyBg: #fff;
      --bodyColor: #000;
      --headerColor: #666;
      --helpBg: #f1f1f1;
      --helpColor: #000;
      --searchBg: #fff;
      --searchColor: #000;
      --searchBorder: #ccc;
    }`;
  } else {
    css = `
    :root {
      --bodyBg: #333;
      --bodyColor: #fff;
      --headerColor: #ccc;
      --helpBg: #222;
      --helpColor: #fff;
      --searchBg: #222;
      --searchColor: #eee;
      --searchBorder: #555;
    }`;
  }

  let html = `
<html>
<head>
  <style>
    ${css}
    #noteSearchInput {
      width: 100%;
      padding: 6px 10px;
      font-size: 0.95em;
      border-radius: 6px;
      border: 1px solid var(--searchBorder, #ccc);
      background-color: var(--searchBg, #fff);
      color: var(--searchColor, #000);
    }
    html, body {
      margin: 0;
      padding: 5px;
      background: var(--bodyBg);
      color: var(--bodyColor);
      font-family: sans-serif;
      min-height: 100vh;
    }
    h1 {
      margin: 0.4em 0 0.2em 0;
      font-size: 2em;
      font-weight: bold;
    }
    h2 {
      margin: 0.35em 0 0.2em 0;
      font-size: 1.5em;
      font-weight: bold;
    }
    h3 {
      margin: 0.3em 0 0.2em 0;
      font-size: 1em;
      font-weight: bold;
    }
    .container {
      margin-bottom: 1em;
      min-height: 50px;
      border: 2px dashed #555;
      padding: 8px;
      border-radius: 6px;
    }
    .container.drag-over {
      border-color: #bbb;
    }
    .tag-pill {
      display: inline-block;
      margin: 4px 6px 4px 0;
      cursor: pointer;
      padding: 3px 8px;
      border-radius: 20px;
      font-size: 0.9em;
      user-select: none;
      position: relative;
    }
    .tooltip {
      display: none;
      position: absolute;
      bottom: -24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.8em;
      white-space: nowrap;
      z-index: 100;
    }
    .tag-pill:hover .tooltip, .tag-pill.active .tooltip {
      display: block;
    }
    #helpIcon {
      position: fixed;
      bottom: 10px;
      left: 10px;
      cursor: pointer;
      font-size: 1.5em;
      color: #aaa;
      z-index: 1002;
    }
    #helpPopover {
      display: none;
      position: fixed;
      bottom: 40px;
      left: 10px;
      background: var(--helpBg);
      color: var(--helpColor);
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
      z-index: 1001;
      max-width: 300px;
      font-size: 0.9em;
      line-height: 1.4em;
    }
    #helpPopover button {
      margin-top: 10px;
      display: block;
    }
    #themeTabs {
      position: fixed;
      bottom: 10px;
      right: 5px;
      width: auto;
      text-align: right;
      z-index: 1002;
    }
    .themeTab {
      margin: 0 2px;
      cursor: pointer;
      padding: 2px 8px;
      font-size: 0.8em;
      background: transparent;
      color: var(--helpColor);
      border-bottom: 1px solid transparent;
      user-select: none;
      opacity: 0.6;
    }
    .themeTab.active {
      border-bottom: 2px solid var(--headerColor);
      color: var(--headerColor);
      opacity: 1;
    }
    .tab-bar {
      margin-bottom: 10px;
      text-align: left;
    }
    .meta-block {
      background: var(--helpBg);
      color: var(--bodyColor);
      padding: 6px 10px;
      border-radius: 6px;
      margin: 6px 0;
      font-size: 0.95em;
      word-break: break-word;
    }
    .filter-toggles {
      margin-bottom: 10px;
    }
    .filter-toggles label {
      margin-right: 18px;
      font-size: 0.98em;
      cursor: pointer;
    }
  </style>
  <script>
    function finalizeColorButtonClick() {
      var val = document.getElementById('colorPickerInput').value;
      Beat.call('Beat.custom.finalizeTagColor(\'' + val + '\')');
    }
  </script>
</head>
<body>
  <div class="tab-bar">
    <button class="themeTab ${activeTab==='keywords'?'active':''}" onclick="Beat.call('Beat.custom.switchTab(\\'keywords\\')')">Keywords</button>
    <button class="themeTab ${activeTab==='notes'?'active':''}" onclick="Beat.call('Beat.custom.switchTab(\\'notes\\')')">Notes + Synopsis</button>
  </div>
`;

  // --- Tabbed UI: Notes/Synopsis ---
  if (activeTab === 'notes') {
    // Add the search input field above the filter-toggles block
    html += `
      <div style="margin-bottom: 10px;">
        <input type="text" id="noteSearchInput" placeholder="Search notes and synopsis..." 
               oninput="window.filterNotes(this.value)">
      </div>
      <div class="filter-toggles">
        <label><input type="checkbox" ${showNotes ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'notes\\')')"> Notes</label>
        <label><input type="checkbox" ${showNotepad ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'notepad\\')')"> Notepad</label>
        <label><input type="checkbox" ${showSynopsis ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'synopsis\\')')"> Synopsis</label>
        <label><input type="checkbox" ${showOmitted ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'omitted\\')')"> Omits</label>
        <label><input type="checkbox" ${showCompleted ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleShowCompleted()')"> Show completed</label>
      </div>
    `;
    // Helper: render inline hashtags as pills, but only for [[#tag]] syntax
    function renderInlineTags(text) {
      // Match only [[#tag]] syntax
      const regex = /\[\[#([\p{L}\p{N}\p{Emoji_Presentation}\p{M}]+)\]\]/gu;
      return text.replace(regex, (matchedText, tagName) => {
        if (/^[a-fA-F0-9]{6}$/.test(tagName)) return matchedText;
        const color = pickColorForTag(tagName);
        return `<span class="tag-pill" style="background-color:${color}; color:#fff; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:0 2px;">#${tagName}</span>`;
      });
    }
    let notepadNoteIndex = 0;
    for (const [index, entry] of notesAndSynopsis.entries()) {
      const entryKey = entry.key || (entry.type + ':' + entry.absPos);
      const isOmitted = entry.type === 'omitted';
      const isNotepadNote = (
        entry.type === 'note' &&
        (entry.lineIndex === undefined || entry.absPos >= 90000000 || entry.key?.startsWith('notepad:')) &&
        (entry.sceneIndex === undefined && entry.range === undefined)
      );
      if (
        (
          (entry.type === 'note' && ((isNotepadNote && showNotepad) || (!isNotepadNote && showNotes))) ||
          (entry.type === 'synopsis' && showSynopsis) ||
          (entry.type === 'omitted' && showOmitted)
        ) &&
        (showCompleted || !dismissedEntries.has(entryKey)) &&
        (showOmitted || !isOmitted)
      ) {
        const isDismissed = dismissedEntries.has(entryKey);
        const checked = isDismissed ? 'checked' : '';
        const style = isDismissed ? 'text-decoration: line-through; opacity: 0.5;' : '';
        // Combine inline tags and markdown (tags first, then markdown)
        let parsed = renderInlineTags(entry.content);
        parsed = parseInlineMarkdown(parsed);
        if (isNotepadNote) {
          const hintId = `hint-${notepadNoteIndex++}`;
          html += `
            <div class="meta-block" style="display: flex; align-items: center; cursor: pointer;" onclick="(function(el){ el.style.display='block'; setTimeout(() => el.style.display='none', 2000); })(document.getElementById('${hintId}'))">
              <input type="checkbox" ${checked} onclick="event.stopPropagation(); Beat.call('Beat.custom.toggleDismissed(\\'${entryKey}\\')')" style="margin-right: 8px;">
              <span style="${style}">${parsed}</span>
              <div id="${hintId}" class="note-hint" style="display:none; margin-left:8px; color:#888; font-size:0.85em; font-style:italic; user-select:none; margin-top:4px;">Note in Notepad</div>
            </div>
          `;
        } else {
          html += `
            <div class="meta-block" style="display: flex; align-items: center;">
              <input type="checkbox" ${checked} onclick="Beat.call('Beat.custom.toggleDismissed(\\'${entryKey}\\')')" style="margin-right: 8px;">
              <span style="cursor:pointer; ${style}" onclick="Beat.call('Beat.custom.scrollToMetaEntry(\\'${entry.absPos}\\')')">${parsed}</span>
            </div>
          `;
        }
      }
    }
    // Add the filterNotes script at the end of the HTML, before </body>
    html += `
<style>
  .note-hint {
    margin-left: 8px;
    color: #888;
    font-size: 0.85em;
    font-style: italic;
    user-select: none;
    transition: display 0.2s;
  }
</style>
<script>
  window.filterNotes = function(query) {
    const blocks = document.querySelectorAll('.meta-block');
    query = query.toLowerCase();
    blocks.forEach(block => {
      const text = block.innerText.toLowerCase();
      block.style.display = text.includes(query) ? 'flex' : 'none';
    });
  }
</script>
</body></html>
`;
    return html;
  }

  // --- Keyword search input above Favorites ---
  html += `
  <div style="margin-bottom: 10px;">
    <input type="text" id="keywordSearchInput" placeholder="Search keywords..." 
           oninput="window.filterKeywords(this.value)"
           style="width: 100%; padding: 6px 10px; font-size: 0.95em; border-radius: 6px; border: 1px solid var(--searchBorder, #ccc); background-color: var(--searchBg, #fff); color: var(--searchColor, #000);">
  </div>
  <h2>Favorites</h2>
  <div id="favoritesContainer" class="container"
       ondragover="event.preventDefault(); this.classList.add('drag-over');"
       ondragleave="this.classList.remove('drag-over');"
       ondrop="(function(e){ e.preventDefault(); this.classList.remove('drag-over'); var tag = e.dataTransfer.getData('text/plain'); Beat.call('Beat.custom.dropToFavorites(\\'' + tag + '\\')'); }).call(this, event)">
  `;
  
  for (const ftag of favoriteTags) {
    const occurrences = tagsByName[ftag] || [];
    const isSpecial = occurrences.some(o => o.special === true);
    const color = pickColorForTag(ftag);
    const borderColor = darkenHexColor(color, 0.2);
    const total = occurrences.length;
    const pos = (occurrenceIndex[ftag] != null ? (occurrenceIndex[ftag] % total) : 0) + 1;
    const pillClass = (activeTooltipTag === ftag) ? "tag-pill active" : "tag-pill";
    let pillStyle;
    if (isSpecial) {
      pillStyle = `background-color:transparent; border:2px solid ${color}; color:${color};`;
    } else {
      pillStyle = `background-color:${color}; border:1px solid ${borderColor}; color:${getContrastColor(color)};`;
    }
    html += `
    <div class="${pillClass}"
         style="${pillStyle}"
         draggable="true"
         ondragstart="event.dataTransfer.setData('text/plain','${ftag}');"
         onclick="Beat.call('Beat.custom.handlePillClick(\\'${ftag}\\')')"
         onmouseleave="Beat.call('Beat.custom.onPillMouseLeave(\\'${ftag}\\')')"
         oncontextmenu="event.preventDefault(); Beat.call('Beat.custom.handleTagRightClick(\\'${ftag}\\', ' + event.clientX + ', ' + event.clientY + ')');">
      ${ftag}
      <span class="tooltip">${pos}/${total}</span>
    </div>
    `;
  }
  
  html += `
  </div>
  <div id="othersContainer" class="container" style="border:none; background:transparent;"
       ondragover="event.preventDefault(); this.classList.add('drag-over');"
       ondragleave="this.classList.remove('drag-over');"
       ondrop="(function(e){ e.preventDefault(); this.classList.remove('drag-over'); var tag = e.dataTransfer.getData('text/plain'); Beat.call('Beat.custom.dropToOthers(\\'' + tag + '\\')'); }).call(this, event)">
  `;
  
  const allTagNames = Object.keys(tagsByName);
  const otherTags = allTagNames.filter(t => !favoriteTags.includes(t));
  if (!otherTags.length) {
    html += `<p style="color:#999;">No other keywords found.</p>`;
  } else {
    for (const tagName of otherTags) {
      const occurrences = tagsByName[tagName];
      const isSpecial = occurrences.some(o => o.special === true);
      const color = pickColorForTag(tagName);
      const borderColor = darkenHexColor(color, 0.2);
      const total = occurrences.length;
      const pos = (occurrenceIndex[tagName] != null ? (occurrenceIndex[tagName] % total) : 0) + 1;
      const pillClass = (activeTooltipTag === tagName) ? "tag-pill active" : "tag-pill";
      let pillStyle;
      if (isSpecial) {
        pillStyle = `background-color:transparent; border:2px solid ${color}; color:${color};`;
      } else {
        pillStyle = `background-color:${color}; border:1px solid ${borderColor}; color:${getContrastColor(color)};`;
      }
      html += `
      <div class="${pillClass}"
           style="${pillStyle}"
           draggable="true"
           ondragstart="event.dataTransfer.setData('text/plain','${tagName}');"
           onclick="Beat.call('Beat.custom.handlePillClick(\\'${tagName}\\')')"
           onmouseleave="Beat.call('Beat.custom.onPillMouseLeave(\\'${tagName}\\')')"
           oncontextmenu="event.preventDefault(); Beat.call('Beat.custom.handleTagRightClick(\\'${tagName}\\', ' + event.clientX + ', ' + event.clientY + ')');">
        ${tagName}
        <span class="tooltip">${pos}/${total}</span>
      </div>
      `;
    }
  }
  
  html += `
  </div>
  <div id="colorPopup" style="${popupStyle}">
    <input type="color" id="colorPickerInput" value="${colorInputValue}"
           oninput="Beat.call('Beat.custom.previewTagColor(\\'' + this.value + '\\')')"
           onblur="Beat.call('Beat.custom.finalizeTagColor(\\'' + this.value + '\\')')">
    <button onclick="finalizeColorButtonClick()">OK</button>
  </div>
  <div id="helpIcon" onclick="document.getElementById('helpPopover').style.display = (document.getElementById('helpPopover').style.display=='block'?'none':'block');">?</div>
  <div id="helpPopover">
    <p>Add a hashtag inside an inline note in your document to create a tag: [[This creates a #tag]].</p>
    <p>You can also tag Storylines/Beats: [[Storyline: #tag]] or [[Beat #tag]].</p>
    <p>Click a tag in the plugin to jump to its location in the document.</p>
    <p>Left click to change the color of a tag.</p>
    <p>Use Ctrl+Cmd+K to toggle the plugin.</p>
    <p>Close the window to remove highlights from the document.</p>
    <button onclick="document.getElementById('helpPopover').style.display='none';">Close</button>
  </div>
</div>
<div id="themeTabs">
  <span class="themeTab ${themeMode==='light'?'active':''}" onclick="Beat.call('Beat.custom.setLightMode()')">Light</span>
  <span class="themeTab ${themeMode==='dark'?'active':''}" onclick="Beat.call('Beat.custom.setDarkMode()')">Dark</span>
  <span class="themeTab ${themeMode==='system'?'active':''}" onclick="Beat.call('Beat.custom.setSystemMode()')">System</span>
</div>
<script>
  window.filterKeywords = function(query) {
    const pills = document.querySelectorAll('.tag-pill');
    query = query.toLowerCase();
    pills.forEach(pill => {
      const text = pill.innerText.toLowerCase();
      pill.style.display = text.includes(query) ? 'inline-block' : 'none';
    });
  };
</script>
</body>
</html>
`;
  return html;
}

function updateWindowUI() {
  if (!myWindow) return;

  const newHTML = `
    <script>
      // Save scroll position before unload
      window.addEventListener('beforeunload', function() {
        sessionStorage.setItem('scrollY', window.scrollY);
      });
      // Restore scroll position on load
      window.addEventListener('DOMContentLoaded', function() {
        const y = sessionStorage.getItem('scrollY') || 0;
        window.scrollTo(0, parseInt(y, 10));
      });
      // Proactively save scroll position on scroll events
      window.addEventListener('scroll', function() {
        sessionStorage.setItem('scrollY', window.scrollY);
      });
    </script>
  ` + buildUIHtml();

  myWindow.setHTML(newHTML);
}

function removeAllHighlights() {
  for (const occ of allOccurrences) {
    Beat.removeBackgroundHighlight(occ.absPos, occ.matchLen);
  }
}

function centerWindow(winObj) {
  if (typeof Beat.screenWidth === "function" && typeof Beat.screenHeight === "function") {
    const frame = winObj.getFrame();
    const x = (Beat.screenWidth() - frame.width) / 2;
    const y = (Beat.screenHeight() - frame.height) / 2;
    winObj.setFrame(x, y, frame.width, frame.height);
  } else {
    Beat.log("Screen dimensions not available for centering.");
  }
}

function reapplyAllHighlights() {
  for (const occ of allOccurrences) {
    const color = pickColorForTag(occ.tag);
    Beat.textBackgroundHighlight(color, occ.absPos, occ.matchLen);
    occ.color = color;
  }
}

// --- Modified togglePluginVisibility function using myWindow consistently ---
function togglePluginVisibility() {
  Beat.log("togglePluginVisibility triggered");
  if (myWindow) {
    if (isPluginVisible) {
      myWindow.hide();
      isPluginVisible = false;
    } else {
      myWindow.show();
      // Reapply disable flags when showing the window again
      myWindow.disableMaximize = true;
      myWindow.disableFullScreen = true;
      myWindow.disableMinimize = true;
      isPluginVisible = true;
    }
  } else {
    main();
    isPluginVisible = true;
  }
}

const toggleMenuItem = Beat.menuItem("Keywords", ["cmd", "ctrl", "k"], togglePluginVisibility);
Beat.menu("Keywords", [toggleMenuItem]);

// --- Modified onKeyDown block using myWindow ---
if (typeof Beat.onKeyDown === "function") {
 
}

main();
