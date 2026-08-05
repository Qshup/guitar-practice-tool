// ═══════════════════════════════════════════════════════════════════════════
// AUDIO ENGINE — Metronome + Backing Track + Scale Run-Through
// ═══════════════════════════════════════════════════════════════════════════
let audioCtx = null;
let metroRunning = false;
let metroNextTime = 0;
let metroBeat = 0;
let metroScheduler = null;
let backingNodes = [];
let runRunning = false;
let runTimeout = null;
let runIdx = 0;
let runNotes = [];

// ── Practice-time tracking (for the progress panel, see progress.js) ──────
// Counts time while the scale run-through and/or metronome are actively running.
// Refcounted so running both at once doesn't double-count or stop early.
let scaleTimerStart = null;
let activeScaleTimers = 0;
function startScaleTimer() {
  if (activeScaleTimers++ === 0) scaleTimerStart = Date.now();
}
function stopScaleTimer() {
  activeScaleTimers = Math.max(0, activeScaleTimers - 1);
  if (activeScaleTimers === 0 && scaleTimerStart) {
    const elapsedSec = Math.round((Date.now() - scaleTimerStart) / 1000);
    scaleTimerStart = null;
    if (elapsedSec > 0 && typeof recordScaleTime === 'function') recordScaleTime(elapsedSec);
  }
}

// ── Tone.js voices (Karplus-Strong synthesis) ──────────────────────────────
// Scale Run, Riffs, and Songs now play through the sample-based engine near the
// bottom of this file (real recorded guitar/bass instead of physical modeling) —
// see that section's header comment. The voices below still power Chords
// (chord-run preview + strum), the Chord Game, and Listen & Repeat, which were
// left on synthesis since they aren't in scope for the sample-engine overhaul.
// pluckVoice: real Karplus-Strong plucked string — dampening/resonance shift
//   per-note by frequency (see stringToneFor) so low strings read as warm/round
//   and high strings as bright/twangy, like a real set.
// ampInput: shared amp-style coloration (saturation -> EQ -> compression) every
//   pluck/bend/vibrato note runs through before the reverb bus — this is what keeps
//   the physical-modeling pluck from sounding like a clean synthesis demo.
// bassVoice: filtered sawtooth bass for the metronome backing track
// chordVoice: triangle pad for backing-track chord stabs
// bendVoice + vibratoFx: pitch-automatable voice for Chords/Game/Listen & Repeat
//   bends & vibrato — a real guitar string bend needs continuous pitch glide,
//   which PluckSynth can't do.
let toneReady = false;
let bassVoice, chordVoice, bendVoice, vibratoFx, reverbBus, ampInput;
// Tone.PluckSynth doesn't extend Monophonic, so Tone.PolySynth can't wrap it —
// a small hand-rolled voice pool gives it polyphony (needed for strummed chords).
const PLUCK_POOL_SIZE = 8;
let pluckPool = [];
let pluckPoolIdx = 0;
let pluckPoolLastTime = [];

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!toneReady) {
    Tone.setContext(audioCtx);
    Tone.start();

    reverbBus = new Tone.Freeverb({ roomSize: 0.6, dampening: 4000 }).toDestination();
    reverbBus.wet.value = 0.13; // slight room tone, not washy — keeps fast runs legible

    // ── "Amp" coloration chain — shared by every plucked/bent/vibrato note ──
    // A raw Karplus-Strong pluck is too clean/synthetic on its own; a touch of
    // saturation + guitar-shaped EQ + gentle compression is what makes it read
    // as an amplified string instead of a plain physical-modeling demo.
    const ampComp = new Tone.Compressor({ threshold: -24, ratio: 3, attack: 0.003, release: 0.15 }).connect(reverbBus);
    const ampEQ = new Tone.EQ3({ low: -2, mid: 2, high: 3 }).connect(ampComp); // scoop mud, push body + pick presence
    ampInput = new Tone.Distortion({ distortion: 0.08, oversample: '2x' }).connect(ampEQ); // subtle tube-amp warmth, not fuzz

    pluckPool = [];
    pluckPoolLastTime = [];
    for (let i = 0; i < PLUCK_POOL_SIZE; i++) {
      pluckPool.push(new Tone.PluckSynth({ attackNoise: 1.4, dampening: 5000, resonance: 0.93 }).connect(ampInput));
      pluckPoolLastTime.push(0);
    }

    bassVoice = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', frequency: 300, rolloff: -12 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.8, baseFrequency: 300, octaves: 1 },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.5 }
    }).connect(Tone.getDestination()); // dry — reverb on bass builds mud

    chordVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.5, release: 0.6 }
    }).connect(Tone.getDestination()); // dry — rhythm-section backing, not the lead voice

    // Bends/vibrato need continuous pitch automation mid-note, which Tone.PluckSynth
    // can't do (its "frequency" only sets the Karplus-Strong delay length at trigger
    // time) — hence a separate oscillator-based voice. A resonant lowpass instead of
    // a narrow bandpass keeps this sounding like an amplified string, not a synth lead.
    bendVoice = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'lowpass', Q: 2, rolloff: -24 },
      filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.3, baseFrequency: 400, octaves: 3.5 },
      envelope: { attack: 0.008, decay: 0.12, sustain: 0.7, release: 0.4 }
    });
    vibratoFx = new Tone.Vibrato({ frequency: 5.5, depth: 0.15, wet: 0 });
    bendVoice.chain(vibratoFx, ampInput);

    toneReady = true;
  }
  return audioCtx;
}

// ── Note frequency table ──────────────────────────────────────────────────
// MIDI note -> Hz. Middle C (C4) = 261.63 Hz
function midiToHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// Note name to MIDI (octave 3-5 range for guitar)
const NOTE_MIDI_BASE = { C:48,  'C#':49, D:50, 'D#':51, E:52, F:53,
                         'F#':54, G:55, 'G#':56, A:57, 'A#':58, B:59 };
function noteToHz(noteName, octave=4) {
  const base = NOTE_MIDI_BASE[norm(noteName)];
  if (base == null) return 220;
  return midiToHz(base + (octave - 3) * 12);
}

// Guitar string open MIDI notes (standard tuning)
const STRING_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

function fretToHz(stringIdx, fret) {
  return midiToHz(STRING_MIDI[stringIdx] + fret);
}

// ── Synth voices ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// MIXER — master → bus → per-source level
// ═══════════════════════════════════════════════════════════════════════════
//
// Every trigger site used to read #vol-slider directly and apply its own
// ad-hoc multiplier (vol*0.6, vol*0.85, vol*0.9, bare vol…). Those numbers
// were tuned against the OLD synthesised engine and carried over unchanged
// when playback moved to real samples, which is why levels do not sit
// together — a sampled note and a Karplus-Strong pluck at "vol * 0.6" are not
// the same loudness.
//
// Three stages now:
//   master  — the existing #vol-slider, scales everything
//   bus     — click / instrument / backing, user-controllable in the mixer
//   source  — a fixed relative level per sound, normalised below
//
// Anything that makes noise should go through mixVol() so there is one place
// to reason about balance.

const MIX_LEVELS = {
  metronome:     0.70,   // click bus
  rhythmClick:   0.70,
  scaleRun:      0.75,   // instrument bus
  chordStrum:    0.65,
  listenRepeat:  0.75,
  riff:          0.75,
  song:          0.70,
  cameraTest:    0.70,
  backingBass:   0.45,   // backing bus
  backingChord:  0.35,
  backingPluck:  0.35,
  // Percussion sits low on purpose: the guitar you are playing must always be
  // the loudest thing in the room.
  drumKick:      0.28,   // ~37% of the instrument level
  drumSnare:     0.24,   // ~32%
  drumHihat:     0.16,   // ~21%, subdivisions should sit underneath
};

