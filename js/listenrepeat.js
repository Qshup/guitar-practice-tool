// ═══════════════════════════════════════════════════════════════════════════
// LISTEN & REPEAT — ear-training: tool plays a sequence, mic grades your reply
// Reuses: scales.js (ALL_SCALES/getBoxNotes/buildFretGrid), audio.js
// (playSampledNote/ensureInstrumentReady/getAudioCtx — the sample-based guitar
// engine, same one Scale Run/Riffs/Songs use), game.js (GAME_CHORDS/
// getDiatonicChords/drawGameChord/drawGuitarNeck), progress.js (localStorage).
// No note/chord data is duplicated here — only sequence-shaping logic.
// ═══════════════════════════════════════════════════════════════════════════

// Follows the app-wide voice (see currentInstrument in audio.js) so ear
// training matches whatever the rest of the app is currently sounding like.
function lrInstrument() { return typeof currentInstrument === 'function' ? currentInstrument() : 'clean'; }

// ── Difficulty presets ───────────────────────────────────────────────────
const LR_DIFFICULTY_ORDER = ['beginner', 'intermediate', 'advanced', 'zappa'];
const LR_DIFFICULTY_PRESETS = {
  beginner:     { label: 'Beginner',     noteMin: 2, noteMax: 3,  bpm: 60,  pauseBeats: 4, autoRepeatOnMiss: true,  repeatsAllowed: Infinity, subdivision: 1 },
  intermediate: { label: 'Intermediate', noteMin: 4, noteMax: 6,  bpm: 90,  pauseBeats: 2, autoRepeatOnMiss: false, repeatsAllowed: 1,        subdivision: 1 },
  advanced:     { label: 'Advanced',     noteMin: 6, noteMax: 10, bpm: 120, pauseBeats: 1, autoRepeatOnMiss: false, repeatsAllowed: 0,        subdivision: 0.5 },
  zappa:        { label: 'Zappa Mode',   noteMin: 5, noteMax: 11, bpm: null, pauseBeats: 1, autoRepeatOnMiss: false, repeatsAllowed: 0,       subdivision: 0.5, oddTime: true },
};

function lrDifficultyIndex() { return Math.max(0, LR_DIFFICULTY_ORDER.indexOf(lrDifficulty)); }
function lrPositionMaxForLevel() { const i = lrDifficultyIndex(); return i <= 0 ? 1 : i === 1 ? 2 : 4; }

// ── Player style definitions (metadata shown in UI + used by generators) ──
const LR_PLAYER_STYLES = {
  deanween: {
    label: 'Dean Ween', scaleIds: ['minpent', 'blues'],
    description: 'Pentatonic phrases with whammy-style pitch variation, unexpected interval jumps, and genre-hopping mid-phrase.',
  },
  ronson: {
    label: 'Mick Ronson', scaleIds: ['minpent'], colorTone: 4, // major 3rd color note added on top of minor pentatonic
    description: 'Minor pentatonic with major color notes, slow wide bends, unison-bend patterns, anthemic ascending lines.',
  },
  hazel: {
    label: 'Eddie Hazel', scaleIds: ['dorian'], keys: ['E', 'A'],
    description: 'E/A Dorian phrases with long sustained notes, wide spaces between them, slow emotional builds.',
  },
  knopfler: {
    label: 'Mark Knopfler', scaleIds: ['majpent'], keys: ['G', 'D'],
    description: 'G/D major pentatonic fingerpicked sequences, open-string drone patterns, Celtic-influenced melodic phrasing.',
  },
  zappa: {
    label: 'Frank Zappa', scaleIds: ['lydian', 'phrygian', 'diminished', 'mixo'],
    description: 'Lydian/Phrygian/Diminished/Mixolydian, odd groupings of 5 or 7, chromatic passing tones, angular jumps.',
  },
};

// ── Chord progression definitions (by scale-degree index into getDiatonicChords) ──
const LR_CHORD_PROGRESSIONS = {
  '145':   { label: 'I – IV – V',    degrees: [0, 3, 4] },
  '251':   { label: 'ii – V – I',    degrees: [1, 4, 0] },
  'i7VI':  { label: 'i – VII – VI',  degrees: [5, 4, 3], relativeMajor: true }, // vi-V-IV of the relative major = i-VII-VI of the minor
  'random': { label: 'Random diatonic', degrees: null },
};

// ── State ─────────────────────────────────────────────────────────────────
let lrMode = 'key';           // 'key' | 'scale' | 'player' | 'chords'
let lrDifficulty = 'beginner';
let lrRunning = false;
let lrPhase = 'idle';         // 'idle' | 'playing' | 'listening' | 'grading' | 'feedback'
let lrStreak = 0;
let lrCurrentSequence = null; // { notes:[...], bpm, meta, isChordMode }
let lrSequenceResults = null;
let lrResponseStartTime = 0;
let lrListenTimeout = null;
let lrChordSelfGradeIdx = 0;

// ── Mic engine ──────────────────────────────────────────────────────────
// Uses the shared engine in js/mic.js (single getUserMedia stream/analyser/
// pitch detector, and the shared sensitivity/noise-gate calibration, for the
// whole app) — only the quiz-specific onset accumulation below (grading a
// full played-back sequence against what was expected) is local to Listen &
// Repeat; Scales/Chords/Tuner use mic.js's onMicOnset()/onMicLevel() directly.
let micDetectedNotes = []; // {time, freq, noteName, cents} — absolute AudioContext time
let lrListening = false;
let lrLastOnsetTime = -1;

function lrMicPollTick() {
  if (!lrListening) return;
  const ctx = getAudioCtx();
  micAnalyser.getFloatTimeDomainData(micSampleBuffer);
  const rms = micComputeRMS(micSampleBuffer) * micSensitivity;
  const now = ctx.currentTime;
  if (rms > micNoiseGate && (now - lrLastOnsetTime) > MIC_MIN_ONSET_GAP) {
    lrLastOnsetTime = now;
    lrCaptureOnsetPitch(now);
  }
  requestAnimationFrame(lrMicPollTick);
}

