// ═══════════════════════════════════════════════════════════════════════════
// STUDY MODE — Flashcards / Fretboard Quiz / Theory sub-tabs
// ═══════════════════════════════════════════════════════════════════════════

function switchStudySubtab(tab) {
  // Guard against a caller passing a name that matches no panel. Without this
  // the two querySelectorAll loops below simply deactivate everything and
  // Study renders blank with no error — which is exactly what a mistyped
  // 'listenrepeat' (the panel is 'listen') did from the session planner.
  if (!document.getElementById(`study-subtab-${tab}`)) {
    console.warn(`switchStudySubtab: no panel "study-subtab-${tab}" — ignoring`);
    return;
  }
  const wasGame = document.getElementById('study-subtab-game')?.classList.contains('active');
  if (wasGame && tab !== 'game' && typeof gameRunning !== 'undefined' && gameRunning) stopGame();
  document.querySelectorAll('#mode-panel-study .subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === tab));
  // Measure the outgoing panel before showing the incoming one — see the note
  // in nav.js about why measuring inside the loop reads the wrong position.
  const panels = [...document.querySelectorAll('#mode-panel-study .subtab-panel')];
  const leaving = panels.find(p => p.classList.contains('active') && p.id !== `study-subtab-${tab}`);
  const leavingTop = leaving ? leaving.offsetTop : null;
  panels.forEach(p => {
    const becoming = p.id === `study-subtab-${tab}`;
    if (becoming) { p.classList.remove('exiting'); p.classList.add('active'); }
    else if (p === leaving) {
      p.style.top = leavingTop + 'px';
      p.classList.remove('active'); p.classList.add('exiting');
      setTimeout(() => { p.classList.remove('exiting'); p.style.top = ''; }, 110);
    } else p.classList.remove('active');
  });
  if (tab === 'theory') renderTheoryPanel();
  if (tab !== 'rhythm' && typeof rhyStop === 'function') rhyStop();
  if (tab === 'rhythm' && typeof rhyRenderAll === 'function') rhyRenderAll();
  if (tab === 'triads' && typeof renderTriads === 'function') { loadTriadState(); renderTriads(); }
  if (tab === 'licks' && typeof loadLickLibrary === 'function') loadLickLibrary();
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
