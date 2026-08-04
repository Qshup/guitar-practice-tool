// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION — top-level mode switching (Scales / Chords / Study / Riffs / Songs)
// ═══════════════════════════════════════════════════════════════════════════

const NAV_MODES = ['scales', 'chords', 'study', 'riffs', 'songs', 'tuner'];

function switchMode(mode) {
  if (!NAV_MODES.includes(mode)) return;
  const activePanel = document.querySelector('.mode-panel.active');
  const prevMode = activePanel ? activePanel.id.replace('mode-panel-', '') : null;

  // Stop anything that shouldn't keep running invisibly once its mode is hidden
  if (prevMode === 'scales' && mode !== 'scales' && typeof runRunning !== 'undefined' && runRunning) stopRun();
  if (prevMode === 'chords' && mode !== 'chords') {
    if (typeof chordRunRunning !== 'undefined' && chordRunRunning) stopChordRun();
  }
  if (prevMode === 'study' && mode !== 'study' && typeof gameRunning !== 'undefined' && gameRunning) stopGame();
  if (prevMode === 'riffs' && mode !== 'riffs' && typeof activeRiffPlayers !== 'undefined') {
    Object.keys(activeRiffPlayers).forEach(id => stopRiffPlay(id));
  }
  if (prevMode === 'songs' && mode !== 'songs') {
    if (typeof songTeardownPlayback === 'function') songTeardownPlayback();
    if (typeof activeSongRiffPlayers !== 'undefined') Object.keys(activeSongRiffPlayers).forEach(id => stopSongRiffPlay(id));
  }

  NAV_MODES.forEach(m => {
    const panel = document.getElementById(`mode-panel-${m}`);
    if (panel) panel.classList.toggle('active', m === mode);
    const btn = document.querySelector(`.nav-btn[data-mode="${m}"]`);
    if (btn) btn.classList.toggle('active', m === mode);
  });

  const data = loadProgress();
  if (mode === 'scales') render();
  if (mode === 'chords') {
    renderChordFretboard();
    if (typeof switchChordSubtab === 'function') switchChordSubtab(data.ui.activeChordSubtab);
  }
  if (mode === 'study' && typeof switchStudySubtab === 'function') switchStudySubtab(data.ui.activeStudySubtab);

  data.ui.activeNavMode = mode;
  saveProgress(data);
}

// ── Init: restore persisted mode + per-mode state on load ──────────────────
// (survives a page reload, not just switching tabs within the running page —
// see saveScalesState()/saveChordsState() in scales.js/chords.js)
(function initNav() {
  if (typeof restoreScalesState === 'function') restoreScalesState();
  if (typeof restoreChordsState === 'function') restoreChordsState();
  if (typeof syncInstrumentSelectors === 'function') syncInstrumentSelectors();
  const data = loadProgress();
  const mode = NAV_MODES.includes(data.ui.activeNavMode) ? data.ui.activeNavMode : 'scales';
  switchMode(mode);
})();

// ── Custom range-slider fill (amber-filled track, see styles.css) ─────────
// Sets a --range-progress custom property per slider so the CSS gradient
// track fill tracks the actual value. Delegated + a MutationObserver so this
// covers every slider that already exists AND every one rendered later
// (song/game panels build their sliders via innerHTML well after this runs).
function updateRangeFill(el) {
  const min = parseFloat(el.min || 0), max = parseFloat(el.max || 100), val = parseFloat(el.value);
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--range-progress', pct + '%');
}
document.addEventListener('input', e => {
  if (e.target.matches && e.target.matches('input[type=range]')) updateRangeFill(e.target);
});
document.querySelectorAll('input[type=range]').forEach(updateRangeFill);
new MutationObserver(muts => {
  muts.forEach(m => m.addedNodes.forEach(node => {
    if (node.nodeType !== 1) return;
    if (node.matches && node.matches('input[type=range]')) updateRangeFill(node);
    if (node.querySelectorAll) node.querySelectorAll('input[type=range]').forEach(updateRangeFill);
  }));
}).observe(document.body, { childList: true, subtree: true });
