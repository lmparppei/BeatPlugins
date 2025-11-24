/*
Title: Keywords
Copyright: Bode Pickman
<Description>
Organize your ideas and easily navigate to specific notes in your document using hashtags or the "at" symbol (like #theme or @plot). It creates a clickable list of keywords so you can jump to them quickly, making it easier to organize, structure, and navigate your document.
Add a hashtag to any inline note: [[This will create a #tag]]
<br><br>

The Notes + Synopsis tab pulls every inline note, synopsis, omitted text, and Notepad entry into a searchable, filterable list. You can toggle which types to show, mark items as completed (striking them out), and click any entry to jump to its location in your document.<br><br>

In the Boneyard, notes are grouped automatically based on section headers and scene headings:
<br>
	•	A section header (#, ##, or ###) starts a new group and includes everything below it, even multiple scene headings, until the next section header.
	<br><br>
  •	If no section header is active, a scene heading (like INT. or EXT.) starts a group and includes all lines until the next scene heading or section header.
	<br><br>
  •	Text before the first section or scene heading is grouped by scene (if possible) or treated as individual entries.
<br><br>
This grouping behavior only applies to the Boneyard. The Notepad handles each paragraph as its own entry.

</Description>

Image: Keywords.png
Version: 2.36
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


// Normalize a string for stable keying/dismissal
function normalize(str) {
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9\s-_]/g, '') // remove punctuation like ', ", etc.
    .toLowerCase();
}

// Lightweight inline markdown parser for bold, italic, underline, code, and styled headers (h1-h3 only)
// Process input line by line to ensure headers only apply to lines starting with #, and do not affect surrounding lines.
function parseInlineMarkdown(text) {
  const lines = text.split("<br>");
  const parsedLines = lines.map(line => {
    if (/^###\s*[^\n#]/.test(line)) {
      // Subheading
      const text = line.replace(/^###\s*/, '');
      return `<span style="font-size:1em; font-weight:bold;">${text}</span>`;
    }
    if (/^##\s*[^\n#]/.test(line)) {
      // Secondary heading
      const text = line.replace(/^##\s*/, '');
      return `<span style="font-size:1.5em; font-weight:bold;">${text}</span>`;
    }
    if (/^#\s*[^\n#]/.test(line)) {
      // Primary heading
      const text = line.replace(/^#\s*/, '');
      return `<span style="font-size:2em; font-weight:bold;">${text}</span>`;
    }
    return line;
  });
  const joined = parsedLines.join("<br>");
  return joined
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

