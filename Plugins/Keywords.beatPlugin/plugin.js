/*
Title: Keywords
Copyright: Bode Pickman
<Description>
Organize your ideas and easily navigate to specific notes in your document using hashtags (like #theme or #plot). It creates a clickable list of keywords so you can jump to them quickly, making it easier to organize, structure, and navigate your document.
Add a hashtag to any inline note: [[This will create a #tag]]
</Description>
Image: Keywords.png
Version: 1.1
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

// Global theme variable: true for dark mode, false for light mode.  
// Using a custom toggle instead of system appearance, as some tag color choices  
// are only visible in either dark or light mode, requiring manual background selection.
// Load saved preference if available; otherwise, default to true.
let isDarkTheme = (Beat.getUserDefault("themePreference") !== undefined) ? Beat.getUserDefault("themePreference") : true;

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
 * Plugin methods callable from HTML.
 */
Beat.custom = {
  refreshUI() {
    tagsByName = {};
    allOccurrences = [];
    occurrenceIndex = {};
    removeAllHighlights();
    gatherAllTags();
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
    // Trigger the flashing effect for this occurrence.
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

  toggleTheme() {
    isDarkTheme = !isDarkTheme;
    Beat.setUserDefault("themePreference", isDarkTheme);
    updateWindowUI();
  }
};

function main() {
  gatherAllTags();

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

  myWindow.disableMaximize = true;
  myWindow.disableMinimize = true;

  centerWindow(myWindow);
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
  for (let i = 0; i < lines.length; i++) {
    const lineObj = lines[i];
    let noteMatch;
    while ((noteMatch = regexNote.exec(lineObj.string)) !== null) {
      const noteContent = noteMatch[1];
      let hashMatch;
      while ((hashMatch = regexHash.exec(noteContent)) !== null) {
        const tagName = hashMatch[1];
        if (/^\d{6}$/.test(tagName)) continue;
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
  return "#fefbc0";
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
  
  const bodyBg = isDarkTheme ? "#333" : "#eee";
  const bodyColor = isDarkTheme ? "#fff" : "#000";
  const headerColor = isDarkTheme ? "#ccc" : "#666";
  const helpBg = isDarkTheme ? "#222" : "#f1f1f1";
  const helpColor = isDarkTheme ? "#fff" : "#000";
  
  let html = `
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 10px;
      background: ${bodyBg};
      color: ${bodyColor};
      font-family: sans-serif;
      position: relative;
      min-height: 100vh;
    }
    h2 {
      margin: 0.5em 0 0.25em 0;
      font-size: 1em;
      font-weight: normal;
      color: ${headerColor};
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
    #themeIcon {
      position: fixed;
      bottom: 10px;
      right: 10px;
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
      background: ${helpBg};
      color: ${helpColor};
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
  </style>
  <script>
    function finalizeColorButtonClick() {
      var val = document.getElementById('colorPickerInput').value;
      Beat.call('Beat.custom.finalizeTagColor(\'' + val + '\')');
    }
  </script>
</head>
<body>
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
    html += `<p style="color:#999;">No other tags found.</p>`;
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
  <div id="themeIcon" onclick="Beat.call('Beat.custom.toggleTheme()')">◐</div>
</body>
</html>
`;
  return html;
}

function updateWindowUI() {
  if (!myWindow) return;
  const newHTML = buildUIHtml();
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

function togglePluginVisibility() {
  Beat.log("togglePluginVisibility triggered");
  if (myWindow) {
    if (isPluginVisible) {
      myWindow.hide();
      isPluginVisible = false;
    } else {
      myWindow.show();
      isPluginVisible = true;
    }
  } else {
    main();
    isPluginVisible = true;
  }
}

const toggleMenuItem = Beat.menuItem("Keywords", ["cmd", "ctrl", "k"], togglePluginVisibility);
Beat.menu("Keywords", [toggleMenuItem]);

if (typeof Beat.onKeyDown === "function") {
  Beat.onKeyDown(function(e) {
    if (e.ctrlKey && e.metaKey && e.key && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!controlWindow) {
        let controlHTML = createControlPanelHTML();
        controlWindow = Beat.htmlWindow(controlHTML, 400, 180, function() {
          removeAllHighlights();
          Beat.end();
        });
        let frame = controlWindow.getFrame ? controlWindow.getFrame() : { width: 400, height: 180 };
        let centerX = (controlWindow.innerWidth ? controlWindow.innerWidth : 800) / 2 - frame.width / 2;
        let centerY = (controlWindow.innerHeight ? controlWindow.innerHeight : 600) / 2 - frame.height / 2;
        controlWindow.setFrame(centerX, centerY, frame.width, frame.height);
      } else {
        controlWindow.close();
        controlWindow = null;
      }
    }
  });
}

main();
