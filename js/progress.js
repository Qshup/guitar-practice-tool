// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE PROGRESS TRACKER — localStorage-backed, collapsible panel
// ═══════════════════════════════════════════════════════════════════════════

const PROGRESS_KEY = 'gpt_progress';
const PROGRESS_VERSION = 1;

function defaultFretboardQuizProgress() {
  return {
    accuracyByType: { note:{correct:0,attempts:0}, scalePos:{correct:0,attempts:0}, chordPos:{correct:0,attempts:0} },
    missedItems: {},
    bestStreak: 0,
    tierUnlocked: { note:true, scalePos:false, chordPos:false },
    totalQuestions: 0,
  };
}

function defaultProgress() {
  return { version: PROGRESS_VERSION, days: {}, chordPairs: {}, riffTotals: {}, ui: { panelCollapsed: false }, fretboardQuiz: defaultFretboardQuizProgress() };
}

function loadProgress() {
  let data = null;
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { data = null; }
  if (!data || typeof data !== 'object') data = defaultProgress();
  if (!data.days) data.days = {};
  if (!data.chordPairs) data.chordPairs = {};
  if (!data.riffTotals) data.riffTotals = {};
  if (!data.ui) data.ui = { panelCollapsed: false };
  if (data.ui.activeNavMode === undefined) data.ui.activeNavMode = 'scales';
  if (data.ui.activeChordSubtab === undefined) data.ui.activeChordSubtab = 'reference';
  if (data.ui.activeStudySubtab === undefined) data.ui.activeStudySubtab = 'flashcards';
  if (!data.fretboardQuiz) data.fretboardQuiz = defaultFretboardQuizProgress();
  if (!data.version) data.version = PROGRESS_VERSION;
  return data;
}

function recordFretboardQuizAnswer(tier, correct, itemKey, itemLabel) {
  const data = loadProgress();
  const fq = data.fretboardQuiz;
  fq.totalQuestions++;
  const stat = fq.accuracyByType[tier];
  stat.attempts++;
  if (correct) {
    stat.correct++;
  } else {
    const m = fq.missedItems[itemKey] || (fq.missedItems[itemKey] = { missCount: 0, label: itemLabel });
    m.missCount++;
    m.label = itemLabel;
  }
  saveProgress(data);
}

function saveProgress(data) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(data)); }
  catch (e) { /* storage full/unavailable — practice continues, just isn't persisted this session */ }
}

function dateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayKey() { return dateKey(new Date()); }

function todayEntry(data) {
  const key = todayKey();
  if (!data.days[key]) data.days[key] = { scaleSeconds:0, scalesPracticed:[], riffsPlayed:[], gameSessions:0 };
  return data.days[key];
}

// ── Write API — called from hooks in audio.js / riffs.js / game.js ────────
function recordScaleTime(seconds) {
  if (!(seconds > 0)) return;
  const data = loadProgress();
  todayEntry(data).scaleSeconds += seconds;
  saveProgress(data);
  renderProgressPanel();
}

function recordScalePracticed(name) {
  if (!name) return;
  const data = loadProgress();
  const day = todayEntry(data);
  if (!day.scalesPracticed.includes(name)) day.scalesPracticed.push(name);
  saveProgress(data);
  renderProgressPanel();
}

function recordRiffPlayed(riffId, title) {
  const data = loadProgress();
  const day = todayEntry(data);
  if (!day.riffsPlayed.includes(riffId)) day.riffsPlayed.push(riffId);
  if (!data.riffTotals[riffId]) data.riffTotals[riffId] = { playCount: 0, title };
  data.riffTotals[riffId].playCount++;
  data.riffTotals[riffId].title = title;
  data.riffTotals[riffId].lastPlayed = new Date().toISOString();
  saveProgress(data);
  renderProgressPanel();
}

function recordGameSession() {
  const data = loadProgress();
  todayEntry(data).gameSessions++;
  saveProgress(data);
  renderProgressPanel();
}

