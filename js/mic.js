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

// ── Calibratable detection thresholds ──────────────────────────────────────
// These were hardcoded guesses tuned by ear against no particular guitar or
// room. They are now state so runMicCalibration() can derive them from your
// actual instrument and noise floor, and so they can persist per profile.
const MIC_TECH_DEFAULTS = {
  vibratoMinRange: 15,     // cents of excursion before wobble counts as vibrato
  vibratoMaxRange: 250,    // above this it's a bend/slide, not vibrato
  vibratoMinSignChanges: 3,
  slideMinCents: 80,       // sustained pitch move that stays put
  bendMinCents: 25,        // sustained rise that stays up
};
let micTech = { ...MIC_TECH_DEFAULTS };

function loadMicCalibration() {
  try {
    if (typeof loadProgress !== 'function') return;
    const c = loadProgress().micCalibration;
    if (!c) return;
    if (typeof c.noiseGate === 'number') micNoiseGate = c.noiseGate;
    if (typeof c.sensitivity === 'number') micSensitivity = c.sensitivity;
    if (c.tech) micTech = { ...MIC_TECH_DEFAULTS, ...c.tech };
  } catch (e) {}
}
function saveMicCalibration(extra) {
  if (typeof loadProgress !== 'function') return;
  const d = loadProgress();
  d.micCalibration = Object.assign({}, d.micCalibration, {
    noiseGate: micNoiseGate, sensitivity: micSensitivity, tech: micTech,
    calibratedAt: new Date().toISOString(),
  }, extra || {});
  saveProgress(d);
}
function resetMicCalibration() {
  micTech = { ...MIC_TECH_DEFAULTS };
  micNoiseGate = 0.02; micSensitivity = 1.0;
  saveMicCalibration({ calibratedAt: null });
}

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
  if (signChanges >= micTech.vibratoMinSignChanges && centsRange > micTech.vibratoMinRange && centsRange < micTech.vibratoMaxRange) return 'vibrato';

  // Slide: pitch moves a clear distance and holds there — two stable regions,
  // not a snap-back (bend release) or a blur (vibrato).
  if (Math.abs(lateAvg - earlyAvg) > micTech.slideMinCents && signChanges <= 1) return 'slide';

  // Bend: pitch rises steadily after the attack and stays up.
  if (lateAvg - earlyAvg > micTech.bendMinCents && signChanges <= 1) return 'bend';

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
  if (body) { body.classList.add('collapsible'); body.classList.toggle('collapsed', !!collapsed); }
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
    if (status) status.textContent = '🎤 Off — enable to hear note matching, tuning, and technique detection';
    updateMicTunerReadout(null);
    return;
  }
  if (btn) { btn.textContent = '… connecting'; btn.disabled = true; }
  const ok = await micSetEnabled(true);
  if (btn) btn.disabled = false;
  if (!ok) {
    if (status) status.textContent = '🎤 ' + micUnavailableMessage('microphone features');
    if (btn) btn.textContent = '▶ MIC ON';
    return;
  }
  if (btn) { btn.textContent = '■ MIC OFF'; btn.classList.add('running'); }
  if (compactBtn) compactBtn.classList.add('active');
  if (status) status.textContent = '🎙️ Listening — play a note to see note matching, tuning, and technique detection live.';
}

// ═══════════════════════════════════════════════════════════════════════════
// GUIDED CALIBRATION
// ═══════════════════════════════════════════════════════════════════════════
//
// Replaces guessing at the sensitivity/noise-gate sliders. Four measured
// steps, each derived from your actual guitar in your actual room:
//   1. silence      -> noise floor, sets the gate 20% above it
//   2. soft playing -> the quietest signal that must still register
//   3. hard playing -> sets sensitivity so a normal hard hit lands near 1.0
//   4. techniques   -> measures the real cents excursion of your bend,
//                      vibrato and slide, so classifyTechnique matches your
//                      hand rather than a number picked in the abstract
//
// The sliders stay afterwards for manual fine-tuning — calibration sets good
// starting values, it doesn't take the controls away.