const MIX_BUS_OF = {
  metronome: 'click', rhythmClick: 'click',
  scaleRun: 'instrument', chordStrum: 'instrument', listenRepeat: 'instrument',
  riff: 'instrument', song: 'instrument', cameraTest: 'instrument',
  backingBass: 'backing', backingChord: 'backing', backingPluck: 'backing',
  drumKick: 'backing', drumSnare: 'backing', drumHihat: 'backing',
};

// All buses default to unity so the per-source levels above ARE the shipped
// balance — backing is already well under the instrument at the source stage
// (0.45/0.35 against 0.75), and discounting the bus as well would double-apply
// it and put the backing track quieter than intended.
const MIX_BUS_DEFAULTS = { click: 1.0, instrument: 1.0, backing: 1.0 };
let mixBusGain = { ...MIX_BUS_DEFAULTS };

function mixMaster() {
  const el = document.getElementById('vol-slider');
  const v = el ? parseInt(el.value, 10) : 60;
  return (isNaN(v) ? 60 : v) / 100;
}

// The single entry point for "how loud should this be".
function mixVol(sourceKey, scale) {
  const lvl = MIX_LEVELS[sourceKey];
  const bus = MIX_BUS_OF[sourceKey];
  if (lvl === undefined || bus === undefined) return mixMaster();
  return mixMaster() * (mixBusGain[bus] ?? 1) * lvl * (scale === undefined ? 1 : scale);
}

function loadMixerSettings() {
  if (typeof loadProgress !== 'function') return;
  const m = loadProgress().ui.mixer;
  // Always rebuild from defaults. Only assigning when a saved value exists
  // left whatever was already in memory in place, so clearing the setting did
  // not restore the shipped balance — and "Reset balance" inherited the same
  // bug when it re-read afterwards.
  mixBusGain = { ...MIX_BUS_DEFAULTS, ...(m || {}) };
  syncMixerUI();
}
function setBusGain(bus, value) {
  if (!(bus in mixBusGain)) return;
  mixBusGain[bus] = Math.max(0, Math.min(1.5, value));
  if (typeof loadProgress === 'function') {
    const d = loadProgress(); d.ui.mixer = { ...mixBusGain }; saveProgress(d);
  }
  syncMixerUI();
}
function resetMixer() {
  mixBusGain = { ...MIX_BUS_DEFAULTS };
  if (typeof loadProgress === 'function') {
    const d = loadProgress(); delete d.ui.mixer; saveProgress(d);
  }
  syncMixerUI();
}

function syncMixerUI() {
  Object.entries(mixBusGain).forEach(([bus, g]) => {
    const sl = document.getElementById(`mix-${bus}-slider`);
    const lb = document.getElementById(`mix-${bus}-val`);
    if (sl && parseInt(sl.value, 10) !== Math.round(g * 100)) {
      sl.value = String(Math.round(g * 100));
      sl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (lb) lb.textContent = Math.round(g * 100) + '%';
  });
}
function toggleMixerPanel() {
  const p = document.getElementById('mixer-panel');
  if (!p) return;
  const open = !p.classList.contains('open');
  p.classList.toggle('open', open);
  const chev = document.getElementById('mixer-chevron');
  if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
  if (open) syncMixerUI();
}

function playClick(time, isAccent, vol) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.connect(env); env.connect(ctx.destination);
  osc.frequency.value = isAccent ? 1200 : 800;
  osc.type = 'square';
  const v = vol * (isAccent ? 0.4 : 0.22);
  env.gain.setValueAtTime(v, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  osc.start(time); osc.stop(time + 0.04);
}

function playBass(time, freq, dur, vol) {
  getAudioCtx();
  bassVoice.triggerAttackRelease(freq / 2, dur * 0.8, time, Math.min(1, vol * 0.9));
}

function playChord(time, freqs, dur, vol, velocity) {
  getAudioCtx();
  const v = velocity == null ? 1 : velocity;
  freqs.forEach(freq => {
    chordVoice.triggerAttackRelease(freq, dur * 0.7, time, Math.min(1, vol * 0.35 * v));
  });
}

// ── Percussion voices (raw Web Audio — kept deliberately subtle so the guitar/
// bass are always the loudest thing in the mix) ────────────────────────────
let noiseBufferCache = null;
function getNoiseBuffer(ctx) {
  if (noiseBufferCache && noiseBufferCache.ctx === ctx) return noiseBufferCache.buffer;
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache = { ctx, buffer };
  return buffer;
}

function playKick(time, vol) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.connect(env); env.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.09);
  const v = vol * 0.26;
  env.gain.setValueAtTime(v, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
  osc.start(time); osc.stop(time + 0.18);
}

function playSnare(time, vol, ghost) {
  const ctx = getAudioCtx();
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
  const env = ctx.createGain();
  noise.connect(bp); bp.connect(env); env.connect(ctx.destination);
  const dur = ghost ? 0.035 : 0.09;
  const v = vol * (ghost ? 0.05 : 0.17);
  env.gain.setValueAtTime(v, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);
  noise.start(time); noise.stop(time + dur + 0.02);
  const osc = ctx.createOscillator();
  const oenv = ctx.createGain();
  osc.connect(oenv); oenv.connect(ctx.destination);
  osc.type = 'triangle'; osc.frequency.value = 180;
  oenv.gain.setValueAtTime(v * 0.45, time);
  oenv.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.6);
  osc.start(time); osc.stop(time + dur * 0.6 + 0.01);
}

function playHihat(time, vol) {
  const ctx = getAudioCtx();
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 7500;
  const env = ctx.createGain();
  noise.connect(hp); hp.connect(env); env.connect(ctx.destination);
  const dur = 0.035;
  const v = vol * 0.08;
  env.gain.setValueAtTime(v, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + dur);
  noise.start(time); noise.stop(time + dur + 0.02);
}

// ── Success micro-feedback (amber pulse + streak bounce + chime) ──────────
// Shared across Fretboard Quiz, Chord Game, Listen & Repeat, and Scale
// Run-Through so every "got it right" moment reads and sounds the same.
function playSuccessChime(vol) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  [880, 1108.73].forEach((f, i) => { // A5 + C#6 — a bright major-third "ding"
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = f;
    const t = now + i * 0.03;
    const v = (vol == null ? 0.5 : vol) * 0.18;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(v, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.start(t); osc.stop(t + 0.4);
  });
}

function pulseSuccess(el) {
  if (!el) return;
  el.classList.remove('success-pulse'); void el.offsetWidth; // restart if already animating
  el.classList.add('success-pulse');
  setTimeout(() => el.classList.remove('success-pulse'), 500);
}

// Spring bounce for streak counters — overshoots to 1.15 then settles, which
// reads as a reaction rather than a resize. Supersedes bounceStreak's linear
// scale for score moments; bounceStreak is kept for existing callers.
function springStreak(el) {
  if (!el) return;
  el.classList.remove('streak-spring'); void el.offsetWidth;
  el.classList.add('streak-spring');
  setTimeout(() => el.classList.remove('streak-spring'), 320);
}

// The counterpart to pulseSuccess — a brief red ring for a wrong answer.
function pulseError(el) {
  if (!el) return;
  el.classList.remove('error-pulse'); void el.offsetWidth;
  el.classList.add('error-pulse');
  setTimeout(() => el.classList.remove('error-pulse'), 460);
}

// A short dull thud: low triangle dropping in pitch with a fast decay. Kept
// deliberately unmusical and well below the guitar so a wrong answer registers
// without becoming a percussion hit competing with what you are playing.
function playErrorThud(vol) {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(58, t + 0.16);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t);
    const level = (vol === undefined ? (typeof mixVol === 'function' ? mixVol('metronome', 0.5) : 0.3) : vol);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.24);
  } catch (e) { /* audio unavailable — feedback is visual only */ }
}

