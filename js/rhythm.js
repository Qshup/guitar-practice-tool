// ═══════════════════════════════════════════════════════════════════════════
// RHYTHM TRAINING — subdivision, polyrhythm, displacement
// ═══════════════════════════════════════════════════════════════════════════
//
// The Zappa practice guide in this app explicitly teaches 7/8, 11/8,
// quintuplets and rhythmic displacement, and until now nothing let you
// actually drill any of it — the app told you to practise this and handed you
// a plain metronome.
//
// These run their own Web Audio scheduler rather than hooking scheduleMetro's
// internals: the metronome's loop is built around one chord-vamp-per-beat and
// grafting sub-beat grids and two simultaneous pulse trains onto it would mean
// rewriting it. BPM and time signature are still READ from the shared
// controls (#bpm-slider / #time-sig), so everything stays in agreement.

const RHY_LOOK_AHEAD = 0.1;      // seconds of audio scheduled ahead
const RHY_SCHEDULE_INTERVAL = 25; // ms between scheduler wakeups
const RHY_GOOD_MS = 45;           // |delta| under this counts as accurate
const RHY_OK_MS = 100;            // under this counts as close

const SUBDIVISIONS = [
  { id: 'quarter', label: 'Quarter', per: 1 },
  { id: 'eighth',  label: 'Eighth',  per: 2 },
  { id: 'triplet', label: 'Triplet', per: 3 },
  { id: 'sixteenth', label: '16th',  per: 4 },
  { id: 'quintuplet', label: 'Quintuplet ★', per: 5 }, // Zappa's signature grouping
];

const POLYRHYTHMS = [
  { id: '3:4', a: 3, b: 4, label: '3 against 4' },
  { id: '5:4', a: 5, b: 4, label: '5 against 4' },
  { id: '7:4', a: 7, b: 4, label: '7 against 4' },
];

// Where a phrase starts, as a fraction of a bar from beat 1.
const DISPLACEMENTS = [
  { id: 'beat1', label: 'On beat 1', offsetBeats: 0 },
  { id: 'and1',  label: 'The "and" of 1', offsetBeats: 0.5 },
  { id: 'beat2', label: 'On beat 2', offsetBeats: 1 },
  { id: 'and2',  label: 'The "and" of 2', offsetBeats: 1.5 },
  { id: 'beat3', label: 'On beat 3', offsetBeats: 2 },
  { id: 'e1',    label: 'The "e" of 1 (16th late) ★', offsetBeats: 0.25 },
];

let rhyMode = 'subdivision';
let rhyRunning = false;
let rhyTimer = null;
let rhyNextTime = 0;
let rhyStep = 0;           // index into the current grid
let rhyTaps = [];          // { delta, cell }
let rhyExpected = [];      // { time, cell } scheduled but not yet judged
let rhySubdivision = 'eighth';
let rhyPoly = '3:4';
let rhyDisplacement = 'and1';
let rhyBarCount = 0;

function rhyBpm() {
  const el = document.getElementById('bpm-slider');
  return el ? parseInt(el.value, 10) : 80;
}
function rhyBeats() {
  const el = document.getElementById('time-sig');
  const v = el ? parseInt(el.value, 10) : 4;
  return isNaN(v) ? 4 : v;
}
function rhyBeatDur() { return 60 / rhyBpm(); }
function rhySubPer() {
  const s = SUBDIVISIONS.find(x => x.id === rhySubdivision);
  return s ? s.per : 2;
}

// ── Grid construction ──────────────────────────────────────────────────────
// Each cell: { beat, sub, isBeat, isAccent }
function rhyBuildGrid() {
  const beats = rhyBeats(), per = rhySubPer(), cells = [];
  for (let b = 0; b < beats; b++) {
    for (let s = 0; s < per; s++) {
      cells.push({ beat: b, sub: s, isBeat: s === 0, isAccent: b === 0 && s === 0 });
    }
  }
  return cells;
}

