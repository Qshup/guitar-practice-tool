// ═══════════════════════════════════════════════════════════════════════════
// STUDY MODE — Flashcards / Fretboard Quiz / Theory sub-tabs
// ═══════════════════════════════════════════════════════════════════════════

function switchStudySubtab(tab) {
  document.querySelectorAll('#mode-panel-study .subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === tab));
  document.querySelectorAll('#mode-panel-study .subtab-panel').forEach(p => p.classList.toggle('active', p.id === `study-subtab-${tab}`));
  if (tab === 'theory') renderTheoryPanel();
  const data = loadProgress();
  data.ui.activeStudySubtab = tab;
  saveProgress(data);
}

// ── Theory sub-tab ──────────────────────────────────────────────────────────
// Reuses scales.js's renderCircle()/renderInfo() against dedicated theory-* ids
// so this reads the current scale/key/position selected in Scales mode without
// touching Scales mode's own circle-svg/info-box.
function renderTheoryPanel() {
  const sc = currentScale();
  const scaleNotes = getScaleNotes(state.key, sc.intervals);
  renderCircle(scaleNotes, 'theory-circle-svg', 'theory-circle-legend');
  renderInfo(sc, scaleNotes, 'theory-info-box');
}