function bounceStreak(el) {
  if (!el) return;
  el.classList.remove('streak-bounce'); void el.offsetWidth;
  el.classList.add('streak-bounce');
  setTimeout(() => el.classList.remove('streak-bounce'), 400);
}

// Real guitar strings aren't tonally uniform — the wound low E/A/D strings ring
// warm and dark with long sustain, the plain high G/B/e strings are brighter and
// decay faster. Frequency is a solid proxy for "which string" without needing to
// thread a string index through every call site (scale run, chords, riffs, songs
// all already differ mainly by pitch). Low notes -> darker/rounder, high notes ->
// brighter/twangier, mirroring how a real set of strings actually behaves.
function stringToneFor(freq) {
  const t = Math.min(1, Math.max(0, freq / 1300));
  return { dampening: 2200 + t * 4600, resonance: 0.95 - t * 0.05 }; // stays within PluckSynth's ~0-7000Hz range
}

function playPluck(time, freq, vol) {
  getAudioCtx();
  const i = pluckPoolIdx;
  pluckPoolIdx = (pluckPoolIdx + 1) % pluckPool.length;
  const v = pluckPool[i];
  // Each PluckSynth voice needs strictly increasing trigger times — guard against
  // reusing a voice at/before its last scheduled time (e.g. rapid chord-game skips).
  const safeTime = Math.max(time, pluckPoolLastTime[i] + 0.001);
  pluckPoolLastTime[i] = safeTime;
  const tone = stringToneFor(freq);
  v.dampening = tone.dampening;
  v.resonance = tone.resonance;
  v.volume.value = Tone.gainToDb(Math.max(0.001, Math.min(1, vol * 0.85)));
  v.triggerAttack(freq, safeTime);
}

// ── Riff bend/vibrato voices ────────────────────────────────────────────────
// semitones: how far the bend travels above the fretted pitch (e.g. 2 = whole step).
// Defaults to 2 (whole step) when a riff note doesn't specify bendTo.
function playBendNote(time, freq, dur, vol, semitones) {
  getAudioCtx();
  vibratoFx.wet.value = 0;
  bendVoice.filterEnvelope.baseFrequency = Math.max(200, freq * 1.5); // filter tracks pitch like a real amp's response
  const target = freq * Math.pow(2, (semitones == null ? 2 : semitones) / 12);
  bendVoice.triggerAttack(freq, time, Math.min(1, vol));
  bendVoice.frequency.setValueAtTime(freq, time);
  bendVoice.frequency.rampTo(target, Math.max(0.05, dur * 0.4), time);
  bendVoice.triggerRelease(time + dur);
}

function playVibratoNote(time, freq, dur, vol) {
  getAudioCtx();
  vibratoFx.wet.value = 1;
  bendVoice.filterEnvelope.baseFrequency = Math.max(200, freq * 1.5);
  bendVoice.triggerAttackRelease(freq, dur, time, Math.min(1, vol));
}

// ── Backing track chord maps ───────────────────────────────────────────────
function getVampChords(key, style) {
  const root = CHROMATIC.indexOf(norm(key));
  // Returns array of [{label, intervals relative to root}] for each vamp chord
  const r = n => CHROMATIC[(root + n) % 12];
  if (style === 'none') return [];
  if (style === 'drone') return [[{label: key, notes:[0,7,12]}]]; // root, 5th, octave
  if (style === 'blues') return [
    [{label:key,       notes:[0,4,7,10]}],
    [{label:key,       notes:[0,4,7,10]}],
    [{label:key,       notes:[0,4,7,10]}],
    [{label:key,       notes:[0,4,7,10]}],
    [{label:r(5),      notes:[5,9,12,15]}],
    [{label:r(5),      notes:[5,9,12,15]}],
    [{label:key,       notes:[0,4,7,10]}],
    [{label:key,       notes:[0,4,7,10]}],
    [{label:r(7),      notes:[7,11,14,17]}],
    [{label:r(5),      notes:[5,9,12,15]}],
    [{label:key,       notes:[0,4,7,10]}],
    [{label:key,       notes:[0,4,7,10]}],
  ];
  if (style === 'minor') return [
    [{label:key,   notes:[0,3,7]}],
    [{label:key,   notes:[0,3,7]}],
    [{label:r(10), notes:[10,14,17]}],
    [{label:r(10), notes:[10,14,17]}],
  ];
  if (style === 'mixo') return [
    [{label:key,   notes:[0,4,7]}],
    [{label:key,   notes:[0,4,7]}],
    [{label:r(10), notes:[10,14,17]}],
    [{label:r(10), notes:[10,14,17]}],
  ];
  if (style === 'zappa') return [
    [{label:key,   notes:[0,4,7]}],
    [{label:r(2),  notes:[2,6,9]}],
  ];
  if (style === 'knopfler') return [
    [{label:key,   notes:[0,4,7]}],
    [{label:r(5),  notes:[5,9,12]}],
    [{label:key,   notes:[0,4,7]}],
    [{label:r(7),  notes:[7,11,14]}],
  ];
  if (style === 'hazel') return [
    [{label:key,   notes:[0,3,7]}],
    [{label:r(5),  notes:[5,9,12]}],
  ];
  return [];
}

