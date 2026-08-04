// ═══════════════════════════════════════════════════════════════════════════
// MIC ENGINE — shared microphone input, real-time pitch detection (pitchy.js),
// onset detection, and calibration (sensitivity/noise gate). One getUserMedia
// stream/analyser for the whole app; Scales' live note matching, Chords'
// strum-timing grading, the standalone Tuner, and Listen & Repeat's
// ear-training grading all subscribe to this engine instead of opening their
// own stream.
//
// Browser-only: getUserMedia needs a real page origin, not the sandboxed
// artifact-preview iframe — see micUnavailableMessage() below. Works when
// running locally via `npm start` in a real browser tab.
// ═══════════════════════════════════════════════════════════════════════════

let micStream = null;
let micSourceNode = null;
let micAnalyser = null;
let micSampleBuffer = null;
let micPitchDetector = null;
let micEnabled = false;         // master on/off — nothing polls unless this is true
let micSensitivity = 1.0;       // multiplier applied to measured RMS before any gate comparison
let micNoiseGate = 0.02;        // RMS floor (post-sensitivity) below which input counts as silence
let micLastOnsetTime = -1;
const MIC_MIN_ONSET_GAP = 0.12; // seconds — debounces one strum into a single onset

function micRunningInIframe() {
  try { return window.self !== window.top; } catch (e) { return true; }
}
function micUnavailableMessage(action) {
  return micRunningInIframe()
    ? `Microphone isn't available in this embedded preview — the page it's embedded in doesn't grant mic access here. Open index.html directly (or run "npm start") to use ${action}.`
    : `Microphone access was denied — allow it in your browser to ${action}.`;
}

async function initMic() {
  if (micStream) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    return false;
  }
  const ctx = getAudioCtx();
  micSourceNode = ctx.createMediaStreamSource(micStream);
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 2048;
  micSampleBuffer = new Float32Array(micAnalyser.fftSize);
  micSourceNode.connect(micAnalyser);
  micPitchDetector = PitchyBundle.PitchDetector.forFloat32Array(micAnalyser.fftSize);
  micPitchDetector.minVolumeDecibels = -45;
  return true;
}