// ── Scheduler ──────────────────────────────────────────────────────────────
function rhySchedule() {
  const ctx = getAudioCtx();
  const vol = (parseInt(document.getElementById('vol-slider').value, 10) || 60) / 100;

  while (rhyNextTime < ctx.currentTime + RHY_LOOK_AHEAD) {
    if (rhyMode === 'subdivision') {
      const grid = rhyBuildGrid();
      const cell = grid[rhyStep % grid.length];
      if (cell.isAccent) playClick(rhyNextTime, true, vol);
      else if (cell.isBeat) playClick(rhyNextTime, false, vol * 0.85);
      else playHihat(rhyNextTime, vol * 0.5);
      rhyExpected.push({ time: rhyNextTime, cell: rhyStep % grid.length });
      rhyHighlightAt(rhyNextTime, rhyStep % grid.length);
      rhyNextTime += rhyBeatDur() / rhySubPer();
      rhyStep++;
      if (rhyStep % grid.length === 0) rhyBarCount++;
    } else if (rhyMode === 'polyrhythm') {
      // One cycle = one bar of `b` beats; `a` evenly spaced pulses across it.
      const p = POLYRHYTHMS.find(x => x.id === rhyPoly);
      const cycle = rhyBeatDur() * p.b;
      const stepsA = p.a, stepsB = p.b;
      const lcmSteps = stepsA * stepsB;
      const tick = cycle / lcmSteps;
      const i = rhyStep % lcmSteps;
      const onA = i % stepsB === 0;   // a-pulses land every stepsB ticks
      const onB = i % stepsA === 0;   // b-pulses land every stepsA ticks
      if (onA && onB) playClick(rhyNextTime, true, vol);
      else if (onB) playClick(rhyNextTime, false, vol * 0.8);
      else if (onA) playHihat(rhyNextTime, vol * 0.7);
      if (onA) {
        rhyExpected.push({ time: rhyNextTime, cell: i });
        rhyHighlightAt(rhyNextTime, i);
      } else if (onB) {
        rhyHighlightAt(rhyNextTime, i);
      }
      rhyNextTime += tick;
      rhyStep++;
      if (rhyStep % lcmSteps === 0) rhyBarCount++;
    } else {
      // Displacement: a full bar of clicks, with the phrase entry marked.
      const beats = rhyBeats();
      const d = DISPLACEMENTS.find(x => x.id === rhyDisplacement);
      const per = 4; // 16th grid so "e of 1" is representable
      const grid = beats * per;
      const i = rhyStep % grid;
      const entryStep = Math.round(d.offsetBeats * per);
      const isBeat = i % per === 0;
      if (i === entryStep) playSnare(rhyNextTime, vol * 0.9);
      else if (i === 0) playClick(rhyNextTime, true, vol);
      else if (isBeat) playClick(rhyNextTime, false, vol * 0.7);
      if (i === entryStep) {
        rhyExpected.push({ time: rhyNextTime, cell: i });
      }
      rhyHighlightAt(rhyNextTime, i);
      rhyNextTime += rhyBeatDur() / per;
      rhyStep++;
      if (rhyStep % grid === 0) rhyBarCount++;
    }
  }
  rhyPruneExpected();
}

// Highlights are visual only, so a setTimeout aligned to the audio clock is
// accurate enough — the audio itself is sample-scheduled and unaffected.
function rhyHighlightAt(time, cellIndex) {
  const ctx = getAudioCtx();
  const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
  setTimeout(() => {
    document.querySelectorAll('#rhythm-grid .rhy-cell').forEach(el => {
      el.classList.toggle('lit', parseInt(el.dataset.cell, 10) === cellIndex);
    });
  }, delayMs);
}

// Anything older than the grading window can never be matched again.
function rhyPruneExpected() {
  const ctx = getAudioCtx();
  rhyExpected = rhyExpected.filter(e => (ctx.currentTime - e.time) < (RHY_OK_MS * 2) / 1000);
}

// ── Tap grading ────────────────────────────────────────────────────────────
function rhyTap() {
  if (!rhyRunning) return;
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  if (!rhyExpected.length) return;
  // Nearest scheduled event in time, in either direction.
  let best = null;
  rhyExpected.forEach(e => {
    const d = Math.abs(now - e.time);
    if (!best || d < best.d) best = { d, e };
  });
  if (!best) return;
  const deltaMs = Math.round((now - best.e.time) * 1000);
  rhyTaps.push({ delta: deltaMs, cell: best.e.cell });
  rhyFlashTap(deltaMs);
  rhyRenderStats();
}

function rhyFlashTap(deltaMs) {
  const el = document.getElementById('rhythm-feedback');
  if (!el) return;
  const a = Math.abs(deltaMs);
  const grade = a <= RHY_GOOD_MS ? 'good' : a <= RHY_OK_MS ? 'ok' : 'off';
  const word = grade === 'good' ? 'Locked' : (deltaMs < 0 ? 'Early' : 'Late');
  el.className = 'rhythm-feedback ' + grade;
  el.textContent = `${word} ${deltaMs > 0 ? '+' : ''}${deltaMs}ms`;
}

