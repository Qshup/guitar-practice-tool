// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION — top-level mode switching (Scales / Chords / Study / Riffs / Songs)
// ═══════════════════════════════════════════════════════════════════════════

const NAV_MODES = ['scales', 'chords', 'study', 'riffs', 'songs'];

function switchMode(mode) {
  if (!NAV_MODES.includes(mode)) return;
  const activePanel = document.querySelector('.mode-panel.active');
  const prevMode = activePanel ? activePanel.id.replace('mode-panel-', '') : null;

  // Stop anything that shouldn't keep running invisibly once its mode is hidden
  if (prevMode === 'scales' && mode !== 'scales' && typeof runRunning !== 'undefined' && runRunning) stopRun();
  if (prevMode === 'chords' && mode !== 'chords') {
    if (typeof chordRunRunning !== 'undefined' && chordRunRunning) stopChordRun();
    if (typeof gameRunning !== 'undefined' && gameRunning) stopGame();
  }
  if (prevMode === 'riffs' && mode !== 'riffs' && typeof activeRiffPlayers !== 'undefined') {
    Object.keys(activeRiffPlayers).forEach(id => stopRiffPlay(id));
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

  data.ui.activeNavMode = mode;
  saveProgress(data);
}

// ── Init: restore persisted mode on load ───────────────────────────────────
(function initNav() {
  const data = loadProgress();
  const mode = NAV_MODES.includes(data.ui.activeNavMode) ? data.ui.activeNavMode : 'scales';
  switchMode(mode);
})();
