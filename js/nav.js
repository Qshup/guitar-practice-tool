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

  // Overlap the two panels so there is no blank frame between them: the old
  // one keeps painting (absolutely positioned, so it does not push layout)
  // while the new one animates in, then is removed once its exit finishes.
  // MEASURE FIRST, then mutate. .exiting is absolutely positioned against
  // <body>, so it needs an explicit top or it jumps to the top of the
  // document. That top has to be read before the incoming panel is shown —
  // NAV_MODES puts 'scales' ahead of 'songs', so measuring inside the loop
  // read the outgoing panel's position *after* the new one was already in
  // flow and had pushed it down (2288px instead of 130px).
  const outgoing = (prevMode && prevMode !== mode) ? document.getElementById(`mode-panel-${prevMode}`) : null;
  const outgoingTop = outgoing && outgoing.classList.contains('active') ? outgoing.offsetTop : null;

  NAV_MODES.forEach(m => {
    const panel = document.getElementById(`mode-panel-${m}`);
    if (!panel) return;
    const becomingActive = m === mode;
    if (becomingActive) {
      panel.classList.remove('exiting');
      panel.classList.add('active');
    } else if (panel === outgoing && outgoingTop !== null) {
      panel.style.top = outgoingTop + 'px';
      panel.classList.remove('active');
      panel.classList.add('exiting');
      setTimeout(() => { panel.classList.remove('exiting'); panel.style.top = ''; }, 170);
    } else {
      panel.classList.remove('active');
    }
    const btn = document.querySelector(`.nav-btn[data-mode="${m}"]`);
    if (btn) btn.classList.toggle('active', becomingActive);
  });
  moveNavIndicator();

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
// ── file:// detection ──────────────────────────────────────────────────────
// Opening index.html by double-clicking it in Finder gives a file:// page, and
// the camera then fails in a way that looks exactly like a broken feature:
//
//   camera.js is the app's ONE <script type="module">. Module scripts are
//   CORS-checked, and a file:// page is an opaque origin, so the browser
//   refuses the import of vendor/mediapipe/vision_bundle.mjs. camera.js never
//   executes, so it never runs the window.toggleCamera = toggleCamera line at
//   its bottom, so the nav button's onclick throws ReferenceError into the
//   console and nothing visible happens.
//
// The 27 CLASSIC scripts load fine from file://, which is what makes this so
// confusing: scales, chords, the mic and lick capture all work, and only the
// camera is dead. MediaPipe's wasm/model fetches and the AlphaTab dynamic
// import are blocked for the same reason.
//
// So say it, loudly, instead of leaving a silent ReferenceError.
function checkPageOrigin() {
  if (location.protocol !== 'file:') return;
  showOriginWarning();
}

// Split out from the protocol check so it can be exercised without actually
// being on a file:// page (the browser extension used for testing cannot
// navigate to file:// URLs at all).
function showOriginWarning() {
  if (document.querySelector('.origin-warning')) return;
  const bar = document.createElement('div');
  bar.className = 'origin-warning';
  bar.innerHTML =
    '<strong>Opened as a file — the camera and Guitar Pro import cannot work.</strong>' +
    '<span>Browsers block module and asset loading on <code>file://</code> pages, so the hand-tracking module never loads. ' +
    'Everything else (scales, chords, mic, lick capture) works fine here.</span>' +
    '<span>To get the camera: double-click <code>Start Guitar Tool.command</code> in the project folder, ' +
    'or run <code>npm start</code> in Terminal, then use the <code>localhost:8080</code> tab it opens.</span>';
  // Inserted AFTER .nav-spacer, in normal flow, so it sits below the fixed nav
  // rather than on top of it. Putting it at document.body's start with a
  // z-index above the nav made it cover the nav and swallow every click —
  // the third time that exact pattern has appeared in this app. A full-width
  // element near the top of the page is a click-catcher unless you place it
  // in flow and give it no stacking context.
  const spacer = document.querySelector('.nav-spacer');
  if (spacer && spacer.parentNode) spacer.parentNode.insertBefore(bar, spacer.nextSibling);
  else document.body.insertBefore(bar, document.body.firstChild);
  const btn = document.getElementById('camera-toggle-btn');
  if (btn) {
    btn.classList.add('nav-btn-disabled');
    btn.title = 'Unavailable on a file:// page — start the local server instead';
  }
}

(function initNav() {
  checkPageOrigin();
  if (typeof restoreScalesState === 'function') restoreScalesState();
  if (typeof restoreChordsState === 'function') restoreChordsState();
  if (typeof syncInstrumentSelectors === 'function') syncInstrumentSelectors();
  if (typeof loadMicCalibration === 'function') { loadMicCalibration(); if (typeof syncMicSlidersToState === 'function') syncMicSlidersToState(); }
  if (typeof fvLoadCalibration === 'function') fvLoadCalibration();
  if (typeof loadMixerSettings === 'function') loadMixerSettings();
  if (typeof harmonyLoad === 'function') harmonyLoad();
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


// ── Sliding active-tab indicator ───────────────────────────────────────────
// A single bar that travels between tabs, rather than a bottom border being
// switched off one button and on another.
function moveNavIndicator() {
  const bar = document.querySelector('.nav-bar');
  if (!bar) return;
  let ind = bar.querySelector('.nav-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.className = 'nav-indicator';
    bar.appendChild(ind);
  }
  const active = bar.querySelector('.nav-btn.active');
  if (!active) { ind.classList.remove('visible'); return; }
  // offsetLeft is relative to .nav-bar (position: relative), and stays correct
  // while the bar is scrolled sideways at narrow widths.
  ind.style.left = active.offsetLeft + 'px';
  ind.style.width = active.offsetWidth + 'px';
  ind.classList.add('visible');
}
window.addEventListener('resize', moveNavIndicator);
