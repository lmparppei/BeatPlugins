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
    <li>Monitor progress in real time</li>
    <li>Set a deadline and see days remaining and pages/words per day required</li>
    <li>Track word/page/duration output, streaks, and trends</li>
  </ul>
</section>
</Description>

Image: Progress Tracker.png
Version: 2.0.0
*/

// State variables
let countType = 'page'; // 'page' or 'word'
let activeMetric = Beat.getUserDefault('progress_tracker_activeMetric') || 'count'; // 'count' or 'duration'
let dailyGoal = 0;
let projectGoal = 100;
let deadlineDate = null;
let dailyOffset = 0;
let dailyOffsetDate = '';
let historyScope = 'document';
Beat.setUserDefault('progress_tracker_scope', historyScope);
const storedDaysOff = Beat.getUserDefault('progress_tracker_daysOff');
let daysOff = [];
if (storedDaysOff !== null && storedDaysOff !== undefined) {
  try {
    const parsedDaysOff = typeof storedDaysOff === 'string' ? JSON.parse(storedDaysOff) : storedDaysOff;
    if (Array.isArray(parsedDaysOff)) {
      daysOff = Array.from(new Set(parsedDaysOff.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
    }
  } catch (err) {
    console.error('Goals plugin could not load saved days off:', err);
  }
} else if (Beat.getUserDefault('progress_tracker_weekendForgiveness') === 'true') {
  daysOff = [0, 6];
}
let strictMode = Beat.getUserDefault('progress_tracker_strictMode') === 'true';

countType = Beat.getDocumentSetting('goals.countType') || countType;

let writingHistories = { page: {}, word: {} };
let timeHistories = {};
let writingHistory = {};
let timeHistory = {};
let allTimeGross = { page: 0, word: 0 };
let lastKnownDocTotal = null; 

// --- LOCAL DATE HELPER (PREVENTS UTC TIMEZONE SPLITS) ---
function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// --- DYNAMIC SCOPE PERSISTENCE HELPERS ---
function loadScopedData() {
  try {
    let storedHistory = historyScope === 'document'
      ? Beat.getDocumentSetting('goals.history')
      : Beat.getUserDefault('progress_tracker_history');
      
    if (!storedHistory && historyScope === 'global' && typeof Beat.localStorage !== 'undefined') {
      storedHistory = Beat.localStorage.getItem('progress_tracker_history');
    }
    
    if (storedHistory) {
      const parsed = typeof storedHistory === 'string' ? JSON.parse(storedHistory) : storedHistory;
      if (parsed.page || parsed.word) writingHistories = parsed;
      else writingHistories[countType] = parsed;
    } else {
      writingHistories = { page: {}, word: {} };
    }
  } catch (e) {
    writingHistories = { page: {}, word: {} };
  }
  writingHistory = writingHistories[countType] || {};

  try {
    let storedTime = historyScope === 'document'
      ? Beat.getDocumentSetting('goals.timeHistory')
      : Beat.getUserDefault('progress_tracker_timeHistory');

    if (!storedTime && historyScope === 'global' && typeof Beat.localStorage !== 'undefined') {
      storedTime = Beat.localStorage.getItem('progress_tracker_timeHistory');
    }

    if (storedTime) {
      timeHistories = typeof storedTime === 'string' ? JSON.parse(storedTime) : storedTime;
    } else {
      timeHistories = {};
    }
  } catch (e) {
    timeHistories = {};
  }
  timeHistory = timeHistories;

  try {
    let storedGross = historyScope === 'document'
      ? Beat.getDocumentSetting('goals.allTimeGross')
      : Beat.getUserDefault('progress_tracker_allTimeGross');
      
    if (!storedGross && historyScope === 'global' && typeof Beat.localStorage !== 'undefined') {
      storedGross = Beat.localStorage.getItem('progress_tracker_allTimeGross');
    }
    
    if (storedGross) {
      allTimeGross = typeof storedGross === 'string' ? JSON.parse(storedGross) : storedGross;
    } else {
      allTimeGross = { page: 0, word: 0 };
    }
  } catch (e) {
    allTimeGross = { page: 0, word: 0 };
  }

  try {
    let storedOffset = historyScope === 'document'
      ? Beat.getDocumentSetting('goals.dailyOffset_' + countType)
      : (Beat.getUserDefault('progress_tracker_dailyOffset_' + countType) || Beat.getUserDefault('progress_tracker_dailyOffset'));
      
    let storedOffsetDate = historyScope === 'document'
      ? Beat.getDocumentSetting('goals.dailyOffsetDate_' + countType)
      : (Beat.getUserDefault('progress_tracker_dailyOffsetDate_' + countType) || Beat.getUserDefault('progress_tracker_dailyOffsetDate'));

    if (historyScope === 'global' && typeof Beat.localStorage !== 'undefined') {
      if (storedOffset === null || storedOffset === undefined) {
        storedOffset = Beat.localStorage.getItem('progress_tracker_dailyOffset_' + countType) || Beat.localStorage.getItem('progress_tracker_dailyOffset');
      }
      if (!storedOffsetDate) {
        storedOffsetDate = Beat.localStorage.getItem('progress_tracker_dailyOffsetDate_' + countType) || Beat.localStorage.getItem('progress_tracker_dailyOffsetDate');
      }
    }

    dailyOffset = (storedOffset !== null && storedOffset !== undefined) ? Number(storedOffset) : 0;
    dailyOffsetDate = storedOffsetDate || '';
  } catch (e) {
    dailyOffset = 0;
    dailyOffsetDate = '';
  }
}

loadScopedData();

function saveGrossState() {
  const grossStr = JSON.stringify(allTimeGross);
  if (historyScope === 'document') {
    Beat.setDocumentSetting('goals.allTimeGross', grossStr);
  } else {
    try { Beat.setUserDefault('progress_tracker_allTimeGross', grossStr); } catch (e) {}
    if (typeof Beat.localStorage !== 'undefined') {
      Beat.localStorage.setItem('progress_tracker_allTimeGross', grossStr);
    }
  }
}

function saveDailyProgress(dateString, pageCount, wordCount = null) {
  const pageValue = Number.isFinite(pageCount) ? Math.max(0, pageCount) : 0;
  const wordValue = Number.isFinite(wordCount) ? Math.max(0, wordCount) : pageValue;

  writingHistories.page = writingHistories.page || {};
  writingHistories.word = writingHistories.word || {};
  writingHistories.page[dateString] = pageValue;
  writingHistories.word[dateString] = wordValue;

  writingHistory = writingHistories[countType] || {};
  const historyStr = JSON.stringify(writingHistories);
  if (historyScope === 'document') {
    Beat.setDocumentSetting('goals.history', historyStr);
  } else {
    try { Beat.setUserDefault('progress_tracker_history', historyStr); } catch (e) {}
    if (typeof Beat.localStorage !== 'undefined') {
      Beat.localStorage.setItem('progress_tracker_history', historyStr);
    }
  }
}

Beat.custom = Beat.custom || {};
Beat.custom.saveTimeData = function(timeStr) {
  try {
    timeHistory = JSON.parse(timeStr);
    if (historyScope === 'document') {
      Beat.setDocumentSetting('goals.timeHistory', timeStr);
    } else {
      try { Beat.setUserDefault('progress_tracker_timeHistory', timeStr); } catch (e) {}
      if (typeof Beat.localStorage !== 'undefined') {
        Beat.localStorage.setItem('progress_tracker_timeHistory', timeStr);
      }
    }
  } catch (e) {}
};

function saveDailyOffsetState() {
  if (historyScope === 'document') {
    Beat.setDocumentSetting('goals.dailyOffset_' + countType, dailyOffset);
    Beat.setDocumentSetting('goals.dailyOffsetDate_' + countType, dailyOffsetDate);
  } else {
    try {
      Beat.setUserDefault('progress_tracker_dailyOffset_' + countType, dailyOffset);
      Beat.setUserDefault('progress_tracker_dailyOffsetDate_' + countType, dailyOffsetDate);
    } catch (e) {}
    if (typeof Beat.localStorage !== 'undefined') {
      Beat.localStorage.setItem('progress_tracker_dailyOffset_' + countType, dailyOffset);
      Beat.localStorage.setItem('progress_tracker_dailyOffsetDate_' + countType, dailyOffsetDate);
    }
  }
}

Beat.custom.setDaysOff = function(val) {
  let selectedDays = val;
  if (typeof val === 'string') {
    try {
      selectedDays = JSON.parse(val);
    } catch (err) {
      console.error('Goals plugin could not parse selected days off:', err);
      return;
    }
  }
  daysOff = Array.from(new Set((Array.isArray(selectedDays) ? selectedDays : [])
    .map(Number)
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
  Beat.setUserDefault('progress_tracker_daysOff', JSON.stringify(daysOff));
  updateMetrics();
};

Beat.custom.setStrictMode = function(val) {
  strictMode = val;
  Beat.setUserDefault('progress_tracker_strictMode', val ? 'true' : 'false');
  updateMetrics();
};

// --- FULLSCREEN & POSITION MEMORY CONTROLLER STATE ---
let isPanelVisible = true;
let savedPanelX = null;
let savedPanelY = null;
let savedPanelWidth = 387; 
let savedPanelHeight = 440; 

countType = Beat.getDocumentSetting('goals.countType') || countType;
dailyGoal = Beat.getDocumentSetting('goals.dailyGoal') || dailyGoal;
projectGoal = Beat.getDocumentSetting('goals.projectGoal') || projectGoal;
const dl = Beat.getDocumentSetting('goals.deadlineDate') || '';
deadlineDate = dl ? new Date(dl) : deadlineDate;

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

function getScreenplayText() {
  let txt = Beat.getText();
  if (!txt) return '';
  txt = txt.split(/^\s*#\s*BONEYARD\b/im)[0];
  txt = txt.replace(/\{\{\{[\s\S]*?\}\}\}/g, '');
  txt = txt.replace(/\[\[.*?\]\]/g, '');
  txt = txt.replace(/^=+.*$/mg, '');
  txt = txt.replace(/^#+.*$/mg, '');
  txt = txt.replace(/\[omit\][\s\S]*?\[\/omit\]/g, '');
  txt = txt.replace(/\/\*[\s\S]*?\*\//g, '');
  return txt;
}

function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTotalCount() {
    const text = getScreenplayText();
    const words = countWords(text);
    if (countType === 'word') {
        return words;
    } else {
        const pagination = Beat.currentPagination();
        if (pagination && pagination.numberOfPages > 0) {
            return pagination.numberOfPages;
        }
        return words > 0 ? Math.max(1, Math.ceil(words / 250)) : 0;
    }
}

function initDailyOffset() {
    const today = getLocalDateStr();
    if (dailyOffsetDate !== today) {
        dailyOffset = getTotalCount();
        dailyOffsetDate = today;
        saveDailyOffsetState();
    }
}

function getDailyOffsetForType(type, total) {
  if (type === countType) {
    initDailyOffset();
    return dailyOffset;
  }

  const offsetKey = 'progress_tracker_dailyOffset_' + type;
  const dateKey = 'progress_tracker_dailyOffsetDate_' + type;
  let storedOffset = historyScope === 'document'
    ? Beat.getDocumentSetting('goals.dailyOffset_' + type)
    : Beat.getUserDefault(offsetKey);
  let storedDate = historyScope === 'document'
    ? Beat.getDocumentSetting('goals.dailyOffsetDate_' + type)
    : Beat.getUserDefault(dateKey);

  if (historyScope === 'global' && typeof Beat.localStorage !== 'undefined') {
    if (storedOffset === null || storedOffset === undefined) storedOffset = Beat.localStorage.getItem(offsetKey);
    if (!storedDate) storedDate = Beat.localStorage.getItem(dateKey);
  }

  let offset = storedOffset !== null && storedOffset !== undefined ? Number(storedOffset) : total;
  if (storedDate !== getLocalDateStr()) {
    offset = total;
    if (historyScope === 'document') {
      Beat.setDocumentSetting('goals.dailyOffset_' + type, offset);
      Beat.setDocumentSetting('goals.dailyOffsetDate_' + type, getLocalDateStr());
    } else {
      try {
        Beat.setUserDefault(offsetKey, offset);
        Beat.setUserDefault(dateKey, getLocalDateStr());
      } catch (e) {}
      if (typeof Beat.localStorage !== 'undefined') {
        Beat.localStorage.setItem(offsetKey, offset);
        Beat.localStorage.setItem(dateKey, getLocalDateStr());
      }
    }
  }
  return offset;
}

function updateMetrics(recordProgress = true) {
  if (typeof isPanelVisible !== 'undefined' && !isPanelVisible) return;

  try {
    initDailyOffset();
    const currentTotal = getTotalCount();

    if (lastKnownDocTotal === null) {
        const savedDocTotal = Beat.getDocumentSetting('goals.lastKnownTotal_' + countType);
        lastKnownDocTotal = (savedDocTotal !== null && savedDocTotal !== undefined) ? Number(savedDocTotal) : currentTotal;
        
        if (allTimeGross[countType] === 0 && currentTotal > 0) {
            allTimeGross[countType] = currentTotal;
            saveGrossState();
        }
        Beat.setDocumentSetting('goals.lastKnownTotal_' + countType, lastKnownDocTotal);
    }

    const diff = currentTotal - lastKnownDocTotal;
    if (diff > 0) {
        allTimeGross[countType] += diff; 
        saveGrossState();
    }
    if (diff !== 0) {
        lastKnownDocTotal = currentTotal; 
        Beat.setDocumentSetting('goals.lastKnownTotal_' + countType, lastKnownDocTotal);
    }

    const pageTotal = Beat.currentPagination && Beat.currentPagination().numberOfPages > 0
      ? Beat.currentPagination().numberOfPages
      : (countWords(getScreenplayText()) > 0 ? Math.max(1, Math.ceil(countWords(getScreenplayText()) / 250)) : 0);
    const wordTotal = countWords(getScreenplayText());
    const pageDailyCount = pageTotal - getDailyOffsetForType('page', pageTotal);
    const wordDailyCount = wordTotal - getDailyOffsetForType('word', wordTotal);
    const netDailyCount = countType === 'word' ? wordDailyCount : pageDailyCount;
    const projectCount = currentTotal;
    const deadlineStr = deadlineDate ? deadlineDate.toISOString() : '';
    const todayStr = getLocalDateStr();
    
    if (recordProgress) saveDailyProgress(todayStr, pageDailyCount, wordDailyCount);
    
    const historyStr = JSON.stringify(writingHistories);
    const timeStr = JSON.stringify(timeHistory);
    const draftedGross = allTimeGross[countType] || 0;
    const daysOffVal = JSON.stringify(daysOff);
    const strictVal = strictMode ? 'true' : 'false';

    if (panel && typeof panel.runJS === 'function') {
        panel.runJS(
            `updateProgress('${countType}', '${activeMetric}', ${netDailyCount}, ${dailyGoal}, ${projectCount}, ${projectGoal}, '${deadlineStr}', '${historyStr}', '${timeStr}', ${draftedGross}, ${daysOffVal}, ${strictVal})`
        );
    }
  } catch (err) {
    console.error("Goals plugin updateMetrics error:", err);
  }
}

Beat.custom.setCountType = function(type) {
  countType = type === 'word' ? 'word' : 'page';
  loadScopedData();
  lastKnownDocTotal = null; 
  Beat.setDocumentSetting('goals.countType', countType);
  updateMetrics();
};

Beat.custom.setActiveMetric = function(metric) {
  activeMetric = metric;
  Beat.setUserDefault('progress_tracker_activeMetric', activeMetric);
  updateMetrics();
};

Beat.custom.setHistoryScope = function(scope) {
  historyScope = scope === 'document' ? 'document' : 'global';
  Beat.setUserDefault('progress_tracker_scope', historyScope);
  loadScopedData();
  lastKnownDocTotal = null;
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

Beat.custom.resetDaily = function() {
  dailyShown = false;
  projectShown = false;
  isFirstRun = true;
  const now = getTotalCount();
  dailyOffset = now;
  dailyOffsetDate = getLocalDateStr();
  saveDailyOffsetState();
  updateMetrics();
};

Beat.custom.clearHistory = function() {
  writingHistories = { page: {}, word: {} };
  writingHistory = writingHistories[countType];
  timeHistories = {};
  timeHistory = {};
  allTimeGross = { page: 0, word: 0 };
  saveGrossState();
  Beat.custom.saveTimeData(JSON.stringify(timeHistory));
  saveDailyProgress(getLocalDateStr(), 0);
  updateMetrics(false);
};

Beat.custom.refresh = function() {
  updateMetrics();
};

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

let collapseMode = Beat.getUserDefault("goals.collapseMode") || "off";
const dlStr = deadlineDate ? deadlineDate.toISOString().split('T')[0] : '';
const totalInit = getTotalCount();
initDailyOffset();
const dailyInit = totalInit - dailyOffset;
const deadlineInit = deadlineDate ? deadlineDate.toISOString() : '';
const historyInit = JSON.stringify(writingHistories);
const timeInit = JSON.stringify(timeHistory);
const draftedGrossInit = allTimeGross[countType] || 0;

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
    #reset-daily, #mute-sound, #settings-btn { color: white; }
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button { filter: invert(1); }
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
.dark #reset-daily, .dark #mute-sound, .dark #settings-btn { color: white; }
.dark input[type=number]::-webkit-inner-spin-button,
.dark input[type=number]::-webkit-outer-spin-button { filter: invert(1); }
.light {
  --background-color: #ffffff;
  --text-color: #333333;
  --primary-color: #71acd4;
  --secondary-color: #555555;
  --input-border-color: rgba(204, 204, 204, 1);
  --daily-donut-color: #6facb2;
  --donut-background-color: #cccccc;
}
.light #reset-daily, .light #mute-sound, .light #settings-btn { color: var(--text-color); }
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
  min-width: 387px;
  min-height: 440px;
  box-sizing: border-box;
}

/* Tabs */
.tabs { display: flex; width: 100%; max-width: 420px; margin-bottom: 12px; border-bottom: 1px solid var(--input-border-color); }
.tab-btn { flex: 1; padding: 8px; background: none; border: none; color: var(--secondary-color); cursor: pointer; font-size: 14px; }
.tab-btn.active { color: var(--primary-color); border-bottom: 2px solid var(--primary-color); font-weight: bold; }
.tab-content { display: none; width: 100%; max-width: 420px; flex-direction: column; align-items: center; flex: 0 0 auto; }
.tab-content.active { display: flex; }

/* Controls & Metrics */
.controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; justify-content: space-between; width: 100%; align-items: flex-start; }
.controls label { font-size: 12px; color: var(--secondary-color); display: flex; flex-direction: column; flex: 1; min-width: 80px; }
.controls input, .controls select { margin-top: 4px; padding: 2px 4px; font-size: 12px; height: 24px; border: 1px solid var(--input-border-color); border-radius: 4px; background-color: var(--background-color); color: var(--text-color); outline: none; }
.controls input:focus, .controls select:focus { box-shadow: 0 0 0 2px var(--primary-color); }
.metrics { flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; position: relative; margin-bottom: 16px; min-height: 220px; }
.metrics canvas { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
#projectDonut { width: 200px; height: 200px; }
#dailyDonut { width: 140px; height: 140px; }
.info { width: 100%; text-align: center; }
.info div { margin: 4px 0; font-size: 14px; }

/* Dashboard Styles */
.dashboard-stats { display: flex; justify-content: space-between; width: 100%; margin-bottom: 16px; }
.stat-box { flex: 1; text-align: center; background: rgba(128,128,128,0.1); padding: 8px; border-radius: 8px; margin: 0 4px; display: flex; flex-direction: column; justify-content: center; cursor: default; }
.stat-title { font-size: 11px; color: var(--secondary-color); margin-bottom: 4px; }
.stat-val { font-size: 18px; font-weight: bold; }
.chart-header { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 8px; }
.chart-header select { font-size: 10px; padding: 2px 4px; border-radius: 4px; background: var(--background-color); color: var(--text-color); border: 1px solid var(--input-border-color); }
.chart-container { width: 100%; height: 150px; flex: 0 0 150px; margin-bottom: 16px; position: relative; }
#lineChartCanvas { width: 100%; height: 100%; }
#chartTooltip { position: absolute; display: none; z-index: 2; padding: 5px 8px; border-radius: 4px; background: var(--text-color); color: var(--background-color); font-size: 11px; white-space: nowrap; pointer-events: none; transform: translate(-50%, -100%); }
.heatmap { display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px; width: 100%; }
.heat-block { aspect-ratio: 1; background-color: var(--primary-color); border-radius: 2px; opacity: 0.1; }
.history-actions { display: flex; justify-content: flex-end; align-items: center; width: 100%; margin-top: 12px; }
.history-actions select { font-size: 10px; padding: 2px 4px; border-radius: 4px; background: var(--background-color); color: var(--text-color); border: 1px solid var(--input-border-color); }
.history-actions button { padding: 5px 8px; font-size: 11px; color: var(--secondary-color); background: none; border: 1px solid var(--input-border-color); border-radius: 4px; cursor: pointer; }
.history-actions button:hover { color: var(--text-color); border-color: var(--secondary-color); }

.success-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); color: #fff; font-size: 24px; font-weight: bold; z-index: 10; }
#successOk { margin-top: 16px; padding: 8px 16px; font-size: 14px; }
#reset-daily { position: absolute; top: 110px; left: 16px; width: 24px; height: 24px; padding: 0; font-size: 33px; border: none; background: none; cursor: pointer; z-index: 5; pointer-events: auto; opacity: 0; transition: opacity 0.3s ease; }
#settings-btn { position: absolute; top: 120px; right: 16px; width: 24px; height: 24px; padding: 0; font-size: 26.5px; border: none; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 5; pointer-events: auto; opacity: 0; transition: opacity 0.3s ease; }
body:hover #reset-daily, body:hover #settings-btn { opacity: 1; }
.button-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: -8px; width: 100%; max-width: 420px; }
</style>

<audio id="successSound"><source src="bell.mp3" type="audio/mpeg"></audio>

<div class="tabs">
  <button class="tab-btn active" id="btn-goal" onclick="switchTab('goal')">Goal</button>
  <button class="tab-btn" id="btn-dashboard" onclick="switchTab('dashboard')">Dashboard</button>
</div>

<div id="tab-goal" class="tab-content active">
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
    <div id="centerCounter" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 40px; font-weight: bold; pointer-events: none;">0</div>
  </div>

  <div class="info">
    <div id="total-count" style="margin-bottom:4px; font-size:14px; color:var(--secondary-color);"></div>
    <div id="info-text"></div>
  </div>
</div>

<div id="tab-dashboard" class="tab-content">
  <div class="dashboard-stats">
    <div class="stat-box" id="box-1">
      <div class="stat-title" id="title-box-1">Today</div>
      <div id="val-box-1" class="stat-val">0</div>
    </div>
    <div class="stat-box" id="box-2">
      <div class="stat-title" id="title-box-2">Weekly</div>
      <div id="val-box-2" class="stat-val">0</div>
    </div>
    <div class="stat-box" id="box-3">
      <div class="stat-title" id="title-box-3"><span id="dash-month-name">Monthly</span></div>
      <div id="val-box-3" class="stat-val">0</div>
    </div>
    <div class="stat-box" id="box-4">
      <div class="stat-title" id="title-box-4">Drafted</div>
      <div id="val-box-4" class="stat-val">0</div>
    </div>
    <div class="stat-box" id="box-5">
      <div class="stat-title">Streak</div>
      <div id="dash-streak" class="stat-val">0</div>
      <div id="dash-streak-record" style="font-size: 10px; color: var(--secondary-color); margin-top: 4px;">record: 0</div>
    </div>
  </div>
  
  <div class="chart-header">
    <span style="font-size: 11px; font-weight: bold; color: var(--secondary-color);">Trends</span>
    <div style="display: flex; gap: 4px;">
      <select id="metricTypeSelect" onchange="switchMetricType(this.value)">
        <option value="pages"${countType === 'page' && activeMetric === 'count' ? ' selected' : ''}>Pages</option>
        <option value="words"${countType === 'word' && activeMetric === 'count' ? ' selected' : ''}>Words</option>
        <option value="duration"${activeMetric === 'duration' ? ' selected' : ''}>Duration</option>
      </select>
      <select id="chartTypeSelect" onchange="switchChartType(this.value)">
        <option value="output">Incremental</option>
        <option value="cumulative">Cumulative</option>
      </select>
      <select id="chartRangeSelect" onchange="switchChartRange(this.value)">
        <option value="week">Week</option>
        <option id="monthOptionLabel" value="month">Month</option>
        <option value="3month">3 Months</option>
        <option value="6month">6 Months</option>
        <option value="Year">Year</option>
        <option value="all">All Time</option>
      </select>
    </div>
  </div>
  <div class="chart-container">
    <canvas id="lineChartCanvas"></canvas>
    <div id="chartTooltip" role="status" aria-live="polite"></div>
  </div>
  
  <div id="heatmapContainer" class="heatmap"></div>
  <div class="history-actions">
    <button id="clear-history" title="Clear historical data for this document">Clear History</button>
  </div>
</div>

<div id="successOverlay" class="success-overlay"><div id="successMessage"></div><button id="successOk">OK</button></div>
<div id="settingsOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 20;">
  <div style="background: var(--background-color); color: var(--text-color); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; width: 250px;">
    <h2 style="margin: 0 0 4px 0; font-size: 18px;">Settings</h2>
    <label style="font-size: 13px; display: flex; align-items: center; justify-content: space-between;">
      <span>Auto-collapse:</span>
      <select id="collapse-select" style="padding: 2px 4px; font-size: 12px;">
        <option value="off"${collapseMode === 'off' ? ' selected' : ''}>Off</option>
        <option value="left"${collapseMode === 'left' ? ' selected' : ''}>Left</option>
        <option value="right"${collapseMode === 'right' ? ' selected' : ''}>Right</option>
      </select>
    </label>
    <label style="font-size: 13px; display: flex; align-items: center; justify-content: space-between;">
      <span>Theme:</span>
      <select id="theme-select" style="padding: 2px 4px; font-size: 12px;">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
    <label style="font-size: 13px; display: flex; align-items: center; gap: 6px;">
      <input type="checkbox" id="mute-checkbox" /> Mute notification sounds
    </label>
    <fieldset style="margin: 0; padding: 8px; border: 1px solid var(--input-border-color); border-radius: 4px;">
      <legend style="font-size: 13px; padding: 0 4px;">Days off</legend>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 4px; font-size: 12px;">
        <label><input type="checkbox" class="day-off-checkbox" value="0"${daysOff.includes(0) ? ' checked' : ''} /> Sun</label>
        <label><input type="checkbox" class="day-off-checkbox" value="1"${daysOff.includes(1) ? ' checked' : ''} /> Mon</label>
        <label><input type="checkbox" class="day-off-checkbox" value="2"${daysOff.includes(2) ? ' checked' : ''} /> Tue</label>
        <label><input type="checkbox" class="day-off-checkbox" value="3"${daysOff.includes(3) ? ' checked' : ''} /> Wed</label>
        <label><input type="checkbox" class="day-off-checkbox" value="4"${daysOff.includes(4) ? ' checked' : ''} /> Thu</label>
        <label><input type="checkbox" class="day-off-checkbox" value="5"${daysOff.includes(5) ? ' checked' : ''} /> Fri</label>
        <label><input type="checkbox" class="day-off-checkbox" value="6"${daysOff.includes(6) ? ' checked' : ''} /> Sat</label>
      </div>
    </fieldset>
    <label style="font-size: 13px; display: flex; align-items: flex-start; gap: 6px;">
      <input type="checkbox" id="strict-mode-checkbox"${strictMode ? ' checked' : ''} style="margin-top: 3px;" />
      <div style="display: flex; flex-direction: column; line-height: 1.2;">
        <span>Strict Mode (Daily Goal)</span>
        <span style="font-size: 10px; color: #ff6b6b; margin-top: 4px;">*Warning: Changing your daily goal will retroactively alter your streak calculations.</span>
      </div>
    </label>
    <button id="settingsClose" style="align-self: flex-end; padding: 6px 14px; font-size: 12px; border: none; border-radius: 4px; cursor: pointer; background: var(--primary-color); color: white;">OK</button>
  </div>
</div>

<div id="clearHistoryOverlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 20;">
  <div style="background: var(--background-color); color: var(--text-color); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; max-width: 280px;">
    <strong>Clear historical data?</strong>
    <div style="font-size: 13px;">This will erase saved history for the active scope.</div>
    <div style="display: flex; justify-content: flex-end; gap: 8px;">
      <button id="clearHistoryCancel" style="padding: 6px 12px; border: 1px solid var(--input-border-color); border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="clearHistoryConfirm" style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer;">Clear</button>
    </div>
  </div>
</div>

<script>
let currentChartRange = 'week';
let currentChartType = 'output';
let lastProgress = null;
let lastDraftedGross = 0;
window._activeMetricVal = '${activeMetric}';
window._daysOff = ${JSON.stringify(daysOff)};
window._strictMode = ${strictMode ? 'true' : 'false'};

// --- LOCAL DATE HELPER (CLIENT SIDE) ---
function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// --- CLIENT-SIDE BROWSER TIMER ENGINE (RELIABLE WEBKIT INTERVAL) ---
let clientInterval = null;
let clientIdleTimeout = null;
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 Minutes

function recordTypingActivity() {
  const todayStr = getLocalDateStr();
  window._lastTimeHistory = window._lastTimeHistory || {};

  if (!clientInterval) {
    clientInterval = setInterval(() => {
      window._lastTimeHistory[todayStr] = (window._lastTimeHistory[todayStr] || 0) + 1;
      
      if (window._lastHistories) {
        drawDashboard(window._lastHistories, window._lastTimeHistory, window._activeMetricVal || 'count', lastDraftedGross, window._daysOff, window._strictMode);
      }

      if (window._lastTimeHistory[todayStr] % 10 === 0) {
        Beat.call(t => Beat.custom.saveTimeData(t), JSON.stringify(window._lastTimeHistory));
      }
    }, 1000);
  }

  if (clientIdleTimeout) clearTimeout(clientIdleTimeout);
  clientIdleTimeout = setTimeout(() => {
    if (clientInterval) {
      clearInterval(clientInterval);
      clientInterval = null;
      Beat.call(t => Beat.custom.saveTimeData(t), JSON.stringify(window._lastTimeHistory));
    }
  }, IDLE_THRESHOLD_MS);
}

// --- APP-LEVEL FOCUS CHANGE LISTENER (VISIBILITY API) ---
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (clientInterval) {
      clearInterval(clientInterval);
      clientInterval = null;
      if (clientIdleTimeout) clearTimeout(clientIdleTimeout);
      Beat.call(t => Beat.custom.saveTimeData(t), JSON.stringify(window._lastTimeHistory));
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });
  const monthOpt = document.getElementById('monthOptionLabel');
  if (monthOpt) monthOpt.textContent = currentMonthName;
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
  document.getElementById('btn-' + tabId).classList.add('active');
  if (tabId === 'goal' && lastProgress) {
    updateDonuts(lastProgress.projProg, lastProgress.dailyProg);
  }
  if (tabId === 'dashboard' && window._lastHistories) {
    drawDashboard(window._lastHistories, window._lastTimeHistory, window._activeMetricVal, lastDraftedGross, window._daysOff, window._strictMode);
  }
}

function switchChartRange(range) {
  currentChartRange = range;
  if (window._lastHistories) drawDashboard(window._lastHistories, window._lastTimeHistory, window._activeMetricVal, lastDraftedGross, window._daysOff, window._strictMode);
}

function switchChartType(type) {
  currentChartType = type;
  if (window._lastHistories) drawDashboard(window._lastHistories, window._lastTimeHistory, window._activeMetricVal, lastDraftedGross, window._daysOff, window._strictMode);
}

function switchMetricType(val) {
  window._activeMetricVal = val;
  if (val === 'pages') {
    Beat.call((t) => Beat.custom.setCountType(t), 'page');
    Beat.call((m) => Beat.custom.setActiveMetric(m), 'count');
  } else if (val === 'words') {
    Beat.call((t) => Beat.custom.setCountType(t), 'word');
    Beat.call((m) => Beat.custom.setActiveMetric(m), 'count');
  } else if (val === 'duration') {
    Beat.call((m) => Beat.custom.setActiveMetric(m), 'duration');
  }
  if (window._lastHistories) {
    drawDashboard(window._lastHistories, window._lastTimeHistory, window._activeMetricVal, lastDraftedGross, window._daysOff, window._strictMode);
  }
}

function switchHistoryScope(scope) {
  Beat.call((s) => Beat.custom.setHistoryScope(s), scope);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const totalMinutes = seconds / 60;
  if (totalMinutes >= 60) {
    return (totalMinutes / 60).toFixed(2) + 'h';
  }
  return Math.round(totalMinutes) + 'm';
}

// Theme override logic
const originalMatchMedia = window.matchMedia.bind(window);
let matchMediaOverride = null;
function applyThemeOverride() {
  let theme = localStorage.getItem('goalsTheme') || 'light';
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    localStorage.setItem('goalsTheme', theme);
  }
  if (matchMediaOverride) { window.matchMedia = originalMatchMedia; matchMediaOverride = null; }
  document.documentElement.classList.remove('light', 'dark');
  if (theme === 'light' || theme === 'dark') {
    window.matchMedia = function(query) {
      if (query === '(prefers-color-scheme: dark)') {
        return { matches: theme === 'dark', media: query, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, onchange: null };
      }
      return originalMatchMedia(query);
    };
    matchMediaOverride = window.matchMedia;
    document.documentElement.classList.add(theme);
  }
  Beat.call(() => Beat.custom.refresh());
}
applyThemeOverride(); 

const collapseSelect = document.getElementById('collapse-select');
collapseSelect.addEventListener('change', e => { Beat.call((mode) => Beat.custom.setCollapseMode(mode), e.target.value); });
window.addEventListener('blur', () => { Beat.call(() => Beat.custom.minimizeGoalsPanel()); });
window.addEventListener('focus', () => { Beat.call(() => Beat.custom.maximizeGoalsPanel()); });
</script>

<script>
let isFirstRun = true;
let dailyShown = false;
let dailyShownDate = getLocalDateKey();
let projectShown = false;
let isMuted = localStorage.getItem('goalsMuted') === 'true';

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const muteCheckbox = document.getElementById('mute-checkbox');
const daysOffCheckboxes = document.querySelectorAll('.day-off-checkbox');
const strictModeCheckbox = document.getElementById('strict-mode-checkbox');
const themeSelect = document.getElementById('theme-select');

themeSelect.value = localStorage.getItem('goalsTheme') || 'light';
themeSelect.addEventListener('change', (e) => { localStorage.setItem('goalsTheme', e.target.value); applyThemeOverride(); });

window.togglePluginTheme = function() {
  const currentTheme = localStorage.getItem('goalsTheme') || 'light';
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('goalsTheme', nextTheme);
  themeSelect.value = nextTheme;
  applyThemeOverride();
};
muteCheckbox.checked = isMuted;

settingsBtn.addEventListener('click', () => { settingsOverlay.style.display = 'flex'; });
settingsClose.addEventListener('click', () => { 
    settingsOverlay.style.display = 'none'; 
    if (window._lastHistories) {
        drawDashboard(window._lastHistories, window._lastTimeHistory, window._activeMetricVal, lastDraftedGross, window._daysOff, window._strictMode);
    }
});
muteCheckbox.addEventListener('change', () => { isMuted = muteCheckbox.checked; localStorage.setItem('goalsMuted', isMuted); });
daysOffCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    window._daysOff = Array.from(daysOffCheckboxes)
      .filter((dayCheckbox) => dayCheckbox.checked)
      .map((dayCheckbox) => Number(dayCheckbox.value));
    Beat.call((val) => Beat.custom.setDaysOff(val), JSON.stringify(window._daysOff));
  });
});
strictModeCheckbox.addEventListener('change', () => {
  window._strictMode = strictModeCheckbox.checked;
  Beat.call((val) => Beat.custom.setStrictMode(val), strictModeCheckbox.checked);
});

