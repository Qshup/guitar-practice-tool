// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE PROGRESS TRACKER — localStorage-backed, collapsible panel
// ═══════════════════════════════════════════════════════════════════════════

const PROGRESS_KEY = 'gpt_progress';
const PROGRESS_VERSION = 1;

// ── User profiles — name + optional avatar, no password. Each profile's
// progress lives under its own localStorage key (PROGRESS_KEY + '_' + id) so
// switching profiles never mixes data between people. Designed for this tool
// to eventually be shared: everyone gets their own separate history. ──
const PROFILES_KEY = 'gpt_profiles';
const PROFILE_AVATARS = ['🎸','🎵','🎶','🤘','⭐','🔥','🌟','🎯'];

function loadProfilesMeta() {
  try { const raw = localStorage.getItem(PROFILES_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return null;
}
function saveProfilesMeta(meta) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(meta)); } catch (e) {}
}

// First run (or an install from before profiles existed): migrate any
// existing single-profile data under the old flat PROGRESS_KEY into a new
// default profile, so adding this feature never loses anyone's history.
function ensureProfilesInitialized() {
  let meta = loadProfilesMeta();
  if (meta && meta.profiles && meta.profiles.length) return meta;
  const defaultId = 'p_' + Date.now().toString(36);
  meta = { profiles: [{ id: defaultId, name: 'Player 1', avatar: '🎸' }], activeProfileId: defaultId };
  try {
    const legacyRaw = localStorage.getItem(PROGRESS_KEY);
    if (legacyRaw) localStorage.setItem(PROGRESS_KEY + '_' + defaultId, legacyRaw);
  } catch (e) {}
  saveProfilesMeta(meta);
  return meta;
}

function getProfiles() { return ensureProfilesInitialized().profiles; }
function getActiveProfileId() { return ensureProfilesInitialized().activeProfileId; }
function getActiveProfile() { const id = getActiveProfileId(); return getProfiles().find(p => p.id === id); }
function activeProgressKey() { return PROGRESS_KEY + '_' + getActiveProfileId(); }

// Every mode's in-memory state (Scales' state, Chords' chordModeState, song/
// riff players, etc.) is scattered across many files with no single reset
// hook — a full page reload is the simplest reliable way to re-initialize
// everything against the newly active profile's data, rather than needing
// every file to expose its own "reset to profile" function.
function createProfile(name, avatar) {
  const meta = ensureProfilesInitialized();
  const id = 'p_' + Date.now().toString(36);
  meta.profiles.push({ id, name: (name || 'New Player').slice(0, 24), avatar: avatar || PROFILE_AVATARS[meta.profiles.length % PROFILE_AVATARS.length] });
  meta.activeProfileId = id;
  saveProfilesMeta(meta);
  location.reload();
}
function switchProfile(id) {
  const meta = ensureProfilesInitialized();
  if (!meta.profiles.find(p => p.id === id) || meta.activeProfileId === id) return;
  meta.activeProfileId = id;
  saveProfilesMeta(meta);
  location.reload();
}
function deleteProfile(id) {
  const meta = ensureProfilesInitialized();
  if (meta.profiles.length <= 1) { alert("Can't delete your only profile."); return; }
  const p = meta.profiles.find(x => x.id === id);
  if (!p || !confirm(`Delete "${p.name}" and all their progress? This cannot be undone.`)) return;
  meta.profiles = meta.profiles.filter(x => x.id !== id);
  if (meta.activeProfileId === id) meta.activeProfileId = meta.profiles[0].id;
  try { localStorage.removeItem(PROGRESS_KEY + '_' + id); } catch (e) {}
  saveProfilesMeta(meta);
  location.reload();
}
function renameActiveProfile() {
  const p = getActiveProfile();
  if (!p) return;
  const name = prompt('Profile name', p.name);
  if (name == null) return;
  const meta = ensureProfilesInitialized();
  meta.profiles.find(x => x.id === p.id).name = name.trim().slice(0, 24) || p.name;
  saveProfilesMeta(meta);
  renderProfileSwitcher();
}

