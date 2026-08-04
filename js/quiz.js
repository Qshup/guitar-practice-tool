// ═══════════════════════════════════════════════════════════════════════════
// FRETBOARD QUIZ — note / scale-position / chord-position identification
// Streak-driven difficulty ladder, per-question-type accuracy, missed-item
// (archetype) spaced-repetition weighting.
// ═══════════════════════════════════════════════════════════════════════════

const FQ_KEY_POOLS = [
  ['E','A','D','G'],
  ['E','A','D','G','C','B'],
  ['E','A','D','G','C','B','F#','Bb'],
];
const FQ_SCALE_POOLS = [
  ['minpent'],
  ['minpent','natmin','majscl'],
  ['minpent','natmin','majscl','blues','mixo','dorian'],
];
const FQ_CHORD_SHAPES_BASIC = ['E','A'];
const FQ_CHORD_SHAPES_FULL = ['E','A','C','G','D'];
const FQ_DEGREE_NAMES = ['root','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th'];

let fqRunning = false;
let fqCurrentQuestion = null;
let fqRemainingTargets = [];
let fqMistakes = 0;
let fqStreak = 0;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fqDifficultyLevel(streak) { return Math.min(8, 1 + Math.floor(streak / 5)); }

function fqTierPools(level) {
  const keys = level <= 1 ? FQ_KEY_POOLS[0] : level <= 2 ? FQ_KEY_POOLS[1] : FQ_KEY_POOLS[2];
  const scaleIds = level <= 1 ? FQ_SCALE_POOLS[0] : level <= 2 ? FQ_SCALE_POOLS[1] : level <= 3 ? FQ_SCALE_POOLS[2] : null; // null = all scales
  const hidePercent = level <= 2 ? 0.25 : level <= 3 ? 0.3 : level <= 5 ? 0.4 : level <= 6 ? 0.55 : 0.7;
  const posMax = level <= 1 ? 1 : level <= 2 ? 2 : 4;
  const chordShapes = level <= 6 ? FQ_CHORD_SHAPES_BASIC : FQ_CHORD_SHAPES_FULL;
  return { keys, scaleIds, hidePercent, posMax, chordShapes };
}

function fqSessionTierUnlock(level) {
  return { scalePos: level >= 3, chordPos: level >= 5 };
}

function fqPickTier(level) {
  const data = loadProgress();
  const persisted = data.fretboardQuiz.tierUnlocked;
  const session = fqSessionTierUnlock(level);
  const avail = ['note'];
  if (persisted.scalePos || session.scalePos) avail.push('scalePos');
  if (persisted.chordPos || session.chordPos) avail.push('chordPos');
  return pick(avail);
}

function fqPersistTierUnlock(level) {
  const session = fqSessionTierUnlock(level);
  const data = loadProgress();
  let changed = false;
  if (session.scalePos && !data.fretboardQuiz.tierUnlocked.scalePos) { data.fretboardQuiz.tierUnlocked.scalePos = true; changed = true; }
  if (session.chordPos && !data.fretboardQuiz.tierUnlocked.chordPos) { data.fretboardQuiz.tierUnlocked.chordPos = true; changed = true; }
  if (changed) saveProgress(data);
}

// ── Question generators ─────────────────────────────────────────────────────
function generateNoteQuestion(level) {
  const pools = fqTierPools(level);
  const key = pick(pools.keys);
  const scaleId = pick(pools.scaleIds || ALL_SCALES.map(s => s.id));
  const scale = ALL_SCALES.find(s => s.id === scaleId);
  const pos = Math.floor(Math.random() * (pools.posMax + 1));
  const boxNotes = getBoxNotes(key, scale.intervals, pos);
  if (!boxNotes.length) return null;
  const askDegree = level >= 7 ? (1 + Math.floor(Math.random() * scale.intervals.length)) : 1;
  let targets = boxNotes.filter(n => n.order === askDegree);
  if (!targets.length) targets = boxNotes.filter(n => n.order === 1);
  if (!targets.length) return null;
  const degreeName = FQ_DEGREE_NAMES[(targets[0].order - 1)] || 'root';
  return {
    tier: 'note', key, scaleId, pos,
    targetCells: targets, shownCells: [],
    mistakeBudget: 0,
    promptText: `Tap the ${degreeName} of ${key} ${scale.name} in position ${pos + 1}`,
    explanation: `${key} ${scale.name}, position ${pos + 1} — the ${degreeName} (${targets[0].note}) is on ${targets.map(t => `${STRING_LABELS[t.string]} string, fret ${t.fret}`).join(' and ')}.`,
    itemKey: `note:${key}:${scaleId}:pos${pos}:deg${targets[0].order}`,
    itemLabel: `${key} ${scale.name} pos${pos + 1} (${degreeName})`,
  };
}

