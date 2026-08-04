// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE PROGRESS TRACKER — durable (IndexedDB + localStorage mirror)
// Storage goes through durableGet/durableSet in js/storage.js — see that file
// for why both stores exist rather than IndexedDB alone.
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
  try { const raw = durableGet(PROFILES_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return null;
}
function saveProfilesMeta(meta) {
  durableSet(PROFILES_KEY, JSON.stringify(meta));
}

// First run (or an install from before profiles existed): migrate any
// existing single-profile data under the old flat PROGRESS_KEY into a new
// default profile, so adding this feature never loses anyone's history.
function ensureProfilesInitialized() {
  let meta = loadProfilesMeta();
  if (meta && meta.profiles && meta.profiles.length) {
    // Idempotent write-through. Without this the profiles meta is only ever
    // written on the load that creates it, so an existing profile never
    // reaches IndexedDB — and recovery would then restore progress under a
    // profile id the app has no record of, leaving the data invisible.
    saveProfilesMeta(meta);
    return meta;
  }
  const defaultId = 'p_' + Date.now().toString(36);
  meta = { profiles: [{ id: defaultId, name: 'Player 1', avatar: '🎸' }], activeProfileId: defaultId };
  try {
    const legacyRaw = durableGet(PROGRESS_KEY);
    if (legacyRaw) durableSet(PROGRESS_KEY + '_' + defaultId, legacyRaw);
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
  // durableRemove, not localStorage.removeItem: deleting only the mirror
  // would leave the profile in IndexedDB, and boot recovery would restore
  // the 'deleted' data on the next load.
  durableRemove(PROGRESS_KEY + '_' + id);
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
    // ── Spaced repetition ────────────────────────────────────────────────
    // srsItems[itemKey] = { box 1-5, correct, incorrect, lastSeen (ISO date),
    //                       lastSeenSession, tier, label }
    // Previously the quiz only recorded MISSES and stored no timestamps, so
    // it had no way to know what had gone stale or what was due — it could
    // only weight toward things you'd got wrong at some point, forever.
    srsItems: {},
    sessionCount: 0,
  };
}

// ── Leitner spaced repetition ───────────────────────────────────────────────
// Boxes 1-3 are paced by SESSIONS (short-term: you want these back the same or
// next time you sit down). Boxes 4-5 are paced by CALENDAR DAYS, because once
// something is genuinely known, "4 sessions" could be 4 days or 4 weeks apart
// and only elapsed time reflects real forgetting.
const SRS_MAX_BOX = 5;
const SRS_SESSION_INTERVAL = { 1: 1, 2: 2, 3: 4 };  // review every N sessions
const SRS_DAY_INTERVAL = { 4: 7, 5: 14 };           // review every N days

function srsDefaultItem(tier, label) {
  return { box: 1, correct: 0, incorrect: 0, lastSeen: null, lastSeenSession: 0, tier, label };
}

// How overdue an item is. >= 0 means due now; larger is more overdue, which is
// what the queue sorts on. Never-seen items are treated as maximally due.
function srsOverdueBy(item, sessionCount, now) {
  if (!item || !item.lastSeen) return Number.MAX_SAFE_INTEGER;
  const box = Math.min(SRS_MAX_BOX, Math.max(1, item.box || 1));
  if (SRS_SESSION_INTERVAL[box] !== undefined) {
    return (sessionCount - (item.lastSeenSession || 0)) - SRS_SESSION_INTERVAL[box];
  }
  const days = (now - new Date(item.lastSeen).getTime()) / 86400000;
  return days - SRS_DAY_INTERVAL[box];
}

function srsIsDue(item, sessionCount, now) {
  return srsOverdueBy(item, sessionCount, now) >= 0;
}

// The review queue for this session: overdue items first (most overdue first).
function srsDueQueue(data) {
  const fq = (data || loadProgress()).fretboardQuiz;
  const now = Date.now(), sc = fq.sessionCount || 0;
  return Object.entries(fq.srsItems || {})
    .map(([key, item]) => ({ key, item, overdue: srsOverdueBy(item, sc, now) }))
    .filter(x => x.overdue >= 0)
    .sort((a, b) => b.overdue - a.overdue);
}

// Called once when a quiz session starts.
function srsBeginSession() {
  const data = loadProgress();
  data.fretboardQuiz.sessionCount = (data.fretboardQuiz.sessionCount || 0) + 1;
  saveProgress(data);
  return data.fretboardQuiz.sessionCount;
}

function srsBoxCounts(data) {
  const fq = (data || loadProgress()).fretboardQuiz;
  const counts = { 1:0, 2:0, 3:0, 4:0, 5:0 };
  Object.values(fq.srsItems || {}).forEach(i => {
    const b = Math.min(SRS_MAX_BOX, Math.max(1, i.box || 1));
    counts[b]++;
  });
  return counts;
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
    const raw = durableGet(activeProgressKey());
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
  if (data.ui.compactExpanded === undefined) data.ui.compactExpanded = false;
  if (!data.fretboardQuiz) data.fretboardQuiz = defaultFretboardQuizProgress();
  if (!data.fretboardQuiz.srsItems) data.fretboardQuiz.srsItems = {};
  if (data.fretboardQuiz.sessionCount === undefined) data.fretboardQuiz.sessionCount = 0;
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

  // Spaced repetition: every answer is recorded, not just failures, and every
  // one carries a timestamp — that pair is what makes scheduling possible.
  if (itemKey) {
    if (!fq.srsItems) fq.srsItems = {};
    const it = fq.srsItems[itemKey] || (fq.srsItems[itemKey] = srsDefaultItem(tier, itemLabel));
    it.tier = tier;
    if (itemLabel) it.label = itemLabel;
    if (correct) {
      it.correct++;
      it.box = Math.min(SRS_MAX_BOX, (it.box || 1) + 1);   // promote one box
    } else {
      it.incorrect++;
      it.box = 1;                                          // straight back to box 1
    }
    it.lastSeen = new Date().toISOString();
    it.lastSeenSession = fq.sessionCount || 0;
  }
  saveProgress(data);
}

function saveProgress(data) {
  durableSet(activeProgressKey(), JSON.stringify(data));
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
  if (scalesEl) scalesEl.textContent = day.scalesPracticed.length ? day.scalesPracticed.join(', ') : 'Nothing yet today';

  const riffsEl = document.getElementById('prog-riffs-list');
  if (riffsEl) riffsEl.textContent = day.riffsPlayed.length ? `${day.riffsPlayed.length} riff${day.riffsPlayed.length===1?'':'s'} played` : 'No riffs yet today';

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
  if (body) { body.classList.add('collapsible'); body.classList.toggle('collapsed', !!collapsed); }
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
}

function toggleProgressPanel() {
  // Takes are loaded lazily — reading blobs out of IndexedDB on every page
  // load would be wasteful when the panel is usually collapsed.
  setTimeout(() => { if (typeof renderTakesList === 'function') renderTakesList(); }, 0);
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

// ── Progress import ───────────────────────────────────────────────────────
// The counterpart exportProgressJSON never had. Without this the export was a
// one-way door: a file you could produce but nothing could read back.
//
// The merge is deliberately NON-DESTRUCTIVE and idempotent — re-importing the
// same file twice must not double your totals. So counters take max() rather
// than summing, and per-day records keep whichever side recorded more
// practice. Nothing in the incoming file can reduce a value you already have.

function progressImportSummary(incoming) {
  const cur = loadProgress();
  const days = Object.keys(incoming.days || {});
  const newDays = days.filter(d => !cur.days || !cur.days[d]).length;
  return {
    totalDays: days.length,
    newDays,
    overlappingDays: days.length - newDays,
    chordPairs: Object.keys(incoming.chordPairs || {}).length,
    riffs: Object.keys(incoming.riffTotals || {}).length,
    quizQuestions: (incoming.fretboardQuiz && incoming.fretboardQuiz.totalQuestions) || 0,
    lrSequences: (incoming.listenRepeat && incoming.listenRepeat.totalSequences) || 0,
    songs: Object.keys(incoming.songs || {}).length,
  };
}

function validateProgressPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'File is not valid JSON object data.';
  const d = parsed.data || parsed; // accept a bare progress object too
  if (typeof d !== 'object' || d === null) return 'No progress data found in file.';
  const looksRight = ['days', 'chordPairs', 'riffTotals', 'fretboardQuiz', 'listenRepeat', 'songs']
    .some(k => d[k] !== undefined);
  if (!looksRight) return 'This does not look like a guitar-practice progress export.';
  if (d.version && Number(d.version) > PROGRESS_VERSION) {
    return `File was written by a newer version (v${d.version}, this app reads v${PROGRESS_VERSION}).`;
  }
  return null; // valid
}

function mergeNumericMap(target, incoming, field) {
  Object.entries(incoming || {}).forEach(([k, v]) => {
    if (typeof v === 'number') {
      target[k] = Math.max(target[k] || 0, v);
    } else if (v && typeof v === 'object') {
      const t = target[k] || (target[k] = {});
      Object.entries(v).forEach(([kk, vv]) => {
        if (typeof vv === 'number') t[kk] = Math.max(t[kk] || 0, vv);
        else if (t[kk] === undefined) t[kk] = vv;
      });
    }
  });
}

function mergeProgress(cur, inc) {
  // Days: keep whichever side recorded more practice for that date.
  Object.entries(inc.days || {}).forEach(([day, entry]) => {
    const existing = cur.days[day];
    if (!existing) { cur.days[day] = entry; return; }
    // Day entries store scaleSeconds, not totalSeconds — comparing the wrong
    // field made both sides 0, so an imported day with more practice could
    // never win and the incoming record was always discarded.
    const dayWeight = e => (e ? (e.scaleSeconds || 0) + (e.gameSessions || 0) * 60 +
      (e.listenRepeatSequences || 0) * 10 + (e.songSessions || 0) * 60 : 0);
    const a = dayWeight(existing), b = dayWeight(entry);
    if (b > a) cur.days[day] = entry;
  });
  mergeNumericMap(cur.chordPairs, inc.chordPairs);
  mergeNumericMap(cur.riffTotals, inc.riffTotals);
  mergeNumericMap(cur.songs, inc.songs);

  if (inc.fretboardQuiz) {
    const t = cur.fretboardQuiz, i = inc.fretboardQuiz;
    t.totalQuestions = Math.max(t.totalQuestions || 0, i.totalQuestions || 0);
    t.bestStreak = Math.max(t.bestStreak || 0, i.bestStreak || 0);
    mergeNumericMap(t.accuracyByType, i.accuracyByType);
    mergeNumericMap(t.missedItems, i.missedItems);
    Object.entries(i.missedItems || {}).forEach(([k, v]) => {
      if (v && v.label && cur.fretboardQuiz.missedItems[k]) cur.fretboardQuiz.missedItems[k].label = v.label;
    });
    Object.entries(i.tierUnlocked || {}).forEach(([k, v]) => { if (v) t.tierUnlocked[k] = true; });
  }
  if (inc.listenRepeat) {
    const t = cur.listenRepeat, i = inc.listenRepeat;
    ['sessions', 'totalSequences', 'correctSequences', 'bestStreak'].forEach(k => {
      t[k] = Math.max(t[k] || 0, i[k] || 0);
    });
    mergeNumericMap(t.accuracyByNote, i.accuracyByNote);
    mergeNumericMap(t.missedNotes, i.missedNotes);
  }
  // ui is intentionally NOT merged — panel/collapse state is a local preference
  // of this device, not practice history worth importing.
  return cur;
}

function triggerProgressImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (e) { alert('Could not read that file — it is not valid JSON.'); return; }
      const err = validateProgressPayload(parsed);
      if (err) { alert('Import cancelled.\n\n' + err); return; }
      const incoming = parsed.data || parsed;
      const s = progressImportSummary(incoming);
      const from = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : 'unknown date';
      const ok = confirm(
        `Import practice history?\n\n` +
        `Exported: ${from}\n\n` +
        `${s.totalDays} day(s) of history — ${s.newDays} new, ${s.overlappingDays} already present\n` +
        `${s.chordPairs} chord pair(s)\n` +
        `${s.riffs} riff(s)\n` +
        `${s.quizQuestions} fretboard-quiz question(s)\n` +
        `${s.lrSequences} listen-and-repeat sequence(s)\n` +
        `${s.songs} song record(s)\n\n` +
        `Nothing will be overwritten with a lower value — where both sides have ` +
        `a record, the one with more practice is kept. Importing the same file ` +
        `twice is safe.\n\nImport into "${(getActiveProfile() || {}).name || 'this profile'}"?`
      );
      if (!ok) return;
      const merged = mergeProgress(loadProgress(), incoming);
      saveProgress(merged);
      alert(`Imported ${s.totalDays} day(s) of history into "${(getActiveProfile() || {}).name || 'this profile'}".\n\nReloading to apply.`);
      location.reload();
    };
    reader.onerror = () => alert('Could not read that file.');
    reader.readAsText(file);
  };
  input.click();
}