function rhyRenderStats() {
  const el = document.getElementById('rhythm-stats');
  if (!el) return;
  if (!rhyTaps.length) { el.innerHTML = '<span class="rhy-stat-empty">Tap along using Space or the grid.</span>'; return; }
  const abs = rhyTaps.map(t => Math.abs(t.delta));
  const good = abs.filter(d => d <= RHY_GOOD_MS).length;
  const ok = abs.filter(d => d > RHY_GOOD_MS && d <= RHY_OK_MS).length;
  const avg = Math.round(abs.reduce((a, b) => a + b, 0) / abs.length);
  const signed = Math.round(rhyTaps.reduce((a, t) => a + t.delta, 0) / rhyTaps.length);
  const drift = signed < -8 ? 'rushing' : signed > 8 ? 'dragging' : 'centred';
  el.innerHTML =
    `<span><em>${rhyTaps.length}</em> taps</span>` +
    `<span class="good"><em>${good}</em> locked</span>` +
    `<span class="ok"><em>${ok}</em> close</span>` +
    `<span><em>${avg}ms</em> avg off</span>` +
    `<span class="drift-${drift}">${drift} (${signed > 0 ? '+' : ''}${signed}ms)</span>`;
}

// ── Rendering ──────────────────────────────────────────────────────────────
function rhyRenderGrid() {
  const el = document.getElementById('rhythm-grid');
  if (!el) return;
  let html = '';
  if (rhyMode === 'subdivision') {
    const grid = rhyBuildGrid(), per = rhySubPer();
    grid.forEach((c, i) => {
      html += `<div class="rhy-cell${c.isBeat ? ' beat' : ''}${c.isAccent ? ' accent' : ''}" data-cell="${i}" onclick="rhyTap()">` +
              `<span>${c.isBeat ? (c.beat + 1) : rhySubLabel(c.sub, per)}</span></div>`;
      if (c.sub === per - 1) html += '<div class="rhy-gap"></div>';
    });
  } else if (rhyMode === 'polyrhythm') {
    const p = POLYRHYTHMS.find(x => x.id === rhyPoly);
    const lcm = p.a * p.b;
    let rowA = '', rowB = '';
    for (let i = 0; i < lcm; i++) {
      const onA = i % p.b === 0, onB = i % p.a === 0;
      rowA += `<div class="rhy-cell poly${onA ? ' on' : ''}" data-cell="${i}" onclick="rhyTap()"><span>${onA ? '●' : ''}</span></div>`;
      rowB += `<div class="rhy-cell poly${onB ? ' on beat' : ''}" data-cell="${i}"><span>${onB ? '●' : ''}</span></div>`;
    }
    html = `<div class="rhy-poly-row"><span class="rhy-row-label">${p.a} — you tap</span><div class="rhy-row">${rowA}</div></div>` +
           `<div class="rhy-poly-row"><span class="rhy-row-label">${p.b} — plays</span><div class="rhy-row">${rowB}</div></div>`;
  } else {
    const beats = rhyBeats(), per = 4;
    const d = DISPLACEMENTS.find(x => x.id === rhyDisplacement);
    const entry = Math.round(d.offsetBeats * per);
    for (let i = 0; i < beats * per; i++) {
      const isBeat = i % per === 0;
      const isEntry = i === entry;
      html += `<div class="rhy-cell${isBeat ? ' beat' : ''}${isEntry ? ' entry' : ''}" data-cell="${i}" onclick="rhyTap()">` +
              `<span>${isEntry ? '▶' : isBeat ? (i / per + 1) : ''}</span></div>`;
      if (i % per === per - 1) html += '<div class="rhy-gap"></div>';
    }
  }
  el.innerHTML = html;
  el.className = 'rhythm-grid mode-' + rhyMode;
}

function rhySubLabel(sub, per) {
  if (per === 2) return '&';
  if (per === 3) return sub === 1 ? 'trip' : 'let';
  if (per === 4) return sub === 1 ? 'e' : sub === 2 ? '&' : 'a';
  return String(sub + 1);
}

function rhyRenderControls() {
  const el = document.getElementById('rhythm-options');
  if (!el) return;
  if (rhyMode === 'subdivision') {
    el.innerHTML = `<div class="ctrl-label">Subdivision</div><div class="btn-row">` +
      SUBDIVISIONS.map(s => `<button class="${s.id === rhySubdivision ? 'active' : ''}" onclick="rhySetSubdivision('${s.id}')">${s.label}</button>`).join('') +
      `</div>`;
  } else if (rhyMode === 'polyrhythm') {
    el.innerHTML = `<div class="ctrl-label">Polyrhythm</div><div class="btn-row">` +
      POLYRHYTHMS.map(p => `<button class="${p.id === rhyPoly ? 'active' : ''}" onclick="rhySetPoly('${p.id}')">${p.label}</button>`).join('') +
      `</div>`;
  } else {
    el.innerHTML = `<div class="ctrl-label">Phrase starts on</div><div class="btn-row">` +
      DISPLACEMENTS.map(d => `<button class="${d.id === rhyDisplacement ? 'active' : ''}" onclick="rhySetDisplacement('${d.id}')">${d.label}</button>`).join('') +
      `</div>`;
  }
}