// ── Per-style rhythm patterns ────────────────────────────────────────────────
// Everything below returns sub-events for ONE quarter-note beat — offset is a
// fraction of that beat (0 = right on it, 0.5 = the straight 8th "and", 0.667 =
// the swung/triplet "and"). This layers real feel (swing, syncopation, ghost
// notes, walking bass, fingerpicked arpeggios) on top of the existing per-beat
// scheduler without needing a full step-sequencer rewrite. Percussion is a
// shared baseline (kick on 1, backbeat snare/rim, closed hihat) — kept subtle
// so the guitar/bass patterns below are always the loudest thing in the mix.
function getStyleBeatEvents(style, beatInBar, beats, chordRoot) {
  const events = [];
  if (style === 'none') return events;

  const fifth = chordRoot + 7;
  const third = chordRoot + 4;
  const minorThird = chordRoot + 3;
  const fourth = chordRoot + 5;
  const flat7 = chordRoot + 10;
  const octave = chordRoot + 12;
  const sixth = chordRoot + 9;

  // ── Percussion baseline ──────────────────────────────────────────────────
  // Kick on 1 AND 3 (it was only on 1), snare on the backbeat — beat 3 in 4/4
  // and up, beat 2 in 3/4 where there is no beat 3 to land on. Hi-hat keeps
  // the subdivision. Levels come from the mixer, where percussion sits at
  // 21-37% of the instrument so the guitar stays on top.
  const backbeatIdx = beats <= 3 ? 1 : 2;
  const kickBeats = beats >= 4 ? [0, 2] : [0];
  if (kickBeats.includes(beatInBar)) events.push({ offset: 0, type: 'kick' });
  if (beatInBar === backbeatIdx) events.push({ offset: 0, type: 'snare' });

  if (style === 'blues') {
    // ── Genuine triplet shuffle ──────────────────────────────────────────
    // Not straight eighths with a swing percentage: the hat plays the first
    // and THIRD triplet of each beat (0 and 2/3), which is what makes a
    // shuffle a shuffle. 0.667 is that third triplet exactly.
    events.push({ offset: 0, type: 'hihat' });
    events.push({ offset: 2 / 3, type: 'hihat', velocity: 0.7 });
    // Root/fifth alternation, deliberately clear: root lands on the odd beats
    // with full weight, fifth on the even ones slightly under it, so the
    // movement is audible rather than a uniform pulse.
    const onRoot = beatInBar % 2 === 0;
    events.push({ offset: 0, type: 'bass', note: onRoot ? chordRoot : fifth, velocity: onRoot ? 0.95 : 0.8 });
    // Comp chord pushed onto the swung third triplet — the shuffle push.
    events.push({ offset: 2 / 3, type: 'chord', notes: [third, fifth, flat7], velocity: 0.5 });

  } else if (style === 'minor') {
    // ── Chord stabs on the "and", walking bass between changes ───────────
    // The stab was at 0.58 — an approximation of "behind the beat" that is
    // neither on the beat nor on the and. It now lands exactly on the and
    // (0.5), which is real rhythmic displacement you can count.
    events.push({ offset: 0, type: 'hihat' });
    events.push({ offset: 0.5, type: 'hihat', velocity: 0.65 });
    const walk = [chordRoot, minorThird, fifth, flat7];
    events.push({ offset: 0, type: 'bass', note: walk[beatInBar % walk.length], velocity: 0.9 });
    // Two-note walking figure INTO the next chord: a passing tone on the and
    // of every beat, stepping toward wherever the bass goes next.
    const nextRoot = walk[(beatInBar + 1) % walk.length];
    const passing = nextRoot > walk[beatInBar % walk.length] ? nextRoot - 1 : nextRoot + 1;
    events.push({ offset: 0.5, type: 'bass', note: passing, velocity: 0.55 });
    events.push({ offset: 0.5, type: 'chord', notes: [minorThird, fifth, flat7], velocity: 0.62 });

  } else if (style === 'mixo') {
    events.push({ offset: 0, type: 'hihat' });
    events.push({ offset: 0.5, type: 'hihat', velocity: 0.7 });
    events.push({ offset: 0, type: 'bass', note: chordRoot, velocity: 0.9 });
    events.push({ offset: 0.5, type: 'bass', note: fifth, velocity: 0.7 });
    events.push({ offset: 0.5, type: 'chord', notes: [third, fifth], velocity: 0.5 });

  } else if (style === 'knopfler') {
    // ── Genuine fingerpicked arpeggio ────────────────────────────────────
    // Bass on 1, inner voices on 2 and 3, top note on 4 — each note fired
    // separately, which is the actual difference between fingerpicking and
    // strumming. The old version used beatInBar % 4, so in 7/8 or 3/4 the
    // pattern wrapped mid-figure and the shape was lost; it is now indexed
    // against the real bar length.
    // Climb low -> high, then fold back down instead of clamping. Clamping at
    // the top voice made 7/8 play the octave on beats 4,5,6,7 — a flat tail
    // rather than a moving figure. Folding keeps the picking pattern alive in
    // any meter, which is the whole point of indexing against the real bar.
    const voices = [chordRoot, third, fifth, octave, fifth, third];
    if (beatInBar === 0) {
      events.push({ offset: 0, type: 'bass', note: chordRoot, velocity: 0.9 });
    } else {
      events.push({ offset: 0, type: 'pluck', note: voices[beatInBar % voices.length], velocity: 0.6 });
    }
    // In-between eighths keep the picking hand moving rather than leaving a
    // gap between quarter notes.
    const between = [third, fifth, octave, fifth];
    events.push({ offset: 0.5, type: 'pluck', note: between[beatInBar % between.length], velocity: 0.34 });
    events.push({ offset: 0, type: 'hihat', velocity: 0.55 });

  } else if (style === 'hazel') {
    // ── Funkadelic two-chord Dorian vamp ─────────────────────────────────
    // Chord hits on the upbeats, bass on 1 and the "and of 3". Sixteenth hats
    // and a ghost bass note are what stop this reading as a metronome
    // exercise — the space between the hits is the groove.
    events.push({ offset: 0, type: 'hihat' });
    events.push({ offset: 0.5, type: 'hihat', velocity: 0.6 });
    events.push({ offset: 0.75, type: 'hihat', velocity: 0.4 });
    if (beatInBar === 0) events.push({ offset: 0, type: 'bass', note: chordRoot, velocity: 0.95 });
    if (beatInBar === 2) events.push({ offset: 0.5, type: 'bass', note: fifth, velocity: 0.85 });
    // Ghost note into the downbeat of the next bar.
    if (beatInBar === beats - 1) events.push({ offset: 0.75, type: 'bass', note: flat7, velocity: 0.4 });
    // Upbeat chord stabs, alternating the two Dorian voicings.
    const voicing = beatInBar % 2 === 0 ? [minorThird, fifth, flat7] : [fourth, sixth, octave];
    events.push({ offset: 0.5, type: 'chord', notes: voicing, velocity: beatInBar % 2 === 0 ? 0.6 : 0.45 });

  } else if (style === 'zappa') {
    events.push({ offset: 0, type: 'hihat' });
    events.push({ offset: 0.5, type: 'hihat', velocity: 0.6 });
    events.push({ offset: 0, type: 'bass', note: chordRoot, velocity: 0.9 });
    events.push({ offset: 0, type: 'chord', notes: [third, fifth], velocity: 0.6 });
    if ((beats === 7 || beats === 11) && beatInBar >= 4) {
      const frag = [fifth, sixth, flat7, chordRoot + 6, third];
      events.push({ offset: 0, type: 'pluck', note: frag[(beatInBar - 4) % frag.length], velocity: 0.6 });
    }

  } else if (style === 'drone') {
    if (beatInBar === 0) events.push({ offset: 0, type: 'bass', note: chordRoot, dur: beats, velocity: 0.9 });
    events.push({ offset: 0, type: 'hihat', velocity: 0.45 });
  }
  return events;
}

// ── Beat display ──────────────────────────────────────────────────────────
// Renders into every .beat-display on the page — the expanded metronome panel
// and the always-visible compact toolbar row. Beats are keyed by data-beat
// rather than by id, because ids must be unique and there are now two copies.
function buildBeatDisplay(beats) {
  document.querySelectorAll('.beat-display').forEach(bd => {
    bd.innerHTML = '';
    for (let i = 0; i < beats; i++) {
      const d = document.createElement('div');
      d.className = 'beat-dot' + (i === 0 ? ' accent' : '');
      d.dataset.beat = i;
      bd.appendChild(d);
    }
  });
}

let lastLitBeat = -1;
function lightBeat(b, beats) {
  if (lastLitBeat >= 0) {
    document.querySelectorAll(`.beat-dot[data-beat="${lastLitBeat}"]`)
      .forEach(d => d.classList.remove('active'));
  }
  document.querySelectorAll(`.beat-dot[data-beat="${b % beats}"]`)
    .forEach(d => d.classList.add('active'));
  lastLitBeat = b % beats;
}

// ── Metronome scheduler ───────────────────────────────────────────────────
const LOOK_AHEAD = 0.1; // seconds
const SCHEDULE_INTERVAL = 25; // ms