function showSuccess(message) {
  const ov = document.getElementById('successOverlay');
  const msg = document.getElementById('successMessage');
  const btn = document.getElementById('successOk');
  if (!ov || !msg || !btn) return;
  msg.textContent = message; ov.style.display = 'flex';
  const snd = document.getElementById('successSound');
  if (snd && !isMuted) { snd.currentTime = 0; snd.play().catch(e => console.warn('Audio play failed:', e)); }
  btn.onclick = () => { ov.style.display = 'none'; };
}

const root = getComputedStyle(document.documentElement);
const primaryColor = root.getPropertyValue('--primary-color').trim();

function drawArc(ctx, radius, thickness, progress, color) {
    const canvas = ctx.canvas;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width; const h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2; const cy = h / 2;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.lineWidth = thickness;
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const donutBg = isDark ? '#333333' : '#cccccc';
    ctx.strokeStyle = donutBg; ctx.lineCap = "butt"; ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(progress, 1));
    ctx.lineWidth = thickness; ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.stroke();
}

function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  return ctx;
}

function updateDonuts(projProg, dailyProg) {
  const projCanvas = document.getElementById('projectDonut');
  const dailyCanvas = document.getElementById('dailyDonut');
  if (!projCanvas || !dailyCanvas) return;
  const projCtx = setupCanvas(projCanvas); const dailyCtx = setupCanvas(dailyCanvas);
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

function renderChart(history, range, type, canvasId, isDuration) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas.offsetParent === null) return;
  const chartTooltip = document.getElementById('chartTooltip');
  if (chartTooltip) chartTooltip.style.display = 'none';
  
  const ctx = setupCanvas(canvas);
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr; const h = canvas.height / dpr;
  
  const padLeft = 45, padBottom = 20, padTop = 10, padRight = 32;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  
  let points = [];
  const today = new Date(); today.setHours(0,0,0,0);
  
  const getVal = (ds) => {
    const raw = history[ds] || 0;
    return isDuration ? Number((raw / 3600).toFixed(2)) : raw;
  };

  const getCumul = (endStr) => {
    let sum = 0;
    for (let k in history) { if (k <= endStr) sum += (history[k] || 0); }
    return isDuration ? Number((sum / 3600).toFixed(2)) : sum;
  };

  if (range === 'week') {
    for(let i=6; i>=0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const ds = getLocalDateStr(d);
      const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
      points.push({ label: label, date: ds, periodStart: ds, periodEnd: ds, value: type === 'cumulative' ? getCumul(ds) : getVal(ds) });
    }
  } else if (range === 'month') {
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let curr = new Date(firstDay);
    while (curr <= lastDay && curr <= today) {
      const ds = getLocalDateStr(curr);
      const label = curr.getDate().toString();
      points.push({ label: label, date: ds, periodStart: ds, periodEnd: ds, value: type === 'cumulative' ? getCumul(ds) : getVal(ds) });
      curr.setDate(curr.getDate() + 1);
    }
  } else {
    if (range === 'all') {
      const years = Object.keys(history)
        .map(date => date.slice(0, 4))
        .filter((year, index, values) => values.indexOf(year) === index)
        .sort();
      for (let year of years) {
        const lastDayStr = year + '-12-31';
        if (type === 'cumulative') {
          points.push({ label: year, periodStart: year + '-01-01', periodEnd: lastDayStr, value: getCumul(lastDayStr) });
        } else {
          let sum = 0;
          for (let date in history) { if (date.startsWith(year)) sum += history[date]; }
          points.push({ label: year, periodStart: year + '-01-01', periodEnd: lastDayStr, value: isDuration ? Number((sum / 3600).toFixed(2)) : sum });
        }
      }
    } else {
      let months = range === '3month' ? 3 : range === '6month' ? 6 : 12;
      for(let i=months-1; i>=0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
        const monthPrefix = getLocalDateStr(d).slice(0, 7);
        const firstDayStr = getLocalDateStr(d);
        const lastDayStr = getLocalDateStr(lastDay);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: range === 'year' ? undefined : (months > 11 ? '2-digit' : undefined) });
        
        if (type === 'cumulative') {
          points.push({ label: label, periodStart: firstDayStr, periodEnd: lastDayStr, value: getCumul(lastDayStr) });
        } else {
          let sum = 0;
          for (let date in history) { if (date.startsWith(monthPrefix)) sum += history[date]; }
          points.push({ label: label, periodStart: firstDayStr, periodEnd: lastDayStr, value: isDuration ? Number((sum / 3600).toFixed(2)) : sum });
        }
      }
    }
  }

  const dataMax = Math.max(...points.map(p => p.value), 0);
  const targetTick = dataMax > 0 ? dataMax / 3 : 1;
  const tickMagnitude = Math.pow(10, Math.floor(Math.log10(targetTick)));
  const normalizedTick = targetTick / tickMagnitude;
  const niceFactor = normalizedTick <= 1 ? 1 : normalizedTick <= 2 ? 2 : normalizedTick <= 5 ? 5 : 10;
  const tickInterval = isDuration
    ? niceFactor * tickMagnitude
    : Math.max(1, niceFactor * tickMagnitude);
  const maxVal = Math.max(tickInterval, Math.ceil(dataMax / tickInterval) * tickInterval);
  const currentGoal = !isDuration ? (type === 'cumulative' ? parseFloat(document.getElementById('project-goal').value) : parseFloat(document.getElementById('daily-goal').value)) : 0;

  ctx.clearRect(0, 0, w, h);
  
  ctx.fillStyle = root.getPropertyValue('--secondary-color').trim();
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  
  ctx.strokeStyle = root.getPropertyValue('--input-border-color').trim();
  ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
  
  for (let val = 0; val <= maxVal + tickInterval * 1e-8; val += tickInterval) {
    const y = padTop + chartH - (val / maxVal * chartH);
    const displayVal = isDuration ? Number(val.toFixed(2)) : Math.round(val);
    let valStr = displayVal > 9999 ? (displayVal/1000).toFixed(1)+'k' : displayVal.toString();
    if (isDuration) valStr += 'h';
    ctx.fillText(valStr, padLeft - 8, y);
    ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(w - padRight, y); ctx.stroke();
  }
  ctx.setLineDash([]); 

  if (currentGoal && currentGoal > 0 && currentGoal <= maxVal) {
     const goalY = padTop + chartH - (currentGoal / maxVal * chartH);
     ctx.beginPath(); ctx.moveTo(padLeft, goalY); ctx.lineTo(w - padRight, goalY);
     ctx.strokeStyle = root.getPropertyValue('--secondary-color').trim();
     ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
  }

  const stepX = chartW / Math.max(points.length - 1, 1);
  const plottedPoints = points.map((point, index) => ({
    x: padLeft + index * stepX,
    y: padTop + chartH - (point.value / maxVal * chartH),
    date: point.date,
    periodStart: point.periodStart,
    periodEnd: point.periodEnd,
    label: point.label
  }));
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padLeft + (i * stepX);
    const y = padTop + chartH - (p.value / maxVal * chartH);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    
    let showLabel = false;
    if (range === 'week') showLabel = true;
    else if (range === 'month') showLabel = true;
    else if ((range === '3month' || range === '6month')) showLabel = true;
    else if (range === 'year' && i % 2 === 0) showLabel = true;
    else if (range === 'all') showLabel = true;

    if (showLabel) {
      if (range === 'month') ctx.font = '8px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(p.label, x, padTop + chartH + 6);
    }
  });
  
  ctx.strokeStyle = root.getPropertyValue('--primary-color').trim();
  ctx.lineWidth = 2; ctx.stroke();
  
  ctx.fillStyle = root.getPropertyValue('--background-color').trim();
  points.forEach((p, i) => {
    const x = padLeft + (i * stepX);
    const y = padTop + chartH - (p.value / maxVal * chartH);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  });

  if (chartTooltip) {
    canvas.onmousemove = (event) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      let nearestPoint = null;
      let nearestDistance = Infinity;

      plottedPoints.forEach((point) => {
        const distance = Math.hypot(mouseX - point.x, mouseY - point.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestPoint = point;
        }
      });

      if (!nearestPoint || nearestDistance > 10 || !nearestPoint.periodStart || !nearestPoint.periodEnd) {
        chartTooltip.style.display = 'none';
        return;
      }

      let exactValue = 0;
      for (let date in history) {
        if (type === 'cumulative'
          ? date <= nearestPoint.periodEnd
          : date >= nearestPoint.periodStart && date <= nearestPoint.periodEnd) {
          exactValue += history[date] || 0;
        }
      }
      if (!nearestPoint.date && type !== 'cumulative' && nearestPoint.periodStart === nearestPoint.periodEnd) {
        exactValue = history[nearestPoint.periodStart] || 0;
      }
      let tooltipLabel;
      if (nearestPoint.date) {
        tooltipLabel = new Date(nearestPoint.date + 'T00:00:00').toLocaleDateString();
      } else if (nearestPoint.periodStart.slice(0, 4) !== nearestPoint.periodEnd.slice(0, 4)) {
        tooltipLabel = nearestPoint.periodStart + ' – ' + nearestPoint.periodEnd;
      } else if (nearestPoint.periodStart.slice(5, 7) === '01' && nearestPoint.periodEnd.slice(5, 7) === '12') {
        tooltipLabel = nearestPoint.periodStart.slice(0, 4);
      } else {
        tooltipLabel = new Date(nearestPoint.periodStart + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      }
      let tooltipValue;
      if (isDuration) {
        const totalSeconds = Math.round(exactValue);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        tooltipValue = hours > 0
          ? hours + 'h ' + minutes + 'm ' + seconds + 's'
          : minutes > 0
            ? minutes + 'm ' + seconds + 's'
            : seconds + 's';
        tooltipValue += ' duration';
      } else {
        const unit = document.getElementById('countTypeSelect').value === 'word' ? 'words' : 'pages';
        tooltipValue = exactValue.toLocaleString() + ' ' + unit;
      }
      const containerRect = canvas.parentElement.getBoundingClientRect();
      chartTooltip.textContent = tooltipLabel + ': ' + tooltipValue + (!nearestPoint.date && type === 'cumulative' ? ' (cumulative)' : '');
      chartTooltip.style.left = (rect.left - containerRect.left + nearestPoint.x) + 'px';
      chartTooltip.style.top = (rect.top - containerRect.top + nearestPoint.y - 8) + 'px';
      chartTooltip.style.display = 'block';
    };
    canvas.onmouseleave = () => { chartTooltip.style.display = 'none'; };
  } else {
    canvas.onmousemove = null;
    canvas.onmouseleave = null;
  }
}