const MIC_CAL_STEPS = [
  { id: 'silence', seconds: 5,  title: 'Stay quiet',
    instruction: "Don't play or touch the guitar. Measuring the noise floor of your room." },
  { id: 'soft', seconds: 10, title: 'Play softly',
    instruction: 'Play your open low E string softly and repeatedly.' },
  { id: 'hard', seconds: 10, title: 'Play hard',
    instruction: 'Play your open low E string as hard as you normally would.' },
  { id: 'bend', seconds: 10, title: 'Bend',
    instruction: 'Play a slow, full bend on the G string. Repeat a few times.' },
  { id: 'vibrato', seconds: 10, title: 'Vibrato',
    instruction: 'Hold a note on the G string and add your normal vibrato.' },
  { id: 'slide', seconds: 10, title: 'Slide',
    instruction: 'Slide between two notes a few frets apart. Repeat a few times.' },
];

let micCalRunning = false;
let micCalResults = {};

function micCalMeasure(step) {
  return new Promise(resolve => {
    const rmsSamples = [], pitchTrace = [];
    const listener = ({ rms, reading }) => {
      rmsSamples.push(rms);
      if (reading && reading.freq) pitchTrace.push(reading.freq);
    };
    onMicLevel(listener);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, step.seconds - (Date.now() - started) / 1000);
      const bar = document.getElementById('mic-cal-progress');
      if (bar) bar.style.width = `${100 - (left / step.seconds) * 100}%`;
      const cd = document.getElementById('mic-cal-countdown');
      if (cd) cd.textContent = `${Math.ceil(left)}s`;
    }, 100);
    setTimeout(() => {
      clearInterval(tick);
      offMicLevel(listener);
      resolve({ rmsSamples, pitchTrace });
    }, step.seconds * 1000);
  });
}

// Largest cents excursion within the captured pitch trace — this is what the
// technique thresholds actually compare against.
function micCalCentsExcursion(pitchTrace) {
  const clean = pitchTrace.filter(f => f > 60 && f < 1400);
  if (clean.length < 6) return null;
  const ref = clean[0];
  const cents = clean.map(f => 1200 * Math.log2(f / ref));
  return Math.max(...cents) - Math.min(...cents);
}

async function runMicCalibration() {
  if (micCalRunning) return;
  if (!micEnabled) {
    const ok = await micSetEnabled(true);
    if (ok === false) { alert('Calibration needs the microphone. Enable it and try again.'); return; }
  }
  micCalRunning = true;
  micCalResults = {};
  showMicCalOverlay();
  try {
    for (const step of MIC_CAL_STEPS) {
      renderMicCalStep(step);
      await new Promise(r => setTimeout(r, 900)); // beat to read the instruction
      if (!micCalRunning) return;                  // cancelled
      micCalResults[step.id] = await micCalMeasure(step);
    }
    applyMicCalibration();
    renderMicCalSummary();
  } finally {
    micCalRunning = false;
  }
}

function cancelMicCalibration() {
  micCalRunning = false;
  hideMicCalOverlay();
}

function applyMicCalibration() {
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };

  const silence = micCalResults.silence ? micCalResults.silence.rmsSamples : [];
  const soft = micCalResults.soft ? micCalResults.soft.rmsSamples : [];
  const hard = micCalResults.hard ? micCalResults.hard.rmsSamples : [];

  // Gate 20% above the measured floor, using the 95th percentile of silence so
  // one cough doesn't set the threshold for the whole session.
  const floor = pct(silence, 0.95);
  const softPeak = pct(soft, 0.9);
  const hardPeak = pct(hard, 0.9);

  const derived = {};
  if (floor > 0) {
    micNoiseGate = Math.min(0.3, Math.max(0.002, floor * 1.2));
    derived.floor = floor;
  }
  // Sensitivity scales a normal hard hit toward ~0.6 RMS, leaving headroom.
  if (hardPeak > 0) {
    micSensitivity = Math.max(0.1, Math.min(4, 0.6 / hardPeak));
    derived.hardPeak = hardPeak; derived.softPeak = softPeak;
  }
  // Gate must still sit below the softest playing, or quiet notes never register.
  if (softPeak > 0 && micNoiseGate >= softPeak * 0.8) {
    micNoiseGate = Math.max(0.002, softPeak * 0.5);
    derived.gateLoweredForSoftPlaying = true;
  }

  const bendEx = micCalResults.bend ? micCalMedianExcursion(micCalResults.bend) : null;
  const vibEx  = micCalResults.vibrato ? micCalMedianExcursion(micCalResults.vibrato) : null;
  const slideEx = micCalResults.slide ? micCalMedianExcursion(micCalResults.slide) : null;

  // Thresholds sit at ~60% of what you actually played, so your normal gesture
  // clears them comfortably without catching every wobble.
  if (bendEx)  micTech.bendMinCents = Math.max(10, Math.round(bendEx * 0.6));
  if (slideEx) micTech.slideMinCents = Math.max(40, Math.round(slideEx * 0.6));
  if (vibEx) {
    micTech.vibratoMinRange = Math.max(8, Math.round(vibEx * 0.5));
    micTech.vibratoMaxRange = Math.max(120, Math.round(vibEx * 2.5));
  }
  micCalResults.derived = { ...derived, bendEx, vibEx, slideEx };

  setMicSensitivity(micSensitivity);
  setMicNoiseGate(micNoiseGate);
  syncMicSlidersToState();
  saveMicCalibration();
}