function lrCaptureOnsetPitch(onsetTime) {
  const ctx = getAudioCtx();
  const samples = [];
  let count = 0;
  const maxSamples = 4;
  function sampleOnce() {
    if (!lrListening) return;
    micAnalyser.getFloatTimeDomainData(micSampleBuffer);
    const [freq, clarity] = micPitchDetector.findPitch(micSampleBuffer, ctx.sampleRate);
    if (freq > 60 && freq < 1400 && clarity > 0.85) samples.push({ freq, clarity });
    count++;
    if (count < maxSamples) setTimeout(sampleOnce, 15);
    else finalize();
  }
  function finalize() {
    if (!samples.length) return; // too noisy/unclear — treat as no detectable note
    samples.sort((a, b) => b.clarity - a.clarity);
    const best = samples[0];
    const info = hzToNoteInfo(best.freq);
    micDetectedNotes.push({ time: onsetTime, freq: best.freq, noteName: info.noteName, cents: info.cents });
    lrUpdateLiveCaptureFeedback();
  }
  setTimeout(sampleOnce, 40); // let the initial pluck transient pass before sampling pitch
}

function lrStartListening() {
  micDetectedNotes = [];
  lrLastOnsetTime = -1;
  lrListening = true;
  lrHandSamples = [];
  requestAnimationFrame(lrMicPollTick);
}

function lrStopListening() {
  lrListening = false;
}

// ── Camera hand-tracking (js/camera.js), combined with mic grading below ──
// Full per-note finger-vs-recommended-fingering matching (like Scales mode
// has) would need tight timestamp correlation between the camera and mic
// streams during grading — not implemented yet. This gives an honest,
// coarser combined signal instead: overall hand-tracking confidence across
// the response window, alongside the existing pitch/timing grading.
let lrHandSamples = []; // {confident} sampled while lrListening is true
function lrHandleHandUpdate(hand) {
  if (!lrListening) return;
  const panel = document.getElementById('study-subtab-listen');
  if (!panel || !panel.classList.contains('active')) return;
  lrHandSamples.push({ confident: hand.present && hand.confidence > 0.5 });
}

function lrCameraMicSummary(fullyCorrect, results) {
  const el = document.getElementById('camera-lr-feedback');
  if (!el) return;
  if (!lrHandSamples.length) { el.textContent = ''; return; }
  const confidentFrac = lrHandSamples.filter(s => s.confident).length / lrHandSamples.length;
  const pitchPart = results
    ? `Mic: ${results.filter(r => r.status === 'correct').length}/${results.length} notes correct.`
    : `Mic: ${fullyCorrect ? 'all chords on time.' : 'some chords off.'}`;
  const camPart = confidentFrac > 0.7 ? 'Camera: hand tracked confidently throughout.'
    : confidentFrac > 0.3 ? 'Camera: tracking was inconsistent — check lighting/angle.'
    : "Camera: hand wasn't reliably visible — reposition for next round.";
  el.textContent = `${pitchPart}  ${camPart}`;
}

// ── Live mic level meter — lets the user visually confirm the mic is
// actually picking up sound, independent of onset/note grading above ──
const MIC_METER_RMS_CEILING = 0.25; // rms value that reads as a "full" meter bar
let lrMeterRAF = null;

function lrStartMeterLoop() {
  if (lrMeterRAF) return;
  const tick = () => {
    const panel = document.getElementById('study-subtab-listen');
    if (!panel || !panel.classList.contains('active') || !micAnalyser) { lrMeterRAF = null; return; }
    micAnalyser.getFloatTimeDomainData(micSampleBuffer);
    const rms = micComputeRMS(micSampleBuffer) * micSensitivity;
    const level = Math.min(1, rms / MIC_METER_RMS_CEILING);
    const fill = document.getElementById('lr-mic-meter-fill');
    if (fill) fill.style.width = `${Math.round(level * 100)}%`;
    const meterEl = document.getElementById('lr-mic-meter');
    const active = rms > micNoiseGate;
    if (meterEl) meterEl.classList.toggle('lr-mic-active', active);

    const readout = document.getElementById('lr-mic-readout');
    if (readout) {
      if (active) {
        const ctx = getAudioCtx();
        const [freq, clarity] = micPitchDetector.findPitch(micSampleBuffer, ctx.sampleRate);
        readout.textContent = (freq > 60 && freq < 1400 && clarity > 0.8)
          ? `Hearing: ${hzToNoteInfo(freq).noteName} (${Math.round(freq)} Hz)`
          : 'Hearing sound (pitch unclear)';
      } else {
        readout.textContent = 'Listening… play a note or talk to test the mic';
      }
    }
    lrMeterRAF = requestAnimationFrame(tick);
  };
  lrMeterRAF = requestAnimationFrame(tick);
}

function lrStopMeterLoop() {
  if (lrMeterRAF) cancelAnimationFrame(lrMeterRAF);
  lrMeterRAF = null;
}

async function lrCheckMic() {
  const btn = document.getElementById('lr-check-mic-btn');
  const readout = document.getElementById('lr-mic-readout');
  if (readout) readout.textContent = 'Requesting microphone access…';
  const ok = await initMic();
  if (!ok) {
    if (readout) readout.textContent = micUnavailableMessage('Listen & Repeat');
    return;
  }
  if (btn) btn.textContent = '🎤 Mic Connected';
  lrStartMeterLoop();
}

// ── Live mic monitor — hear your own mic input through the speakers/headphones
// in near real time, independent of recording or sequence grading ──
let micMonitorGain = null;

async function lrToggleMicMonitor() {
  const btn = document.getElementById('lr-monitor-btn');
  const hint = document.getElementById('lr-monitor-hint');
  if (micMonitorGain) {
    micMonitorGain.disconnect();
    micMonitorGain = null;
    if (btn) { btn.textContent = '🔊 Monitor Mic'; btn.classList.remove('active'); }
    if (hint) hint.style.display = 'none';
    return;
  }
  const ok = await initMic();
  if (!ok) {
    document.getElementById('lr-mic-readout').textContent = micUnavailableMessage('Listen & Repeat');
    return;
  }
  lrStartMeterLoop();
  const ctx = getAudioCtx();
  micMonitorGain = ctx.createGain();
  micMonitorGain.gain.value = 0.85;
  micSourceNode.connect(micMonitorGain);
  micMonitorGain.connect(ctx.destination);
  if (btn) { btn.textContent = '🔇 Stop Monitor'; btn.classList.add('active'); }
  if (hint) hint.style.display = '';
}