function generateScalePosQuestion(level) {
  const pools = fqTierPools(level);
  const key = pick(pools.keys);
  const scaleId = pick(pools.scaleIds || ALL_SCALES.map(s => s.id));
  const scale = ALL_SCALES.find(s => s.id === scaleId);
  const pos = Math.floor(Math.random() * 5);
  const boxNotes = getBoxNotes(key, scale.intervals, pos);
  if (boxNotes.length < 3) return null;
  const shuffled = [...boxNotes].sort(() => Math.random() - 0.5);
  const hideCount = Math.max(1, Math.min(boxNotes.length - 1, Math.round(boxNotes.length * pools.hidePercent)));
  const targets = shuffled.slice(0, hideCount);
  const targetSet = new Set(targets.map(t => `${t.string}-${t.fret}`));
  const shown = boxNotes.filter(n => !targetSet.has(`${n.string}-${n.fret}`));
  return {
    tier: 'scalePos', key, scaleId, pos,
    targetCells: targets, shownCells: shown,
    mistakeBudget: Math.max(1, Math.ceil(targets.length / 2)),
    promptText: `Tap the ${targets.length} missing note${targets.length === 1 ? '' : 's'} to complete ${key} ${scale.name}, position ${pos + 1}`,
    explanation: `Missing notes: ${targets.map(t => `${t.note} (${STRING_LABELS[t.string]} string, fret ${t.fret})`).join(', ')}.`,
    itemKey: `scalepos:${key}:${scaleId}:pos${pos}`,
    itemLabel: `${key} ${scale.name} pos${pos + 1}`,
  };
}

function generateChordPosQuestion(level) {
  const pools = fqTierPools(level);
  const key = pick(pools.keys);
  const shape = pick(pools.chordShapes);
  const frets = getShapeFrets(shape, key);
  const targets = [];
  frets.forEach((f, si) => { if (f >= 0) targets.push({ string: si, fret: f, note: noteAt(STRINGS[si], f) }); });
  if (targets.length < 2) return null;
  return {
    tier: 'chordPos', key, shape,
    targetCells: targets, shownCells: [],
    mistakeBudget: Math.max(1, Math.ceil(targets.length / 2)),
    promptText: `Tap all the notes of the ${key} chord (${shape} shape) in this position`,
    explanation: `${key} (${shape} shape) notes: ${targets.map(t => `${t.note} (${STRING_LABELS[t.string]} string, fret ${t.fret})`).join(', ')}.`,
    itemKey: `chordpos:${key}:${shape}`,
    itemLabel: `${key} ${shape} shape`,
  };
}