function scheduleMetro() {
  const ctx = getAudioCtx();
  const bpm = parseInt(document.getElementById('bpm-slider').value);
  const beats = parseInt(document.getElementById('time-sig').value);
  const vol = parseInt(document.getElementById('vol-slider').value) / 100;
  const style = document.getElementById('vamp-style').value;
  const chords = getVampChords(state.key, style);
  const beatDur = 60 / bpm;

  const root = CHROMATIC.indexOf(norm(state.key));
  const baseHz = midiToHz(36 + root); // low bass register
  const bassHz = semitones => baseHz * Math.pow(2, semitones / 12);
  const chordToneHz = semitones => midiToHz(48 + root + semitones);

  while (metroNextTime < ctx.currentTime + LOOK_AHEAD) {
    const isAccent = (metroBeat % beats) === 0;
    const beatInBar = metroBeat % beats;
    const t = metroNextTime;

    // Click
    playClick(t, isAccent, mixVol('metronome'));

    if (chords.length > 0) {
      const patLen = chords.length;
      const patBeat = metroBeat % (patLen * beats);
      const barIdx = Math.floor(patBeat / beats);
      const chord = chords[barIdx % chords.length][0];
      // Publish the chord so the harmony overlay can recolour the neck in
      // time with the backing track. Guarded by its own enabled flag, and a
      // repeat of the same chord is a no-op, so this costs nothing when off.
      //
      // harmonyRecordChord is deliberately NOT behind that flag: it timestamps
      // the chord onto the AudioContext clock so lick capture and the
      // chord-tone trainer can ask "what was sounding when I played that note"
      // per note, long after the fact. The overlay being off is a display
      // choice and shouldn't erase the harmonic context.
      if (beatInBar === 0 && typeof harmonyChordFromVamp === 'function') {
        const vampChord = harmonyChordFromVamp(state.key, chord);
        if (typeof harmonyRecordChord === 'function') harmonyRecordChord(vampChord, t);
        if (typeof harmonySetChord === 'function') harmonySetChord(vampChord);
      }

      if (chord) {
        const chordRoot = chord.notes[0];
        const subEvents = getStyleBeatEvents(style, beatInBar, beats, chordRoot);
        subEvents.forEach(ev => {
          const evTime = t + ev.offset * beatDur;
          const evVel = ev.velocity == null ? 1 : ev.velocity;
          if (ev.type === 'kick') playKick(evTime, mixVol('drumKick'));
          else if (ev.type === 'snare') playSnare(evTime, mixVol('drumSnare'), false);
          else if (ev.type === 'hihat') playHihat(evTime, mixVol('drumHihat'));
          else if (ev.type === 'bass') {
            const durBeats = ev.dur || (1 - ev.offset);
            playBass(evTime, bassHz(ev.note), beatDur * durBeats * 0.9, mixVol('backingBass', evVel));
          } else if (ev.type === 'pluck') {
            const durBeats = ev.dur || (1 - ev.offset);
            playChord(evTime, [chordToneHz(ev.note)], beatDur * durBeats * 0.85, mixVol('backingPluck'), evVel);
          } else if (ev.type === 'chord') {
            const durBeats = ev.dur || (1 - ev.offset);
            playChord(evTime, ev.notes.map(chordToneHz), beatDur * durBeats * 0.85, mixVol('backingChord'), evVel);
          } else if (ev.type === 'ghost-chord') {
            // A quiet, short pre-echo of the chord stab that follows — the
            // "ghost note" feel, not a drum hit.
            playChord(evTime, ev.notes.map(chordToneHz), beatDur * 0.18, mixVol('backingChord'), 0.18);
          }
        });

        if (isAccent) {
          const beatTime = (metroNextTime - ctx.currentTime) * 1000;
          setTimeout(() => {
            document.getElementById('chord-display').textContent = chord.label;
          }, Math.max(0, beatTime));
        }
      }
    }

    // Visual beat light
    const b = metroBeat;
    const beatTime = (metroNextTime - ctx.currentTime) * 1000;
    setTimeout(() => lightBeat(b, beats), Math.max(0, beatTime));

    metroNextTime += beatDur;
    metroBeat++;
  }
}

function toggleMetronome() {
  const btn = document.getElementById('metro-btn');
  const compactBtn = document.getElementById('compact-play-btn');
  if (metroRunning) {
    clearInterval(metroScheduler);
    metroRunning = false;
    metroBeat = 0;
    btn.textContent = '▶ START';
    btn.classList.remove('running');
    if (compactBtn) compactBtn.classList.remove('running');
    document.getElementById('chord-display').textContent = '';
    // Clear beat dots
    document.querySelectorAll('.beat-dot').forEach(d=>d.classList.remove('active'));
    stopScaleTimer();
  } else {
    const ctx = getAudioCtx();
    const beats = parseInt(document.getElementById('time-sig').value);
    buildBeatDisplay(beats);
    metroNextTime = ctx.currentTime + 0.05;
    metroBeat = 0;
    metroRunning = true;
    btn.textContent = '■ STOP';
    btn.classList.add('running');
    if (compactBtn) compactBtn.classList.add('running');
    startScaleTimer();
    scheduleMetro();
    metroScheduler = setInterval(scheduleMetro, SCHEDULE_INTERVAL);
  }
}

// Rebuild beat display when time sig changes
document.getElementById('time-sig').addEventListener('change', () => {
  if (metroRunning) {
    clearInterval(metroScheduler);
    metroRunning = false;
    document.getElementById('metro-btn').textContent='▶ START';
    document.getElementById('metro-btn').classList.remove('running');
    document.getElementById('chord-display').textContent='';
  }
  buildBeatDisplay(parseInt(document.getElementById('time-sig').value));
});

// ── Scale Run-Through ─────────────────────────────────────────────────────
function buildRunSequence() {
  const sc = currentScale();
  const boxNotes = getBoxNotes(state.key, sc.intervals, state.pos);
  // Sort by string (low to high = string 0 to 5) then fret
  const stringOrder = [0,1,2,3,4,5]; // low E first = ascending pitch generally
  let ordered = [];
  for (let si of stringOrder) {
    const sn = boxNotes.filter(n=>n.string===si).sort((a,b)=>a.fret-b.fret);
    ordered = ordered.concat(sn);
  }
  const dir = document.getElementById('run-dir').value;
  if (dir === 'up') return ordered;
  if (dir === 'down') return [...ordered].reverse();
  if (dir === 'updown') return [...ordered, ...[...ordered].reverse()];
  if (dir === 'random') {
    const s = [...ordered];
    for (let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}
    return s;
  }
  return ordered;
}

function getDotEl(stringIdx, fret) {
  // Find the fret-cell for this string/fret combination
  const stringOrder = [5,4,3,2,1,0]; // visual order (high e on top)
  const rowIdx = stringOrder.indexOf(stringIdx);
  const rows = document.querySelectorAll('.string-row');
  if (!rows[rowIdx]) return null;
  const cells = rows[rowIdx].querySelectorAll('.fret-cell');
  if (!cells[fret]) return null;
  return cells[fret].querySelector('.note-dot');
}

let lastHighlightEl = null;

function highlightDot(el) {
  if (lastHighlightEl) lastHighlightEl.classList.remove('run-highlight');
  if (el) {
    el.classList.add('run-highlight');
    // Restart the pop each time so consecutive notes each register.
    el.classList.remove('note-pop'); void el.offsetWidth; el.classList.add('note-pop');
    lastHighlightEl = el;
  }
}

function playRunNote(note) {
  const instrument = document.getElementById('run-instrument').value;
  const vol = parseInt(document.getElementById('vol-slider').value) / 100;
  if (instrument === 'muted') return;
  const ctx = getAudioCtx();
  const freq = fretToHz(note.string, note.fret);
  const speed = parseInt(document.getElementById('run-speed').value);
  const dur = Math.max(0.08, (speed / 1000) * 0.92); // ring until just before the next note
  playSampledNote(instrument, ctx.currentTime, freq, dur, mixVol('scaleRun'), { stringIdx: note.string });
}

// Preload as soon as an instrument is picked so RUN SCALE doesn't stall on first press.
function runSetInstrument(key) {
  setCurrentInstrument(key);
  if (key !== 'muted') ensureInstrumentReady(key);
}

