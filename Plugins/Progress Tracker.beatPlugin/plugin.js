/*
Title: Progress Tracker
Copyright: Bode Pickman
<Description>
<section class="plugin-description">
  <p>
    Progress Tracker helps you stay on target with both daily and long-term writing objectives.
  </p>
  <ul>
    <li>Define daily and project goals with page or word counts</li>
    <li>Monitor progress in real time with nested circular visualizations</li>
    <li>Set a deadline and see days remaining and the pages/words per day you need to hit your goal</li>
    <li>Reset your daily count with one click</li>
  </ul>
</section>
</Description>

Image: Progress Tracker.png
Version: 1.1
*/

// State variables
let countType = 'page';
let dailyGoal = 0;
let projectGoal = 100;
let deadlineDate = null;
let dailyOffset = 0;
let dailyOffsetDate = '';

// --- FULLSCREEN & POSITION MEMORY CONTROLLER STATE ---
let isPanelVisible = true;
let savedPanelX = null;
let savedPanelY = null;
let savedPanelWidth = 387; // Default width
let savedPanelHeight = 375; // Default height

// Load saved settings from document
countType = Beat.getDocumentSetting('goals.countType') || countType;
dailyGoal = Beat.getDocumentSetting('goals.dailyGoal') || dailyGoal;
projectGoal = Beat.getDocumentSetting('goals.projectGoal') || projectGoal;
const dl = Beat.getDocumentSetting('goals.deadlineDate') || '';
deadlineDate = dl ? new Date(dl) : deadlineDate;

// 1. RECOVER STORAGE STATE: Instantly pull saved positions on launch if available
if (typeof Beat.localStorage !== 'undefined') {
  const sx = Beat.localStorage.getItem('progress_tracker_x');
  const sy = Beat.localStorage.getItem('progress_tracker_y');
  const sw = Beat.localStorage.getItem('progress_tracker_w');
  const sh = Beat.localStorage.getItem('progress_tracker_h');
  if (sx !== null) savedPanelX = Number(sx);
  if (sy !== null) savedPanelY = Number(sy);
  if (sw !== null) savedPanelWidth = Number(sw);
  if (sh !== null) savedPanelHeight = Number(sh);
}