function recordChordPairResult(from, to, success) {
  if (!from || !to) return;
  const data = loadProgress();
  const key = `${from}>${to}`;
  const entry = data.chordPairs[key] || (data.chordPairs[key] = { attempts:0, correct:0, bestStreak:0, curStreak:0 });
  entry.attempts++;
  if (success) {
    entry.correct++;
    entry.curStreak++;
    if (entry.curStreak > entry.bestStreak) entry.bestStreak = entry.curStreak;
  } else {
    entry.curStreak = 0;
  }
  saveProgress(data);
  renderProgressPanel();
}

// ── Render ──────────────────────────────────────────────────────────────────
function liveScaleSeconds() {
  return (typeof scaleTimerStart !== 'undefined' && scaleTimerStart) ? (Date.now() - scaleTimerStart) / 1000 : 0;
}

function renderProgressPanel() {
  const data = loadProgress();
  const day = data.days[todayKey()] || { scaleSeconds:0, scalesPracticed:[], riffsPlayed:[], gameSessions:0 };
  const liveSeconds = Math.round(day.scaleSeconds + liveScaleSeconds());

  const timeEl = document.getElementById('prog-scale-time');
  if (timeEl) timeEl.textContent = `${Math.floor(liveSeconds/60)}m ${liveSeconds%60}s`;

  const scalesEl = document.getElementById('prog-scales-list');
  if (scalesEl) scalesEl.textContent = day.scalesPracticed.length ? day.scalesPracticed.join(', ') : '—';

  const riffsEl = document.getElementById('prog-riffs-list');
  if (riffsEl) riffsEl.textContent = day.riffsPlayed.length ? `${day.riffsPlayed.length} riff${day.riffsPlayed.length===1?'':'s'} played` : '—';

  const gameEl = document.getElementById('prog-game-sessions');
  if (gameEl) gameEl.textContent = day.gameSessions;

  const pairsEl = document.getElementById('prog-chord-pairs');
  if (pairsEl) {
    const pairs = Object.entries(data.chordPairs).sort((a,b) => b[1].attempts - a[1].attempts).slice(0, 8);
    pairsEl.innerHTML = pairs.length
      ? pairs.map(([key, s]) => {
          const [from, to] = key.split('>');
          return `<div class="prog-pair-row"><span class="prog-pair-name">${from} → ${to}</span><span class="prog-pair-stat">${s.correct}/${s.attempts} · best streak ${s.bestStreak}</span></div>`;
        }).join('')
      : '<div class="prog-pair-row" style="color:#444">No chord switches recorded yet — play the Chord Switching Game below</div>';
  }

  renderHeatmap(data);
}

function renderHeatmap(data) {
  data = data || loadProgress();
  const grid = document.getElementById('practice-heatmap');
  if (!grid) return;
  grid.innerHTML = '';
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d);
    const day = data.days[key];
    const activity = day ? (day.scaleSeconds/60) + day.riffsPlayed.length*2 + day.gameSessions*3 : 0;
    const level = activity===0 ? 0 : activity<5 ? 1 : activity<15 ? 2 : activity<30 ? 3 : 4;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.level = level;
    cell.title = day
      ? `${key}: ${Math.round(day.scaleSeconds/60)}m scales · ${day.riffsPlayed.length} riffs · ${day.gameSessions} game session(s)`
      : `${key}: no practice logged`;
    grid.appendChild(cell);
  }
}

// ── Collapsible panel ────────────────────────────────────────────────────
function applyPanelCollapsedState(collapsed) {
  const body = document.getElementById('progress-panel-body');
  const chevron = document.getElementById('progress-panel-chevron');
  if (body) body.style.display = collapsed ? 'none' : '';
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
}

function toggleProgressPanel() {
  const data = loadProgress();
  data.ui.panelCollapsed = !data.ui.panelCollapsed;
  saveProgress(data);
  applyPanelCollapsedState(data.ui.panelCollapsed);
}

// ── Init ──────────────────────────────────────────────────────────────────
applyPanelCollapsedState(loadProgress().ui.panelCollapsed);
renderProgressPanel();
setInterval(renderProgressPanel, 1000); // keeps the live scale-time ticking while a session runs