// Helper: render inline hashtags as pills, for both [[#tag]] and #tag syntax
function renderInlineTags(text) {
  // Style [[#tag]] using color
  text = text.replace(/\[\[\s*#([a-zA-Z0-9_]+)\s*\]\]/g, (_, tag) => {
    const color = pickColorForTag(tag.toLowerCase());
    return `<span class="tag-pill" style="background-color:${color}; color:#fff; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:0 2px;">${tag.toLowerCase()}</span>`;
  });

  // Style [[@tag]] using same color logic (treat as @tag)
  text = text.replace(/\[\[\s*@([a-zA-Z0-9_]+)\s*\]\]/g, (_, tag) => {
    const color = pickColorForTag(tag.toLowerCase());
    return `<span class="tag-pill" style="background-color:${color}; color:#fff; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:0 2px;">${tag.toLowerCase()}</span>`;
  });

  // Also catch raw inline #tag and @tag (non-wrapped)
  text = text.replace(/(^|\s)([#@][a-zA-Z0-9_]+)/g, (_, prefix, tag) => {
    const color = pickColorForTag(tag.slice(1).toLowerCase());
    return `${prefix}<span class="tag-pill" style="background-color:${color}; color:#fff; padding:3px 8px; border-radius:20px; font-size:0.85em; margin:0 2px;">${tag.slice(1).toLowerCase()}</span>`;
  });

  return text;
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
let sizesBeforeMinimize = null;

// Theme mode: "light", "dark", or "system" (default uses system preference)
let themeMode = Beat.getUserDefault("themePreference") || "system";
let collapseMode = Beat.getUserDefault("collapseMode") || "off";

// Attempt to import Cocoa for multi-screen support; fall back gracefully if unavailable
try {
  ObjC.import('Cocoa');
} catch (e) {
  // ObjC not available in this environment
}

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
let showBoneyard = Beat.getDocumentSetting("showBoneyard");
if (showBoneyard === undefined) showBoneyard = true;
let hideBackgroundTags = Beat.getDocumentSetting("hideBackgroundTags");
if (hideBackgroundTags === undefined) hideBackgroundTags = false;
let enforceContrast = Beat.getUserDefault("enforceContrast");
if (enforceContrast === undefined) enforceContrast = true;
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

// === WCAG Contrast (Hue-Preserving) Utilities ===
function _hex(h){return h.replace(/^#/,'');}
function _clamp01(x){return Math.max(0,Math.min(1,x));}
function _rgbFromHex(hex){
  const h=_hex(hex);
  return {
    r: parseInt(h.slice(0,2),16),
    g: parseInt(h.slice(2,4),16),
    b: parseInt(h.slice(4,6),16)
  };
}
function _hexFromRgb(r,g,b){
  const to2=n=>n.toString(16).padStart(2,'0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
function _rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){ h=s=0; }
  else{
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h/=6;
  }
  return {h,s,l};
}
function _hslToRgb(h,s,l){
  function hue2rgb(p,q,t){
    if(t<0) t+=1; if(t>1) t-=1;
    if(t<1/6) return p + (q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p + (q-p)*(2/3 - t)*6;
    return p;
  }
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q = l<0.5 ? l*(1+s) : l + s - l*s;
    const p = 2*l - q;
    r = hue2rgb(p,q,h+1/3);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h-1/3);
  }
  return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) };
}
// Relative luminance + contrast ratio (WCAG)
function _relLum(hex){
  const {r,g,b}=_rgbFromHex(hex);
  const f=c=>{ c/=255; return (c<=0.03928)? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
  const R=f(r), G=f(g), B=f(b);
  return 0.2126*R + 0.7152*G + 0.0722*B;
}
function _contrastRatio(a,b){
  const L1=_relLum(a), L2=_relLum(b);
  const hi=Math.max(L1,L2), lo=Math.min(L1,L2);
  return (hi+0.05)/(lo+0.05);
}
function _editorTextColor(){
  // Heuristic: Beat doesn’t expose the actual editor text color.
  // These values match typical Beat themes closely.
  return (themeMode === 'dark') ? '#E4E4E4' : '#1B1D1E';
}

// Perceived brightness (0..255) helper
function _brightness255(hex){
  const h=_hex(hex); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  return (r*299 + g*587 + b*114) / 1000; // 0..255
}

/**
 * Adjust only LIGHTNESS (keep hue & saturation) to hit a target WCAG contrast,
 * and enforce a minimum perceived brightness gap from the editor text color for visibility.
 */
function ensureBgContrastHuePreserving(baseHex, minRatio=8.0){
  const text=_editorTextColor();
  if (!enforceContrast) return baseHex;
  const BRIGHTNESS_GAP = 64; // ~25% of 255 — push further from text luminance
  const STEP = 0.08;         // 8% lightness steps for bolder shifts

  // If already passes AAA and looks separated enough, keep as is
  if (_contrastRatio(text, baseHex) >= minRatio && Math.abs(_brightness255(text) - _brightness255(baseHex)) >= BRIGHTNESS_GAP) {
    return baseHex;
  }

  // Convert to HSL once
  const {r,g,b}=_rgbFromHex(baseHex);
  const {h,s,l}= _rgbToHsl(r,g,b);

  let best = null; // {hex, deltaL, dir: 'lighter'|'darker'}

  // Search toward lighter and darker, prefer smallest lightness change that satisfies contrast first
  function testDir(sign){
    for (let k=STEP; k<=1.0; k+=STEP){
      const L = _clamp01(l + sign*k);
      const rgb=_hslToRgb(h,s,L);
      const hex=_hexFromRgb(rgb.r,rgb.g,rgb.b);
      if (_contrastRatio(text, hex) >= minRatio){
        best = {hex, deltaL: Math.abs(L-l), dir: (sign>0?'lighter':'darker')};
        break;
      }
      if ((sign>0 && L>=1.0) || (sign<0 && L<=0.0)) break;
    }
  }
  testDir(+1); // try lighter
  const lighter = best; // stash
  best = null;
  testDir(-1); // try darker
  const darker = best;

  // Choose the smaller deltaL; tie-break by higher contrast
  let chosen = null;
  if (lighter && darker){
    chosen = (lighter.deltaL < darker.deltaL) ? lighter : (darker.deltaL < lighter.deltaL ? darker : (_contrastRatio(text, lighter.hex) >= _contrastRatio(text, darker.hex) ? lighter : darker));
  } else {
    chosen = lighter || darker;
  }

  // If nothing found (extreme edge case), keep base
  if (!chosen) return baseHex;

  // Ensure a minimum perceived brightness gap vs text for better visibility, continuing in the chosen direction
  let out = chosen.hex;
  let outL = _rgbToHsl(...Object.values(_rgbFromHex(out))).l;
  while (Math.abs(_brightness255(text) - _brightness255(out)) < BRIGHTNESS_GAP || _contrastRatio(text, out) < minRatio){
    outL = _clamp01(outL + (chosen.dir==='lighter' ? STEP : -STEP));
    const rgb=_hslToRgb(h,s,outL);
    out = _hexFromRgb(rgb.r,rgb.g,rgb.b);
    // Stop if we hit bounds or the contrast is already quite strong
    if (outL === 0 || outL === 1 || _contrastRatio(text, out) >= (minRatio + 0.5)) break;
  }
  // Soft clamp toward extremes if still too close after stepping
  const outHsl = _rgbToHsl(...Object.values(_rgbFromHex(out)));
  if (Math.abs(_brightness255(text) - _brightness255(out)) < BRIGHTNESS_GAP) {
    let targetL = (chosen.dir === 'lighter') ? 0.9 : 0.1;
    const rgb=_hslToRgb(h, s, targetL);
    const hexTarget=_hexFromRgb(rgb.r, rgb.g, rgb.b);
    if (_contrastRatio(text, hexTarget) >= minRatio) out = hexTarget;
  }
  // Debug: log before/after contrast
  try { Beat.log(`[KW] Contrast adjust: base=${baseHex} → result=${out} (min=${minRatio}, gap≥${BRIGHTNESS_GAP})`); } catch {}
  return out;
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
  toggleHideBackgroundTags() {
    hideBackgroundTags = !hideBackgroundTags;
    Beat.setDocumentSetting("hideBackgroundTags", hideBackgroundTags);
    Beat.custom.refreshUI();
  },
  toggleContrastEnforcement() {
    enforceContrast = !enforceContrast;
    Beat.setUserDefault("enforceContrast", enforceContrast);
    removeAllHighlights();
    reapplyAllHighlights();
    updateWindowUI();
  },
  setEnforceContrast(mode) {
    // mode: 'on' | 'off'
    const next = (mode === 'on');
    if (next === enforceContrast) return;
    enforceContrast = next;
    Beat.setUserDefault("enforceContrast", enforceContrast);
    removeAllHighlights();
    reapplyAllHighlights();
    updateWindowUI();
  },
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

    const all = tagsByName[tagName];
    const docHits = all.filter(o => o.lineIndex != null && o.lineIndex >= 0);
    const noteHits = all.filter(o => o.lineIndex == null || o.lineIndex < 0);

    if (!occurrenceIndex[tagName]) occurrenceIndex[tagName] = 0;

    const index = occurrenceIndex[tagName] % docHits.length;
    const occ = docHits[index];

    if (occ) {
      const lines = Beat.lines();
      if (lines[occ.lineIndex]) {
        Beat.scrollTo(lines[occ.lineIndex].position);
        flashHighlight(occ.color, occ.absPos, occ.matchLen, 3);
      }
      occurrenceIndex[tagName]++;
      updateWindowUI();
    } else if (noteHits.length > 0) {
      Beat.alert("Note in Notepad", "This keyword was found in your Notepad.");
    }
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
    if (type === 'boneyard') {
      showBoneyard = !showBoneyard;
      Beat.setDocumentSetting("showBoneyard", showBoneyard);
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
  setThemeMode(mode) {
    themeMode = mode;
    Beat.setUserDefault("themePreference", mode);
    updateWindowUI();
  },
  setCollapseMode(mode) {
    collapseMode = mode;
    Beat.setUserDefault("collapseMode", mode);
    updateWindowUI();
  },
  minimizeFTOutliner() {
    if (collapseMode !== "off" && myWindow) {
      // Store the original frame once
      if (!sizesBeforeMinimize) {
        sizesBeforeMinimize = myWindow.getFrame();
      }
      const { x: origX, y: origY, width: origW, height: origH } = sizesBeforeMinimize;
      const newWidth = Math.floor(origW * 0.25);
      const newX = (collapseMode === "right")
                 ? (origX + origW - newWidth)
                 : origX;
      const newY = origY + origH - 28;
      myWindow.setFrame(newX, newY, newWidth, 28);
    }
  },
  maximizeFTOutliner() {
    if (myWindow && sizesBeforeMinimize) {
      // Restore original frame regardless of hideOnBlur
      const { x, y, width, height } = sizesBeforeMinimize;
      myWindow.setFrame(x, y, width, height);
      sizesBeforeMinimize = null;
    }
  },
};

function main() {
  gatherAllTags();
  gatherNotepadNotes();

  // --- Listen for Notepad changes and refresh UI in real time ---
  Beat.onNotepadChange(() => {
    Beat.custom.refreshUI();
  });

  if (!Object.keys(tagsByName).length && notesAndSynopsis.length === 0) {
    Beat.alert("No Keywords or Notes Found", "Try adding a hashtag within an inline note (e.g., [[This is a #keyword]]).");
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
myWindow = Beat.htmlWindow(ui, 600, 500, onWindowClosed,
  { utility: false }
);

  centerWindow(myWindow);
}

function gatherNotepadNotes() {
  // Remove any prior Notepad-based entries to prevent duplication or stale dismissal states
  notesAndSynopsis = notesAndSynopsis.filter(entry => !entry.key?.startsWith("notepad:"));

  // Load raw Notepad text and return if empty
  const np = Beat.notepad?.string || '';
  if (!np) return;

  // Split into blocks by blank lines (paragraphs)
  // A block is a sequence of non-blank lines separated by one or more blank lines
  const lines = np.split('\n');
  let blocks = [];
  let currentBlock = [];
  let blockStartIdx = 0;
  let blockIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      if (currentBlock.length > 0) {
        blocks.push({ lines: [...currentBlock], startIndex: blockStartIdx });
        currentBlock = [];
      }
      blockStartIdx = i + 1;
    } else {
      if (currentBlock.length === 0) blockStartIdx = i;
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push({ lines: [...currentBlock], startIndex: blockStartIdx });
  }

  // If no non-blank blocks, but Notepad has content, create a single block for all content
  if (blocks.length === 0 && np.trim() !== '') {
    blocks = [{ lines: lines, startIndex: 0 }];
  }

  // Convert each block into a Notepad entry
  blocks.forEach((blk, j) => {
    let content = blk.lines.join('<br>').trim();
    // If block is empty after trimming, skip
    if (!content) return;
    const absPos = 90000000 + j;
    const key = `notepad:${j}`;
    notesAndSynopsis.push({
      type: 'note',
      content,
      absPos,
      lineIndex: blk.startIndex,
      key
    });
  });
}

function onWindowClosed() {
  removeAllHighlights();
  Beat.end();
}

/**
 * Gather all tags from the document.
 */
function gatherAllTags() {
  let insideBoneyardSection = false;
  const boneyardHeaderRegex = /^#\s*BONEYARD/i;
  const regexNote = /\[\[(.*?)\]\]/g;
  const regexHash = /[#@]([\p{L}\p{N}\p{Emoji_Presentation}\p{M}]+)/gu;
  const lines = Beat.lines();
  // Gather tags
  for (let i = 0; i < lines.length; i++) {
    // --- Boneyard section skip logic ---
    const trimmedLine = lines[i].string.trim();
    if (boneyardHeaderRegex.test(trimmedLine)) {
      insideBoneyardSection = true;
    }
    if (/^#\s+/.test(trimmedLine) && !boneyardHeaderRegex.test(trimmedLine)) {
      insideBoneyardSection = false;
    }
    if (insideBoneyardSection && hideBackgroundTags) {
      continue;
    }
    const lineObj = lines[i];
    let noteMatch;
    while ((noteMatch = regexNote.exec(lineObj.string)) !== null) {
      const noteContent = noteMatch[1];
      let hashMatch;
      while ((hashMatch = regexHash.exec(noteContent)) !== null) {
        const tagName = hashMatch[1].toLowerCase();
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
        const tName = specialMatch[2].trim().toLowerCase();
        const offsetInNote = noteContent.indexOf(specialMatch[2]);
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
  let insideBoneyard = false;
  insideBoneyardSection = false;
  for (let i = 0; i < lines.length; i++) {
    const lineObj = lines[i];
    const line = lineObj.string;
    let noteMatch;
    while ((noteMatch = regexNote.exec(line)) !== null) {
      if (insideBoneyardSection) continue;
      const content = noteMatch[1];
      if (/^#[a-fA-F0-9]{6}$/.test(content.trim())) continue;
      const absPos = lineObj.position + noteMatch.index;
      const trimmed = content.trim();
      const isSpecialTag = /^\s*(beat|storyline)\b\s*[:]?\s+([^\]]+)/i.test(trimmed);
      if (
        !/^[#@]([\p{L}\p{N}\p{Emoji_Presentation}\p{M}]+)$/u.test(trimmed) &&
        !isSpecialTag &&
        !line.trim().startsWith('=')
      ) {
        notesAndSynopsis.push({ type: 'note', content, absPos, lineIndex: i, key: `note:${normalize(content)}` });
      }
    }
    // Inserted logic to rename manual page breaks and recognize === as forced page break
    const trimmedLine = line.trim().toLowerCase();
    if (trimmedLine === "manual page break" || trimmedLine === "===") {
      notesAndSynopsis.push({ type: 'synopsis', content: '**Forced Page Break**', absPos: lineObj.position, lineIndex: i, key: `synopsis:${normalize('**Forced Page Break**')}` });
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
        content: '**🚫 Omitted:** ' + previewText,
        absPos: lineObj.position,
        lineIndex: i,
        key: `omitted:${i}`
      });

      i = j; // Skip to the end of the omitted block
      continue;
    }
    // --- Track if we are inside a BONEYARD block for main loop ---
    const trimmed = line.trim();
    if (/^#\s*BONEYARD/i.test(trimmed)) {
      // New grouping rules for BONEYARD content
      // 1. A section header (#, ##, ###) starts a group and collects every line
      //   —including multiple scene headings—until the next section header.
      // 2. If no section header is active, a scene heading
      //    (INT., EXT., INT/EXT., I/E., EST., INT-EXT.) starts a group
      //    and collects lines until the next scene heading or a section header.
      // 3. Text before the first header is grouped by rule 2 (scene‑by‑scene).
      const bLines = [];
      for (let k = i + 1; k < lines.length; k++) {
        bLines.push({ text: lines[k].string, position: lines[k].position, index: k });
      }

      const sectionRegex = /^#\s*(.*)$/;
      const sceneRegex   = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.|INT-EXT\.)/i;

      const bBlocks     = [];
      let currentBlock  = null; // active section‑ or scene‑level block

      bLines.forEach(({ text: bText, position: bPos, index: bIdx }) => {
        const trimmed = bText.trim();

        // --- Section header -------------------------------------------------
        const sectionMatch = trimmed.match(sectionRegex);
        if (sectionMatch) {
          if (currentBlock) bBlocks.push(currentBlock);          // close prior block
          currentBlock = {                                        // start new section
            header: sectionMatch[1].trim(),
            lines: [],
            startIndex: bIdx,
            startPos: bPos
          };
          return; // header handled
        }

        // --- Inside a section header: just accumulate -----------------------
        if (currentBlock && currentBlock.header) {
          currentBlock.lines.push(bText);
          return;
        }

        // --- Scene‑heading logic (only when NOT in a section) ---------------
        const isSceneHeading = sceneRegex.test(trimmed);

        if (isSceneHeading) {
          if (currentBlock) bBlocks.push(currentBlock);          // close prior scene
          currentBlock = {                                        // start new scene group
            header: null,               // scene groups have no explicit header
            lines: [bText],             // include the heading line itself
            startIndex: bIdx,
            startPos: bPos
          };
        } else if (trimmed !== '' || (currentBlock && currentBlock.lines.length)) {
          // Non‑blank line (or blank line inside a group) => accumulate
          if (!currentBlock) {
            currentBlock = {
              header: null,
              lines: [bText],
              startIndex: bIdx,
              startPos: bPos
            };
          } else {
            currentBlock.lines.push(bText);
          }
        }
        // Completely blank lines before any group are ignored.
      });

      // Close the last open block, if any.
      if (currentBlock) bBlocks.push(currentBlock);

      // Emit all BONEYARD snippets
      bBlocks.forEach(blk => {
        const contentLines = [];
        if (blk.header) contentLines.push('# ' + blk.header);
        contentLines.push(...blk.lines);
        notesAndSynopsis.push({
          type: 'boneyard',
          content: contentLines.join('<br>').trim(),
          absPos: blk.startPos,
          lineIndex: blk.startIndex,
          key: `boneyard:${blk.startIndex}`
        });
      });
      // Stop processing further lines
      break;
    }
    // Update insideBoneyard flag when a top-level header is encountered (not BONEYARD)
    if (/^#\s+/.test(trimmed) && !/^#\s*BONEYARD/i.test(trimmed)) {
      insideBoneyard = false;
      insideBoneyardSection = false;
    }
    // If we are inside a BONEYARD block, skip synopsis detection for this line
    // (Synopsis detection is moved below, after BONEYARD block handling)

    // Guard clause: skip lines that are just == or ===
    if (line.trim() === "==" || line.trim() === "===") continue;
    // More explicit: Only add synopsis if NOT inside BONEYARD section (exclude = ... lines inside BONEYARD)
    const isSynopsisLine = /^=\s?(.*)/.test(line);
    if (isSynopsisLine && !insideBoneyardSection) {
      const content = line.replace(/^=\s?/, '');
      const absPos = lineObj.position + line.indexOf('=');
      const specialTagOnly = /^\s*(new\s*)?\[\[\s*(beat|storyline)\s*:?\s+[^\]]+\]\]\s*$/i.test(content.trim());
      if (specialTagOnly) continue;
      if (/^#[a-fA-F0-9]{6}$/.test(content.trim())) continue;
      notesAndSynopsis.push({ type: 'synopsis', content, absPos, lineIndex: i, key: `synopsis:${normalize(content)}` });
    }
  }
  // --- Add Notepad tags as tag occurrences and to notesAndSynopsis ---
  // This must come after the main notepadNotes are gathered in gatherNotepadNotes
  const np = Beat.notepad?.string || '';
  if (np) {
    const notepadLines = np.split(/\n/);
    // Add Notepad entries to notesAndSynopsis (done in gatherNotepadNotes)
    // Now, scan all Notepad lines for tag patterns and add them as tags
    const tagRegex = /\[\[\s*(#?[^\]\s]+(?:\s+[^\]\s]+)*)\s*\]\]/g;
    notepadLines.forEach(line => {
      const stripped = line.trim();
      let tagMatch;
      while ((tagMatch = tagRegex.exec(stripped)) !== null) {
        const fullMatch = tagMatch[1].trim();
        if (/^(beat|storyline)\b[:\s]/i.test(fullMatch)) {
          const tagName = fullMatch.replace(/^(beat|storyline)\b[:\s]*/i, '').trim().toLowerCase();
          if (tagName) {
            addTag(tagName, pickColorForTag(tagName), { lineIndex: -1, absPos: -1, matchLen: tagName.length, special: true });
          }
        } else {
          const tagName = fullMatch.replace(/^#/, '').trim().toLowerCase();
          if (tagName) {
            addTag(tagName, pickColorForTag(tagName), { lineIndex: -1, absPos: -1, matchLen: tagName.length, special: false });
          }
        }
      }
    });
  }
  // Sort notesAndSynopsis by absPos ascending
  notesAndSynopsis.sort((a, b) => a.absPos - b.absPos);
}

// Helper to add a tag for Notepad-based tags (does not highlight in doc)
function addTag(tagName, color, occurrence) {
  if (!tagsByName[tagName]) tagsByName[tagName] = [];
  // Avoid duplicates: only add if not already present with same -1/-1
  if (!tagsByName[tagName].some(o => o.lineIndex === occurrence.lineIndex && o.absPos === occurrence.absPos && o.matchLen === occurrence.matchLen && o.special === occurrence.special)) {
    tagsByName[tagName].push({ tag: tagName, ...occurrence, color });
    allOccurrences.push({ tag: tagName, ...occurrence, color });
  }
}

function addOccurrence(tagName, lineIndex, absPos, matchLen, special = false) {
  const baseColor = pickColorForTag(tagName);
  const hl = ensureBgContrastHuePreserving(baseColor, 8.0); // push visibility further
  Beat.textBackgroundHighlight(hl, absPos, matchLen);
  const occurrence = { tag: tagName, lineIndex, absPos, matchLen, color: hl, special };
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
    const baseColor = pickColorForTag(occ.tag);
    const hl = ensureBgContrastHuePreserving(baseColor, 8.0);
    Beat.textBackgroundHighlight(hl, occ.absPos, occ.matchLen);
    occ.color = hl;
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
      --notepadBg: rgba(232, 241, 255, 0.5);
      --boneyardBg: rgba(255, 236, 236, 0.5);
      --synopsisBg: rgba(248, 250, 255, 0.5);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bodyBg: #1e1e1e;
        --bodyColor: #eee;
        --headerColor: #aaa;
        --helpBg: #2a2a2a;
        --helpColor: #fff;
        --searchBg: #2a2a2a;
        --searchColor: #fff;
        --searchBorder: #444;
        --notepadBg: rgba(34, 48, 63, 0.5);
        --boneyardBg: rgba(68, 38, 38, 0.5);
        --synopsisBg: rgba(37, 42, 51, 0.5);
      }
    }
    /* Darken dropdown chevrons in light mode only */
    @media (prefers-color-scheme: light) {
      select {
        color-scheme: light;
      }

      select::-ms-expand,
      select::after {
        filter: brightness(0.2);
      }

      select::-webkit-inner-spin-button,
      select::-webkit-outer-spin-button,
      select::-webkit-dropdown-arrow {
        filter: brightness(0.2);
      }
    }
    `;
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
      --notepadBg: rgba(232, 241, 255, 0.5);
      --boneyardBg: rgba(255, 236, 236, 0.5);
      --synopsisBg: rgba(248, 250, 255, 0.55);
    }
    /* Darken dropdown chevrons in light mode only */
    @media (prefers-color-scheme: light) {
      select {
        color-scheme: light;
      }

      select::-ms-expand,
      select::after {
        filter: brightness(0.2);
      }

      select::-webkit-inner-spin-button,
      select::-webkit-outer-spin-button,
      select::-webkit-dropdown-arrow {
        filter: brightness(0.2);
      }
    }
    `;
  } else {
    css = `
    :root {
      --bodyBg: #1e1e1e;
      --bodyColor: #eee;
      --headerColor: #aaa;
      --helpBg: #2a2a2a;
      --helpColor: #fff;
      --searchBg: #2a2a2a;
      --searchColor: #fff;
      --searchBorder: #444;
      --notepadBg: rgba(34, 48, 63, 0.5);
      --boneyardBg: rgba(68, 38, 38, 0.5);
      --synopsisBg: rgba(37, 42, 51, 0.5);
    }`;
  }

  const collapseMode = Beat.getUserDefault("collapseMode") || "off";
  let html = `
<html>
<head>
  <style>
    ${css}
    /* Base style for all select elements */
    select {
      font-family: inherit;
      border: none;
      outline: none;
      box-shadow: none;
    }
    /* Style dropdowns for Auto-collapse and Theme selectors */
    #themeTabs select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;

      background-color: var(--helpBg);
      color: var(--helpColor);
      border: 1px solid var(--searchBorder);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.85em;
      background-repeat: no-repeat;
      background-position: right 8px center;
      background-size: 12px 16px;
      padding-right: 24px;
    }
    @media (prefers-color-scheme: dark) {
      #themeTabs select {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="16" viewBox="0 0 12 16"><path d="M3.5 6l2.5-2 2.5 2" stroke="%23ccc" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M3.5 10l2.5 2 2.5-2" stroke="%23ccc" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>');
      }
    }
    @media (prefers-color-scheme: light) {
      #themeTabs select {
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="16" viewBox="0 0 12 16"><path d="M3.5 6l2.5-2 2.5 2" stroke="%23333" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M3.5 10l2.5 2 2.5-2" stroke="%23333" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>');
      }
    }
    #themeTabs select:hover,
    #themeTabs select:focus {
      border-color: var(--headerColor);
      background-color: var(--searchBg);
    }
    #themeTabs select option {
      background: var(--bodyBg);
      color: var(--bodyColor);
    }
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
    /* --- Begin: themeTabs visibility --- */
    #themeTabs {
      position: fixed;
      bottom: 10px;
      right: 5px;
      width: auto;
      text-align: right;
      z-index: 1002;

      /* Hide by default; reveal on hover or when body has .show-controls */
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    /* Show when hovering the controls themselves or when keyboard focusing inside */
    #themeTabs:hover,
    #themeTabs:focus-within {
      opacity: 1;
      pointer-events: auto;
    }
    /* Also show when the body has .show-controls (toggled by hovering the ? help icon) */
    body.show-controls #themeTabs {
      opacity: 1;
      pointer-events: auto;
    }
    /* --- End: themeTabs visibility --- */
    .themeTab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      padding: 6px 12px;
      font-size: 0.9em;
      font-weight: 500;
      color: var(--bodyColor);
      cursor: pointer;
      transition: border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
    }

    .themeTab:hover {
      border-bottom: 2px solid var(--headerColor);
    }

    .themeTab.active {
      border-bottom: 2px solid var(--headerColor);
      font-weight: 600;
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
    .meta-block.notepad-note {
      background: var(--notepadBg);
    }
    .meta-block.boneyard-note {
      background: var(--boneyardBg);
    }
    .meta-block.synopsis-note {
      background: var(--helpBg);
    }
    /* Slightly darker background for inline notes */
    .meta-block:not(.notepad-note):not(.boneyard-note):not(.synopsis-note) {
      background: color-mix(in srgb, var(--helpBg) 90%, black 10%);
    }
    .filter-toggles {
      margin-bottom: 10px;
    }
    .filter-toggles label {
      margin-right: 18px;
      font-size: 0.98em;
      cursor: pointer;
    }
    /* Native checkbox accent color styling */
    input[type="checkbox"] {
      accent-color: var(--headerColor);
      color-scheme: light dark;
      width: 14px;
      height: 14px;
      cursor: pointer;
    }
    /* --- Sticky Header Styles --- */
    .sticky-header {
      position: sticky;
      top: 0;
      background: var(--bodyBg);
      z-index: 10;
      padding-top: 8px;
    }
    .sticky-header input,
    .sticky-header .tab-bar,
    .sticky-header .filter-toggles {
      margin-bottom: 8px;
    }
    /* If dark mode, override sticky-header background */
    @media (prefers-color-scheme: dark) {
      .sticky-header {
        background: var(--bodyBg);
      }
    }
  </style>
  <script>
    function finalizeColorButtonClick() {
      var val = document.getElementById('colorPickerInput').value;
      Beat.call('Beat.custom.finalizeTagColor(\'' + val + '\')');
    }
  </script>
  <script>
    function minimizeFTOutliner() {
      Beat.call('Beat.custom.minimizeFTOutliner()');
    }
    function maximizeFTOutliner() {
      Beat.call('Beat.custom.maximizeFTOutliner()');
    }
    window.addEventListener('blur', minimizeFTOutliner);
    window.addEventListener('focus', maximizeFTOutliner);
  </script>
  <style>
    #footerBar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 10px;
      z-index: 1002;
      pointer-events: none;
    }
    #footerBar > * {
      pointer-events: auto;
    }
  </style>
  <script>
    // Reveal bottom controls when hovering the entire footerBar (help icon + tabs)
    document.addEventListener('DOMContentLoaded', function () {
      var footer = document.getElementById('footerBar');
      function show() { document.body.classList.add('show-controls'); }
      function hideSoon() {
        setTimeout(function () {
          if (!(footer && footer.matches(':hover'))) {
            document.body.classList.remove('show-controls');
          }
        }, 120);
      }
      if (footer) {
        footer.addEventListener('mouseenter', show);
        footer.addEventListener('mouseleave', hideSoon);
        footer.addEventListener('focusin', show);
        footer.addEventListener('focusout', hideSoon);
      }
    });
  </script>
</head>
<body>
  <div class="sticky-header">
    <div class="tab-bar">
      <button class="themeTab ${activeTab==='keywords'?'active':''}" onclick="Beat.call('Beat.custom.switchTab(\\'keywords\\')')">Keywords</button>
      <button class="themeTab ${activeTab==='notes'?'active':''}" onclick="Beat.call('Beat.custom.switchTab(\\'notes\\')')">Notes + Synopsis</button>
    </div>
`;

  // --- Tabbed UI: Notes/Synopsis ---
  if (activeTab === 'notes') {
    // Add the search input field and filter toggles inside sticky-header
    html += `
      <input type="text" id="noteSearchInput" placeholder="Search notes and synopsis..." 
             oninput="window.filterNotes(this.value)">
      <div class="filter-toggles toggles">
        <label><input type="checkbox" ${showNotes ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'notes\\')')"> Notes</label>
        <label><input type="checkbox" ${showSynopsis ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'synopsis\\')')"> Synopsis</label>
        <label><input type="checkbox" ${showOmitted ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'omitted\\')')"> Omits</label>
        <label><input type="checkbox" ${showBoneyard ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'boneyard\\')')"> Boneyard</label>
        <label><input type="checkbox" ${showNotepad ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleFilter(\\'notepad\\')')"> Notepad</label>
        <label><input type="checkbox" ${showCompleted ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleShowCompleted()')"> Show completed</label>
      </div>
    </div> <!-- end sticky-header -->
    `;
    let notepadNoteIndex = 0;
    for (const [index, entry] of notesAndSynopsis.entries()) {
      const entryKey = entry.key || `${entry.type}:${entry.lineIndex ?? entry.absPos}`;
      const isOmitted = entry.type === 'omitted';
      const isBoneyard = entry.type === 'boneyard';
      const isNotepadNote = (
        entry.type === 'note' &&
        (entry.lineIndex === undefined || entry.absPos >= 90000000 || entry.key?.startsWith('notepad:')) &&
        (entry.sceneIndex === undefined && entry.range === undefined)
      );
      const isSynopsis = entry.type === 'synopsis';
      if (
        (
          (entry.type === 'note' && ((isNotepadNote && showNotepad) || (!isNotepadNote && showNotes))) ||
          (entry.type === 'synopsis' && showSynopsis) ||
          (entry.type === 'omitted' && showOmitted) ||
          (entry.type === 'boneyard' && showBoneyard)
        ) &&
        (showCompleted || !dismissedEntries.has(entryKey)) &&
        (showOmitted || !isOmitted)
      ) {
        const isDismissed = dismissedEntries.has(entryKey);
        const checked = isDismissed ? 'checked' : '';
        const style = isDismissed ? 'text-decoration: line-through; opacity: 0.5;' : '';
        // Truncate content to 1000 characters for display
        let displayContent = entry.content;
        if (displayContent.length > 1000) {
          displayContent = displayContent.slice(0, 1000) + '…';
        }
        // First, apply markdown for headers, bold, italic, underline, code
        let parsed = parseInlineMarkdown(displayContent);
        // Next, render inline tags for [[#tag]], [[@tag]], and raw #tag/@tag
        parsed = renderInlineTags(parsed);
        // Wrap [[beat ...]] or [[storyline ...]] as special pill...
        parsed = parsed.replace(/\[\[\s*(beat|storyline)\s*:?\s+([^\]]+?)\s*\]\]/gi, (_, _prefix, rest) => {
          const tokens = rest.trim().split(/\s+/);
          const first = tokens[0] || '';
          if (first.startsWith('#')) return `[[${_prefix}: ${rest}]]`; // leave unprocessed
          const clean = first;
          return `<span class="pill special">${clean.toLowerCase()}</span>`;
        });
        // Remove any remaining [[...]] wrappers
        parsed = parsed.replace(/\[\[(.*?)\]\]/g, '$1');
        // Add a data attribute for Boneyard entries (styling suspended)
        let boneyardAttr = isBoneyard ? ' data-is-boneyard="true"' : '';
        // Escape double quotes for data-original attribute
        const dataOriginal = entry.content.replace(/"/g, '&quot;');
        if (isNotepadNote) {
          // Render tag preview below notepad note using only tag tokens ([[#tag]], [[@tag]])
          const tagOnlyContent = (entry.content.match(/\[\[\s*[@#][a-zA-Z0-9_]+\s*\]\]/g) || []).join(' ');
          const renderedTagsHTML = renderInlineTags(tagOnlyContent);
          const hintId = `hint-${notepadNoteIndex++}`;
          html += `
            <div class="meta-block notepad-note" style="display: flex; flex-direction: column; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px dashed #ddd;">
              <div style="display: flex; align-items: center;">
                <input type="checkbox" ${checked} onclick="event.stopPropagation(); Beat.call('Beat.custom.toggleDismissed(\\'${entryKey}\\')')" style="margin-right: 8px;">
                <div
                  class="editable-note"
                  contenteditable="true"
                  onkeydown="if (event.key === 'Enter') event.preventDefault();"
                  onblur="(function(el){
                    const newContent = el.innerText;
                    Beat.call((newVal) => {
                      const lines = Beat.notepad.string.split('\\n');
                      const index = ${entry.lineIndex !== undefined ? entry.lineIndex : 0};
                      const newLines = newVal.split('\\n');
                      lines.splice(index, newLines.length, ...newLines);
                      Beat.notepad.string = lines.join('\\n');
                      Beat.custom.refreshUI();
                    }, newContent);
                  })(this)"
                  style="white-space: pre-wrap; flex: 1; ${style};"
                >${parseInlineMarkdown(entry.content)}</div>
                <button onclick="Beat.call(() => {
      const lines = Beat.notepad.string.split('\\n');
      lines.splice(${entry.lineIndex}, 1);
      Beat.notepad.string = lines.join('\\n');
      Beat.custom.refreshUI();
    })"
                style="margin-left: 8px; background: transparent; border: none; color: #888; font-size: 1.2em; cursor: pointer;">×</button>
                <div id="${hintId}" class="note-hint" style="display:none; margin-left:8px; color:#888; font-size:0.85em; font-style:italic; user-select:none; margin-top:4px;">Note in Notepad</div>
              </div>
              ${renderedTagsHTML.trim() ? `<div class="rendered-tags" style="margin-top:4px; font-size:0.85em; color:#999; opacity:0.8;">${renderedTagsHTML}</div>` : ''}
            </div>
          `;
        } else {
          html += `
            <div class="meta-block${isBoneyard ? ' boneyard-note' : ''}${isSynopsis ? ' synopsis-note' : ''}" data-original="${dataOriginal}"${boneyardAttr} style="display: flex; align-items: center;">
              <input type="checkbox" ${checked} onclick="Beat.call('Beat.custom.toggleDismissed(\\'${entryKey}\\')')" style="margin-right: 8px;">
              <div style="white-space: pre-wrap; cursor:pointer; ${style}; flex: 1;" onclick="Beat.call('Beat.custom.scrollToMetaEntry(\\'${entry.absPos}\\')')">${parsed}</div>
            </div>
          `;
        }
      }
    }
    // Add the floating plus button for Notes + Synopsis tab
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
  .pill.special {
    display: inline-block;
    margin: 0 3px 0 0;
    padding: 2px 8px;
    border-radius: 16px;
    background: transparent;
    border: 2px solid #687d9d;
    color: #687d9d;
    font-size: 0.9em;
    font-weight: 600;
    vertical-align: middle;
  }
  .floating-add-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #687d9d;
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    font-size: 22px;
    text-align: center;
    cursor: pointer;
    z-index: 1001;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .floating-add-btn:hover {
    background-color: #506082;
  }
</style>
<button class="floating-add-btn" title="Add note to Notepad"
  onmouseenter="window._hoverScroll = setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50)"
  onmouseleave="clearTimeout(window._hoverScroll)"
  onclick="Beat.call(() => {
    let np = Beat.notepad.string;
    if (np.length > 0 && !np.endsWith('\\n')) np += '\\n';
    Beat.notepad.string = np + '\\nTypeYourNote';
    Beat.custom.refreshUI();
  })">+</button>
<script>
  window.filterNotes = function(query) {
    const blocks = document.querySelectorAll('.meta-block');
    query = query.toLowerCase();
    blocks.forEach(block => {
      let text = block.getAttribute('data-original') || block.innerText;
      text = text.replace(/<br\\s*\\/?>/gi, ' ').toLowerCase();
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
  <div class="sticky-header">
    <input type="text" id="keywordSearchInput" placeholder="Search keywords..." 
           oninput="window.filterKeywords(this.value)"
           style="width: 100%; padding: 6px 10px; font-size: 0.95em; border-radius: 6px; border: 1px solid var(--searchBorder, #ccc); background-color: var(--searchBg, #fff); color: var(--searchColor, #000);">
    <label style="margin-top: 6px; display:block;" title="Hide Keywords in Notepad, Boneyard, and Omits.">
      <input type="checkbox" ${hideBackgroundTags ? 'checked' : ''} onclick="Beat.call('Beat.custom.toggleHideBackgroundTags()')">
      Hide Keywords in Notepad, Boneyard, & Omits
    </label>
    <h2>Favorites</h2>
  </div>
  <div id="favoritesContainer" class="container"
       ondragover="event.preventDefault(); this.classList.add('drag-over');"
       ondragleave="this.classList.remove('drag-over');"
       ondrop="(function(e){ e.preventDefault(); this.classList.remove('drag-over'); var tag = e.dataTransfer.getData('text/plain'); Beat.call('Beat.custom.dropToFavorites(\\'' + tag + '\\')'); }).call(this, event)">
  `;

  for (const ftag of favoriteTags) {
    if (hideBackgroundTags) {
      const occs = tagsByName[ftag];
      if (!occs || occs.every(o => {
        const entry = notesAndSynopsis.find(n => n.lineIndex === o.lineIndex);
        return o.lineIndex === -1 || (entry && ['omitted', 'boneyard'].includes(entry.type));
      })) continue;
    }
    const occurrences = tagsByName[ftag] || [];
    const isSpecial = occurrences.some(o => o.special === true);
    const color = pickColorForTag(ftag);
    const borderColor = darkenHexColor(color, 0.2);
    const notepadCount = occurrences.filter(o => o.lineIndex < 0).length;
    const docCount = occurrences.filter(o => o.lineIndex >= 0).length;
    // Tooltip position and count relative to document entries only
    const pos = (occurrenceIndex[ftag] != null && docCount > 0 ? (occurrenceIndex[ftag] % docCount) : 0) + 1;
    const pillClass = (activeTooltipTag === ftag) ? "tag-pill active" : "tag-pill";
    let pillStyle;
    if (isSpecial) {
      pillStyle = `background-color:transparent; border:2px solid ${color}; color:${color};`;
    } else {
      pillStyle = `background-color:${color}; border:1px solid ${borderColor}; color:${getContrastColor(color)};`;
    }
    // Extract only the first word for display
    let tagLabel = ftag.split(/\s+/)[0];
    // Determine if all occurrences are notepad-only
    const notepadOnly = occurrences.every(o => o.lineIndex === -1);
    html += `
    <div class="${pillClass}"
         style="${pillStyle}"
         draggable="true"
         ondragstart="event.dataTransfer.setData('text/plain','${ftag}');"
         ${notepadOnly ? '' : `onclick="Beat.call('Beat.custom.handlePillClick(\\'${ftag}\\')')"`}
         onmouseleave="Beat.call('Beat.custom.onPillMouseLeave(\\'${ftag}\\')')"
         oncontextmenu="event.preventDefault(); Beat.call('Beat.custom.handleTagRightClick(\\'${ftag}\\', ' + event.clientX + ', ' + event.clientY + ')');">
      ${tagLabel}
      <span class="tooltip">
        ${notepadOnly ? '' : `${pos}/${docCount}`} ${notepadOnly ? 'in Notepad' : (notepadCount > 0 ? 'in document (also in Notepad)' : 'in document')}
      </span>
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
  const otherTags = allTagNames.filter(t => {
    if (favoriteTags.includes(t)) return false;
    if (!hideBackgroundTags) return true;
    const occs = tagsByName[t];
    return occs.some(o => {
      const entry = notesAndSynopsis.find(n => n.lineIndex === o.lineIndex);
      return o.lineIndex !== -1 && (!entry || !['omitted', 'boneyard'].includes(entry.type));
    });
  });
  if (!otherTags.length) {
    html += `<p style="color:#999;">No other keywords found.</p>`;
  } else {
    for (const tagName of otherTags) {
      const occurrences = tagsByName[tagName];
      const isSpecial = occurrences.some(o => o.special === true);
      const color = pickColorForTag(tagName);
      const borderColor = darkenHexColor(color, 0.2);
      const notepadCount = occurrences.filter(o => o.lineIndex < 0).length;
      const docCount = occurrences.filter(o => o.lineIndex >= 0).length;
      // Tooltip position and count relative to document entries only
      const pos = (occurrenceIndex[tagName] != null && docCount > 0 ? (occurrenceIndex[tagName] % docCount) : 0) + 1;
      const pillClass = (activeTooltipTag === tagName) ? "tag-pill active" : "tag-pill";
      let pillStyle;
      if (isSpecial) {
        pillStyle = `background-color:transparent; border:2px solid ${color}; color:${color};`;
      } else {
        pillStyle = `background-color:${color}; border:1px solid ${borderColor}; color:${getContrastColor(color)};`;
      }
      // Extract only the first word for display
      let tagLabel = tagName.split(/\s+/)[0];
      // Determine if all occurrences are notepad-only
      const notepadOnly = occurrences.every(o => o.lineIndex === -1);
      html += `
      <div class="${pillClass}"
           style="${pillStyle}"
           draggable="true"
           ondragstart="event.dataTransfer.setData('text/plain','${tagName}');"
           ${notepadOnly ? '' : `onclick="Beat.call('Beat.custom.handlePillClick(\\'${tagName}\\')')"`}
           onmouseleave="Beat.call('Beat.custom.onPillMouseLeave(\\'${tagName}\\')')"
           oncontextmenu="event.preventDefault(); Beat.call('Beat.custom.handleTagRightClick(\\'${tagName}\\', ' + event.clientX + ', ' + event.clientY + ')');">
        ${tagLabel}
        <span class="tooltip">
          ${notepadOnly ? '' : `${pos}/${docCount}`} ${notepadOnly ? 'in Notepad' : (notepadCount > 0 ? 'in document (also in Notepad)' : 'in document')}
        </span>
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
  <div id="footerBar">
    <div id="helpIcon" onclick="document.getElementById('helpPopover').style.display = (document.getElementById('helpPopover').style.display=='block'?'none':'block');">?</div>
    <div id="helpPopover">
      <p>Add a hashtag (#) or at-sign (@) inside an inline note in your document to create a tag. For example: [[This creates a #tag]] and [[This creates an @tag]].</p>
      <p>You can also tag Storylines/Beats: [[Storyline: #tag]] or [[Beat #tag]].</p>
      <p>Click a tag in the plugin to jump to its location in the document.</p>
      <p>Left click to change the color of a tag.</p>
      <p>Use Ctrl+Cmd+K to toggle the plugin.</p>
      <p>Close the window to remove highlights from the document.</p>
      <button onclick="document.getElementById('helpPopover').style.display='none';">Close</button>
    </div>
    <div id="themeTabs">
      <label style="margin-right:12px;">
        Auto-collapse:
        <select onchange="Beat.call('Beat.custom.setCollapseMode(\\'' + this.value + '\\')')">
          <option value="off"   ${collapseMode==='off'   ? 'selected' : ''}>Off</option>
          <option value="left"  ${collapseMode==='left'  ? 'selected' : ''}>Left</option>
          <option value="right" ${collapseMode==='right' ? 'selected' : ''}>Right</option>
        </select>
      </label>
      <label style="margin-right:12px;">
        Highlight Contrast:
        <select onchange="Beat.call('Beat.custom.setEnforceContrast(\\'' + this.value + '\\')')">
          <option value="on"  ${enforceContrast ? 'selected' : ''}>On</option>
          <option value="off" ${!enforceContrast ? 'selected' : ''}>Off</option>
        </select>
      </label>
      <label style="margin-right:12px;">
        Theme:
        <select onchange="Beat.call('Beat.custom.setThemeMode(\\'' + this.value + '\\')')">
          <option value="off"   disabled>Type</option>
          <option value="light"  ${themeMode==='light'  ? 'selected' : ''}>Light</option>
          <option value="dark"   ${themeMode==='dark'   ? 'selected' : ''}>Dark</option>
          <option value="system" ${themeMode==='system' ? 'selected' : ''}>System</option>
        </select>
      </label>
    </div>
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
    const baseColor = pickColorForTag(occ.tag);
    const hl = ensureBgContrastHuePreserving(baseColor, 8.0);
    Beat.textBackgroundHighlight(hl, occ.absPos, occ.matchLen);
    occ.color = hl;
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
    }
  } else {
    main();
    isPluginVisible = true;
  }
}

const toggleMenuItem = Beat.menuItem("Keywords", ["cmd", "ctrl", "k"], togglePluginVisibility);
Beat.menu("Keywords", [toggleMenuItem]);

// --- Modified onKeyDown block using myWindow ---


main();