function drawDashboard(histories, timeData, metricVal, draftedGross, selectedDaysOff, strictEnabled) {
  window._lastHistories = histories;
  window._daysOff = Array.isArray(selectedDaysOff) ? selectedDaysOff : [];
  window._strictMode = strictEnabled;
  
  window._lastTimeHistory = window._lastTimeHistory || {};
  if (timeData) {
    for (let k in timeData) {
      window._lastTimeHistory[k] = Math.max(window._lastTimeHistory[k] || 0, timeData[k]);
    }
  }

  window._activeMetricVal = metricVal;
  
  const today = new Date(); today.setHours(0,0,0,0);
  const isDurationMode = metricVal === 'duration';
  
  const isWordMode = document.getElementById('countTypeSelect').value === 'word';
  const pageHist = histories.page || {};
  const wordHist = histories.word || {};
  const activeHist = isWordMode ? wordHist : pageHist;
  const unitPlural = isWordMode ? 'Words' : 'Pages';
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });

  const isDayActive = (dObj) => {
    const ds = getLocalDateStr(dObj);
    const pCount = pageHist[ds] || 0;
    const wCount = wordHist[ds] || 0;
    
    if (window._strictMode) {
      const dailyGoalInput = parseFloat(document.getElementById('daily-goal').value) || 0;
      if (dailyGoalInput > 0) {
        const metricValue = isWordMode ? wCount : pCount;
        return metricValue >= dailyGoalInput;
      }
    }

    return pCount > 0 || wCount > 0;
  };

  const isDayOff = (dObj) => window._daysOff.includes(dObj.getDay());

  // --- STREAK & ACTIVE DAYS CALCULATION ---
  let currentStreak = 0;
  let pointer = new Date(today);
  let isToday = true;

  while (true) {
    const active = isDayActive(pointer);
    if (active) {
      currentStreak++;
      isToday = false;
      pointer.setDate(pointer.getDate() - 1);
    } else {
      if (isToday) {
        // Haven't written today yet; skip today without breaking and check yesterday
        isToday = false;
        pointer.setDate(pointer.getDate() - 1);
      } else {
        if (isDayOff(pointer)) {
          // Skip selected days off without breaking the streak.
          pointer.setDate(pointer.getDate() - 1);
        } else {
          break;
        }
      }
    }
    if ((today - pointer) > 730 * 24 * 60 * 60 * 1000) break;
  }

  let earliestDate = new Date(today);
  let allActiveDates = new Set();
  [pageHist, wordHist].forEach(h => {
    Object.keys(h).forEach(k => {
      if (h[k] > 0) allActiveDates.add(k);
      const d = new Date(k);
      if (d < earliestDate) earliestDate = d;
    });
  });

  let sortedActiveDates = Array.from(allActiveDates).sort();
  let projectStartDate = sortedActiveDates.length > 0 ? sortedActiveDates[0] : getLocalDateStr(today);
  let totalActiveDaysCount = allActiveDates.size;

  let longestStreak = 0;
  if (allActiveDates.size > 0) {
    let iter = new Date(earliestDate);
    iter.setHours(0,0,0,0);
    let tempStreak = 0;
    while (iter <= today) {
      if (isDayActive(iter)) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        iter.setDate(iter.getDate() + 1);
      } else {
        if (isDayOff(iter)) {
          iter.setDate(iter.getDate() + 1);
        } else {
          tempStreak = 0;
          iter.setDate(iter.getDate() + 1);
        }
      }
    }
  }
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  document.getElementById('dash-streak').textContent = currentStreak;
  const recordEl = document.getElementById('dash-streak-record');
  if (recordEl) recordEl.textContent = 'record: ' + longestStreak;
  
  // Streak Odometer Tooltip
  document.getElementById('box-5').title = "Started: " + projectStartDate + "\\nActive Days: " + totalActiveDaysCount;

  // --- BOX 1, 2, 3, 4 RENDER ---
  const todayString = getLocalDateStr(today);
  const monthPrefix = todayString.slice(0, 7);

  const mondayOffset = (today.getDay() + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - mondayOffset);

  let weeklySec = 0, monthlySec = 0, totalSec = 0;
  for (let date in window._lastTimeHistory) {
    totalSec += window._lastTimeHistory[date];
    if (date.startsWith(monthPrefix)) monthlySec += window._lastTimeHistory[date];
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    const ds = getLocalDateStr(d);
    if (window._lastTimeHistory[ds]) weeklySec += window._lastTimeHistory[ds];
  }

  document.getElementById('box-2').title = (weeklySec / 3600 / 24).toFixed(2) + " days (" + (weeklySec / 3600).toFixed(1) + " hours)";
  document.getElementById('box-3').title = (monthlySec / 3600 / 24).toFixed(2) + " days (" + (monthlySec / 3600).toFixed(1) + " hours)";
  document.getElementById('box-4').title = (totalSec / 3600 / 24).toFixed(2) + " days (" + (totalSec / 3600).toFixed(1) + " hours)";

  if (isDurationMode) {
    document.getElementById('title-box-1').textContent = 'Daily duration';
    document.getElementById('title-box-2').textContent = 'Weekly duration';
    document.getElementById('title-box-3').textContent = monthName + ' duration';
    document.getElementById('title-box-4').textContent = 'Total duration';

    let dailySec = window._lastTimeHistory[todayString] || 0;

    document.getElementById('val-box-1').textContent = formatDuration(dailySec);
    document.getElementById('val-box-2').textContent = formatDuration(weeklySec);
    document.getElementById('val-box-3').textContent = formatDuration(monthlySec);
    document.getElementById('val-box-4').textContent = formatDuration(totalSec);

    renderChart(window._lastTimeHistory, currentChartRange, currentChartType, 'lineChartCanvas', true);
  } else {
    document.getElementById('title-box-1').innerHTML = 'Today <span>' + unitPlural + '</span>';
    document.getElementById('title-box-2').innerHTML = 'Weekly <span>' + unitPlural + '</span>';
    document.getElementById('title-box-3').innerHTML = '<span>' + monthName + '</span> <span>' + unitPlural + '</span>';
    document.getElementById('title-box-4').innerHTML = 'Drafted <span>' + unitPlural + '</span>';

    let monthly = 0, weekly = 0;
    for (let date in activeHist) { if (date.startsWith(monthPrefix)) monthly += activeHist[date]; }
    let todayCount = activeHist[todayString] || 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      const ds = getLocalDateStr(d);
      if (activeHist[ds]) weekly += activeHist[ds];
    }

    document.getElementById('val-box-1').textContent = todayCount;
    document.getElementById('val-box-2').textContent = weekly;
    document.getElementById('val-box-3').textContent = monthly;
    document.getElementById('val-box-4').textContent = draftedGross !== undefined ? draftedGross : 0;

    renderChart(activeHist, currentChartRange, currentChartType, 'lineChartCanvas', false);
  }

  // --- HEATMAP ---
  const heatmap = document.getElementById('heatmapContainer');
  if (heatmap) {
      heatmap.innerHTML = '';
      let daysToShow = 28;
      const heatmapSource = isDurationMode ? window._lastTimeHistory : activeHist;

      if (currentChartRange === 'month') {
        const year = today.getFullYear(); const month = today.getMonth();
        daysToShow = new Date(year, month + 1, 0).getDate();
      } else if (currentChartRange === '3month') daysToShow = 90;
      else if (currentChartRange === '6month') daysToShow = 180;
      else if (currentChartRange === 'year') daysToShow = 365;
      else if (currentChartRange === 'all') {
        const dates = Object.keys(heatmapSource).sort();
        if (dates.length > 0) {
          const firstDate = new Date(dates[0]);
          const diffTime = Math.abs(today - firstDate);
          daysToShow = Math.min(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 365);
        }
      }

      heatmap.style.gridTemplateColumns = daysToShow > 90 ? 'repeat(31, 1fr)' : 'repeat(14, 1fr)';

      for(let i = daysToShow - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const ds = getLocalDateStr(d);
        const val = heatmapSource[ds] || 0;
        const block = document.createElement('div');
        block.className = 'heat-block';
        if (val > 0) {
           const threshold = isDurationMode ? 1800 : 500;
           if (val > threshold * 2) block.style.opacity = 1;
           else if (val > threshold) block.style.opacity = 0.7;
           else block.style.opacity = 0.4;
        }
        block.title = ds + ": " + (isDurationMode ? formatDuration(val) : val);
        heatmap.appendChild(block);
      }
  }
}