function toggleProfileMenu() {
  const menu = document.getElementById('profile-menu');
  if (!menu) return;
  const opening = menu.style.display === 'none';
  menu.style.display = opening ? '' : 'none';
  if (opening) renderProfileMenu();
}
function renderProfileMenu() {
  const menu = document.getElementById('profile-menu');
  if (!menu) return;
  const activeId = getActiveProfileId();
  menu.innerHTML = getProfiles().map(p => `
    <div class="profile-menu-row${p.id === activeId ? ' active' : ''}">
      <span class="profile-menu-avatar">${p.avatar}</span>
      <span class="profile-menu-name" onclick="switchProfile('${p.id}')">${p.name}${p.id === activeId ? ' (current)' : ''}</span>
      ${p.id === activeId ? `<button onclick="renameActiveProfile()" title="Rename">✎</button>` : ''}
      <button onclick="deleteProfile('${p.id}')" title="Delete">🗑</button>
    </div>
  `).join('') + `<button class="profile-menu-new" onclick="promptNewProfile()">+ New Profile</button>`;
}
function promptNewProfile() {
  const name = prompt('New profile name');
  if (name == null) return; // cancelled
  createProfile(name.trim());
}
function renderProfileSwitcher() {
  const chip = document.getElementById('profile-chip');
  const p = getActiveProfile();
  if (chip && p) chip.textContent = `${p.avatar} ${p.name} ▾`;
}

function defaultFretboardQuizProgress() {
  return {
    accuracyByType: { note:{correct:0,attempts:0}, scalePos:{correct:0,attempts:0}, chordPos:{correct:0,attempts:0} },
    missedItems: {},
    bestStreak: 0,
    tierUnlocked: { note:true, scalePos:false, chordPos:false },
    totalQuestions: 0,
  };
}

function defaultListenRepeatProgress() {
  return {
    sessions: 0,
    totalSequences: 0,
    correctSequences: 0,
    bestStreak: 0,
    accuracyByNote: {},   // 'string-fret' -> {correct, attempts}
    missedNotes: {},      // 'string-fret' -> missCount, feeds the neck heatmap
    lastContext: { mode: null },
  };
}

function defaultProgress() {
  return { version: PROGRESS_VERSION, days: {}, chordPairs: {}, riffTotals: {}, ui: { panelCollapsed: true, metronomeCollapsed: false }, fretboardQuiz: defaultFretboardQuizProgress(), listenRepeat: defaultListenRepeatProgress(), songs: {} };
}

function loadProgress() {
  let data = null;
  try {
    const raw = localStorage.getItem(activeProgressKey());
    if (raw) data = JSON.parse(raw);
  } catch (e) { data = null; }
  if (!data || typeof data !== 'object') data = defaultProgress();
  if (!data.days) data.days = {};
  if (!data.chordPairs) data.chordPairs = {};
  if (!data.riffTotals) data.riffTotals = {};
  if (!data.ui) data.ui = { panelCollapsed: true, metronomeCollapsed: false };
  if (data.ui.activeNavMode === undefined) data.ui.activeNavMode = 'scales';
  if (data.ui.activeChordSubtab === undefined) data.ui.activeChordSubtab = 'reference';
  if (data.ui.activeStudySubtab === undefined) data.ui.activeStudySubtab = 'flashcards';
  if (data.ui.metronomeCollapsed === undefined) data.ui.metronomeCollapsed = false;
  if (data.ui.micBarCollapsed === undefined) data.ui.micBarCollapsed = false;
  if (!data.fretboardQuiz) data.fretboardQuiz = defaultFretboardQuizProgress();
  if (!data.listenRepeat) data.listenRepeat = defaultListenRepeatProgress();
  if (!data.songs) data.songs = {};
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
  try { localStorage.setItem(activeProgressKey(), JSON.stringify(data)); }
  catch (e) { /* storage full/unavailable — practice continues, just isn't persisted this session */ }
}

function dateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function todayKey() { return dateKey(new Date()); }

