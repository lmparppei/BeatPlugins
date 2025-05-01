/*
Title: The Elements of Style
<Description>
Inspired by iA Writer’s Syntax Highlighting and Strunk & White’s classic <em>The Elements of Style</em>, 
    this tool helps you apply timeless writing principles. It highlights adverbs, adjectives, nominalizations, weak verbs, passive voice, conjunctions, fillers, redundancies, and clichés—making it easier to spot areas 
    for potential revision. While highlighted words and phrases aren’t necessarily incorrect, 
    this tool empowers you to clarify, tighten, and strengthen your writing—giving you greater control and 
    confidence in your text. 
    
    <br><br>Use CTRL+CMD+S to toggle plugin window.
        <br>Use CTRL+CMD+H to toggle plugin window and highlights.

    <br><br><strong>Disclaimer:</strong> Please note that this plugin relies on automated heuristics to identify various linguistic elements and may occasionally produce false positives or miss some instances. We encourage you to use your own discretion when interpreting the highlights and making revisions.
</Description>
Image: ElementsOfStyle.png
Version: 1.3
*/
  
(function() {
  // Ensure Beat.custom exists.
  if (!Beat.custom) {
    Beat.custom = {};
  }

  /* ----------------------------------------------------------------
     GLOBAL ARRAYS & TOGGLES
  ---------------------------------------------------------------- */

  let adverbs = [];
  let adjectives = [];
  let allNominalizations = [];  // for collecting nominalization tokens (to later filter)
  let nominalizations = [];     // repeating nominalizations only
  let verbs = [];
  let passiveVoice = [];
  let conjunctions = [];
  let fillers = [];
  let redundancies = [];
  let cliches = [];

  let adverbHighlights = [];
  let adjectiveHighlights = [];
  let nominalizationHighlights = [];
  let verbHighlights = [];
  let passiveVoiceHighlights = [];
  let conjunctionHighlights = [];
  let fillerHighlights = [];
  let redundancyHighlights = [];
  let clicheHighlights = [];

  let showAdverbs = (Beat.getUserDefault("syntax_showAdverbs") !== undefined) ? Beat.getUserDefault("syntax_showAdverbs") : true;
  let showAdjectives = (Beat.getUserDefault("syntax_showAdjectives") !== undefined) ? Beat.getUserDefault("syntax_showAdjectives") : true;
  let showNominalizations = (Beat.getUserDefault("syntax_showNominalizations") !== undefined) ? Beat.getUserDefault("syntax_showNominalizations") : true;
  let showVerbs = (Beat.getUserDefault("syntax_showVerbs") !== undefined) ? Beat.getUserDefault("syntax_showVerbs") : true;
  let showPassiveVoice = (Beat.getUserDefault("syntax_showPassiveVoice") !== undefined) ? Beat.getUserDefault("syntax_showPassiveVoice") : true;
  let showConjunctions = (Beat.getUserDefault("syntax_showConjunctions") !== undefined) ? Beat.getUserDefault("syntax_showConjunctions") : true;
  let showFillers = (Beat.getUserDefault("syntax_showFillers") !== undefined) ? Beat.getUserDefault("syntax_showFillers") : true;
  let showRedundancies = (Beat.getUserDefault("syntax_showRedundancies") !== undefined) ? Beat.getUserDefault("syntax_showRedundancies") : true;
  let showCliches = (Beat.getUserDefault("syntax_showCliches") !== undefined) ? Beat.getUserDefault("syntax_showCliches") : true;

  Beat.custom.currentTokenIndex = 0;
  let isControlWindowVisible = true;
  // Global flag for whether highlights are enabled.
  let highlightsOn = true;

  /* ----------------------------------------------------------------
     HELPER FUNCTIONS
  ---------------------------------------------------------------- */

  /**
   * removeAllHighlights
   * Clears all background highlights.
   */
  function removeAllHighlights() {
    const allHighlights = [
      ...adverbHighlights, 
      ...adjectiveHighlights, 
      ...nominalizationHighlights, 
      ...verbHighlights, 
      ...passiveVoiceHighlights, 
      ...conjunctionHighlights, 
      ...fillerHighlights, 
      ...redundancyHighlights, 
      ...clicheHighlights
    ];
    allHighlights.forEach(hl => {
      Beat.removeBackgroundHighlight(hl.absPos, hl.length);
    });
    adverbHighlights = [];
    adjectiveHighlights = [];
    nominalizationHighlights = [];
    verbHighlights = [];
    passiveVoiceHighlights = [];
    conjunctionHighlights = [];
    fillerHighlights = [];
    redundancyHighlights = [];
    clicheHighlights = [];
  }

  /**
   * isInsideInlineNote
   * Returns true if a match index is within [[...]] in lineStr.
   */
  function isInsideInlineNote(lineStr, pos) {
    const regex = /\[\[.*?\]\]/g;
    let match;
    while ((match = regex.exec(lineStr)) !== null) {
      const start = match.index;
      const end = regex.lastIndex;
      if (pos >= start && pos < end) {
        return true;
      }
    }
    return false;
  }

  /**
   * highlightTokens
   * Applies textBackgroundHighlight for each token in tokens[].
   */
  function highlightTokens(tokens, color, highlightArray) {
    let lines = Beat.lines();
    tokens.forEach(token => {
      let line = lines[token.lineNum];
      let idx = (typeof token.index === "number") ? token.index : line.string.indexOf(token.word);
      if (idx >= 0) {
        let absPos = line.position + idx;
        Beat.textBackgroundHighlight(color, absPos, token.word.length);
        highlightArray.push({ absPos, length: token.word.length, lineNum: token.lineNum });
      }
    });
  }

  /**
   * flashHighlight
   * Alternates between highlight and reformat to produce a "flash."
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
   * getCategoryColor
   * Returns a default color for each category.
   */
  function getCategoryColor(category) {
    switch (category) {
      case 'adverbs': return "#b84f50";
      case 'adjectives': return "#837a40";
      case 'nominalizations': return "#96601d";
      case 'verbs': return "#44785c";
      case 'passiveVoice': return "#4a838f";
      case 'conjunctions': return "#78674c";
      case 'fillers': return "#7b54a4";
      case 'redundancies': return "#a3668d";
      case 'cliches': return "#527099";
      default: return "#ff0000";
    }
  }

  /* ----------------------------------------------------------------
     CONSOLIDATED TOKEN GATHERING + HIGHLIGHT
  ---------------------------------------------------------------- */

  /**
   * gatherTokens
   * Single pass through lines, skipping synopses, omitted lines, or inline note content.
   */
  function gatherTokens() {
    adverbs = [];
    adjectives = [];
    allNominalizations = [];
    nominalizations = [];
    verbs = [];
    passiveVoice = [];
    conjunctions = [];
    fillers = [];
    redundancies = [];
    cliches = [];

    const patterns = {
      adverbs:       { regex: /\b\w+ly\b/gi, target: adverbs },
      adjectives:    { regex: /\b\w+(ous|ful|able|ible|ic|ive|al)\b/gi, target: adjectives },
      nominalizations: { regex: /\b\w+(?:able|ation|ment|ness|ity|age|ance|ence|ency|ian|ion|ism)s?\b/gi, target: allNominalizations },
      verbs:         { regex: /\b(?:is|are|was|were|be|been|being|have|has|had|do|does|did|seem|seems|seemed|appear|appears|appeared)\b/gi, target: verbs },
      passive:       { regex: /\b(?:is|are|was|were|be|been|being)\b\s+\b\w+(?:ed|en|n|t|wn|ne)\b/gi, target: passiveVoice },
      conjunctions:  { regex: /\b(?:and|but|or|nor|for|yet|so)\b/gi, target: conjunctions },
      fillers:       { regex: /\b(?:um|uh|er|ah|hmm|oh|okay|alright|anyway|actually|literally|I guess|I mean|sort of|kind of|kinda|basically|pretty much|essentially|just|really|honestly|seriously|clearly|obviously|definitely|totally|completely)\b/gi, target: fillers },
      redundancies:  { regex: /\b(?:true fact|free gift|advance warning|final outcome|unexpected surprise|completely unanimous|past history|added bonus|basic fundamentals|basic necessities|exact duplicate|exact replica|reason why|close scrutiny|final conclusion|over exaggerate|past memories|past experience|false pretense|circle around|collaborate together|continue on|current trend|each and every|empty space|estimated roughly|first began|foreign imports|frozen ice|full capacity|future prospects|general public|general consensus)\b/gi, target: redundancies },
      cliches:       { regex: /\b(?:at the end of the day|think outside the box|only time will tell|in the nick of time|better late than never|as luck would have it|it is what it is|back to square one|beat around the bush|easier said than done|every cloud has a silver lining|go the extra mile|hit the nail on the head|last but not least|let bygones be bygones|the writing on the wall|tip of the iceberg|water under the bridge|when push comes to shove|you live and learn)\b/gi, target: cliches }
    };

    const lines = Beat.lines();
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      // Skip synopsis lines and omitted lines.
      if (line.string.trim().startsWith("=") || line.omitted) continue;
      if (line.typeAsString() === "Dialogue" || line.typeAsString() === "Action") {
        for (let category in patterns) {
          let { regex, target } = patterns[category];
          regex.lastIndex = 0;
          let match;
          while ((match = regex.exec(line.string)) !== null) {
            if (isInsideInlineNote(line.string, match.index)) continue;
            target.push({ word: match[0], lineNum: i, index: match.index });
          }
        }
      }
    }

    // Highlight all nominalizations without filtering for repetition
    nominalizations = allNominalizations;
  }

  /**
   * updateAllTokens
   * Gathers tokens in a single pass, highlights them, and combines them for navigation.
   */
  function updateAllTokens(range, callback) {
    // Gather new tokens
    gatherTokens();
    // Remove old highlights
    removeAllHighlights();

    // Only apply highlights if they are enabled
    if (highlightsOn) {
      if (showAdverbs)             highlightTokens(adverbs,        "#b84f50", adverbHighlights);
      if (showAdjectives)          highlightTokens(adjectives,     "#837a40", adjectiveHighlights);
      if (showNominalizations)     highlightTokens(nominalizations,  "#96601d", nominalizationHighlights);
      if (showVerbs)               highlightTokens(verbs,          "#44785c", verbHighlights);
      if (showPassiveVoice)        highlightTokens(passiveVoice,   "#4a838f", passiveVoiceHighlights);
      if (showConjunctions)        highlightTokens(conjunctions,   "#78674c", conjunctionHighlights);
      if (showFillers)             highlightTokens(fillers,        "#7b54a4", fillerHighlights);
      if (showRedundancies)        highlightTokens(redundancies,   "#a3668d", redundancyHighlights);
      if (showCliches)             highlightTokens(cliches,        "#527099", clicheHighlights);
    }
    
    // Combine tokens from all enabled categories for nav
    let combinedTokens = [];
    if (showAdverbs)             combinedTokens = combinedTokens.concat(adverbs.map(t => Object.assign({ category: 'adverbs' }, t)));
    if (showAdjectives)          combinedTokens = combinedTokens.concat(adjectives.map(t => Object.assign({ category: 'adjectives' }, t)));
    if (showNominalizations)     combinedTokens = combinedTokens.concat(nominalizations.map(t => Object.assign({ category: 'nominalizations' }, t)));
    if (showVerbs)               combinedTokens = combinedTokens.concat(verbs.map(t => Object.assign({ category: 'verbs' }, t)));
    if (showPassiveVoice)        combinedTokens = combinedTokens.concat(passiveVoice.map(t => Object.assign({ category: 'passiveVoice' }, t)));
    if (showConjunctions)        combinedTokens = combinedTokens.concat(conjunctions.map(t => Object.assign({ category: 'conjunctions' }, t)));
    if (showFillers)             combinedTokens = combinedTokens.concat(fillers.map(t => Object.assign({ category: 'fillers' }, t)));
    if (showRedundancies)        combinedTokens = combinedTokens.concat(redundancies.map(t => Object.assign({ category: 'redundancies' }, t)));
    if (showCliches)             combinedTokens = combinedTokens.concat(cliches.map(t => Object.assign({ category: 'cliches' }, t)));
    
    // Compute absolute positions
    const lines = Beat.lines();
    combinedTokens = combinedTokens.map(token => {
      let line = lines[token.lineNum];
      let idx = (typeof token.index === "number") ? token.index : line.string.indexOf(token.word);
      return Object.assign(token, { absPos: line.position + idx });
    });
    combinedTokens.sort((a, b) => a.absPos - b.absPos);
    Beat.custom.allTokens = combinedTokens;

    callback();
  }

  /**
   * fullUpdateHighlights
   * Called to parse & highlight the entire document
   */
  function fullUpdateHighlights() {
    let lines = Beat.lines();
    let range = { start: 0, end: lines.length };
    updateAllTokens(range, function() {
      if (controlWindow) {
        controlWindow.setHTML(createControlPanelHTML());
      }
    });
  }

  /**
   * A small helper for code that calls "updateHighlights" 
   * Instead we define it here as an alias for fullUpdateHighlights
   */
  function updateHighlights() {
    fullUpdateHighlights();
  }

  /**
   * Debounced full update
   */
  let lastUpdateRequestTime = 0;
  const debounceDelay = 300; // ms

  function debouncedFullUpdate() {
    lastUpdateRequestTime = Date.now();
    Beat.timer(debounceDelay / 1000, function() {
      if (Date.now() - lastUpdateRequestTime >= debounceDelay) {
        fullUpdateHighlights();
        Beat.custom.currentTokenIndex = 0;
        if (controlWindow) {
          controlWindow.setHTML(createControlPanelHTML());
        }
      }
    });
  }

  // Listen for text changes
  Beat.onTextChange((location, length) => {
    debouncedFullUpdate();
    if (controlWindow) {
      controlWindow.setHTML(createControlPanelHTML());
    }
  });

  /* ----------------------------------------------------------------
     NAVIGATION
  ---------------------------------------------------------------- */

  Beat.custom.showPreviousToken = function() {
    let tokens = Beat.custom.allTokens || [];
    if (Beat.custom.currentTokenIndex > 0) {
      Beat.custom.currentTokenIndex--;
      let token = tokens[Beat.custom.currentTokenIndex];
      Beat.custom.scrollToLine(token.lineNum);
      let color = getCategoryColor(token.category);
      flashHighlight(color, token.absPos, token.word.length, 3);
      Beat.custom.updateCounter();
    }
  };

  Beat.custom.showNextToken = function() {
    let tokens = Beat.custom.allTokens || [];
    if (Beat.custom.currentTokenIndex < tokens.length - 1) {
      Beat.custom.currentTokenIndex++;
      let token = tokens[Beat.custom.currentTokenIndex];
      Beat.custom.scrollToLine(token.lineNum);
      let color = getCategoryColor(token.category);
      flashHighlight(color, token.absPos, token.word.length, 3);
      Beat.custom.updateCounter();
    }
  };

  Beat.custom.scrollToLine = function(lineNum) {
    let line = Beat.lines()[lineNum];
    Beat.scrollTo(line.position);
  };

  Beat.custom.updateCounter = function() {
    if (controlWindow) {
      controlWindow.setHTML(createControlPanelHTML());
    }
  };

  /* ----------------------------------------------------------------
     TOGGLES
  ---------------------------------------------------------------- */

  Beat.custom.toggleCategory = function(category) {
    switch (category) {
      case 'adverbs':
        showAdverbs = !showAdverbs;
        Beat.setUserDefault("syntax_showAdverbs", showAdverbs);
        break;
      case 'adjectives':
        showAdjectives = !showAdjectives;
        Beat.setUserDefault("syntax_showAdjectives", showAdjectives);
        break;
      case 'nominalizations':
        showNominalizations = !showNominalizations;
        Beat.setUserDefault("syntax_showNominalizations", showNominalizations);
        break;
      case 'verbs':
        showVerbs = !showVerbs;
        Beat.setUserDefault("syntax_showVerbs", showVerbs);
        break;
      case 'passiveVoice':
        showPassiveVoice = !showPassiveVoice;
        Beat.setUserDefault("syntax_showPassiveVoice", showPassiveVoice);
        break;
      case 'conjunctions':
        showConjunctions = !showConjunctions;
        Beat.setUserDefault("syntax_showConjunctions", showConjunctions);
        break;
      case 'fillers':
        showFillers = !showFillers;
        Beat.setUserDefault("syntax_showFillers", showFillers);
        break;
      case 'redundancies':
        showRedundancies = !showRedundancies;
        Beat.setUserDefault("syntax_showRedundancies", showRedundancies);
        break;
      case 'cliches':
        showCliches = !showCliches;
        Beat.setUserDefault("syntax_showCliches", showCliches);
        break;
    }
    fullUpdateHighlights();
    if (controlWindow) {
      controlWindow.setHTML(createControlPanelHTML());
    }
  };

  // Toggle highlights on/off.
  Beat.custom.toggleHighlights = function() {
    highlightsOn = !highlightsOn;
    if (highlightsOn) {
      fullUpdateHighlights();
    } else {
      removeAllHighlights();
    }
    if (controlWindow) {
      controlWindow.setHTML(createControlPanelHTML());
    }
  };

  // NEW: Toggle both plugin visibility and highlights.
  function toggleVisibilityAndHighlights() {
    if (isControlWindowVisible) {
      // Hide control panel and turn off highlights.
      controlWindow.hide();
      isControlWindowVisible = false;
      highlightsOn = false;
      removeAllHighlights();
    } else {
      // Show control panel and turn on highlights.
      controlWindow.show();
      isControlWindowVisible = true;
      highlightsOn = true;
      fullUpdateHighlights();
    }
    if (controlWindow) {
      controlWindow.setHTML(createControlPanelHTML());
    }
  }

  /* ----------------------------------------------------------------
     CONTROL PANEL
  ---------------------------------------------------------------- */

  function createControlPanelHTML() {
    let tokens = Beat.custom.allTokens || [];
    let current = (typeof Beat.custom.currentTokenIndex === "number") ? Beat.custom.currentTokenIndex : 0;
    let total = tokens.length;
    let counterHTML = `<p style="margin: 8px 0;">Occurrence: ${total > 0 ? (current + 1) + " / " + total : "0 / 0"}</p>`;
    
    let styleBlock = `
      <style>
        :root {
          --panel-bg: #f5f5f5;
          --panel-text: #333;
          --button-bg: #fff;
          --button-text: #000;
          --button-border: #ccc;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --panel-bg: #2a2a2a;
            --panel-text: #ddd;
            --button-bg: #444;
            --button-text: #fff;
            --button-border: #666;
          }
        }
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          background-color: var(--panel-bg);
          color: var(--panel-text);
          font-family: sans-serif;
          box-sizing: border-box;
        }
        .control-panel {
          padding: 10px;
          box-sizing: border-box;
        }
        .control-panel label {
          color: #fff !important;
        }
        button {
          background: var(--button-bg);
          color: var(--button-text);
          border: 1px solid var(--button-border);
          cursor: pointer;
          padding: 3px 6px;
          border-radius: 4px;
          margin-right: 6px;
        }
        button:hover {
          background: #ddd;
          color: #000;
        }
        @media (prefers-color-scheme: dark) {
          button:hover {
            background: #555;
            color: #fff;
          }
        }
        input[type="checkbox"] {
          accent-color: var(--button-text);
        }
        hr {
          border: none;
          border-top: 1px solid var(--button-border);
        }
        
        .toggle-switch {
          position: relative;
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
          margin: 8px 0;
        }
        
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .slider {
          position: relative;
          width: 40px;
          height: 20px;
          background-color: #ccc;
          border-radius: 20px;
          transition: background-color 0.3s;
          margin-left: 4px;
        }
        
        .slider::before {
          content: "";
          position: absolute;
          height: 16px;
          width: 16px;
          left: 2px;
          top: 2px;
          background-color: white;
          border-radius: 50%;
          transition: transform 0.3s;
        }
        
        .toggle-switch input:checked + .slider {
          background-color: #0a84ff;
        }
        
        .toggle-switch input:checked + .slider::before {
          transform: translateX(20px);
        }

.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  margin: 8px 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: relative;
  width: 40px;
  height: 20px;
  background-color: #ccc;
  border-radius: 20px;
  transition: background-color 0.3s;
}

.slider::before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 2px;
  top: 2px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

        .toggle-switch input:checked + .slider {
          background-color: #0a84ff;
        }

        .toggle-switch input:checked + .slider::before {
          transform: translateX(20px);
        }
        .toggle-switch span {
          color: var(--panel-text);
        }
        }
      </style>
    `;
    
    let checkboxHTML = `
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
        <label style="background-color:#b84f50; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showAdverbs ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'adverbs\\')')"> Adverbs
        </label>
        <label style="background-color:#837a40; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showAdjectives ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'adjectives\\')')"> Adjectives
        </label>
        <label style="background-color:#96601d; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showNominalizations ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'nominalizations\\')')"> Nominalizations
        </label>
        <label style="background-color:#44785c; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showVerbs ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'verbs\\')')"> Weak Verbs
        </label>
        <label style="background-color:#4a838f; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showPassiveVoice ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'passiveVoice\\')')"> Passive Voice
        </label>
        <label style="background-color:#78674c; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showConjunctions ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'conjunctions\\')')"> Conjunctions
        </label>
        <label style="background-color:#7b54a4; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showFillers ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'fillers\\')')"> Fillers
        </label>
        <label style="background-color:#a3668d; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showRedundancies ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'redundancies\\')')"> Redundancies
        </label>
        <label style="background-color:#527099; padding:2px 4px; border-radius:3px;">
          <input type="checkbox" ${showCliches ? "checked" : ""} onclick="Beat.call('Beat.custom.toggleCategory(\\'cliches\\')')"> Clichés
        </label>
      </div>
      <hr style="margin:8px 0;">
    `;
    
    // Button to toggle highlights on/off, and navigation, in a flex container with gap
    let toggleHighlightsAndNav = `
      <div style="display: flex; align-items: center; margin-top: 4px; gap: 10px;">
        <label class="toggle-switch" style="margin: 0;">
          <span style="margin-right: 8px;">Highlights</span>
          <input type="checkbox" ${highlightsOn ? "checked" : ""} onchange="Beat.call('Beat.custom.toggleHighlights()')" />
          <span class="slider"></span>
        </label>
        <button onclick="Beat.call('Beat.custom.showPreviousToken()');">Previous</button>
        <button onclick="Beat.call('Beat.custom.showNextToken()');">Next</button>
      </div>
      <p style="margin: 8px 0;">Occurrence: ${total > 0 ? (current + 1) + " / " + total : "0 / 0"}</p>
    `;
    return styleBlock + `<div class="control-panel">` + checkboxHTML + toggleHighlightsAndNav + `</div>`;
  }

  /* ----------------------------------------------------------------
     UI WINDOW CREATION
  ---------------------------------------------------------------- */

  let controlHTML = createControlPanelHTML();
  let controlWindow = Beat.htmlWindow(controlHTML, 400, 200, function() {
    removeAllHighlights();
    Beat.end();
  });
  
  controlWindow.disableMaximize = true;
  controlWindow.disableFullScreen = true;
  controlWindow.disableMinimize = true;
  
  let frame = controlWindow.getFrame ? controlWindow.getFrame() : { width: 400, height: 200 };
  let centerX = (controlWindow.innerWidth ? controlWindow.innerWidth : 800) / 2 - frame.width / 2;
  let centerY = (controlWindow.innerHeight ? controlWindow.innerHeight : 600) / 2 - frame.height / 2;
  controlWindow.setFrame(centerX, centerY, frame.width, frame.height);
  // On plugin launch, do a full parse/highlight
  fullUpdateHighlights();
  Beat.custom.allTokens = Beat.custom.allTokens || [];
  Beat.custom.updateCounter = function() {
    if (controlWindow) {
      controlWindow.setHTML(createControlPanelHTML());
    }
  };
  Beat.custom.updateCounter();

  /**
   * toggleControlWindow
   * Toggles the control panel only
   */
  function toggleControlWindow() {
    if (controlWindow) {
      if (isControlWindowVisible) {
        controlWindow.hide();
        isControlWindowVisible = false;
      } else {
        controlWindow.show();
        isControlWindowVisible = true;
      }
    } else {
      let controlHTML = createControlPanelHTML();
      controlWindow = Beat.htmlWindow(controlHTML, 400, 200, function() {
        removeAllHighlights();
        Beat.end();
      });
      let frame = controlWindow.getFrame ? controlWindow.getFrame() : { width: 400, height: 200 };
      let centerX = (controlWindow.innerWidth ? controlWindow.innerWidth : 800) / 2 - frame.width / 2;
      let centerY = (controlWindow.innerHeight ? controlWindow.innerHeight : 600) / 2 - frame.height / 2;
      controlWindow.setFrame(centerX, centerY, frame.width, frame.height);
      isControlWindowVisible = true;
    }
  }

  //  "The Elements of Style" menu items
  const toggleWindowMenuItem = Beat.menuItem("Toggle Window", ["cmd", "ctrl", "s"], toggleControlWindow);
  const toggleVisibilityAndHighlightsMenuItem = Beat.menuItem("Toggle Window & Highlights", ["cmd", "ctrl", "h"], toggleVisibilityAndHighlights);

  Beat.menu("The Elements of Style", [
    toggleWindowMenuItem,
    toggleVisibilityAndHighlightsMenuItem
  ]);
})();
