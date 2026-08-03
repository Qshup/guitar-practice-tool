// ═══════════════════════════════════════════════════════════════════════════
// TUNER — standalone view. Reuses the shared mic engine (js/mic.js) entirely;
// this file only renders it. Large note-name readout + a cents-deviation
// gauge with a left/right correction indicator, active whenever the mic is
// on — same 15-cent tolerance (TUNING_TOLERANCE_CENTS) used everywhere else.
// ═══════════════════════════════════════════════════════════════════════════

function tunerModeIsActive() {
  const panel = document.getElementById('mode-panel-tuner');
  return !!(panel && panel.classList.contains('active'));
}

function tunerHandleMicLevel(frame) {
  if (!tunerModeIsActive()) return;
  const noteEl = document.getElementById('tuner-note');
  const centsEl = document.getElementById('tuner-cents-label');
  const needle = document.getElementById('tuner-needle');
  const hzEl = document.getElementById('tuner-hz');
  if (!noteEl) return;

  if (!frame.reading) {
    noteEl.textContent = '—';
    noteEl.className = 'tuner-note';
    if (centsEl) { centsEl.textContent = micEnabled ? 'Play a note' : 'Turn on the mic in the bar above'; centsEl.className = 'tuner-cents-label'; }
    if (needle) { needle.style.left = '50%'; needle.classList.remove('in-tune'); }
    if (hzEl) hzEl.textContent = '';
    return;
  }

  const { noteName, cents, freq } = frame.reading;
  const inTune = Math.abs(cents) <= TUNING_TOLERANCE_CENTS;
  noteEl.textContent = noteName;
  noteEl.className = 'tuner-note ' + (inTune ? 'in-tune' : '');
  if (hzEl) hzEl.textContent = `${Math.round(freq)} Hz`;
  if (centsEl) {
    centsEl.textContent = inTune ? 'IN TUNE' : (cents > 0 ? `▲ SHARP ${cents}¢ — tune down` : `▼ FLAT ${cents}¢ — tune up`);
    centsEl.className = 'tuner-cents-label ' + (inTune ? 'in-tune' : cents > 0 ? 'sharp' : 'flat');
  }
  if (needle) {
    const clamped = Math.max(-50, Math.min(50, cents));
    needle.style.left = `${50 + clamped}%`;
    needle.classList.toggle('in-tune', inTune);
  }
}
onMicLevel(tunerHandleMicLevel);