// ── Record & play back ──────────────────────────────────────────────────────
let micRecorder = null;
let micRecordedChunks = [];
let micRecordingUrl = null;
let lrLastTakeBlob = null;

async function lrToggleRecording() {
  const btn = document.getElementById('lr-record-btn');
  const status = document.getElementById('lr-record-status');
  if (micRecorder && micRecorder.state === 'recording') {
    micRecorder.stop();
    return;
  }
  const ok = await initMic();
  if (!ok) {
    status.textContent = micUnavailableMessage('recording');
    return;
  }
  lrStartMeterLoop();
  micRecordedChunks = [];
  try {
    micRecorder = new MediaRecorder(micStream);
  } catch (e) {
    status.textContent = 'Recording is not supported in this browser.';
    return;
  }
  micRecorder.ondataavailable = (e) => { if (e.data.size > 0) micRecordedChunks.push(e.data); };
  micRecorder.onstop = () => {
    const blob = new Blob(micRecordedChunks, { type: micRecorder.mimeType || 'audio/webm' });
    if (micRecordingUrl) URL.revokeObjectURL(micRecordingUrl);
    micRecordingUrl = URL.createObjectURL(blob);
    const audioEl = document.getElementById('lr-recording-audio');
    audioEl.src = micRecordingUrl;
    audioEl.style.display = '';
    // Hold the blob so it can be kept. Previously it existed only as an object
    // URL that the next recording overwrote, so every take was ephemeral.
    lrLastTakeBlob = blob;
    const keepBtn = document.getElementById('lr-keep-take-btn');
    if (keepBtn) { keepBtn.style.display = ''; keepBtn.disabled = false; keepBtn.textContent = 'Keep this take'; }
    status.textContent = 'Recording ready — press play to hear it back.';
    btn.textContent = '⏺ Record';
    btn.classList.remove('recording');
  };
  micRecorder.start();
  btn.textContent = '⏹ Stop Recording';
  btn.classList.add('recording');
  status.textContent = '● Recording…';
}

// ── Note-picking helpers (reuse scales.js's getBoxNotes for real fretboard positions) ──
function lrNoteCount() {
  const p = LR_DIFFICULTY_PRESETS[lrDifficulty];
  return p.noteMin + Math.floor(Math.random() * (p.noteMax - p.noteMin + 1));
}

function lrPickBox(key, intervals) {
  const pos = Math.floor(Math.random() * (lrPositionMaxForLevel() + 1));
  return { pos, boxNotes: getBoxNotes(key, intervals, pos) };
}

function noteSemitoneValue(n) { return STRING_MIDI[n.string] + n.fret; }