// ── Rebuilding a specific item ──────────────────────────────────────────────
// itemKeys are fully deterministic:
//   note:{key}:{scaleId}:pos{n}:deg{n}   scalepos:{key}:{scaleId}:pos{n}
//   chordpos:{key}:{shape}
// so a due item can be regenerated exactly rather than approximated by its
// tier. Without this, spaced repetition would only be able to say "you're due
// something note-shaped" and then ask a random note question — which is what
// the old missed-item weighting did, and why it never actually re-tested the
// thing you got wrong.
function generateFromItemKey(itemKey) {
  if (!itemKey) return null;
  const parts = itemKey.split(':');
  try {
    if (parts[0] === 'note') {
      const [, key, scaleId, posPart, degPart] = parts;
      const scale = ALL_SCALES.find(sc => sc.id === scaleId);
      if (!scale) return null;
      const pos = parseInt(posPart.replace('pos', ''), 10);
      const deg = parseInt(degPart.replace('deg', ''), 10);
      const boxNotes = getBoxNotes(key, scale.intervals, pos);
      let targets = boxNotes.filter(n => n.order === deg);
      if (!targets.length) return null;
      const degreeName = FQ_DEGREE_NAMES[targets[0].order - 1] || 'root';
      return {
        tier: 'note', key, scaleId, pos, targetCells: targets, shownCells: [], mistakeBudget: 0,
        promptText: `Tap the ${degreeName} of ${key} ${scale.name} in position ${pos + 1}`,
        explanation: `${key} ${scale.name}, position ${pos + 1} — the ${degreeName} (${targets[0].note}) is on ${targets.map(t => `${STRING_LABELS[t.string]} string, fret ${t.fret}`).join(' and ')}.`,
        itemKey, itemLabel: `${key} ${scale.name} pos${pos + 1} (${degreeName})`,
      };
    }
    if (parts[0] === 'scalepos') {
      const [, key, scaleId, posPart] = parts;
      const scale = ALL_SCALES.find(sc => sc.id === scaleId);
      if (!scale) return null;
      const pos = parseInt(posPart.replace('pos', ''), 10);
      const boxNotes = getBoxNotes(key, scale.intervals, pos);
      if (boxNotes.length < 3) return null;
      const pools = fqTierPools(fqDifficultyLevel(fqStreak));
      const shuffled = [...boxNotes].sort(() => Math.random() - 0.5);
      const hideCount = Math.max(1, Math.min(boxNotes.length - 1, Math.round(boxNotes.length * pools.hidePercent)));
      const targets = shuffled.slice(0, hideCount);
      const targetSet = new Set(targets.map(t => `${t.string}-${t.fret}`));
      const shown = boxNotes.filter(n => !targetSet.has(`${n.string}-${n.fret}`));
      return {
        tier: 'scalePos', key, scaleId, pos, targetCells: targets, shownCells: shown,
        mistakeBudget: Math.max(1, Math.ceil(targets.length / 2)),
        promptText: `Tap the ${targets.length} missing note${targets.length === 1 ? '' : 's'} to complete ${key} ${scale.name}, position ${pos + 1}`,
        explanation: `Missing notes: ${targets.map(t => `${t.note} (${STRING_LABELS[t.string]} string, fret ${t.fret})`).join(', ')}.`,
        itemKey, itemLabel: `${key} ${scale.name} pos${pos + 1}`,
      };
    }
    if (parts[0] === 'chordpos') {
      const [, key, shape] = parts;
      const frets = getShapeFrets(shape, key);
      const targets = [];
      frets.forEach((f, si) => { if (f >= 0) targets.push({ string: si, fret: f, note: noteAt(STRINGS[si], f) }); });
      if (targets.length < 2) return null;
      return {
        tier: 'chordPos', key, shape, targetCells: targets, shownCells: [],
        mistakeBudget: Math.max(1, Math.ceil(targets.length / 2)),
        promptText: `Tap all the notes of the ${key} chord (${shape} shape) in this position`,
        explanation: `${key} (${shape} shape) notes: ${targets.map(t => `${t.note} (${STRING_LABELS[t.string]} string, fret ${t.fret})`).join(', ')}.`,
        itemKey, itemLabel: `${key} ${shape} shape`,
      };
    }
  } catch (e) { return null; }
  return null;
}

function generateForTier(tier, level) {
  let q = null, attempts = 0;
  while (!q && attempts < 20) {
    q = tier === 'note' ? generateNoteQuestion(level)
      : tier === 'scalePos' ? generateScalePosQuestion(level)
      : generateChordPosQuestion(level);
    attempts++;
  }
  return q;
}

// Priority: overdue review items first (most overdue first), then new material.
// fqSessionQueue is built once per session by toggleFretboardQuiz.
let fqSessionQueue = [];

function generateQuestion(level) {
  while (fqSessionQueue.length) {
    const next = fqSessionQueue.shift();
    const q = generateFromItemKey(next.key);
    if (q) { q.srsBox = next.item.box || 1; q.srsDue = true; return q; }
    // Item no longer buildable (e.g. a scale that has since changed) — drop it.
  }
  return generateForTier(fqPickTier(level), level);
}