function micComputeRMS(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function setMicSensitivity(v) { micSensitivity = Math.max(0.1, Math.min(4, v)); }
function setMicNoiseGate(v) { micNoiseGate = Math.max(0, Math.min(0.3, v)); }

function midiToNoteInfo(midiFloat) {
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const noteName = CHROMATIC[((midi % 12) + 12) % 12];
  return { midi, noteName, cents };
}
function hzToNoteInfo(freq) {
  return midiToNoteInfo(69 + 12 * Math.log2(freq / 440));
}

// ── Master on/off — starts/stops every loop below together ─────────────────
async function micSetEnabled(enabled) {
  if (enabled) {
    const ok = await initMic();
    if (!ok) return false;
    micEnabled = true;
    startMicMeterLoop();
    startOnsetDetection();
    return true;
  }
  micEnabled = false;
  stopMicMeterLoop();
  stopOnsetDetection();
  return true;
}

// ── Level meter + live pitch readout — one shared RAF loop, many subscribers ──
let micMeterRAF = null;
let micMeterListeners = [];
function onMicLevel(fn) { micMeterListeners.push(fn); }
function offMicLevel(fn) { micMeterListeners = micMeterListeners.filter(f => f !== fn); }

// startMicMeterLoop() and startOnsetDetection() are always enabled/disabled
// together (both driven by micSetEnabled) and were originally two separate
// RAF loops, each independently calling getFloatTimeDomainData + computing
// RMS on the same buffer every frame — a redundant analyser read per frame.
// This loop does that read once and drives both the level-meter listeners
// and onset detection from the single result.
function startMicMeterLoop() {
  if (micMeterRAF) return;
  const tick = () => {
    if (!micEnabled || !micAnalyser) { micMeterRAF = null; return; }
    micAnalyser.getFloatTimeDomainData(micSampleBuffer);
    const rawRms = micComputeRMS(micSampleBuffer);
    const rms = rawRms * micSensitivity;
    const active = rms > micNoiseGate;
    let reading = null;
    if (active) {
      const ctx = getAudioCtx();
      const [freq, clarity] = micPitchDetector.findPitch(micSampleBuffer, ctx.sampleRate);
      if (freq > 60 && freq < 1400 && clarity > 0.8) reading = { freq, clarity, ...hzToNoteInfo(freq) };
    }
    micMeterListeners.forEach(fn => fn({ rms, active, reading }));
    pollOnsetFromFrame(rms);
    micMeterRAF = requestAnimationFrame(tick);
  };
  micMeterRAF = requestAnimationFrame(tick);
}
function stopMicMeterLoop() { if (micMeterRAF) cancelAnimationFrame(micMeterRAF); micMeterRAF = null; }

// ── Onset detection + post-attack envelope tracking ─────────────────────────
// Fires onOnset({time, freq, noteName, midi, cents, clarity, technique, samples})
// once per detected pick/strum attack. `samples` is the raw pitch/RMS envelope
// sampled for ENVELOPE_WINDOW_MS after the attack, which technique
// classification (below) reads to tell bend/vibrato/slide/mute apart.
const ENVELOPE_WINDOW_MS = 450;
const ENVELOPE_SAMPLE_INTERVAL_MS = 20;

let onsetListeners = [];
function onMicOnset(fn) { onsetListeners.push(fn); }
function offMicOnset(fn) { onsetListeners = onsetListeners.filter(f => f !== fn); }

// Called from startMicMeterLoop()'s single per-frame read (see comment
// there) rather than running its own second RAF loop over the same buffer.
let onsetDetectionActive = false;
function startOnsetDetection() { onsetDetectionActive = true; micLastOnsetTime = -1; }
function stopOnsetDetection() { onsetDetectionActive = false; }
function pollOnsetFromFrame(rms) {
  if (!onsetDetectionActive) return;
  const now = getAudioCtx().currentTime;
  if (rms > micNoiseGate && (now - micLastOnsetTime) > MIC_MIN_ONSET_GAP) {
    micLastOnsetTime = now;
    captureNoteEnvelope(now);
  }
}

// Fires onOnset TWICE per note: once "early" (as soon as one confident
// pitch reading comes in, typically ~30-90ms after the attack) with just
// the pitch, and once "late" after the full ENVELOPE_WINDOW_MS with
// technique classification added. The early firing exists because waiting
// the full window before saying anything reads as badly-lagged/wrong
// feedback on anything faster than a slow single note — by the time a
// ~450ms-delayed match appeared, a scale run at any real tempo had already
// moved 2-3 notes on, so every match looked like it was for the wrong
// note. Consumers that only care about pitch (Scales' note matching) should
// act on evt.early === true; consumers that need the full envelope
// (technique labels) already only see it on the late firing, since
// evt.technique is null on the early one.
function captureNoteEnvelope(onsetTime) {
  const ctx = getAudioCtx();
  const samples = [];
  const maxSamples = Math.round(ENVELOPE_WINDOW_MS / ENVELOPE_SAMPLE_INTERVAL_MS);
  let count = 0;
  let earlyFired = false;
  function sampleOnce() {
    if (!micEnabled) return;
    micAnalyser.getFloatTimeDomainData(micSampleBuffer);
    const rms = micComputeRMS(micSampleBuffer) * micSensitivity;
    const [freq, clarity] = micPitchDetector.findPitch(micSampleBuffer, ctx.sampleRate);
    const sample = { t: count * ENVELOPE_SAMPLE_INTERVAL_MS, rms, freq: (freq > 60 && freq < 1400) ? freq : null, clarity };
    samples.push(sample);
    if (!earlyFired && sample.freq && sample.clarity > 0.85) {
      earlyFired = true;
      const info = hzToNoteInfo(sample.freq);
      onsetListeners.forEach(fn => fn({ time: onsetTime, freq: sample.freq, clarity: sample.clarity, technique: null, early: true, ...info }));
    }
    count++;
    if (count < maxSamples) setTimeout(sampleOnce, ENVELOPE_SAMPLE_INTERVAL_MS);
    else finalize();
  }
  function finalize() {
    const pitched = samples.filter(s => s.freq && s.clarity > 0.8);
    if (!pitched.length) {
      // No clean pitch anywhere in the window — a percussive/muffled hit rather than a ringing note.
      const hadEnergy = samples.some(s => s.rms > micNoiseGate);
      onsetListeners.forEach(fn => fn({ time: onsetTime, freq: null, samples, technique: hadEnergy ? 'mute' : null, early: false }));
      return;
    }
    const attackFreq = pitched[0].freq;
    const info = hzToNoteInfo(attackFreq);
    const technique = classifyTechnique(samples, attackFreq);
    onsetListeners.forEach(fn => fn({ time: onsetTime, freq: attackFreq, clarity: pitched[0].clarity, samples, technique, early: false, ...info }));
  }
  setTimeout(sampleOnce, 30); // let the pick transient pass before the first pitch read
}

// ── Technique classification ────────────────────────────────────────────────
// samples: [{t, rms, freq|null, clarity}] across ~450ms post-attack.
// attackFreq: the fundamental read right after the pick transient (the
// "target" pitch everything else is measured against, in cents).
function classifyTechnique(samples, attackFreq) {
  const pitched = samples.filter(s => s.freq && s.clarity > 0.8);
  if (pitched.length < 4) return null; // too little clean signal to say anything specific

  const cents = pitched.map(s => 1200 * Math.log2(s.freq / attackFreq));
  const third = Math.max(1, Math.ceil(cents.length / 3));
  const early = cents.slice(0, third);
  const late = cents.slice(-third);
  const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
  const lateAvg = late.reduce((a, b) => a + b, 0) / late.length;
  const centsRange = Math.max(...cents) - Math.min(...cents);

  // Vibrato: the pitch trace changes direction repeatedly (regular oscillation)
  // rather than moving smoothly in one direction.
  let signChanges = 0;
  for (let i = 2; i < cents.length; i++) {
    const d1 = cents[i - 1] - cents[i - 2], d2 = cents[i] - cents[i - 1];
    if (Math.sign(d1) !== 0 && Math.sign(d2) !== 0 && Math.sign(d1) !== Math.sign(d2)) signChanges++;
  }
  if (signChanges >= 3 && centsRange > 15 && centsRange < 250) return 'vibrato';

  // Slide: pitch moves a clear distance and holds there — two stable regions,
  // not a snap-back (bend release) or a blur (vibrato).
  if (Math.abs(lateAvg - earlyAvg) > 80 && signChanges <= 1) return 'slide';

  // Bend: pitch rises steadily after the attack and stays up.
  if (lateAvg - earlyAvg > 25 && signChanges <= 1) return 'bend';

  return null; // plain note — no technique to report
}

// ── Shared technique-label + tuner readout (persistent Mic bar, see index.html) ──
function showMicTechniqueLabel(name) {
  const el = document.getElementById('mic-technique-label');
  if (!el) return;
  const labels = { bend: '🎸 Bend', vibrato: '〰️ Vibrato', slide: '➡️ Slide', mute: '🔇 Muted note' };
  if (!labels[name]) return;
  el.textContent = labels[name];
  el.style.display = '';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 1500);
}