window.updateProgress = function(countTypeArg, activeMetricArg, dailyCount, dailyGoal, projCount, projGoal, deadlineStr, historyStr, timeStr, draftedGross, daysOffVal, strictVal) {
  try {
    window._activeMetricVal = activeMetricArg;
    window._daysOff = Array.isArray(daysOffVal) ? daysOffVal : [];
    window._strictMode = strictVal;
    
    var sel = document.getElementById('countTypeSelect'); if (sel) sel.value = countTypeArg;
    var metricSel = document.getElementById('metricTypeSelect');
    if (metricSel) {
      if (activeMetricArg === 'duration') metricSel.value = 'duration';
      else metricSel.value = countTypeArg === 'word' ? 'words' : 'pages';
    }

    var dailyInput = document.getElementById('daily-goal'); if (dailyInput) dailyInput.value = dailyGoal;
    var projInput = document.getElementById('project-goal'); if (projInput) projInput.value = projGoal;
    var deadlineInput = document.getElementById('deadline-input');
    if (deadlineInput) { deadlineInput.value = deadlineStr ? deadlineStr.split('T')[0] : ''; }

    const projProg = projGoal ? projCount / projGoal : 0;
    const dailyProg = dailyGoal ? dailyCount / dailyGoal : 0;
    lastProgress = { projProg: projProg, dailyProg: dailyProg };
    lastDraftedGross = draftedGross;
    updateDonuts(projProg, dailyProg);
    
    var centerEl = document.getElementById('centerCounter');
    if (centerEl) { centerEl.textContent = dailyCount; }
    
    var ct = document.getElementById('countTypeSelect').value;
    var unit = ct === 'word' ? 'words' : 'pages';
    var totalEl = document.getElementById('total-count');
    if (totalEl) {
      var remaining = projGoal - projCount; if (remaining < 0) remaining = 0;
      totalEl.textContent = projCount + ' ' + unit + ' total / ' + remaining + ' ' + unit + ' remaining';
    }
    
    let days = '';
    if (deadlineStr) {
      const dl = new Date(deadlineStr);
      const today = new Date(); today.setHours(0,0,0,0);
      days = Math.ceil((dl - today) / (1000*60*60*24));
    }
    const pagesPerDay = days > 0 && projGoal ? Math.ceil((projGoal - projCount) / days) : 0;
    updateInfo(days, pagesPerDay);

    if (historyStr) {
       window._lastHistories = JSON.parse(historyStr);
       const parsedTime = JSON.parse(timeStr || '{}');
       drawDashboard(window._lastHistories, parsedTime, activeMetricArg, draftedGross, window._daysOff, strictVal);
    }

    const today = getLocalDateKey();
    if (today !== dailyShownDate) {
      dailyShownDate = today;
      dailyShown = false;
    }

    if (!isFirstRun) {
      if (dailyGoal > 0 && dailyCount >= dailyGoal && !dailyShown) { dailyShown = true; showSuccess('🎉 Daily goal achieved!'); }
      if (projGoal > 0 && projCount >= projGoal && !projectShown) { projectShown = true; showSuccess('🏆 Project goal achieved!'); }
    }
    isFirstRun = false;
  } catch (err) { console.error("Goals plugin updateProgress error:", err); }
};