// ── Rendering + interaction ──────────────────────────────────────────────────
function renderQuizQuestion(q) {
  fqCurrentQuestion = q;
  fqRemainingTargets = q.targetCells.map(t => `${t.string}-${t.fret}`);
  fqMistakes = 0;

  document.getElementById('quiz-prompt').textContent = q.promptText;
  document.getElementById('quiz-explanation').textContent = '';
  renderSrsBoxIndicator(q);

  const shownMap = {};
  q.shownCells.forEach(t => shownMap[`${t.string}-${t.fret}`] = t);

  const container = document.getElementById('quiz-fretboard');
  buildFretGrid(container, (cell, dot, si, f) => {
    dot.dataset.string = si; dot.dataset.fret = f;
    const k = `${si}-${f}`;
    if (shownMap[k]) {
      dot.classList.add('quiz-given');
      dot.textContent = shownMap[k].note;
    } else {
      dot.classList.add('quiz-blank');
    }
  });
}

function handleQuizTap(dot) {
  if (!fqRunning || !fqCurrentQuestion) return;
  if (!dot.classList.contains('quiz-blank')) return;
  const si = +dot.dataset.string, f = +dot.dataset.fret;
  const k = `${si}-${f}`;
  const idx = fqRemainingTargets.indexOf(k);
  if (idx >= 0) {
    fqRemainingTargets.splice(idx, 1);
    dot.classList.remove('quiz-blank');
    dot.classList.add('quiz-correct');
    dot.textContent = noteAt(STRINGS[si], f);
    if (fqRemainingTargets.length === 0) questionSucceeded();
  } else {
    fqMistakes++;
    dot.classList.add('quiz-wrong');
    setTimeout(() => dot.classList.remove('quiz-wrong'), 300);
    if (fqMistakes > fqCurrentQuestion.mistakeBudget) questionFailed();
  }
}

function questionSucceeded() {
  const cleanClear = fqMistakes === 0;
  fqStreak = cleanClear ? fqStreak + 1 : 0;
  recordFretboardQuizAnswer(fqCurrentQuestion.tier, cleanClear, fqCurrentQuestion.itemKey, fqCurrentQuestion.itemLabel);
  if (cleanClear) {
    const data = loadProgress();
    if (fqStreak > data.fretboardQuiz.bestStreak) { data.fretboardQuiz.bestStreak = fqStreak; saveProgress(data); }
  }
  updateFqStatsDisplay();
  renderSrsQueueSummary();
  document.getElementById('quiz-explanation').textContent = cleanClear ? '✓ Correct!' : `Cleared with ${fqMistakes} mistake(s).`;
  if (cleanClear) {
    if (typeof pulseSuccess === 'function') pulseSuccess(document.getElementById('quiz-fretboard'));
    if (typeof bounceStreak === 'function') bounceStreak(document.getElementById('fq-streak'));
    if (typeof playSuccessChime === 'function') playSuccessChime();
  }
  setTimeout(nextQuizQuestion, 900);
}

function questionFailed() {
  fqStreak = 0;
  fqRemainingTargets.forEach(k => {
    const [si, f] = k.split('-').map(Number);
    const dot = document.querySelector(`#quiz-fretboard .note-dot[data-string="${si}"][data-fret="${f}"]`);
    if (dot) { dot.classList.remove('quiz-blank'); dot.classList.add('quiz-reveal'); dot.textContent = noteAt(STRINGS[si], f); }
  });
  recordFretboardQuizAnswer(fqCurrentQuestion.tier, false, fqCurrentQuestion.itemKey, fqCurrentQuestion.itemLabel);
  updateFqStatsDisplay();
  renderSrsQueueSummary();
  document.getElementById('quiz-explanation').textContent = '✗ ' + fqCurrentQuestion.explanation;
  setTimeout(nextQuizQuestion, 1800);
}

function nextQuizQuestion() {
  if (!fqRunning) return;
  const level = fqDifficultyLevel(fqStreak);
  fqPersistTierUnlock(level);
  const q = generateQuestion(level);
  renderQuizQuestion(q);
}