// Extract only screenplay content for word count
function getScreenplayText() {
  let txt = Beat.getText();
  // Exclude everything under a BONEYARD heading
  txt = txt.split(/^\s*#\s*BONEYARD\b/im)[0];
  // Remove boneyard blocks {{{ ... }}}
  txt = txt.replace(/\{\{\{[\s\S]*?\}\}\}/g, '');
  // Remove inline notes [[...]]
  txt = txt.replace(/\[\[.*?\]\]/g, '');
  // Remove synopsis lines starting with '='
  txt = txt.replace(/^=+.*$/mg, '');
  // Remove section headings marked with # (Markdown style)
  txt = txt.replace(/^#+.*$/mg, '');
  // Remove omit blocks [omit]...[/omit]
  txt = txt.replace(/\[omit\][\s\S]*?\[\/omit\]/g, '');
  // Remove C-style omit comments /*...*/
  txt = txt.replace(/\/\*[\s\S]*?\*\//g, '');
  return txt;
}

// Counting helpers
function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
function getTotalCount() {
    if (countType === 'word') {
        return countWords(getScreenplayText());
    } else {
        const pagination = Beat.currentPagination();
        return pagination.numberOfPages;
    }
}

// Initialize daily offset (resets at midnight)
function initDailyOffset() {
    const today = new Date().toISOString().split('T')[0];
    if (dailyOffsetDate !== today) {
        dailyOffset = getTotalCount();
        dailyOffsetDate = today;
    }
}

// Update metrics and send to UI
function updateMetrics() {
  // FIX: If the user toggled the tracker off, do absolutely nothing!
  if (typeof isPanelVisible !== 'undefined' && !isPanelVisible) return;

  try {
    initDailyOffset();

    const totalCount = getTotalCount();
    const dailyCount = totalCount - dailyOffset;
    const projectCount = totalCount;
    const deadlineStr = deadlineDate ? deadlineDate.toISOString() : '';
    if (panel && typeof panel.runJS === 'function') {
        panel.runJS(
            `updateProgress('${countType}', ${dailyCount}, ${dailyGoal}, ${projectCount}, ${projectGoal}, '${deadlineStr}')`
        );
    }
  } catch (err) {
    console.error("Goals plugin updateMetrics error:", err);
  }
}

// Custom API exposed to UI
Beat.custom = Beat.custom || {};
Beat.custom.setCountType = function(type) {
    countType = type === 'word' ? 'word' : 'page';
    Beat.setDocumentSetting('goals.countType', countType);
    updateMetrics();
};
Beat.custom.setDailyGoal = function(goal) {
    dailyGoal = goal || 0;
    Beat.setDocumentSetting('goals.dailyGoal', dailyGoal);
    updateMetrics();
};
Beat.custom.setProjectGoal = function(goal) {
    projectGoal = goal || 0;
    Beat.setDocumentSetting('goals.projectGoal', projectGoal);
    updateMetrics();
};
Beat.custom.setDeadline = function(dateStr) {
    deadlineDate = dateStr ? new Date(dateStr) : null;
    Beat.setDocumentSetting('goals.deadlineDate', dateStr || '');
    updateMetrics();
};

// Reset daily counter immediately
Beat.custom.resetDaily = function() {
  dailyShown = false;
  projectShown = false;
  isFirstRun = true;
  // Force reset offset to current total
  const now = getTotalCount();
  dailyOffset = now;
  // Also update the stored offset date to today
  dailyOffsetDate = new Date().toISOString().split('T')[0];
  updateMetrics();
};

// Expose updateMetrics to UI
Beat.custom.refresh = function() {
  updateMetrics();
};

// Auto-collapse API
Beat.custom.setCollapseMode = function(mode) {
  collapseMode = mode;
  Beat.setUserDefault("goals.collapseMode", mode);
};
Beat.custom.minimizeGoalsPanel = function() {
  if (collapseMode !== "off" && panel) {
    if (!panel._origFrame) panel._origFrame = panel.getFrame();
    const { x, y, width, height } = panel._origFrame;
    const newWidth = (collapseMode === "left" || collapseMode === "right")
      ? Math.floor(width * 0.25) : width;
    const newX = collapseMode === "right" ? x + width - newWidth : x;
    const newY = y + height - 28;
    panel.setFrame(newX, newY, newWidth, 28);
  }
};
Beat.custom.maximizeGoalsPanel = function() {
  if (panel && panel._origFrame) {
    const { x, y, width, height } = panel._origFrame;
    panel.setFrame(x, y, width, height);
    panel._origFrame = null;
  }
};

// Auto-collapse mode (persisted)
let collapseMode = Beat.getUserDefault("goals.collapseMode") || "off";
// Prepare deadline string for HTML
const dlStr = deadlineDate ? deadlineDate.toISOString().split('T')[0] : '';

// Compute initial counts for embedding in HTML template
const totalInit = getTotalCount();
const dailyInit = totalInit - dailyOffset;
const deadlineInit = deadlineDate ? deadlineDate.toISOString() : '';

// Embedded UI markup
const html = `
<style>
:root {
    --background-color: #ffffff;
    --text-color: #333333;
    --primary-color: #71acd4;
    --secondary-color: #555555;
    --input-border-color: rgba(204, 204, 204, 1);
    --daily-donut-color: #6facb2;
    --donut-background-color: #cccccc;
}

@media (prefers-color-scheme: dark) {
    :root {
        --background-color: #1e1e1e;
        --text-color: #f0f0f0;
        --primary-color: #71acd4;
        --secondary-color: #AAAAAA;
        --input-border-color: #555555;
        --daily-donut-color: #6facb2;
        --donut-background-color: #333333;
    }
    #reset-daily {
      color: white;
    }
    #mute-sound {
      color: white;
    }
    #settings-btn {
      color: white;
    }
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button {
      filter: invert(1);
    }
}
.dark {
    --background-color: #1e1e1e;
    --text-color: #f0f0f0;
    --primary-color: #71acd4;
    --secondary-color: #AAAAAA;
    --input-border-color: #555555;
    --daily-donut-color: #6facb2;
    --donut-background-color: #333333;
}
.dark #reset-daily,
.dark #mute-sound,
.dark #settings-btn {
    color: white;
}
.dark input[type=number]::-webkit-inner-spin-button,
.dark input[type=number]::-webkit-outer-spin-button {
    filter: invert(1);
}
body {
  margin: 0;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100vh;
  overflow: hidden;
}
.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
    justify-content: space-between;
    width: 100%; max-width: 420px;
    align-items: flex-start;
}
.controls label {
    font-size: 12px;
    color: var(--secondary-color);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 80px;
}
.controls input,
.controls select {
    margin-top: 4px;
    padding: 2px 4px;
    font-size: 12px;
    height: 24px;
    border: 1px solid var(--input-border-color);
    border-radius: 4px;
    background-color: var(--background-color);
    color: var(--text-color);
    -webkit-text-fill-color: var(--text-color);
    appearance: none;
    -webkit-appearance: none;
    outline: none;
    box-shadow: none;
}

.controls input:focus,
.controls select:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--primary-color);
}
.metrics {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 420px;
  position: relative;
}
.metrics canvas {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
}
#projectDonut {
    width: 200px;
    height: 200px;
}
#dailyDonut {
    width: 140px;
    height: 140px;
}
.info {
    margin-top: auto;
    width: 100%; max-width: 420px;
    text-align: center;
}
.info div {
    margin: 4px 0;
    font-size: 14px;
}
.success-overlay {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.5);
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  z-index: 10;
}
#successOk {
  margin-top: 16px;
  padding: 8px 16px;
  font-size: 14px;
}
  #reset-daily {
    position: absolute;
    top: 60px;
    left: 16px;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 33px;
    border: none;
    background: none;
    cursor: pointer;
    z-index: 5;
    pointer-events: auto;
  }
  #reset-daily:hover { opacity: 0.8; }
  #reset-daily:focus { outline: none; box-shadow: 0 0 0 2px var(--primary-color); }

  #settings-btn {
    position: absolute;
    top: 70px;
    right: 16px;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 26.5px;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    pointer-events: auto;
  }

  #reset-daily,
  #settings-btn {
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  body:hover #reset-daily,
  body:hover #settings-btn {
    opacity: 1;
  }

  .button-row {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: -8px;
    width: 100%;
    max-width: 420px;
  }
<\/style>
<audio id="successSound">
  <source src="bell.mp3" type="audio/mpeg">
<\/audio>

<div class="controls">
  <label>Count Type
    <select id="countTypeSelect">
      <option value="page"${countType === 'page' ? ' selected' : ''}>Pages</option>
      <option value="word"${countType === 'word' ? ' selected' : ''}>Words</option>
    </select>
  </label>
  <label>Daily Goal
    <input type="number" id="daily-goal" placeholder="0" value="${dailyGoal}" />
  </label>
  <label>Project Goal
    <input type="number" id="project-goal" placeholder="0" value="${projectGoal}" />
  </label>
  <label>Deadline
    <input type="date" id="deadline-input" value="${dlStr}" />
  </label>
</div>
<div class="button-row">
  <button id="settings-btn" title="Settings">⚙</button>
  <button id="reset-daily" title="Reset daily goal">⟳</button>
</div>

<div class="metrics">
  <canvas id="projectDonut"></canvas>
  <canvas id="dailyDonut"></canvas>
  <div id="centerCounter" style="
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      font-size: 40px;
      font-weight: bold;
      pointer-events: none;
  ">0</div>
</div>

<div class="info">
  <div id="total-count" style="margin-bottom:4px; font-size:14px; color:var(--secondary-color);"></div>
  <div id="info-text"></div>
</div>

<div id="successOverlay" class="success-overlay">
  <div id="successMessage"></div>
  <button id="successOk">OK</button>
</div>

<div id="settingsOverlay" style="
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    display: none; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.5); z-index: 20;
">
  <div style="
      background: var(--background-color);
      color: var(--text-color);
      padding: 16px; border-radius: 8px;
      display: flex; flex-direction: column; gap: 12px;
  ">
    <h2 style="margin: 0 0 8px 0; font-size: 18px;">Settings</h2>
    <label style="font-size: 14px;">
      <input type="checkbox" id="mute-checkbox" /> Mute notification sounds
    </label>
    <label style="font-size: 14px;">
      Auto-collapse:
      <select id="collapse-select" style="margin-left: 8px;">
        <option value="off"${collapseMode === 'off' ? ' selected' : ''}>Off</option>
        <option value="left"${collapseMode === 'left' ? ' selected' : ''}>Left</option>
        <option value="right"${collapseMode === 'right' ? ' selected' : ''}>Right</option>
      </select>
    </label>
    <label style="font-size: 14px;">
      Theme:
      <select id="theme-select" style="margin-left: 8px;">
        <option value="system" selected>System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
    <button id="settingsClose" style="
        align-self: flex-end; padding: 6px 12px;
        font-size: 14px; border: none; border-radius: 4px; cursor: pointer;
    ">OK</button>
  </div>
</div>
<script>
// Theme override logic
const originalMatchMedia = window.matchMedia.bind(window);
let matchMediaOverride = null;

function applyThemeOverride() {
  const theme = localStorage.getItem('goalsTheme') || 'system';

  if (matchMediaOverride) {
    window.matchMedia = originalMatchMedia;
    matchMediaOverride = null;
  }

  document.documentElement.classList.remove('light', 'dark');

  if (theme === 'light' || theme === 'dark') {
    window.matchMedia = function(query) {
      if (query === '(prefers-color-scheme: dark)') {
        return {
          matches: theme === 'dark',
          media: query,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          onchange: null
        };
      }
      return originalMatchMedia(query);
    };
    matchMediaOverride = window.matchMedia;
    document.documentElement.classList.add(theme);
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.add(prefersDark ? 'dark' : 'light');
  }

  Beat.call(() => Beat.custom.refresh());
}
applyThemeOverride(); 
  const collapseSelect = document.getElementById('collapse-select');
  collapseSelect.addEventListener('change', e => {
    Beat.call((mode) => Beat.custom.setCollapseMode(mode), e.target.value);
  });
  function minimizeGoalsWindow() { Beat.call('Beat.custom.minimizeGoalsPanel()'); }
  function maximizeGoalsWindow() { Beat.call('Beat.custom.maximizeGoalsPanel()'); }
  window.addEventListener('blur', minimizeGoalsWindow);
  window.addEventListener('focus', maximizeGoalsWindow);
</script>

<script>
let isFirstRun = true;
let dailyShown = false;
let projectShown = false;

let isMuted = localStorage.getItem('goalsMuted') === 'true';

const settingsBtn    = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose  = document.getElementById('settingsClose');
const muteCheckbox   = document.getElementById('mute-checkbox');

const themeSelect = document.getElementById('theme-select');
themeSelect.value = localStorage.getItem('goalsTheme') || 'system';
themeSelect.addEventListener('change', (e) => {
  localStorage.setItem('goalsTheme', e.target.value);
  applyThemeOverride();
});

muteCheckbox.checked = isMuted;

settingsBtn.addEventListener('click', () => {
  settingsOverlay.style.display = 'flex';
});
settingsClose.addEventListener('click', () => {
  settingsOverlay.style.display = 'none';
});

muteCheckbox.addEventListener('change', () => {
  isMuted = muteCheckbox.checked;
  localStorage.setItem('goalsMuted', isMuted);
});

function showSuccess(message) {
  const ov = document.getElementById('successOverlay');
  const msg = document.getElementById('successMessage');
  const btn = document.getElementById('successOk');
  if (!ov || !msg || !btn) return;
  msg.textContent = message;
  ov.style.display = 'flex';
  const snd = document.getElementById('successSound');
  if (snd && !isMuted) {
    snd.currentTime = 0;
    snd.play().catch(e => console.warn('Audio play failed:', e));
  }
  btn.onclick = () => { ov.style.display = 'none'; };
}

const root = getComputedStyle(document.documentElement);
const borderColor = root.getPropertyValue('--input-border-color').trim();
const primaryColor = root.getPropertyValue('--primary-color').trim();
const secondaryColor = root.getPropertyValue('--secondary-color').trim();

function drawArc(ctx, radius, thickness, progress, color) {
    const canvas = ctx.canvas;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.lineWidth = thickness;
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const donutBg = isDark ? '#333333' : '#cccccc';
    ctx.strokeStyle = donutBg;
    ctx.lineCap = "butt";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(progress, 1));
    ctx.lineWidth = thickness;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.stroke();
}

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  return ctx;
}

function updateDonuts(projProg, dailyProg) {
  const projCanvas = document.getElementById('projectDonut');
  const dailyCanvas = document.getElementById('dailyDonut');
  const projCtx = setupCanvas(projCanvas);
  const dailyCtx = setupCanvas(dailyCanvas);
  drawArc(projCtx, 90, 20, projProg, primaryColor);
  const dailyColor = root.getPropertyValue('--daily-donut-color').trim();
  drawArc(dailyCtx, 60, 20, dailyProg, dailyColor);
}

function updateInfo(daysLeft, pagesPerDay) {
  const ct = document.getElementById('countTypeSelect').value;
  const unitLabel = ct === 'word' ? 'words' : 'pages';
  const daysPart = daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' remaining';
  var combined = daysPart + '; you need ' + pagesPerDay + ' ' + unitLabel + ' per day';
  const infoEl = document.getElementById('info-text');
  if (infoEl) infoEl.textContent = combined;
}

window.updateProgress = function(countTypeArg, dailyCount, dailyGoal, projCount, projGoal, deadlineStr) {
  try {
    var sel = document.getElementById('countTypeSelect');
    if (sel) sel.value = countTypeArg;
    var dailyInput = document.getElementById('daily-goal');
    if (dailyInput) dailyInput.value = dailyGoal;
    var projInput = document.getElementById('project-goal');
    if (projInput) projInput.value = projGoal;
    var deadlineInput = document.getElementById('deadline-input');
    if (deadlineInput) {
      var ds = '';
      if (deadlineStr) {
        ds = deadlineStr.split('T')[0];
      }
      deadlineInput.value = ds;
    }

    const projProg = projGoal ? projCount / projGoal : 0;
    const dailyProg = dailyGoal ? dailyCount / dailyGoal : 0;
    updateDonuts(projProg, dailyProg);
    
    var centerEl = document.getElementById('centerCounter');
    if (centerEl) {
        centerEl.textContent = dailyCount;
    }
    
    var ct = document.getElementById('countTypeSelect').value;
    var unit = ct === 'word' ? 'words' : 'pages';
    var totalEl = document.getElementById('total-count');
    if (totalEl) {
      var remaining = projGoal - projCount;
      if (remaining < 0) remaining = 0;
      totalEl.textContent = projCount + ' ' + unit + ' total / ' + remaining + ' ' + unit + ' remaining';
    }
    let days = '';
    if (deadlineStr) {
      const dl = new Date(deadlineStr);
      const today = new Date(); today.setHours(0,0,0,0);
      const diff = dl - today;
      days = Math.ceil(diff / (1000*60*60*24));
    }
    const pagesPerDay = days > 0 && projGoal ? Math.ceil((projGoal - projCount) / days) : 0;
    updateInfo(days, pagesPerDay);

    if (!isFirstRun) {
      if (dailyGoal > 0 && dailyCount >= dailyGoal && !dailyShown) {
        dailyShown = true;
        showSuccess('🎉 Daily goal achieved!');
      }
      if (projGoal > 0 && projCount >= projGoal && !projectShown) {
        projectShown = true;
        showSuccess('🏆 Project goal achieved!');
      }
    }
    isFirstRun = false;
  } catch (err) {
    console.error("Goals plugin updateProgress error:", err);
  }
};

document.getElementById('countTypeSelect').addEventListener('change', (e) => {
  Beat.call((type) => Beat.custom.setCountType(type), e.target.value);
});
document.getElementById('daily-goal').addEventListener('input', (e) => {
  Beat.call((val) => Beat.custom.setDailyGoal(val), parseInt(e.target.value));
});
document.getElementById('project-goal').addEventListener('input', (e) => {
  Beat.call((val) => Beat.custom.setProjectGoal(val), parseInt(e.target.value));
});
document.getElementById('deadline-input').addEventListener('change', (e) => {
  Beat.call((val) => Beat.custom.setDeadline(val), e.target.value);
});

updateDonuts(0, 0);
updateProgress('${countType}', ${dailyInit}, ${dailyGoal}, ${totalInit}, ${projectGoal}, '${deadlineInit}');

document.getElementById('reset-daily').addEventListener('click', () => {
  dailyShown = false;
  projectShown = false;
  isFirstRun = true;
  const ov = document.getElementById('successOverlay');
  if (ov) ov.style.display = 'none';

  Beat.call(() => Beat.custom.resetDaily());
  Beat.call(() => Beat.custom.refresh());
});

window.addEventListener('focus', () => {
  Beat.call(() => Beat.custom.refresh());
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  Beat.call(() => Beat.custom.refresh());
});
</script>
`;

// Initialize panel
let panel = Beat.htmlWindow(html, savedPanelWidth, savedPanelHeight);

// 2. INTELLIGENT POSITION BOOT: If saved data exists, position it there immediately
if (savedPanelX !== null && savedPanelY !== null) {
  if (typeof panel.setFrame === "function") {
    panel.setFrame(savedPanelX, savedPanelY, savedPanelWidth, savedPanelHeight);
  }
}

// 3. KEEP IN MEMORY: Crucial to keep instances alive so positioning isn't dropped mid-session
panel.resizable = true;
panel.stayInMemory = true; 

// 4. COORDINATE & SIZE TRACKING SYNCHRONIZER: Call this to commit manual window drags/resizes
function syncProgressTrackerCoordinates() {
  if (panel && typeof panel.getFrame === "function") {
    const currentFrame = panel.getFrame();
    // Guard check: Avoid tracking hidden off-screen positions or collapsed zero-bounds
    if (currentFrame.x > -5000 && currentFrame.width > 0 && currentFrame.height > 0) {
      savedPanelX = currentFrame.x;
      savedPanelY = currentFrame.y;
      savedPanelWidth = currentFrame.width;
      savedPanelHeight = currentFrame.height;
      
      if (typeof Beat.localStorage !== 'undefined') {
        Beat.localStorage.setItem('progress_tracker_x', savedPanelX);
        Beat.localStorage.setItem('progress_tracker_y', savedPanelY);
        Beat.localStorage.setItem('progress_tracker_w', savedPanelWidth);
        Beat.localStorage.setItem('progress_tracker_h', savedPanelHeight);
      }
    }
  }
}

// 5. UNIFIED RE-POSITION TOGGLE ENGINE (Flattening & Memory)
Beat.custom.toggleProgressTrackerWindow = function() {
  if (panel) {
    isPanelVisible = !isPanelVisible;
    
    if (!isPanelVisible) {
      // 1. MEMORY CHECK: Actively capture coordinates and size right before hiding
      syncProgressTrackerCoordinates();
      
      // 2. INVISIBLE STATE: Collapse dimensions to absolute zero right at its current spot
      if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
        panel.setFrame(savedPanelX, savedPanelY, 0, 0);
      } else {
        panel.hide();
      }
    } else {
      // 3. RESTORE STATE: Instant size expansion directly back to the user's custom location
      if (typeof panel.show === "function") {
        panel.show();
      }
      
      if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
        panel.setFrame(savedPanelX, savedPanelY, savedPanelWidth, savedPanelHeight); 
      } else if (typeof centerWindow === "function") {
        // Safe startup fallback placement
        if (typeof panel.setFrame === "function") { panel.setFrame(100, 100, savedPanelWidth, savedPanelHeight); }
        centerWindow(panel);
      }
      
      // Keep structural stats flowing dynamically on window expansion
      try { updateMetrics(); } catch (e) {}
    }
  }
};

// Re-map the older legacy direct toggle assignment to match your unified custom method
panel.toggle = Beat.custom.toggleProgressTrackerWindow;

// Listen for changes
Beat.onTextChange(function() {
  try {
    if (!Beat.onTextChangeDisabled) updateMetrics();
  } catch (err) {
    console.error("Goals plugin onTextChange error:", err);
  }
});
Beat.onPreviewFinished(function() {
  try {
    updateMetrics();
  } catch (err) {
    console.error("Goals plugin onPreviewFinished error:", err);
  }
});

// --- UNIFIED NATIVE SHORTCUT MENU REGISTER ---
const toggleProgressWindowItem = Beat.menuItem(
  "Toggle Progress Tracker", 
  ["cmd", "ctrl", "p"], 
  Beat.custom.toggleProgressTrackerWindow
);

Beat.menu("Progress Tracker", [
  toggleProgressWindowItem
]);

// 6. ACTIVE BINDING: Continually catch real-time dragging across multiple monitors
if (panel && typeof panel.onMove === "function") {
  panel.onMove(function() {
    syncProgressTrackerCoordinates();
  });
}