// biasMode: 'random' | 'jump' | 'step' | 'ascend'
function lrPickNextNote(boxNotes, prevNote, biasMode) {
  if (!boxNotes.length) return null;
  if (!prevNote || boxNotes.length === 1) return boxNotes[Math.floor(Math.random() * boxNotes.length)];
  const scored = boxNotes.map(n => {
    const fretDist = Math.abs(n.fret - prevNote.fret) + Math.abs(n.string - prevNote.string) * 2;
    let score = Math.random();
    if (biasMode === 'jump') score += fretDist * 0.15;
    else if (biasMode === 'step') score -= fretDist * 0.12;
    else if (biasMode === 'ascend') score += (noteSemitoneValue(n) - noteSemitoneValue(prevNote)) * 0.08;
    return { n, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(3, scored.length));
  return top[Math.floor(Math.random() * top.length)].n;
}

function lrBuildTimedSequence(noteList, bpm, subdivision) {
  const beatDur = 60 / bpm;
  const noteDur = beatDur * subdivision;
  return noteList.map((n, i) => ({ string: n.string, fret: n.fret, note: n.note, time: i * noteDur, dur: noteDur, technique: n.technique, bendTo: n.bendTo }));
}

// ── Sequence generators ─────────────────────────────────────────────────────
function lrGenerateByKeySequence(key, isMinor) {
  const intervals = isMinor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]; // minpent / majpent intervals, directly
  const { pos, boxNotes } = lrPickBox(key, intervals);
  if (!boxNotes.length) return null;
  const count = lrNoteCount();
  const chosen = [];
  let prev = null;
  for (let i = 0; i < count; i++) { prev = lrPickNextNote(boxNotes, prev, 'random'); chosen.push(prev); }
  const bpm = lrBpmForSequence();
  return {
    notes: lrBuildTimedSequence(chosen, bpm, LR_DIFFICULTY_PRESETS[lrDifficulty].subdivision),
    bpm, meta: { mode: 'key', key, isMinor, pos, label: `${key} ${isMinor ? 'minor' : 'major'}, position ${pos + 1}` },
  };
}

function lrGenerateByScaleSequence(scaleId, key) {
  const scale = ALL_SCALES.find(s => s.id === scaleId);
  if (!scale) return null;
  const { pos, boxNotes } = lrPickBox(key, scale.intervals);
  if (!boxNotes.length) return null;
  const count = lrNoteCount();
  const chosen = [];
  let prev = null;
  for (let i = 0; i < count; i++) { prev = lrPickNextNote(boxNotes, prev, 'random'); chosen.push(prev); }
  const bpm = lrBpmForSequence();
  return {
    notes: lrBuildTimedSequence(chosen, bpm, LR_DIFFICULTY_PRESETS[lrDifficulty].subdivision),
    bpm, meta: { mode: 'scale', scaleId, key, pos, label: `${key} ${scale.name}, position ${pos + 1}` },
  };
}

function lrGeneratePlayerStyleSequence(styleId) {
  const style = LR_PLAYER_STYLES[styleId];
  if (!style) return null;
  const count = lrNoteCount();
  const bpm = lrBpmForSequence();
  const subdivision = LR_DIFFICULTY_PRESETS[lrDifficulty].subdivision;
  let chosen = [];
  let label = style.label;

  if (styleId === 'deanween') {
    // Genre-hopping: switch scale roughly every 2-3 notes; bias toward big jumps.
    const key = pick(['E', 'A', 'D', 'G']);
    let prev = null;
    let notesSinceSwitch = 0;
    let curScaleId = pick(style.scaleIds);
    let box = lrPickBox(key, ALL_SCALES.find(s => s.id === curScaleId).intervals).boxNotes;
    for (let i = 0; i < count; i++) {
      if (notesSinceSwitch >= 2 && Math.random() < 0.5) {
        curScaleId = pick(style.scaleIds.concat(['majpent']));
        box = lrPickBox(key, ALL_SCALES.find(s => s.id === curScaleId).intervals).boxNotes;
        notesSinceSwitch = 0;
      }
      prev = lrPickNextNote(box, prev, 'jump');
      if (Math.random() < 0.3) prev = { ...prev, technique: 'bend', bendTo: pick([1, 2]) }; // whammy-ish pitch variation
      chosen.push(prev);
      notesSinceSwitch++;
    }
    label = `Dean Ween style — ${key}, genre-hopping pentatonic/blues`;
  } else if (styleId === 'ronson') {
    const key = pick(['E', 'A', 'D']);
    const { boxNotes } = lrPickBox(key, ALL_SCALES.find(s => s.id === 'minpent').intervals);
    // Occasionally splice in a major-3rd color tone relative to key
    const rootMidi = CHROMATIC.indexOf(norm(key));
    const colorNote = noteAt(key, 4);
    let prev = null;
    for (let i = 0; i < count; i++) {
      prev = lrPickNextNote(boxNotes, prev, 'ascend'); // anthemic ascending bias
      if (Math.random() < 0.25) prev = { ...prev, technique: 'bend', bendTo: 2 }; // slow wide bends
      chosen.push(prev);
    }
    label = `Mick Ronson style — ${key} minor pentatonic + major color tones, ascending lines`;
  } else if (styleId === 'hazel') {
    const key = pick(style.keys);
    const { boxNotes } = lrPickBox(key, ALL_SCALES.find(s => s.id === 'dorian').intervals);
    let prev = null;
    for (let i = 0; i < count; i++) { prev = lrPickNextNote(boxNotes, prev, 'step'); chosen.push({ ...prev, technique: Math.random() < 0.4 ? 'vibrato' : undefined }); }
    label = `Eddie Hazel style — ${key} Dorian, long sustained phrasing`;
  } else if (styleId === 'knopfler') {
    const key = pick(style.keys);
    const { boxNotes } = lrPickBox(key, ALL_SCALES.find(s => s.id === 'majpent').intervals);
    // Weave in the open string of the key (drone) between melody notes where possible
    const openStringIdx = STRINGS.findIndex(s => norm(s) === norm(key));
    let prev = null;
    for (let i = 0; i < count; i++) {
      if (openStringIdx >= 0 && i > 0 && i % 2 === 1) {
        chosen.push({ string: openStringIdx, fret: 0, note: STRINGS[openStringIdx] });
      } else {
        prev = lrPickNextNote(boxNotes, prev, 'step');
        chosen.push(prev);
      }
    }
    label = `Mark Knopfler style — ${key} major pentatonic, open-string drone`;
  } else if (styleId === 'zappa') {
    const key = pick(['E', 'A', 'D', 'G', 'C']);
    const scaleId = pick(style.scaleIds);
    const { boxNotes } = lrPickBox(key, ALL_SCALES.find(s => s.id === scaleId).intervals);
    let prev = null;
    const zCount = pick([5, 7]); // odd groupings
    for (let i = 0; i < zCount; i++) {
      prev = lrPickNextNote(boxNotes, prev, 'jump');
      // chromatic passing tone before some notes
      if (Math.random() < 0.3 && prev.fret > 0) {
        chosen.push({ string: prev.string, fret: prev.fret - 1, note: noteAt(STRINGS[prev.string], prev.fret - 1), technique: 'chromatic' });
      }
      chosen.push(prev);
    }
    label = `Zappa style — ${key} ${ALL_SCALES.find(s => s.id === scaleId).name}, ${zCount}-note odd grouping`;
    return { notes: lrBuildTimedSequence(chosen, bpm, subdivision), bpm, meta: { mode: 'player', styleId, key, scaleId, label } };
  }

  return { notes: lrBuildTimedSequence(chosen, bpm, subdivision), bpm, meta: { mode: 'player', styleId, label } };
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function lrGenerateChordProgressionSequence(key, progId) {
  const prog = LR_CHORD_PROGRESSIONS[progId];
  if (!prog) return null;
  const diatonicKey = prog.relativeMajor ? CHROMATIC[(CHROMATIC.indexOf(norm(key)) + 3) % 12] : key;
  const diatonic = getDiatonicChords(diatonicKey);
  let degrees = prog.degrees;
  if (!degrees) { // random diatonic walk
    const len = 3 + Math.floor(Math.random() * 2);
    degrees = Array.from({ length: len }, () => Math.floor(Math.random() * 7));
  }
  let chordNames = degrees.map(d => diatonic[d].chord).filter(name => GAME_CHORDS[name]);
  if (chordNames.length < 2) chordNames = ['C', 'Am', 'F', 'G'];
  const bpm = lrBpmForSequence();
  const beatDur = 60 / bpm;
  const chordDur = beatDur * 2; // 2 beats per chord, reasonable for strumming
  return {
    isChordMode: true,
    notes: chordNames.map((name, i) => ({ chordName: name, time: i * chordDur, dur: chordDur })),
    bpm, meta: { mode: 'chords', key, progId, label: `${key} — ${prog.label}` },
  };
}

function lrBpmForSequence() {
  const preset = LR_DIFFICULTY_PRESETS[lrDifficulty];
  const bpm = preset.bpm || (90 + Math.floor(Math.random() * 70)); // Zappa: randomized 90-160
  const slider = document.getElementById('bpm-slider');
  if (slider) { slider.value = bpm; const val = document.getElementById('bpm-val'); if (val) val.textContent = bpm; }
  if (preset.oddTime) {
    const sel = document.getElementById('time-sig');
    if (sel) sel.value = pick(['7', '11']);
  }
  return bpm;
}

function lrCurrentBpmFromMetronome() {
  const slider = document.getElementById('bpm-slider');
  return slider ? parseInt(slider.value) : 90;
}

// ── Fretboard visualization (reuses scales.js's buildFretGrid + shared .note-dot CSS) ──
function lrRenderBlankFretboard() {
  const container = document.getElementById('lr-fretboard');
  if (!container) return;
  buildFretGrid(container, (cell, dot, si, f) => {
    dot.dataset.string = si; dot.dataset.fret = f;
    dot.classList.add('lr-idle');
  });
}

function lrGetDot(si, f) {
  return document.querySelector(`#lr-fretboard .note-dot[data-string="${si}"][data-fret="${f}"]`);
}

function lrLightSequence(notes, onDone) {
  lrRenderBlankFretboard();
  let lastDot = null;
  notes.forEach((n, i) => {
    setTimeout(() => {
      if (lastDot) lastDot.classList.remove('lr-playing');
      const dot = lrGetDot(n.string, n.fret);
      if (dot) {
        dot.classList.add('lr-playing'); dot.textContent = n.note;
        dot.classList.remove('note-pop'); void dot.offsetWidth; dot.classList.add('note-pop');
        lastDot = dot;
      }
    }, n.time * 1000);
  });
  const last = notes[notes.length - 1];
  const totalMs = (last ? (last.time + last.dur) : 0) * 1000;
  setTimeout(() => {
    if (lastDot) lastDot.classList.remove('lr-playing');
    lrRenderBlankFretboard(); // fade out — back to blank before the user responds
    if (onDone) onDone();
  }, totalMs + 300);
}

// ── Playback engine ─────────────────────────────────────────────────────────
function lrCountInThenPlay(bpm, beats, onNoteTime, sequenceDurSec, onAllDone) {
  const ctx = getAudioCtx();
  const beatDur = 60 / bpm;
  const startAt = ctx.currentTime + 0.15;
  for (let b = 0; b < beats; b++) playClick(startAt + b * beatDur, b === 0, mixVol('metronome'));
  const seqStart = startAt + beats * beatDur;
  onNoteTime(seqStart);
  setTimeout(onAllDone, (beats * beatDur + sequenceDurSec) * 1000 + 250);
  return seqStart;
}

function lrPlayNoteSequence(seq, onAllDone) {
  const ctx = getAudioCtx();
  const beats = document.getElementById('time-sig') ? parseInt(document.getElementById('time-sig').value) : 4;
  const vol = parseInt(document.getElementById('vol-slider')?.value || '60') / 100;
  const last = seq.notes[seq.notes.length - 1];
  const seqDur = last ? last.time + last.dur : 0;

  const seqStart = lrCountInThenPlay(seq.bpm, beats, (startTime) => {
    seq.notes.forEach(n => {
      const freq = fretToHz(n.string, n.fret);
      const t = startTime + n.time;
      // 'chromatic' (Zappa-style passing tone) isn't a playSampledNote technique —
      // it's just a plain note a half-step off, same as before.
      const technique = n.technique === 'chromatic' ? undefined : n.technique;
      playSampledNote(lrInstrument(), t, freq, n.dur * 0.85, mixVol('listenRepeat'), { technique, bendTo: n.bendTo, stringIdx: n.string });
    });
    // Visual lighting synced to the same schedule (relative ms from now)
    const delayMs = Math.max(0, (startTime - ctx.currentTime) * 1000);
    setTimeout(() => lrLightSequence(seq.notes, null), delayMs);
  }, seqDur, onAllDone);

  return seqStart;
}

function lrPlayChordSequence(seq, onAllDone) {
  const ctx = getAudioCtx();
  const beats = document.getElementById('time-sig') ? parseInt(document.getElementById('time-sig').value) : 4;
  const vol = parseInt(document.getElementById('vol-slider')?.value || '60') / 100;
  const last = seq.notes[seq.notes.length - 1];
  const seqDur = last ? last.time + last.dur : 0;

  lrCountInThenPlay(seq.bpm, beats, (startTime) => {
    seq.notes.forEach(chordEvent => {
      const chord = GAME_CHORDS[chordEvent.chordName];
      if (!chord) return;
      const t = startTime + chordEvent.time;
      chord.f.forEach((f, si) => { if (f >= 0) playSampledNote(lrInstrument(), t + si * 0.03, fretToHz(si, f), chordEvent.dur * 0.85, mixVol('listenRepeat', 0.85), { stringIdx: si }); });
    });
  }, seqDur, onAllDone);
}

// ── Grading (note modes) ─────────────────────────────────────────────────────
function lrNotesMatch(playedNoteName, expectedNoteName) {
  return norm(playedNoteName) === norm(expectedNoteName);
}

function lrGradeSequence(expectedNotes, responseStartTime, capturedNotes) {
  const TIGHT_MS = 150, WIDE_MS = 450;
  const results = [];
  let ptr = 0;
  expectedNotes.forEach(exp => {
    const expAbsTime = responseStartTime + exp.time;
    let matchIdx = -1;
    for (let j = ptr; j < capturedNotes.length; j++) {
      const dt = (capturedNotes[j].time - expAbsTime) * 1000;
      if (Math.abs(dt) <= WIDE_MS) { matchIdx = j; break; }
      if (dt > WIDE_MS) break;
    }
    if (matchIdx === -1) {
      results.push({ expected: exp, status: 'missing' });
      return;
    }
    const cand = capturedNotes[matchIdx];
    ptr = matchIdx + 1;
    const dtMs = (cand.time - expAbsTime) * 1000;
    if (!lrNotesMatch(cand.noteName, exp.note)) {
      results.push({ expected: exp, played: cand, status: 'wrong', dtMs });
    } else if (Math.abs(dtMs) <= TIGHT_MS) {
      results.push({ expected: exp, played: cand, status: 'correct', dtMs });
    } else {
      results.push({ expected: exp, played: cand, status: 'close', dtMs });
    }
  });
  return results;
}

function lrTipForResult(r) {
  if (r.status === 'wrong') {
    return `You played ${r.played.noteName} instead of ${r.expected.note} — listen closely to the pitch, not just the shape.`;
  }
  if (r.status === 'missing') {
    return `You missed the ${r.expected.note} — make sure every note in the sequence gets played, even short ones.`;
  }
  if (r.status === 'close') {
    return r.dtMs > 0
      ? `You played ${r.expected.note} correctly but a little late — listen to the spacing between notes, not just the notes themselves.`
      : `You played ${r.expected.note} correctly but rushed it — try to match the exact gap you heard.`;
  }
  return '';
}

// ── Chord-progression mode: mic timing only, self-graded correctness ───────
// (A monophonic pitch detector can't decompose a strummed chord — see the
// per-chord onset-timing + self-grade design agreed with the user.)
let lrChordTimingResults = [];

function lrGradeChordTiming(expectedChords, responseStartTime, capturedNotes) {
  // capturedNotes here are just onset timestamps (pitch content ignored) — reuse
  // the mic's onset detector purely as a strum-timing detector for this mode.
  const TIGHT_MS = 200, WIDE_MS = 600;
  const results = [];
  let ptr = 0;
  expectedChords.forEach(exp => {
    const expAbsTime = responseStartTime + exp.time;
    let matchIdx = -1;
    for (let j = ptr; j < capturedNotes.length; j++) {
      const dt = (capturedNotes[j].time - expAbsTime) * 1000;
      if (Math.abs(dt) <= WIDE_MS) { matchIdx = j; break; }
      if (dt > WIDE_MS) break;
    }
    if (matchIdx === -1) { results.push({ expected: exp, timing: 'missing' }); return; }
    ptr = matchIdx + 1;
    const dtMs = (capturedNotes[matchIdx].time - expAbsTime) * 1000;
    results.push({ expected: exp, timing: Math.abs(dtMs) <= TIGHT_MS ? 'onTime' : 'off', dtMs });
  });
  return results;
}

function lrPresentChordForSelfGrade(idx) {
  const seq = lrCurrentSequence;
  lrChordSelfGradeIdx = idx;
  if (idx >= seq.notes.length) { lrFinishChordSequence(); return; }
  const chordEvent = seq.notes[idx];
  const timing = lrChordTimingResults[idx];
  document.getElementById('lr-chord-current').textContent = chordEvent.chordName;
  document.getElementById('lr-chord-timing').textContent = timing
    ? (timing.timing === 'onTime' ? '✓ Good timing' : timing.timing === 'off' ? '~ Timing was off' : '— No strum detected')
    : '';
  document.getElementById('lr-chord-grade-row').style.display = '';
  document.getElementById('lr-chord-miss-panel').style.display = 'none';
}

function lrGradeChordSwitch(success) {
  const seq = lrCurrentSequence;
  const chordEvent = seq.notes[lrChordSelfGradeIdx];
  if (!success) {
    // Show correct fingering + highlight on the neck before moving on
    const canvas = document.getElementById('lr-chord-diagram-canvas');
    if (canvas) drawGameChord(canvas, chordEvent.chordName, 150);
    drawGuitarNeck('lr-neck-canvas', chordEvent.chordName, 'static');
    document.getElementById('lr-chord-miss-panel').style.display = '';
    document.getElementById('lr-chord-miss-name').textContent = chordEvent.chordName;
  }
  lrChordResultsLog.push({ chordName: chordEvent.chordName, success, timing: lrChordTimingResults[lrChordSelfGradeIdx] });
  setTimeout(() => lrPresentChordForSelfGrade(lrChordSelfGradeIdx + 1), success ? 400 : 1800);
}

let lrChordResultsLog = [];

function lrFinishChordSequence() {
  const allCorrect = lrChordResultsLog.length > 0 && lrChordResultsLog.every(r => r.success);
  lrFinalizeSequence(allCorrect, null);
}

// ── Top-level session control ───────────────────────────────────────────────
function lrGenerateCurrentSequence() {
  if (lrMode === 'key') {
    const key = document.getElementById('lr-key-select').value;
    const isMinor = document.getElementById('lr-tonality-select').value === 'minor';
    return lrGenerateByKeySequence(key, isMinor);
  }
  if (lrMode === 'scale') {
    const scaleId = document.getElementById('lr-scale-select').value;
    const key = document.getElementById('lr-scale-key-select').value;
    return lrGenerateByScaleSequence(scaleId, key);
  }
  if (lrMode === 'player') {
    const styleId = document.getElementById('lr-player-select').value;
    return lrGeneratePlayerStyleSequence(styleId);
  }
  if (lrMode === 'chords') {
    const key = document.getElementById('lr-chord-key-select').value;
    const progId = document.getElementById('lr-progression-select').value;
    return lrGenerateChordProgressionSequence(key, progId);
  }
  return null;
}

function lrSetPhase(phase) {
  lrPhase = phase;
  const statusEl = document.getElementById('lr-status');
  if (statusEl) {
    statusEl.textContent = { idle: 'Press Start to hear a sequence', playing: '♪ Listen…', listening: '● Your turn — play it back', grading: 'Grading…', feedback: '' }[phase] || '';
  }
}

function lrStartRound() {
  const seq = lrGenerateCurrentSequence();
  if (!seq) { document.getElementById('lr-status').textContent = 'Could not generate a sequence — check your selections.'; return; }
  lrCurrentSequence = seq;
  document.getElementById('lr-context-label').textContent = seq.meta.label;
  document.getElementById('lr-feedback-panel').style.display = 'none';
  document.getElementById('lr-fretboard-wrap').style.display = seq.isChordMode ? 'none' : '';
  document.getElementById('lr-chord-panel').style.display = seq.isChordMode ? '' : 'none';
  if (seq.isChordMode) document.getElementById('lr-chord-miss-panel').style.display = 'none';
  lrSetPhase('playing');

  if (seq.isChordMode) {
    lrChordResultsLog = [];
    lrPlayChordSequence(seq, () => {
      lrSetPhase('listening');
      lrStartListening();
      const ctx = getAudioCtx();
      lrResponseStartTime = ctx.currentTime;
      const last = seq.notes[seq.notes.length - 1];
      const listenWindowMs = (last.time + last.dur + 2) * 1000;
      lrListenTimeout = setTimeout(() => {
        lrStopListening();
        lrChordTimingResults = lrGradeChordTiming(seq.notes, lrResponseStartTime, micDetectedNotes);
        lrSetPhase('feedback');
        lrPresentChordForSelfGrade(0);
      }, listenWindowMs);
    });
  } else {
    lrPlayNoteSequence(seq, () => {
      lrSetPhase('listening');
      lrStartListening();
      const ctx = getAudioCtx();
      lrResponseStartTime = ctx.currentTime;
      const last = seq.notes[seq.notes.length - 1];
      const listenWindowMs = (last.time + last.dur + 2.5) * 1000;
      lrListenTimeout = setTimeout(() => {
        lrStopListening();
        lrSetPhase('grading');
        const results = lrGradeSequence(seq.notes, lrResponseStartTime, micDetectedNotes);
        lrSequenceResults = results;
        lrShowFeedback(results);
        const allCorrect = results.every(r => r.status === 'correct');
        lrFinalizeSequence(allCorrect, results);
      }, listenWindowMs);
    });
  }
}

function lrReplaySequence() {
  if (!lrCurrentSequence || lrPhase === 'playing') return;
  clearTimeout(lrListenTimeout);
  lrStopListening();
  lrSetPhase('playing');
  const replay = lrCurrentSequence.isChordMode ? lrPlayChordSequence : lrPlayNoteSequence;
  replay(lrCurrentSequence, () => {
    lrSetPhase('listening');
    lrStartListening();
    lrResponseStartTime = getAudioCtx().currentTime;
  });
}

function lrUpdateLiveCaptureFeedback() {
  const el = document.getElementById('lr-live-capture');
  if (el) el.textContent = `Heard ${micDetectedNotes.length} note(s)...`;
}

// ── Feedback rendering (note modes) ─────────────────────────────────────────
function lrShowFeedback(results) {
  lrRenderBlankFretboard();
  const statusClass = { correct: 'quiz-correct', close: 'quiz-close', wrong: 'quiz-wrong', missing: 'lr-missing' };
  results.forEach(r => {
    const dot = lrGetDot(r.expected.string, r.expected.fret);
    if (!dot) return;
    dot.classList.remove('lr-idle');
    dot.classList.add(statusClass[r.status]);
    dot.textContent = r.expected.note;
  });

  const correctCount = results.filter(r => r.status === 'correct').length;
  const closeCount = results.filter(r => r.status === 'close').length;
  const wrongOrMissing = results.filter(r => r.status === 'wrong' || r.status === 'missing');
  const avgAbsDt = results.filter(r => r.dtMs !== undefined).reduce((s, r) => s + Math.abs(r.dtMs), 0) / (results.filter(r => r.dtMs !== undefined).length || 1);
  const feel = avgAbsDt < 80 ? 'solid and even' : avgAbsDt < 200 ? 'mostly steady, a little loose' : 'rushed — slow down and listen to the gaps';

  const panel = document.getElementById('lr-feedback-panel');
  panel.style.display = '';
  panel.innerHTML = `
    <div class="lr-feedback-summary">${correctCount}/${results.length} correct${closeCount ? `, ${closeCount} close` : ''} — feel: ${feel}</div>
    ${wrongOrMissing.map(r => `<div class="lr-feedback-tip">${lrTipForResult(r)}</div>`).join('')}
  `;
}

// ── Session finalize: streak, progress recording, next round, celebration ──
function lrFinalizeSequence(fullyCorrect, results) {
  lrCameraMicSummary(fullyCorrect, results);
  const data = loadProgress();
  const lr = data.listenRepeat;
  lr.totalSequences++;
  if (fullyCorrect) { lr.correctSequences++; lrStreak++; } else { lrStreak = 0; }
  let newBest = false;
  if (lrStreak > lr.bestStreak) { lr.bestStreak = lrStreak; newBest = true; }

  if (results) {
    results.forEach(r => {
      const noteKey = `${r.expected.string}-${r.expected.fret}`;
      const stat = lr.accuracyByNote[noteKey] || (lr.accuracyByNote[noteKey] = { correct: 0, attempts: 0 });
      stat.attempts++;
      if (r.status === 'correct') stat.correct++;
      else { lr.missedNotes[noteKey] = (lr.missedNotes[noteKey] || 0) + 1; }
    });
  }
  lr.lastContext = { mode: lrMode, ...lrCurrentSequence.meta };
  const today = todayEntry(data);
  today.listenRepeatSequences = (today.listenRepeatSequences || 0) + 1;
  saveProgress(data);
  renderProgressPanel();
  lrUpdateStatsDisplay();
  lrRenderMissedNotesHeatmap();

  // Difficulty auto-progression: every 5 correct in a row bumps one level
  let leveledUp = false;
  if (fullyCorrect && lrStreak > 0 && lrStreak % 5 === 0) {
    const idx = LR_DIFFICULTY_ORDER.indexOf(lrDifficulty);
    if (idx < LR_DIFFICULTY_ORDER.length - 1) {
      lrDifficulty = LR_DIFFICULTY_ORDER[idx + 1];
      const sel = document.getElementById('lr-difficulty-select');
      if (sel) sel.value = lrDifficulty;
      leveledUp = true;
    }
  }

  if (newBest || leveledUp) lrCelebrate(leveledUp ? `Level up: ${LR_DIFFICULTY_PRESETS[lrDifficulty].label}!` : `New best streak: ${lrStreak}!`);

  document.getElementById('lr-streak').textContent = lrStreak;
  document.getElementById('lr-best-streak').textContent = lr.bestStreak;
  if (fullyCorrect && typeof springStreak === 'function') springStreak(document.getElementById('lr-streak'));
  if (!fullyCorrect) {
    if (typeof pulseError === 'function') pulseError(document.getElementById('lr-sequence-display'));
    if (typeof playErrorThud === 'function') playErrorThud();
  }

  if (fullyCorrect) {
    playPluck(getAudioCtx().currentTime, 880, 0.5);
    playPluck(getAudioCtx().currentTime + 0.08, 1108.7, 0.5); // quick major-third flourish — a satisfying "ding"
    setTimeout(() => { lrSetPhase('idle'); lrStartRound(); }, 1200);
  } else {
    lrSetPhase('idle');
  }
}

function lrCelebrate(message) {
  const el = document.getElementById('lr-celebration');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('lr-celebrate-anim'); void el.offsetWidth; // restart animation
  el.classList.add('lr-celebrate-anim');
  setTimeout(() => el.classList.remove('lr-celebrate-anim'), 1600);
}

function lrUpdateStatsDisplay() {
  const data = loadProgress();
  const lr = data.listenRepeat;
  document.getElementById('lr-streak').textContent = lrStreak;
  document.getElementById('lr-best-streak').textContent = lr.bestStreak;
  document.getElementById('lr-total-sequences').textContent = lr.totalSequences;
  const acc = lr.totalSequences ? Math.round(lr.correctSequences / lr.totalSequences * 100) : 0;
  if (lr.totalSequences && typeof recordTrendPoint === 'function') {
    recordTrendPoint('lrAccuracy', acc);
  }
  const lrAccEl = document.getElementById('lr-accuracy');
  lrAccEl.textContent = lr.totalSequences ? `${acc}%` : '—';
  lrAccEl.classList.toggle('is-empty', !lr.totalSequences);
}

function lrRenderMissedNotesHeatmap() {
  const container = document.getElementById('lr-heatmap-fretboard');
  if (!container) return;
  const data = loadProgress();
  const missed = data.listenRepeat.missedNotes;
  const maxMiss = Math.max(1, ...Object.values(missed));
  buildFretGrid(container, (cell, dot, si, f) => {
    const key = `${si}-${f}`;
    const count = missed[key] || 0;
    if (count > 0) {
      const intensity = count / maxMiss;
      dot.style.background = `rgba(229,57,53,${0.15 + intensity * 0.7})`;
      dot.style.borderColor = '#e53935';
      dot.title = `${count} miss${count === 1 ? '' : 'es'}`;
      dot.textContent = noteAt(STRINGS[si], f);
    } else {
      dot.classList.add('empty');
    }
  }, 12);
}

// ── UI wiring ────────────────────────────────────────────────────────────────
function lrSwitchMode(mode) {
  lrMode = mode;
  document.querySelectorAll('.lr-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.lrMode === mode));
  document.querySelectorAll('.lr-mode-controls').forEach(el => el.style.display = el.dataset.lrMode === mode ? '' : 'none');
}

async function lrToggleListenRepeat() {
  const btn = document.getElementById('lr-start-btn');
  if (lrRunning) {
    lrRunning = false;
    clearTimeout(lrListenTimeout);
    lrStopListening();
    btn.textContent = '▶ START';
    btn.classList.remove('running');
    lrSetPhase('idle');
    return;
  }
  const ok = await initMic();
  if (!ok) {
    document.getElementById('lr-status').textContent = micUnavailableMessage('Listen & Repeat');
    return;
  }
  lrStartMeterLoop();
  const micBtn = document.getElementById('lr-check-mic-btn');
  if (micBtn) micBtn.textContent = '🎤 Mic Connected';
  btn.disabled = true;
  btn.textContent = '… loading';
  await ensureInstrumentReady(LR_INSTRUMENT);
  btn.disabled = false;
  lrRunning = true;
  btn.textContent = '■ STOP';
  btn.classList.add('running');
  const data = loadProgress();
  data.listenRepeat.sessions++;
  saveProgress(data);
  lrStartRound();
}

function lrPopulateSelects() {
  const keySel = document.getElementById('lr-key-select');
  const scaleKeySel = document.getElementById('lr-scale-key-select');
  const chordKeySel = document.getElementById('lr-chord-key-select');
  [keySel, scaleKeySel, chordKeySel].forEach(sel => {
    if (!sel) return;
    KEYS.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o); });
  });

  const scaleSel = document.getElementById('lr-scale-select');
  if (scaleSel) ALL_SCALES.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = (s.zappa ? '★ ' : '') + s.name; scaleSel.appendChild(o); });

  const playerSel = document.getElementById('lr-player-select');
  if (playerSel) Object.entries(LR_PLAYER_STYLES).forEach(([id, s]) => { const o = document.createElement('option'); o.value = id; o.textContent = s.label; playerSel.appendChild(o); });

  const progSel = document.getElementById('lr-progression-select');
  if (progSel) Object.entries(LR_CHORD_PROGRESSIONS).forEach(([id, p]) => { const o = document.createElement('option'); o.value = id; o.textContent = p.label; progSel.appendChild(o); });

  const diffSel = document.getElementById('lr-difficulty-select');
  if (diffSel) LR_DIFFICULTY_ORDER.forEach(id => { const o = document.createElement('option'); o.value = id; o.textContent = LR_DIFFICULTY_PRESETS[id].label; diffSel.appendChild(o); });

  const playerDescEl = document.getElementById('lr-player-desc');
  function updatePlayerDesc() { if (playerDescEl && playerSel) playerDescEl.textContent = LR_PLAYER_STYLES[playerSel.value].description; }
  if (playerSel) { playerSel.addEventListener('change', updatePlayerDesc); updatePlayerDesc(); }

  if (diffSel) diffSel.addEventListener('change', () => { lrDifficulty = diffSel.value; });
}