// ── Init ──────────────────────────────────────────────────────────────────
renderProfileSwitcher();
applyPanelCollapsedState(loadProgress().ui.panelCollapsed);
if (typeof applyMetronomeBarCollapsedState === 'function') applyMetronomeBarCollapsedState(loadProgress().ui.metronomeCollapsed);
if (typeof applyMicBarCollapsedState === 'function') applyMicBarCollapsedState(loadProgress().ui.micBarCollapsed);
if (typeof applyCompactExpandedState === 'function') applyCompactExpandedState(loadProgress().ui.compactExpanded);
if (typeof syncCompactBpm === 'function') { const s = document.getElementById('bpm-slider'); if (s) syncCompactBpm(s.value); }
renderProgressPanel();
setInterval(renderProgressPanel, 1000); // keeps the live scale-time ticking while a session runs
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profile-menu');
  if (menu && menu.style.display !== 'none' && !e.target.closest('.profile-chip-wrap')) menu.style.display = 'none';
});

// ── Recorded takes UI ──────────────────────────────────────────────────────
// Lives in the progress panel because the point of keeping takes is comparing
// them over time, which is a progress question, not a Listen & Repeat one.
let takesObjectUrls = [];

function releaseTakeUrls() {
  takesObjectUrls.forEach(u => URL.revokeObjectURL(u));
  takesObjectUrls = [];
}

