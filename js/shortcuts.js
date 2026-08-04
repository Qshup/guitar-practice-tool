// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS — operate the tool without putting the guitar down
// ═══════════════════════════════════════════════════════════════════════════
//
// The whole app is used with both hands occupied. Reaching for a mouse to
// start the metronome or step a scale position costs more than it sounds like
// when you are mid-practice, so the common actions get single keys.
//
// Every handler bails if focus is in a text field — index.html has a
// contenteditable BPM value and several inputs/selects, and stealing Space or
// a digit from those would be worse than having no shortcuts at all.

const SHORTCUTS = [
  { keys: 'Space',   label: 'Start / stop the metronome' },
  { keys: 'M',       label: 'Microphone on / off' },
  { keys: 'R',       label: 'Start / stop the scale run-through' },
  { keys: 'G',       label: 'Start / stop the chord switching game' },
  { keys: '← / →',   label: 'Previous / next scale position (or chord in a run)' },
  { keys: '1 – 5',   label: 'Jump straight to scale position 1–5' },
  { keys: 'Tab',     label: 'Cycle through the nav modes' },
  { keys: '?',       label: 'Show this list' },
  { keys: 'Esc',     label: 'Close this list' },
];

function shortcutsTypingTarget(e) {
  const t = e.target;
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
}

function activeModeName() {
  const p = document.querySelector('.mode-panel.active');
  return p ? p.id.replace('mode-panel-', '') : null;
}

// ── Actions ────────────────────────────────────────────────────────────────

function shortcutStepScalePosition(delta) {
  if (typeof state === 'undefined' || typeof render !== 'function') return false;
  const next = Math.max(0, Math.min(4, state.pos + delta));
  if (next === state.pos) return true;
  state.pos = next;
  document.querySelectorAll('[data-group="pos"]').forEach((b, i) => b.classList.toggle('active', i === state.pos));
  render();
  return true;
}

function shortcutSetScalePosition(index) {
  if (typeof state === 'undefined' || typeof render !== 'function') return false;
  state.pos = index;
  document.querySelectorAll('[data-group="pos"]').forEach((b, i) => b.classList.toggle('active', i === index));
  render();
  return true;
}

function shortcutCycleMode(backwards) {
  if (typeof NAV_MODES === 'undefined' || typeof switchMode !== 'function') return false;
  const cur = activeModeName();
  const i = NAV_MODES.indexOf(cur);
  const next = NAV_MODES[((i === -1 ? 0 : i) + (backwards ? -1 : 1) + NAV_MODES.length) % NAV_MODES.length];
  switchMode(next);
  return true;
}

// Left/Right mean "previous/next scale position" in Scales, but "previous/next
// chord" wherever a chord sequence is the thing on screen.
function shortcutStepChord(delta) {
  if (delta > 0 && typeof chordRunStep === 'function' && typeof chordRunRunning !== 'undefined' && chordRunRunning) {
    chordRunStep();
    return true;
  }
  return false;
}

// ── Help overlay ───────────────────────────────────────────────────────────

function renderShortcutsOverlay() {
  const el = document.getElementById('shortcuts-overlay');
  if (!el) return;
  el.innerHTML = `
    <div class="shortcuts-card">
      <div class="shortcuts-title">Keyboard shortcuts</div>
      <div class="shortcuts-sub">So you can drive the tool without putting the guitar down.</div>
      <ul class="shortcuts-list">
        ${SHORTCUTS.map(s => `<li><kbd>${s.keys}</kbd><span>${s.label}</span></li>`).join('')}
      </ul>
      <div class="shortcuts-foot">Shortcuts pause while you're typing in a field.</div>
      <button class="big-btn btn-go" onclick="hideShortcutsOverlay()">Close</button>
    </div>`;
  el.classList.add('visible');
}
function showShortcutsOverlay() { renderShortcutsOverlay(); }
function hideShortcutsOverlay() {
  const el = document.getElementById('shortcuts-overlay');
  if (el) el.classList.remove('visible');
}
function toggleShortcutsOverlay() {
  const el = document.getElementById('shortcuts-overlay');
  if (!el) return;
  el.classList.contains('visible') ? hideShortcutsOverlay() : showShortcutsOverlay();
}

// ── Dispatch ───────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;   // never shadow browser chrome

  if (e.key === 'Escape') {
    hideShortcutsOverlay();
    if (typeof hideSessionStartScreen === 'function') hideSessionStartScreen();
    return;
  }
  if (shortcutsTypingTarget(e)) return;

  const mode = activeModeName();
  let handled = false;

  switch (e.key) {
    case ' ':
      if (typeof toggleMetronome === 'function') { toggleMetronome(); handled = true; }
      break;
    case 'm': case 'M':
      if (typeof toggleMicEnabled === 'function') { toggleMicEnabled(); handled = true; }
      break;
    case 'r': case 'R':
      if (typeof toggleRun === 'function') { toggleRun(); handled = true; }
      break;
    case 'g': case 'G':
      if (typeof toggleGame === 'function') {
        // The game lives in Study > Chord Game; go there first so the key works
        // from anywhere rather than only when you're already looking at it.
        if (mode !== 'study' && typeof switchMode === 'function') switchMode('study');
        if (typeof switchStudySubtab === 'function') switchStudySubtab('game');
        toggleGame();
        handled = true;
      }
      break;
    case 'ArrowLeft':
      handled = shortcutStepChord(-1) || (mode === 'scales' && shortcutStepScalePosition(-1));
      break;
    case 'ArrowRight':
      handled = shortcutStepChord(1) || (mode === 'scales' && shortcutStepScalePosition(1));
      break;
    case 'Tab':
      handled = shortcutCycleMode(e.shiftKey);
      break;
    case '?':
      toggleShortcutsOverlay(); handled = true;
      break;
    default:
      if (/^[1-5]$/.test(e.key) && mode === 'scales') {
        handled = shortcutSetScalePosition(parseInt(e.key, 10) - 1);
      }
  }

  // Only swallow the event when something actually acted on it — Space still
  // scrolls, Tab still moves focus, digits still type, everywhere else.
  if (handled) { e.preventDefault(); e.stopPropagation(); }
});