// ── Init ──────────────────────────────────────────────────────────────────
lrPopulateSelects();
lrRenderBlankFretboard();
lrUpdateStatsDisplay();
lrRenderMissedNotesHeatmap();


// ── Keeping takes ──────────────────────────────────────────────────────────
// The value here is comparison over time: hearing a take from a month ago
// against one from today on the same sequence is one of the highest-return
// things you can do at this stage. Blobs go to IndexedDB (see storage.js) —
// never localStorage, which would be blown by a few MB of audio.
async function lrKeepTake() {
  if (!lrLastTakeBlob) return;
  const btn = document.getElementById('lr-keep-take-btn');
  const sc = (typeof currentScale === 'function') ? currentScale() : null;
  const acc = (typeof lrLastRoundAccuracy !== 'undefined' && lrLastRoundAccuracy != null)
    ? lrLastRoundAccuracy : null;
  const record = {
    blob: lrLastTakeBlob,
    createdAt: Date.now(),
    name: '',
    sequence: (typeof lrCurrentSequenceLabel === 'function' ? lrCurrentSequenceLabel() : 'Listen & Repeat take'),
    scale: sc ? sc.name : null,
    key: (typeof state !== 'undefined' ? state.key : null),
    accuracy: acc,
    profile: (typeof getActiveProfileId === 'function' ? getActiveProfileId() : null),
    mimeType: lrLastTakeBlob.type || 'audio/webm',
    bytes: lrLastTakeBlob.size,
  };
  try {
    await saveTake(record);
    if (btn) { btn.textContent = '✓ Kept'; btn.disabled = true; }
    if (typeof renderTakesList === 'function') renderTakesList();
  } catch (e) {
    const status = document.getElementById('lr-record-status');
    if (status) status.textContent = 'Could not save take: ' + (e && e.message ? e.message : e);
  }
}

// Best-effort label for what was being practised when the take was recorded.
function lrCurrentSequenceLabel() {
  const sc = (typeof currentScale === 'function') ? currentScale() : null;
  const k = (typeof state !== 'undefined') ? state.key : null;
  if (sc && k) return `${k} ${sc.name}`;
  return 'Listen & Repeat take';
}
