// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE SESSION SPINE — plans a timed session from real practice history
// ═══════════════════════════════════════════════════════════════════════════
//
// The tool had no answer to "what should I practice for the next 30 minutes?"
// Every mode was excellent in isolation and the progress panel recorded what
// you DID, but nothing recommended what to do next — which is the hardest
// decision to make well at the point where you most need help making it.
//
// This reads the history that was already being recorded (stale scales, the
// SRS due queue, weak chord pairs, unplayed riffs) and assembles a sequence of
// timed activities. It is an OPTION, never a gate: skipSessionPlanner() goes
// straight to free practice, and an active plan never blocks navigation — you
// can deviate at any point and the bar just keeps tracking time.

const SESSION_DURATIONS = [15, 30, 45, 60];
const SESSION_FOCUSES = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'Knopfler', label: 'Knopfler' },
  { id: 'Ronson', label: 'Ronson' },
  { id: 'Hazel', label: 'Hazel' },
  { id: 'Dean Ween', label: 'Dean Ween' },
  { id: 'Zappa', label: 'Zappa' },
];

let sessionTickTimer = null;

// ── History queries ────────────────────────────────────────────────────────

// Days since a named scale last appeared in a day's scalesPracticed list.
// Returns null if it has never been practiced (which reads as "new", not "stale").
function daysSinceScalePracticed(data, scaleName) {
  const days = Object.keys(data.days || {}).sort().reverse();
  for (const d of days) {
    const entry = data.days[d];
    if (entry && Array.isArray(entry.scalesPracticed) && entry.scalesPracticed.includes(scaleName)) {
      return Math.max(0, Math.round((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000));
    }
  }
  return null;
}

// The scale most worth revisiting: longest since practiced, preferring ones
// tied to the chosen player focus.
function stalestScale(data, focus) {
  const pool = ALL_SCALES.filter(s => focus === 'Zappa' ? s.zappa : true);
  let best = null;
  pool.forEach(s => {
    const since = daysSinceScalePracticed(data, s.name);
    const score = since === null ? 999 : since;   // never-practiced ranks highest
    if (!best || score > best.score) best = { scale: s, since, score };
  });
  return best;
}

// Weakest chord transition by success rate, needing a minimum sample so a
// single miss doesn't dominate the plan.
function weakestChordPair(data) {
  const entries = Object.entries(data.chordPairs || {})
    .map(([pair, v]) => {
      if (typeof v === 'number') return { pair, attempts: v, rate: null };
      // recordChordPairResult stores { attempts, correct, bestStreak, curStreak }.
      // This used to read v.success / v.fail, which do not exist — so every
      // pair scored null and the weakest-transition line never appeared in a
      // real plan. It only looked right in testing because the fixture used
      // the invented field names.
      const attempts = v.attempts || 0;
      return { pair, attempts, rate: attempts ? (v.correct || 0) / attempts : null };
    })
    .filter(e => e.attempts >= 3 && e.rate !== null);
  if (!entries.length) return null;
  entries.sort((a, b) => a.rate - b.rate);
  return entries[0];
}

// A riff matching the focus that has been played least.
// Riffs have no id field — riffs.js identifies them positionally as
// `${groupIndex}-${riffIndex}` and recordRiffPlayed stores
// riffTotals[id] = { playCount, title, lastPlayed }. Reading r.id (undefined)
// and treating the value as a number made "least played" pick the first riff
// every time regardless of history.
function leastPlayedRiff(data, focus) {
  if (typeof RIFF_LIBRARY === 'undefined') return null;
  const totals = data.riffTotals || {};
  const all = [];
  RIFF_LIBRARY.forEach((group, gi) => {
    (group.riffs || []).forEach((r, ri) => {
      const players = r.player || [];
      if (focus !== 'balanced' && !players.includes(focus)) return;
      const rec = totals[`${gi}-${ri}`];
      const plays = rec ? (typeof rec === 'number' ? rec : (rec.playCount || 0)) : 0;
      all.push({ riff: r, riffId: `${gi}-${ri}`, plays });
    });
  });
  if (!all.length) return null;
  all.sort((a, b) => a.plays - b.plays);
  return all[0];
}

function songForFocus(focus) {
  if (typeof SONG_LIBRARY === 'undefined' || focus === 'balanced') return null;
  const matches = SONG_LIBRARY.filter(s => s.playerTag === focus);
  return matches.length ? matches[0] : null;
}

// ── Plan generation ────────────────────────────────────────────────────────
// Each activity: { id, title, reason, minutes, mode, subtab, done }
// Proportions are of the total, so a 15-minute session is the same shape as a
// 60-minute one rather than a truncated version of it.

function buildSessionPlan(totalMinutes, focus) {
  const data = loadProgress();
  const plan = [];
  const slice = (frac, min) => Math.max(min, Math.round(totalMinutes * frac));

  // 1. Warm up on the stalest scale
  const stale = stalestScale(data, focus);
  if (stale) {
    plan.push({
      id: 'warmup', mode: 'scales', minutes: slice(0.18, 3),
      title: `Warm up: ${stale.scale.name}`,
      reason: stale.since === null ? 'never practiced yet' : `not practiced in ${stale.since} day${stale.since === 1 ? '' : 's'}`,
      setup: { scaleId: stale.scale.id },
    });
  }

  // 2. Fretboard quiz, sized by what's actually due
  const due = (typeof srsDueQueue === 'function') ? srsDueQueue(data) : [];
  plan.push({
    id: 'quiz', mode: 'study', subtab: 'quiz', minutes: slice(0.25, 4),
    title: due.length ? `Fretboard quiz: ${due.length} due for review` : 'Fretboard quiz: new material',
    reason: due.length
      ? `${due.length} item${due.length === 1 ? '' : 's'} scheduled by spaced repetition`
      : 'nothing due — building new items',
  });

  // 3. Chord switching
  const weak = weakestChordPair(data);
  plan.push({
    id: 'chords', mode: 'study', subtab: 'game', minutes: slice(0.27, 4),
    title: focus === 'balanced' ? 'Chord switching' : `Chord switching: ${focus} progressions`,
    reason: weak
      ? `your ${weak.pair.replace('>', ' → ')} transition is weakest (${Math.round(weak.rate * 100)}%)`
      : 'builds the change speed everything else depends on',
  });

  // 4. Riff or song, depending on focus
  const song = songForFocus(focus);
  const riff = leastPlayedRiff(data, focus);
  if (song && totalMinutes >= 30) {
    plan.push({
      id: 'song', mode: 'songs', minutes: slice(0.30, 5),
      title: `Song: ${song.title}`,
      reason: `matches your ${focus} focus today`,
      setup: { songId: song.id },
    });
  } else if (riff) {
    plan.push({
      id: 'riff', mode: 'riffs', minutes: slice(0.30, 5),
      title: `Riff practice: ${riff.riff.title}`,
      reason: riff.plays === 0 ? 'never played this one' : `only played ${riff.plays} time${riff.plays === 1 ? '' : 's'}`,
      setup: { riffId: riff.riffId },
    });
  }

  // 5. Ear training closes the session on longer plans
  if (totalMinutes >= 45) {
    plan.push({
      // 'listen', not 'listenrepeat' — switchStudySubtab matches panel ids
      // literally and does not validate, so a wrong name silently hides every
      // panel in Study rather than erroring.
      id: 'ear', mode: 'study', subtab: 'listen', minutes: slice(0.15, 4),
      title: 'Ear training: Listen & Repeat',
      reason: 'ties the fretboard shapes to what you actually hear',
    });
  }

  plan.forEach(a => { a.done = false; });
  return plan;
}

// ── Session lifecycle ──────────────────────────────────────────────────────

function getSession() {
  const s = loadProgress().session;
  return (s && s.active) ? s : null;
}

function startSession(totalMinutes, focus) {
  const plan = buildSessionPlan(totalMinutes, focus);
  const data = loadProgress();
  data.session = {
    active: true, plan, currentIndex: 0, focus,
    totalMinutes, startedAt: Date.now(), elapsedBefore: 0,
  };
  saveProgress(data);
  hideSessionStartScreen();
  renderSessionBar();
  startSessionTicker();
  goToActivity(0);
}

function skipSessionPlanner() {
  const data = loadProgress();
  data.session = { active: false, dismissedAt: Date.now() };
  saveProgress(data);
  hideSessionStartScreen();
}

function goToActivity(index) {
  const data = loadProgress();
  const s = data.session;
  if (!s || !s.active || !s.plan[index]) return;
  s.currentIndex = index;
  saveProgress(data);
  const act = s.plan[index];
  if (typeof switchMode === 'function') switchMode(act.mode);
  if (act.subtab && typeof switchStudySubtab === 'function') switchStudySubtab(act.subtab);
  // Nudge the relevant mode toward the specific thing the plan named.
  if (act.setup && act.setup.scaleId && typeof state !== 'undefined') {
    state.scaleId = act.setup.scaleId;
    if (typeof buildScaleSelector === 'function') buildScaleSelector();
    if (typeof render === 'function') render();
  }
  renderSessionBar();
}

function completeCurrentActivity() {
  const data = loadProgress();
  const s = data.session;
  if (!s || !s.active) return;
  const act = s.plan[s.currentIndex];
  if (act) act.done = true;
  saveProgress(data);
  const next = s.plan.findIndex(a => !a.done);
  if (next === -1) { endSession(); return; }
  goToActivity(next);
}

function sessionElapsedMinutes(s) {
  return (Date.now() - s.startedAt) / 60000;
}

function endSession() {
  const data = loadProgress();
  const s = data.session;
  if (!s || !s.active) return;
  const elapsed = Math.round(sessionElapsedMinutes(s));
  const doneCount = s.plan.filter(a => a.done).length;
  s.active = false;
  s.endedAt = Date.now();
  saveProgress(data);
  stopSessionTicker();
  renderSessionBar();
  showSessionSummary(s, elapsed, doneCount);
}

function startSessionTicker() {
  stopSessionTicker();
  sessionTickTimer = setInterval(renderSessionBar, 1000);
}
function stopSessionTicker() {
  if (sessionTickTimer) { clearInterval(sessionTickTimer); sessionTickTimer = null; }
}

// ── UI ─────────────────────────────────────────────────────────────────────

function renderSessionStartScreen() {
  const el = document.getElementById('session-start');
  if (!el) return;
  el.innerHTML = `
    <div class="session-start-card">
      <div class="session-start-title">Plan today's practice</div>
      <div class="session-start-sub">Built from what's actually gone stale in your history. Optional — you can go straight to free practice.</div>
      <div class="session-field">
        <div class="session-field-label">How long?</div>
        <div class="session-opt-row" id="session-duration-row">
          ${SESSION_DURATIONS.map((m, i) => `<button class="session-opt${i === 1 ? ' active' : ''}" data-minutes="${m}">${m} min</button>`).join('')}
        </div>
      </div>
      <div class="session-field">
        <div class="session-field-label">Focus</div>
        <div class="session-opt-row" id="session-focus-row">
          ${SESSION_FOCUSES.map((f, i) => `<button class="session-opt${i === 0 ? ' active' : ''}" data-focus="${f.id}">${f.label}</button>`).join('')}
        </div>
      </div>
      <div class="session-start-actions">
        <button class="big-btn btn-go" onclick="startSessionFromForm()">Build my session</button>
        <button class="session-skip" onclick="skipSessionPlanner()">Skip — free practice</button>
      </div>
    </div>`;
  el.classList.add('visible');
  el.querySelectorAll('#session-duration-row .session-opt, #session-focus-row .session-opt').forEach(b => {
    b.onclick = () => {
      b.parentElement.querySelectorAll('.session-opt').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
}

function startSessionFromForm() {
  const mins = parseInt(document.querySelector('#session-duration-row .session-opt.active').dataset.minutes, 10);
  const focus = document.querySelector('#session-focus-row .session-opt.active').dataset.focus;
  startSession(mins, focus);
}

function hideSessionStartScreen() {
  const el = document.getElementById('session-start');
  if (el) el.classList.remove('visible');
}

function renderSessionBar() {
  const bar = document.getElementById('session-bar');
  if (!bar) return;
  const s = getSession();
  if (!s) { bar.classList.remove('visible'); bar.innerHTML = ''; return; }
  const elapsed = sessionElapsedMinutes(s);
  const pct = Math.min(100, (elapsed / s.totalMinutes) * 100);
  const remaining = Math.max(0, Math.ceil(s.totalMinutes - elapsed));
  const act = s.plan[s.currentIndex];
  bar.classList.add('visible');
  bar.innerHTML = `
    <div class="session-bar-fill" style="width:${pct}%"></div>
    <div class="session-bar-content">
      <span class="session-bar-step">${s.currentIndex + 1}/${s.plan.length}</span>
      <span class="session-bar-title">${act ? act.title : 'Session'}</span>
      <span class="session-bar-time">${remaining} min left</span>
      <button class="session-bar-btn" onclick="completeCurrentActivity()" title="Mark this step done and move on">Next ›</button>
      <button class="session-bar-btn" onclick="endSession()" title="Finish the session now">End</button>
    </div>`;
}

function showSessionSummary(s, elapsed, doneCount) {
  const el = document.getElementById('session-start');
  if (!el) return;
  const lines = s.plan.map(a => `<li class="${a.done ? 'done' : 'skipped'}">${a.done ? '✓' : '·'} ${a.title} <em>${a.minutes} min</em></li>`).join('');
  el.innerHTML = `
    <div class="session-start-card">
      <div class="session-start-title">Session complete</div>
      <div class="session-start-sub">${elapsed} minute${elapsed === 1 ? '' : 's'} practised · ${doneCount} of ${s.plan.length} steps completed</div>
      <ul class="session-summary-list">${lines}</ul>
      <div class="session-start-actions">
        <button class="big-btn btn-go" onclick="hideSessionStartScreen()">Done</button>
        <button class="session-skip" id="session-obsidian-btn" onclick="exportSessionSummaryToObsidian()">Export to Obsidian</button>
      </div>
    </div>`;
  el.classList.add('visible');
  const ob = document.getElementById('session-obsidian-btn');
  if (ob && typeof obsidianSupported === 'function' && !obsidianSupported()) ob.style.display = 'none';
}

async function exportSessionSummaryToObsidian() {
  const data = loadProgress();
  const s = data.session;
  if (!s || typeof exportSessionToObsidian !== 'function') return;
  const elapsed = s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : s.totalMinutes;
  try {
    await exportSessionToObsidian({
      title: `Practice session — ${s.focus === 'balanced' ? 'balanced' : s.focus}`,
      durationSeconds: elapsed * 60,
      practiced: s.plan.filter(a => a.done).map(a => a.title),
      sections: s.plan.map(a => ({ name: a.title, score: a.done ? 'clean' : 'skipped' })),
      focusNext: s.plan.filter(a => !a.done).map(a => a.title).join(', ') || '',
    });
    const btn = document.getElementById('session-obsidian-btn');
    if (btn) btn.textContent = '✓ Exported';
  } catch (e) {
    alert('Obsidian export failed: ' + (e && e.message ? e.message : e));
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
// Show the planner on load unless a session is already running (resume it) or
// the planner was dismissed within the last hour (don't nag on every reload).
(function initSession() {
  const data = loadProgress();
  const s = data.session;
  if (s && s.active) {
    renderSessionBar();
    startSessionTicker();
    return;
  }
  const dismissedRecently = s && s.dismissedAt && (Date.now() - s.dismissedAt) < 3600000;
  if (!dismissedRecently) renderSessionStartScreen();
})();