function micCalMedianExcursion(capture) {
  const ex = micCalCentsExcursion(capture.pitchTrace);
  return ex && isFinite(ex) ? ex : null;
}

function syncMicSlidersToState() {
  const sens = document.getElementById('mic-sensitivity-slider');
  const gate = document.getElementById('mic-noise-gate-slider');
  if (sens) { sens.value = String(Math.round(micSensitivity * 100)); sens.dispatchEvent(new Event('input', { bubbles: true })); }
  if (gate) { gate.value = String(Math.round(micNoiseGate * 1000)); gate.dispatchEvent(new Event('input', { bubbles: true })); }
}

// ── Calibration UI ─────────────────────────────────────────────────────────
function showMicCalOverlay() {
  const el = document.getElementById('mic-cal-overlay');
  if (el) el.classList.add('visible');
}
function hideMicCalOverlay() {
  const el = document.getElementById('mic-cal-overlay');
  if (el) el.classList.remove('visible');
}
function renderMicCalStep(step) {
  const el = document.getElementById('mic-cal-overlay');
  if (!el) return;
  const idx = MIC_CAL_STEPS.indexOf(step) + 1;
  el.innerHTML = `
    <div class="mic-cal-card">
      <div class="mic-cal-step">Step ${idx} of ${MIC_CAL_STEPS.length}</div>
      <div class="mic-cal-title">${step.title}</div>
      <div class="mic-cal-instruction">${step.instruction}</div>
      <div class="mic-cal-bar"><div class="mic-cal-bar-fill" id="mic-cal-progress"></div></div>
      <div class="mic-cal-countdown" id="mic-cal-countdown">${step.seconds}s</div>
      <button class="session-skip" onclick="cancelMicCalibration()">Cancel calibration</button>
    </div>`;
}
function renderMicCalSummary() {
  const el = document.getElementById('mic-cal-overlay');
  if (!el) return;
  const d = micCalResults.derived || {};
  const row = (label, value) => `<li><span>${label}</span><em>${value}</em></li>`;
  el.innerHTML = `
    <div class="mic-cal-card">
      <div class="mic-cal-title">Calibrated</div>
      <div class="mic-cal-instruction">Measured from your guitar in this room. The sliders still work if you want to fine-tune.</div>
      <ul class="mic-cal-results">
        ${row('Room noise floor', d.floor ? d.floor.toFixed(4) + ' RMS' : 'not measured')}
        ${row('Noise gate', micNoiseGate.toFixed(4) + ' RMS')}
        ${row('Sensitivity', micSensitivity.toFixed(2) + '×')}
        ${row('Bend threshold', micTech.bendMinCents + '¢' + (d.bendEx ? ` (you played ~${Math.round(d.bendEx)}¢)` : ''))}
        ${row('Vibrato range', micTech.vibratoMinRange + '–' + micTech.vibratoMaxRange + '¢')}
        ${row('Slide threshold', micTech.slideMinCents + '¢' + (d.slideEx ? ` (you played ~${Math.round(d.slideEx)}¢)` : ''))}
      </ul>
      <div class="mic-cal-actions">
        <button class="big-btn btn-go" onclick="hideMicCalOverlay()">Done</button>
        <button class="session-skip" onclick="resetMicCalibration(); syncMicSlidersToState(); hideMicCalOverlay();">Reset to defaults</button>
      </div>
    </div>`;
}

// NOT called here: mic.js loads before progress.js (see index.html script
// order), so loadProgress does not exist yet and this would silently skip —
// the same load-order trap that made saveScalesState throw. nav.js's
// initNav() calls loadMicCalibration() once every file is loaded.