async function renderTakesList() {
  const el = document.getElementById('takes-list');
  if (!el || typeof listTakes !== 'function') return;
  releaseTakeUrls();
  const all = await listTakes();
  const mine = all.filter(t => !t.profile || t.profile === getActiveProfileId());
  if (!mine.length) {
    el.innerHTML = '<div class="takes-empty">No takes kept yet. Record one in Study &rsaquo; Listen &amp; Repeat and press "Keep this take".</div>';
    return;
  }
  el.innerHTML = mine.map(t => {
    const url = URL.createObjectURL(t.blob);
    takesObjectUrls.push(url);
    const when = new Date(t.createdAt);
    const label = t.name || t.sequence || 'Take';
    const meta = [
      when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      t.accuracy != null ? t.accuracy + '%' : null,
      t.bytes ? Math.round(t.bytes / 1024) + 'kB' : null,
    ].filter(Boolean).join(' · ');
    return `<div class="take-row">
      <div class="take-main">
        <div class="take-name">${label}</div>
        <div class="take-meta">${meta}</div>
        <audio controls preload="none" src="${url}"></audio>
      </div>
      <div class="take-actions">
        <button onclick="renameTake(${t.id})" title="Rename">Rename</button>
        <button onclick="removeTake(${t.id})" title="Delete">Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function renameTake(id) {
  const name = prompt('Name this take');
  if (name == null) return;
  await updateTake(id, { name: name.trim().slice(0, 60) });
  renderTakesList();
}

async function removeTake(id) {
  if (!confirm('Delete this recording? This cannot be undone.')) return;
  await deleteTake(id);
  renderTakesList();
}