document.getElementById('countTypeSelect').addEventListener('change', (e) => { Beat.call((type) => Beat.custom.setCountType(type), e.target.value); });
document.getElementById('daily-goal').addEventListener('input', (e) => { Beat.call((val) => Beat.custom.setDailyGoal(val), parseInt(e.target.value)); });
document.getElementById('project-goal').addEventListener('input', (e) => { Beat.call((val) => Beat.custom.setProjectGoal(val), parseInt(e.target.value)); });
document.getElementById('deadline-input').addEventListener('change', (e) => { Beat.call((val) => Beat.custom.setDeadline(val), e.target.value); });

updateProgress('${countType}', '${activeMetric}', ${dailyInit}, ${dailyGoal}, ${totalInit}, ${projectGoal}, '${deadlineInit}', '${historyInit}', '${timeInit}', ${draftedGrossInit}, ${JSON.stringify(daysOff)}, ${strictMode ? 'true' : 'false'});

document.getElementById('reset-daily').addEventListener('click', () => {
  dailyShown = false; projectShown = false; isFirstRun = true;
  const ov = document.getElementById('successOverlay'); if (ov) ov.style.display = 'none';
  Beat.call(() => Beat.custom.resetDaily()); Beat.call(() => Beat.custom.refresh());
});

const clearHistoryOverlay = document.getElementById('clearHistoryOverlay');
document.getElementById('clear-history').addEventListener('click', () => {
  clearHistoryOverlay.style.display = 'flex';
});
document.getElementById('clearHistoryCancel').addEventListener('click', () => {
  clearHistoryOverlay.style.display = 'none';
});
document.getElementById('clearHistoryConfirm').addEventListener('click', () => {
  clearHistoryOverlay.style.display = 'none';
  window._lastTimeHistory = {};
  Beat.call(() => Beat.custom.clearHistory());
});