function todayEntry(data) {
  const key = todayKey();
  if (!data.days[key]) data.days[key] = { scaleSeconds:0, scalesPracticed:[], riffsPlayed:[], gameSessions:0, listenRepeatSequences:0, songSessions:0 };
  if (data.days[key].listenRepeatSequences === undefined) data.days[key].listenRepeatSequences = 0;
  if (data.days[key].songSessions === undefined) data.days[key].songSessions = 0;
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

// sectionResults: { [sectionId]: { grade:'clean'|'needsWork', label } }
function recordSongSession(songId, songTitle, sectionResults, note, playSeconds) {
  if (!songId) return;
  const data = loadProgress();
  const s = data.songs[songId] || (data.songs[songId] = { title: songTitle, plays: 0, lastPlayed: null, totalSeconds: 0, sections: {}, notes: [] });
  s.title = songTitle || s.title;
  s.plays++;
  s.lastPlayed = new Date().toISOString();
  if (playSeconds > 0) s.totalSeconds += playSeconds;
  Object.entries(sectionResults || {}).forEach(([sectionId, result]) => {
    const sec = s.sections[sectionId] || (s.sections[sectionId] = { clean: 0, needsWork: 0, label: result.label });
    sec.label = result.label || sec.label;
    if (result.grade === 'clean') sec.clean++;
    else if (result.grade === 'needsWork') sec.needsWork++;
  });
  if (note && note.trim()) {
    s.notes.unshift({ date: new Date().toISOString(), text: note.trim() });
    if (s.notes.length > 20) s.notes.length = 20;
  }
  const today = todayEntry(data);
  today.songSessions++;
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
    const activity = day ? (day.scaleSeconds/60) + day.riffsPlayed.length*2 + day.gameSessions*3 + (day.listenRepeatSequences||0)*2 + (day.songSessions||0)*3 : 0;
    const level = activity===0 ? 0 : activity<5 ? 1 : activity<15 ? 2 : activity<30 ? 3 : 4;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.level = level;
    cell.title = day
      ? `${key}: ${Math.round(day.scaleSeconds/60)}m scales · ${day.riffsPlayed.length} riffs · ${day.gameSessions} game session(s) · ${day.listenRepeatSequences||0} listen & repeat · ${day.songSessions||0} song session(s)`
      : `${key}: no practice logged`;
    grid.appendChild(cell);
  }
}

// ── Progress popover (toggled by the nav bar's Progress button) ───────────
function applyPanelCollapsedState(collapsed) {
  const panel = document.getElementById('progress-panel');
  const body = document.getElementById('progress-panel-body');
  const chevron = document.getElementById('progress-panel-chevron');
  if (panel) panel.classList.toggle('open', !collapsed);
  if (body) body.style.display = collapsed ? 'none' : '';
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
}

function toggleProgressPanel() {
  const data = loadProgress();
  data.ui.panelCollapsed = !data.ui.panelCollapsed;
  saveProgress(data);
  applyPanelCollapsedState(data.ui.panelCollapsed);
}

// ── Export progress as a JSON backup ────────────────────────────────────────
function exportProgressJSON() {
  const data = loadProgress();
  const payload = { exportedAt: new Date().toISOString(), profile: (typeof getActiveProfileId === 'function' ? getActiveProfileId() : null), data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = payload.exportedAt.slice(0, 10);
  a.href = url;
  a.download = `guitar-practice-progress-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Init ──────────────────────────────────────────────────────────────────
renderProfileSwitcher();
applyPanelCollapsedState(loadProgress().ui.panelCollapsed);
if (typeof applyMetronomeBarCollapsedState === 'function') applyMetronomeBarCollapsedState(loadProgress().ui.metronomeCollapsed);
if (typeof applyMicBarCollapsedState === 'function') applyMicBarCollapsedState(loadProgress().ui.micBarCollapsed);
renderProgressPanel();
setInterval(renderProgressPanel, 1000); // keeps the live scale-time ticking while a session runs
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profile-menu');
  if (menu && menu.style.display !== 'none' && !e.target.closest('.profile-chip-wrap')) menu.style.display = 'none';
});