function runStep() {
  if (!runRunning || runIdx >= runNotes.length) {
    if (runRunning && runIdx >= runNotes.length) {
      stopRun(true);
    }
    return;
  }
  const note = runNotes[runIdx];
  const el = getDotEl(note.string, note.fret);
  highlightDot(el);
  playRunNote(note);

  const sc = currentScale();
  const scaleNotes = getScaleNotes(state.key, sc.intervals);
  document.getElementById('run-display').textContent =
    `Note ${runIdx+1}/${runNotes.length}  →  ${note.note}  (order ${note.order} in scale)  fret ${note.fret} str ${STRING_LABELS[note.string]}`;

  runIdx++;
  const speed = parseInt(document.getElementById('run-speed').value);
  runTimeout = setTimeout(runStep, speed);
}

function stopRun(completed) {
  runRunning = false;
  clearTimeout(runTimeout);
  if (lastHighlightEl) { lastHighlightEl.classList.remove('run-highlight'); lastHighlightEl = null; }
  const btn = document.getElementById('run-btn');
  btn.textContent = '▶ RUN SCALE';
  btn.classList.remove('running');
  document.getElementById('run-display').textContent = 'Run complete. Press again to repeat.';
  stopScaleTimer();
  if (completed) {
    if (typeof pulseSuccess === 'function') pulseSuccess(document.getElementById('run-display'));
    if (typeof playSuccessChime === 'function') playSuccessChime();
  }
}

async function toggleRun() {
  const btn = document.getElementById('run-btn');
  if (runRunning) {
    stopRun();
    document.getElementById('run-display').textContent = 'Stopped.';
  } else {
    getAudioCtx();
    runNotes = buildRunSequence();
    if (!runNotes.length) {
      document.getElementById('run-display').textContent = 'No notes in current position. Try a different key or position.';
      return;
    }
    const instrument = document.getElementById('run-instrument').value;
    if (instrument !== 'muted') {
      btn.disabled = true;
      btn.textContent = '… loading';
      await ensureInstrumentReady(instrument);
      btn.disabled = false;
    }
    runRunning = true;
    runIdx = 0;
    btn.textContent = '■ STOP';
    btn.classList.add('running');
    startScaleTimer();
    if (typeof recordScalePracticed === 'function') recordScalePracticed(currentScale().name);
    runStep();
  }
}

// Re-build run when scale/pos changes
const _origRender = render;
// Patch: stop run on state change
function patchedRender() {
  if (runRunning) stopRun();
  _origRender();
}
// Override the render function calls from buttons to use patched version
// Actually just stop run on key/pos/scale changes by hooking into existing flow:
document.getElementById('pos-btns') && document.addEventListener('click', e => {
  if (e.target.dataset.group === 'pos' || e.target.dataset.group === 'key') {
    if (runRunning) stopRun();
  }
});

// Init beat display
buildBeatDisplay(4);

// ═══════════════════════════════════════════════════════════════════════════
// LIVE NOTE MATCHING (Scales mode) — mic.js's onMicOnset() feeds this. Active
// whenever the mic is on and Scales is the visible mode: colors the nearest
// dot in the current scale-position box green (in tune, within
// TUNING_TOLERANCE_CENTS)/amber (right note, out of tune), or flashes the
// fretboard red when nothing in the box is close to the pitch heard — a
// monophonic detector can only report a pitch, not which string was played,
// so "nearest dot in the box you're currently looking at" is the practical
// stand-in for "which dot you just played."
// ═══════════════════════════════════════════════════════════════════════════
function scalesModeIsActive() {
  const panel = document.getElementById('mode-panel-scales');
  return !!(panel && panel.classList.contains('active'));
}

function scalesHandleMicOnset(evt) {
  // React to the fast "early" pitch-only firing (~30-90ms after the attack),
  // not the full-envelope one 450ms later — mic.js fires both per note.
  // Waiting for the late one made every match land 2-3 notes behind on any
  // real-tempo scale run, which read as "wrong note" even when the eventual
  // pitch reading would have been correct.
  if (!evt.early || !scalesModeIsActive() || evt.freq == null) return;
  const sc = currentScale();
  const boxNotes = getBoxNotes(state.key, sc.intervals, state.pos);
  let best = null, bestCents = Infinity;
  boxNotes.forEach(n => {
    const cents = Math.abs(1200 * Math.log2(evt.freq / fretToHz(n.string, n.fret)));
    if (cents < bestCents) { bestCents = cents; best = n; }
  });

  const statusEl = document.getElementById('mic-scale-match-status');
  if (!best || bestCents > 60) {
    if (statusEl) { statusEl.textContent = `Heard ${evt.noteName} — not in the current position`; statusEl.className = 'mic-scale-match-status wrong'; }
    const fb = document.getElementById('fretboard');
    if (fb) { fb.classList.add('mic-wrong-flash'); setTimeout(() => fb.classList.remove('mic-wrong-flash'), 400); }
    return;
  }

  const exactCents = Math.round(1200 * Math.log2(evt.freq / fretToHz(best.string, best.fret)));
  const inTune = Math.abs(exactCents) <= TUNING_TOLERANCE_CENTS;
  const dot = getDotEl(best.string, best.fret);
  if (dot) {
    dot.classList.remove('quiz-correct', 'quiz-close');
    dot.classList.add(inTune ? 'quiz-correct' : 'quiz-close');
    clearTimeout(dot._micMatchTimer);
    dot._micMatchTimer = setTimeout(() => dot.classList.remove('quiz-correct', 'quiz-close'), 900);
  }
  if (statusEl) {
    statusEl.textContent = inTune ? `✓ ${best.note} — in tune` : `${best.note} — ${exactCents > 0 ? 'sharp' : 'flat'} by ${Math.abs(exactCents)}¢`;
    statusEl.className = 'mic-scale-match-status ' + (inTune ? 'correct' : 'close');
  }
  reportScaleFingerMatch(best, boxNotes);
}
onMicOnset(scalesHandleMicOnset);

// ── Camera finger-vs-recommended-fingering (js/camera.js) ──────────────────
// Camera frames (~30-60fps) and mic onsets are separate async streams — we
// cache the latest hand-curl reading here and consult it whenever the mic
// confirms a note, rather than trying to timestamp-match the two streams.
let lastHandCurls = null;
function scalesHandleHandUpdate(hand) {
  if (!scalesModeIsActive()) return;
  lastHandCurls = hand.present ? analyzeHandCurl(hand) : null;
}

function activeHandFingerNumber(curls) {
  if (!curls) return null;
  const order = ['index', 'middle', 'ring', 'pinky'];
  let best = null, bestVal = CURL_THRESHOLD;
  order.forEach((name, i) => { if (curls[name] > bestVal) { bestVal = curls[name]; best = i + 1; } });
  return best;
}

function reportScaleFingerMatch(best, boxNotes) {
  const el = document.getElementById('camera-scale-feedback');
  if (!el || !lastHandCurls) return;
  const seenFinger = activeHandFingerNumber(lastHandCurls);
  const recommendedFinger = assignFingers(boxNotes)[`${best.string}-${best.fret}`];
  if (!seenFinger) el.textContent = 'Camera: no finger clearly fretting — check hand position.';
  else if (!recommendedFinger) el.textContent = `Camera: finger ${seenFinger} playing — this note is usually open (no fretting finger recommended).`;
  else if (seenFinger === recommendedFinger) el.textContent = `Camera: ✓ finger ${seenFinger} matches the recommended fingering.`;
  else el.textContent = `Camera: finger ${seenFinger} detected, but finger ${recommendedFinger} is recommended for this note.`;
}

// ── Metronome bar collapse (persistent across all modes) ──────────────────
function applyMetronomeBarCollapsedState(collapsed) {
  const body = document.getElementById('metronome-bar-body');
  const chevron = document.getElementById('metronome-bar-chevron');
  // .collapsible animates max-height; display:none snapped.
  if (body) { body.classList.add('collapsible'); body.classList.toggle('collapsed', !!collapsed); }
  if (chevron) chevron.textContent = collapsed ? '▸' : '▾';
}