function updateFqStatsDisplay() {
  const data = loadProgress();
  const fq = data.fretboardQuiz;
  document.getElementById('fq-streak').textContent = fqStreak;
  document.getElementById('fq-best').textContent = fq.bestStreak;
  document.getElementById('fq-level').textContent = fqDifficultyLevel(fqStreak);
  const totalAttempts = Object.values(fq.accuracyByType).reduce((a, s) => a + s.attempts, 0);
  const totalCorrect = Object.values(fq.accuracyByType).reduce((a, s) => a + s.correct, 0);
  const fqAccEl = document.getElementById('fq-accuracy');
  fqAccEl.textContent = totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) + '%' : '—';
  fqAccEl.classList.toggle('is-empty', !totalAttempts); // dims the placeholder so it reads as 'no data yet', not broken

  const byTypeEl = document.getElementById('fq-accuracy-by-type');
  const labels = { note: 'Notes', scalePos: 'Scale Pos', chordPos: 'Chord Pos' };
  byTypeEl.innerHTML = Object.entries(fq.accuracyByType).map(([tier, s]) => {
    const pct = s.attempts ? Math.round(s.correct / s.attempts * 100) + '%' : '—';
    return `<div class="fq-type-stat"><span class="fq-type-label">${labels[tier]}</span><span>${pct} (${s.correct}/${s.attempts})</span></div>`;
  }).join('');
}

function toggleFretboardQuiz() {
  const btn = document.getElementById('fq-start-btn');
  if (fqRunning) {
    fqRunning = false;
    fqCurrentQuestion = null;
    btn.textContent = '▶ START QUIZ';
    btn.classList.remove('running');
    document.getElementById('quiz-prompt').textContent = 'Press Start to begin';
    document.getElementById('quiz-explanation').textContent = '';
  } else {
    fqRunning = true;
    fqStreak = 0;
    // Advance the session counter (boxes 1-3 are paced in sessions) and build
    // this session's review queue before the first question is generated.
    srsBeginSession();
    fqSessionQueue = srsDueQueue();
    renderSrsQueueSummary();
    btn.textContent = '■ STOP QUIZ';
    btn.classList.add('running');
    updateFqStatsDisplay();
    nextQuizQuestion();
  }
}

// ── Spaced-repetition UI ────────────────────────────────────────────────────
function renderSrsQueueSummary() {
  const el = document.getElementById('fq-srs-summary');
  if (!el) return;
  const counts = srsBoxCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const due = fqSessionQueue.length;
  if (!total) {
    el.innerHTML = `<span class="srs-queue-line">First session — everything is new material.</span>`;
    return;
  }
  const boxes = [1,2,3,4,5].map(b =>
    `<span class="srs-box-chip srs-box-${b}" title="Box ${b}: ${b<=3?`every ${{1:1,2:2,3:4}[b]} session(s)`:`every ${{4:7,5:14}[b]} days`}">${b}<em>${counts[b]}</em></span>`
  ).join('');
  el.innerHTML =
    `<span class="srs-queue-line">${due ? `<strong>${due}</strong> item${due===1?'':'s'} due for review` : 'Nothing due — new material only'}` +
    ` · ${total} item${total===1?'':'s'} tracked</span><span class="srs-box-row">${boxes}</span>`;
}

function renderSrsBoxIndicator(q) {
  const el = document.getElementById('fq-box-indicator');
  if (!el) return;
  if (!q || !q.itemKey) { el.textContent = ''; el.className = 'srs-indicator'; return; }
  const fq = loadProgress().fretboardQuiz;
  const item = (fq.srsItems || {})[q.itemKey];
  const box = item ? Math.min(5, Math.max(1, item.box || 1)) : 1;
  el.className = `srs-indicator srs-box-${box}` + (q.srsDue ? ' is-due' : '');
  el.innerHTML = item
    ? `<span class="srs-indicator-box">Box ${box}/5</span>` +
      `<span class="srs-indicator-meta">${item.correct}✓ ${item.incorrect}✗${q.srsDue ? ' · due for review' : ''}</span>`
    : `<span class="srs-indicator-box">New</span><span class="srs-indicator-meta">first time seeing this</span>`;
}

// ── Init: delegated click handler + initial stats ───────────────────────────
document.getElementById('quiz-fretboard').addEventListener('click', e => {
  const dot = e.target.closest('.note-dot');
  if (dot) handleQuizTap(dot);
});
updateFqStatsDisplay();