const TUNING_TOLERANCE_CENTS = 15;

function updateMicTunerReadout(reading) {
  const noteEl = document.getElementById('mic-tuner-note');
  const centsEl = document.getElementById('mic-tuner-cents');
  if (!noteEl || !centsEl) return;
  if (!reading) { noteEl.textContent = '—'; centsEl.textContent = ''; centsEl.className = 'mic-tuner-cents'; return; }
  noteEl.textContent = reading.noteName;
  const inTune = Math.abs(reading.cents) <= TUNING_TOLERANCE_CENTS;
  centsEl.textContent = inTune ? 'in tune' : (reading.cents > 0 ? `▲ sharp ${reading.cents}¢ — tune down` : `▼ flat ${reading.cents}¢ — tune up`);
  centsEl.className = 'mic-tuner-cents ' + (inTune ? 'in-tune' : reading.cents > 0 ? 'sharp' : 'flat');
}

// ── Persistent Mic Bar wiring (index.html) — meter fill, note/cents readout,
// technique label, and the on/off toggle every mode's mic feature shares ──
onMicLevel((frame) => {
  const fill = document.getElementById('mic-level-meter-fill');
  if (fill) fill.style.width = `${Math.round(Math.min(1, frame.rms / 0.3) * 100)}%`;
  const meter = document.getElementById('mic-level-meter');
  if (meter) meter.classList.toggle('lr-mic-active', frame.active);
  updateMicTunerReadout(frame.reading);
});
onMicOnset((evt) => { if (evt.technique) showMicTechniqueLabel(evt.technique); });

function applyMicBarCollapsedState(collapsed) {
  const body = document.getElementById('mic-bar-body');
  const chevron = document.getElementById('mic-bar-chevron');
  if (body) body.style.display = collapsed ? 'none' : '';
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
}
function toggleMicBar() {
  const data = loadProgress();
  data.ui.micBarCollapsed = !data.ui.micBarCollapsed;
  saveProgress(data);
  applyMicBarCollapsedState(data.ui.micBarCollapsed);
}

async function toggleMicEnabled() {
  const btn = document.getElementById('mic-enable-btn');
  const status = document.getElementById('mic-status-text');
  const compactBtn = document.getElementById('compact-mic-btn');
  if (micEnabled) {
    await micSetEnabled(false);
    if (btn) { btn.textContent = '▶ MIC ON'; btn.classList.remove('running'); }
    if (compactBtn) compactBtn.classList.remove('active');
    if (status) status.textContent = 'Off — enable to hear note matching, tuning, and technique detection';
    updateMicTunerReadout(null);
    return;
  }
  if (btn) { btn.textContent = '… connecting'; btn.disabled = true; }
  const ok = await micSetEnabled(true);
  if (btn) btn.disabled = false;
  if (!ok) {
    if (status) status.textContent = micUnavailableMessage('microphone features');
    if (btn) btn.textContent = '▶ MIC ON';
    return;
  }
  if (btn) { btn.textContent = '■ MIC OFF'; btn.classList.add('running'); }
  if (compactBtn) compactBtn.classList.add('active');
  if (status) status.textContent = 'Listening — play a note to see note matching, tuning, and technique detection live.';
}