function toggleMetronomeBar() {
  const data = loadProgress();
  data.ui.metronomeCollapsed = !data.ui.metronomeCollapsed;
  saveProgress(data);
  applyMetronomeBarCollapsedState(data.ui.metronomeCollapsed);
}

// ── Compact toolbar (BPM/play/mic) ─────────────────────────────────────────
let compactTapTimes = [];
let compactTapResetTimer = null;

function syncCompactBpm(value) {
  const el = document.getElementById('compact-bpm-value');
  if (el && document.activeElement !== el) el.textContent = value;
}

function compactBpmEdited(el) {
  const slider = document.getElementById('bpm-slider');
  if (!slider) return;
  let bpm = parseInt(el.textContent, 10);
  if (isNaN(bpm)) bpm = parseInt(slider.value, 10);
  bpm = Math.min(parseInt(slider.max, 10), Math.max(parseInt(slider.min, 10), bpm));
  slider.value = bpm;
  el.textContent = bpm;
  const v = document.getElementById('bpm-val');
  if (v) v.textContent = bpm;
}

function compactTapTempo() {
  const now = Date.now();
  compactTapTimes.push(now);
  if (compactTapTimes.length > 5) compactTapTimes.shift();
  clearTimeout(compactTapResetTimer);
  compactTapResetTimer = setTimeout(() => { compactTapTimes = []; }, 2000);
  if (compactTapTimes.length < 2) return;
  const intervals = [];
  for (let i = 1; i < compactTapTimes.length; i++) intervals.push(compactTapTimes[i] - compactTapTimes[i - 1]);
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60000 / avgMs);
  const slider = document.getElementById('bpm-slider');
  if (!slider) return;
  const clamped = Math.min(parseInt(slider.max, 10), Math.max(parseInt(slider.min, 10), bpm));
  slider.value = clamped;
  const v = document.getElementById('bpm-val');
  if (v) v.textContent = clamped;
  syncCompactBpm(clamped);
}

function applyCompactExpandedState(expanded) {
  const body = document.getElementById('compact-expanded');
  const chevron = document.getElementById('compact-chevron');
  if (body) body.classList.toggle('open', !!expanded);
  if (chevron) chevron.textContent = expanded ? '▴' : '▾';
}

function toggleComboExpanded() {
  const data = loadProgress();
  data.ui.compactExpanded = !data.ui.compactExpanded;
  saveProgress(data);
  applyCompactExpandedState(data.ui.compactExpanded);
}

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE-BASED GUITAR ENGINE — Real recorded guitar/bass notes
// (gleitz/midi-js-soundfonts, MIT-licensed, CDN-hosted) instead of Tone.js
// synthesis. Powers Scale Run-Through, Riffs, and Songs (audio.js/riffs.js/
// songs.js are the callers). Chords, the Chord Game, and Listen & Repeat still
// use the Tone.js voices above — see the comment on those voices for why.
//
// Each instrument file is one JS blob mapping note names ("C4", "A#2", ...)
// to base64 data-URI mp3 samples. We load an instrument's file only when it's
// actually selected (on-demand, not upfront), decode every sample it contains
// once, then play any requested pitch by picking the nearest recorded note
// and correcting pitch with playbackRate — the same technique soundfont-player
// and WebAudioFont use. Tempo (Tone.Transport bpm, or a mode's own speed
// control) only changes *when* a note fires, never playbackRate, so pitch
// stays correct at every speed.
//
// ── MIDI readiness ──────────────────────────────────────────────────────
// playSampledNote(instrumentKey, time, freq, dur, vol, opts) below is already
// the single entry point every mode calls to sound a note — a future Web MIDI
// `onmidimessage` handler only needs to translate a note-on event into this
// same call, e.g.:
//   const freq = midiToHz(midiNote);
//   playSampledNote(currentInstrument(), getAudioCtx().currentTime, freq, 1.5,
//     velocity / 127, { stringIdx: midiNote }); // MIDI note # doubles as the choke key
// Note-off should call stopRingingString(midiNote, getAudioCtx().currentTime).
// No changes to the engine itself are needed — see CLAUDE.md "Audio Architecture".
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLE_INSTRUMENTS = {
  clean: 'electric_guitar_clean',
  crunch: 'overdriven_guitar',
  acoustic: 'acoustic_guitar_steel',
  bass: 'electric_bass_finger',
};
const SAMPLE_INSTRUMENT_LABELS = { clean: 'Clean Electric', crunch: 'Crunch Electric', acoustic: 'Acoustic', bass: 'Bass' };

// ── App-wide instrument voice ──────────────────────────────────────────────
// Every sampled-playback surface reads this, so choosing "Acoustic" in Scales
// also changes how the Chords strum and the Chord Game sound. Previously each
// surface had its own selector (or a hardcoded voice), which is half of why
// the app sounded like two different instruments depending on which mode you
// were in. Persisted per profile in ui.instrument.
function currentInstrument() {
  try {
    if (typeof loadProgress === 'function') {
      const v = loadProgress().ui.instrument;
      if (v && SAMPLE_INSTRUMENT_LABELS[v]) return v;
    }
  } catch (e) {}
  return 'clean';
}
// Called once at startup so every selector on the page shows the persisted
// voice rather than whatever its markup happened to mark as selected.
function syncInstrumentSelectors() {
  const cur = currentInstrument();
  document.querySelectorAll('#run-instrument, #riff-instrument-select, .instrument-select')
    .forEach(sel => { sel.value = cur; });
}

function setCurrentInstrument(key) {
  if (!SAMPLE_INSTRUMENT_LABELS[key]) return;
  if (typeof loadProgress === 'function') {
    const d = loadProgress(); d.ui.instrument = key; saveProgress(d);
  }
  if (typeof ensureInstrumentReady === 'function') ensureInstrumentReady(key);
  // Keep every on-screen selector in agreement.
  document.querySelectorAll('#run-instrument, #riff-instrument-select, .instrument-select')
    .forEach(sel => { if (sel.value !== key) sel.value = key; });
}
const SOUNDFONT_BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const SAMPLE_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let sampleEngineReady = false;
let sampleAmpBus, sampleDryBus, sampleRoomGain;
const instrumentEntriesReady = {}; // instrumentKey -> [{midi, buf}] once fully loaded+decoded
const instrumentLoadPromises = {}; // instrumentKey -> in-flight/resolved Promise
const ringingByString = {}; // stringIdx (or 'bass') -> {source, gainNode} — for note-choking
let sampleLoadListeners = [];

function onSampleLoadingChange(fn) { sampleLoadListeners.push(fn); }
function notifySampleLoading(isLoading, label) { sampleLoadListeners.forEach(fn => fn(isLoading, label)); }

function ensureSampleEngine() {
  const ctx = getAudioCtx();
  if (sampleEngineReady) return ctx;
  // Synthetic impulse response — a real IR file would need a fetch of its own;
  // exponentially-decaying noise through a ConvolverNode is a standard,
  // dependency-free way to get a plausible room reverb.
  const irLength = Math.floor(ctx.sampleRate * 1.6);
  const impulse = ctx.createBuffer(2, irLength, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < irLength; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2.2);
  }
  const roomConvolver = ctx.createConvolver();
  roomConvolver.buffer = impulse;

  const roomDelay = ctx.createDelay(1.0);
  roomDelay.delayTime.value = 0.11;
  const roomFeedback = ctx.createGain();
  roomFeedback.gain.value = 0.16;
  roomDelay.connect(roomFeedback);
  roomFeedback.connect(roomDelay);

  sampleRoomGain = ctx.createGain();
  sampleRoomGain.gain.value = 0.25; // overwritten immediately by the Room slider's initial value

  sampleAmpBus = ctx.createGain(); // electric guitars connect here — gets the room send
  sampleDryBus = ctx.createGain(); // acoustic/bass connect here — stays tight/dry

  sampleAmpBus.connect(ctx.destination);
  sampleAmpBus.connect(roomConvolver);
  sampleAmpBus.connect(roomDelay);
  roomConvolver.connect(sampleRoomGain);
  roomDelay.connect(sampleRoomGain);
  sampleRoomGain.connect(ctx.destination);

  sampleDryBus.connect(ctx.destination);

  sampleEngineReady = true;
  return ctx;
}