window.addEventListener('focus', () => { Beat.call(() => Beat.custom.refresh()); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { Beat.call(() => Beat.custom.refresh()); });
</script>
`;

let panel = Beat.htmlWindow(html, savedPanelWidth, savedPanelHeight);

if (savedPanelX !== null && savedPanelY !== null) {
  if (typeof panel.setFrame === "function") { panel.setFrame(savedPanelX, savedPanelY, savedPanelWidth, savedPanelHeight); }
}
panel.resizable = true;
panel.stayInMemory = true; 

function syncProgressTrackerCoordinates() {
  if (panel && typeof panel.getFrame === "function") {
    const currentFrame = panel.getFrame();
    if (currentFrame.x > -5000 && currentFrame.width > 0 && currentFrame.height > 0) {
      savedPanelX = currentFrame.x; savedPanelY = currentFrame.y;
      savedPanelWidth = currentFrame.width; savedPanelHeight = currentFrame.height;
      if (typeof Beat.localStorage !== 'undefined') {
        Beat.localStorage.setItem('progress_tracker_x', savedPanelX);
        Beat.localStorage.setItem('progress_tracker_y', savedPanelY);
        Beat.localStorage.setItem('progress_tracker_w', savedPanelWidth);
        Beat.localStorage.setItem('progress_tracker_h', savedPanelHeight);
      }
    }
  }
}

Beat.custom.toggleProgressTrackerWindow = function() {
  if (panel) {
    isPanelVisible = !isPanelVisible;
    if (!isPanelVisible) {
      syncProgressTrackerCoordinates();
      if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
        panel.setFrame(savedPanelX, savedPanelY, 0, 0);
      } else { panel.hide(); }
    } else {
      if (typeof panel.show === "function") { panel.show(); }
      if (typeof panel.setFrame === "function" && savedPanelX !== null && savedPanelY !== null) {
        panel.setFrame(savedPanelX, savedPanelY, savedPanelWidth, savedPanelHeight); 
      }
      try { updateMetrics(); } catch (e) {}
    }
  }
};
panel.toggle = Beat.custom.toggleProgressTrackerWindow;

Beat.onTextChange(function() { 
  try { 
    if (panel && typeof panel.runJS === 'function') {
      panel.runJS('recordTypingActivity()');
    }
    if (!Beat.onTextChangeDisabled) updateMetrics(); 
  } catch (err) {} 
});
Beat.onPreviewFinished(function() { try { updateMetrics(); } catch (err) {} });

const toggleProgressWindowItem = Beat.menuItem("Toggle Progress Tracker", ["cmd", "ctrl", "p"], Beat.custom.toggleProgressTrackerWindow);
Beat.custom.togglePluginTheme = function() {
  if (panel && typeof panel.runJS === "function") panel.runJS('togglePluginTheme()');
};
const togglePluginThemeItem = Beat.menuItem("Toggle Plugin Theme", ["cmd", "ctrl", "0"], Beat.custom.togglePluginTheme);
Beat.menu("Progress Tracker", [toggleProgressWindowItem, togglePluginThemeItem]);
if (panel && typeof panel.onMove === "function") { panel.onMove(function() { syncProgressTrackerCoordinates(); }); }