function rhyRenderHint() {
  const el = document.getElementById('rhythm-hint');
  if (!el) return;
  const hints = {
    subdivision: 'Count out loud while you tap. The accent is beat 1 of the bar — everything else is where the subdivision falls.',
    polyrhythm: 'Tap the top row only; the bottom row plays itself. Both lock together on the first cell of each cycle.',
    displacement: 'The snare marks where your phrase enters. Play the same lick starting there instead of on beat 1 — this is the Zappa/Hazel feel.',
  };
  el.textContent = hints[rhyMode];
}

function rhyRenderAll() { rhyRenderControls(); rhyRenderGrid(); rhyRenderHint(); rhyRenderStats(); }

// ── Controls ───────────────────────────────────────────────────────────────
function rhySetMode(m) {
  const was = rhyRunning;
  if (was) rhyStop();
  rhyMode = m;
  document.querySelectorAll('#rhythm-mode-row button').forEach(b => b.classList.toggle('active', b.dataset.rhymode === m));
  rhyTaps = [];
  rhyRenderAll();
  if (was) rhyStart();
}
function rhySetSubdivision(id) { rhySubdivision = id; rhyReset(); }
function rhySetPoly(id) { rhyPoly = id; rhyReset(); }
function rhySetDisplacement(id) { rhyDisplacement = id; rhyReset(); }
function rhyReset() {
  const was = rhyRunning;
  if (was) rhyStop();
  rhyStep = 0; rhyBarCount = 0; rhyTaps = []; rhyExpected = [];
  rhyRenderAll();
  if (was) rhyStart();
}

function rhyStart() {
  if (rhyRunning) return;
  const ctx = getAudioCtx();
  // Browsers only resume an AudioContext from a real user gesture. rhyStart is
  // always called from a click or a keypress so this normally succeeds — but if
  // it doesn't, currentTime stays frozen at 0, the scheduler's while-loop exits
  // immediately every tick, and the trainer would sit there looking active
  // while producing no sound and no highlights. Say so instead of pretending.
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {}, () => {});
    if (ctx.state === 'suspended') {
      const fb = document.getElementById('rhythm-feedback');
      if (fb) { fb.className = 'rhythm-feedback off'; fb.textContent = 'Click START to enable audio'; }
      return;
    }
  }
  rhyRunning = true;
  rhyStep = 0; rhyBarCount = 0; rhyExpected = []; rhyTaps = [];
  rhyNextTime = ctx.currentTime + 0.08;
  rhyTimer = setInterval(rhySchedule, RHY_SCHEDULE_INTERVAL);
  const btn = document.getElementById('rhythm-start-btn');
  if (btn) { btn.textContent = '■ STOP'; btn.classList.add('running'); }
  rhyRenderStats();
}

function rhyStop() {
  if (!rhyRunning) return;
  rhyRunning = false;
  clearInterval(rhyTimer); rhyTimer = null;
  document.querySelectorAll('#rhythm-grid .rhy-cell').forEach(el => el.classList.remove('lit'));
  const btn = document.getElementById('rhythm-start-btn');
  if (btn) { btn.textContent = '▶ START', btn.classList.remove('running'); }
  rhyRecordSession();
}

function rhyToggle() { rhyRunning ? rhyStop() : rhyStart(); }

// Feeds the shared progress tracker so rhythm work counts as practice.
function rhyRecordSession() {
  if (!rhyTaps.length || typeof loadProgress !== 'function') return;
  const abs = rhyTaps.map(t => Math.abs(t.delta));
  const avg = Math.round(abs.reduce((a, b) => a + b, 0) / abs.length);
  const good = abs.filter(d => d <= RHY_GOOD_MS).length;
  const data = loadProgress();
  if (!data.rhythm) data.rhythm = { sessions: 0, totalTaps: 0, bestAvgMs: null, byMode: {} };
  const r = data.rhythm;
  r.sessions++;
  r.totalTaps += rhyTaps.length;
  if (r.bestAvgMs === null || avg < r.bestAvgMs) r.bestAvgMs = avg;
  const key = rhyMode === 'subdivision' ? `${rhyMode}:${rhySubdivision}`
            : rhyMode === 'polyrhythm' ? `${rhyMode}:${rhyPoly}`
            : `${rhyMode}:${rhyDisplacement}`;
  const m = r.byMode[key] || (r.byMode[key] = { taps: 0, locked: 0, bestAvgMs: null });
  m.taps += rhyTaps.length;
  m.locked += good;
  if (m.bestAvgMs === null || avg < m.bestAvgMs) m.bestAvgMs = avg;
  saveProgress(data);
}

// Space taps while this sub-tab is showing, instead of toggling the metronome.
// shortcuts.js checks this first (see its Space case).
function rhythmPanelActive() {
  const p = document.getElementById('study-subtab-rhythm');
  return !!(p && p.classList.contains('active') &&
            document.getElementById('mode-panel-study').classList.contains('active'));
}