function setSampleRoomAmount(amount) {
  ensureSampleEngine();
  if (sampleRoomGain) sampleRoomGain.gain.value = Math.max(0, Math.min(1, amount));
}

function sampleNameToMidi(name) {
  const m = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!m) return null;
  const idx = SAMPLE_NOTE_NAMES.indexOf(m[1]);
  if (idx < 0) return null;
  return (parseInt(m[2], 10) + 1) * 12 + idx;
}

function fetchSoundfontTable(gmName) {
  return new Promise((resolve, reject) => {
    window.MIDI = window.MIDI || {};
    window.MIDI.Soundfont = window.MIDI.Soundfont || {};
    if (window.MIDI.Soundfont[gmName]) { resolve(window.MIDI.Soundfont[gmName]); return; }
    const script = document.createElement('script');
    script.src = SOUNDFONT_BASE + gmName + '-mp3.js';
    script.onload = () => {
      const table = window.MIDI.Soundfont[gmName];
      if (table) resolve(table); else reject(new Error('Soundfont script loaded but did not define ' + gmName));
    };
    script.onerror = () => reject(new Error('Failed to load soundfont: ' + gmName));
    document.head.appendChild(script);
  });
}

async function decodeDataUri(ctx, dataUri) {
  const res = await fetch(dataUri);
  const arrBuf = await res.arrayBuffer();
  return ctx.decodeAudioData(arrBuf);
}

// Resolves once the instrument's full note set is fetched *and* decoded —
// after that, playSampledNote() below is 100% synchronous, so Tone.Part's
// precisely-scheduled callback never has to wait on network/decode mid-song.
function ensureInstrumentReady(instrumentKey) {
  if (instrumentLoadPromises[instrumentKey]) return instrumentLoadPromises[instrumentKey];
  const gmName = SAMPLE_INSTRUMENTS[instrumentKey];
  if (!gmName) return Promise.resolve([]);
  const ctx = ensureSampleEngine();
  notifySampleLoading(true, SAMPLE_INSTRUMENT_LABELS[instrumentKey] || gmName);
  instrumentLoadPromises[instrumentKey] = (async () => {
    const table = await fetchSoundfontTable(gmName);
    const entries = [];
    for (const noteName of Object.keys(table)) {
      const midi = sampleNameToMidi(noteName);
      if (midi == null) continue;
      try {
        const buf = await decodeDataUri(ctx, table[noteName]);
        entries.push({ midi, buf });
      } catch (e) { /* skip a single bad sample rather than failing the whole instrument */ }
    }
    entries.sort((a, b) => a.midi - b.midi);
    instrumentEntriesReady[instrumentKey] = entries;
    notifySampleLoading(false);
    return entries;
  })();
  return instrumentLoadPromises[instrumentKey];
}

function nearestSampleEntry(entries, targetMidi) {
  let best = null, bestDist = Infinity;
  for (const e of entries) {
    const dist = Math.abs(e.midi - targetMidi);
    if (dist < bestDist) { bestDist = dist; best = e; }
  }
  return best;
}

function stopAllRingingSamples() {
  const now = ensureSampleEngine().currentTime;
  Object.keys(ringingByString).forEach(key => stopRingingString(key, now, true));
}

function stopRingingString(stringKey, atTime, fast) {
  const cur = ringingByString[stringKey];
  if (!cur) return;
  const release = fast ? 0.035 : 0.06;
  try {
    cur.gainNode.gain.cancelScheduledValues(atTime);
    cur.gainNode.gain.setValueAtTime(Math.max(0.0001, cur.gainNode.gain.value), atTime);
    cur.gainNode.gain.linearRampToValueAtTime(0.0001, atTime + release);
    cur.source.stop(atTime + release + 0.02);
  } catch (e) { /* source may have already finished naturally — nothing to stop */ }
  delete ringingByString[stringKey];
}

// opts: { technique, bendTo, fromFreq, stringIdx }
// technique: 'bend' | 'vibrato' | 'slide' | 'hammer' | 'pulloff' | 'mute' | 'harmonic'
function playSampledNote(instrumentKey, time, freq, dur, vol, opts) {
  opts = opts || {};
  const entries = instrumentEntriesReady[instrumentKey];
  if (!entries || !entries.length) return; // not loaded yet — caller should have awaited ensureInstrumentReady()
  const ctx = ensureSampleEngine();
  const targetMidi = 69 + 12 * Math.log2(freq / 440);
  const nearest = nearestSampleEntry(entries, Math.round(targetMidi));
  if (!nearest) return;
  const baseRate = Math.pow(2, (targetMidi - nearest.midi) / 12);

  const source = ctx.createBufferSource();
  source.buffer = nearest.buf;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 16000; // effectively neutral unless a technique below narrows it
  const gainNode = ctx.createGain();

  const technique = opts.technique;
  let attack = 0.004;
  let ringDur = Math.min(dur, Math.max(0.05, nearest.buf.duration - 0.03));
  let peakVol = vol;

  if (technique === 'hammer' || technique === 'pulloff') attack = 0.028; // legato — no pick transient
  if (technique === 'mute') { tone.frequency.value = 1700; ringDur = Math.min(ringDur, 0.15); }
  if (technique === 'harmonic') {
    tone.type = 'highpass'; tone.frequency.value = 350;
    ringDur = Math.min(dur * 1.35, Math.max(0.05, nearest.buf.duration - 0.03));
    peakVol = vol * 1.05;
  }

  source.playbackRate.setValueAtTime(baseRate, time);
  if (technique === 'bend') {
    const semis = opts.bendTo == null ? 2 : opts.bendTo;
    source.playbackRate.linearRampToValueAtTime(baseRate * Math.pow(2, semis / 12), time + Math.max(0.08, dur * 0.5));
  } else if (technique === 'slide' && opts.fromFreq) {
    const fromMidi = 69 + 12 * Math.log2(opts.fromFreq / 440);
    const fromRate = Math.pow(2, (fromMidi - nearest.midi) / 12);
    source.playbackRate.setValueAtTime(fromRate, time);
    source.playbackRate.linearRampToValueAtTime(baseRate, time + Math.min(0.16, Math.max(0.05, dur * 0.6)));
  }

  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, peakVol), time + attack);
  const releaseStart = time + Math.max(attack + 0.02, ringDur);
  gainNode.gain.setValueAtTime(Math.max(0.001, peakVol), releaseStart);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseStart + 0.22);

  source.connect(tone);
  tone.connect(gainNode);
  gainNode.connect(instrumentKey === 'clean' || instrumentKey === 'crunch' ? sampleAmpBus : sampleDryBus);

  if (technique === 'vibrato') {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5.5;
    lfoGain.gain.value = 25; // cents
    lfo.connect(lfoGain);
    lfoGain.connect(source.detune);
    lfo.start(time + 0.08);
    lfo.stop(time + dur + 0.3);
  }

  // Fretting-hand choke: a new note on the same string mutes whatever was ringing there.
  if (opts.stringIdx != null) {
    stopRingingString(opts.stringIdx, time, technique === 'mute');
    ringingByString[opts.stringIdx] = { source, gainNode };
  }

  source.start(time);
  source.stop(time + Math.max(ringDur, dur) + 0.45);
}
