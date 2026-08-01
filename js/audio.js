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

// ── Tone.js voices (guitar-quality synthesis) ──────────────────────────────
// pluckVoice: real Karplus-Strong plucked string (scale run, chord strum, chord vamp)
// bassVoice: filtered sawtooth bass for the metronome backing track
// chordVoice: triangle pad for backing-track chord stabs
// bendVoice + vibratoFx: pitch-automatable voice for riff bends/vibrato (see riffs.js)
let toneReady = false;
let bassVoice, chordVoice, bendVoice, vibratoFx, reverbBus;
// Tone.PluckSynth doesn't extend Monophonic, so Tone.PolySynth can't wrap it —
// a small hand-rolled voice pool gives it polyphony (needed for strummed chords).
const PLUCK_POOL_SIZE = 8;
let pluckPool = [];
let pluckPoolIdx = 0;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!toneReady) {
    Tone.setContext(audioCtx);
    Tone.start();

    reverbBus = new Tone.Freeverb({ roomSize: 0.6, dampening: 4000 }).toDestination();
    reverbBus.wet.value = 0.13; // slight room tone, not washy — keeps fast runs legible

    pluckPool = [];
    for (let i = 0; i < PLUCK_POOL_SIZE; i++) {
      pluckPool.push(new Tone.PluckSynth({ attackNoise: 1, dampening: 6000, resonance: 0.92 }).connect(reverbBus));
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

    bendVoice = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { type: 'bandpass', Q: 10 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3, baseFrequency: 800, octaves: 2 },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.4 }
    });
    vibratoFx = new Tone.Vibrato({ frequency: 5.5, depth: 0.15, wet: 0 });
    bendVoice.chain(vibratoFx, reverbBus);

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

function playChord(time, freqs, dur, vol) {
  getAudioCtx();
  freqs.forEach(freq => {
    chordVoice.triggerAttackRelease(freq, dur * 0.7, time, Math.min(1, vol * 0.35));
  });
}

function playPluck(time, freq, vol) {
  getAudioCtx();
  const v = pluckPool[pluckPoolIdx];
  pluckPoolIdx = (pluckPoolIdx + 1) % pluckPool.length;
  v.volume.value = Tone.gainToDb(Math.max(0.001, Math.min(1, vol * 0.85)));
  v.triggerAttack(freq, time);
}

// ── Riff bend/vibrato voices ────────────────────────────────────────────────
// semitones: how far the bend travels above the fretted pitch (e.g. 2 = whole step).
// Defaults to 2 (whole step) when a riff note doesn't specify bendTo.
function playBendNote(time, freq, dur, vol, semitones) {
  getAudioCtx();
  vibratoFx.wet.value = 0;
  const target = freq * Math.pow(2, (semitones == null ? 2 : semitones) / 12);
  bendVoice.triggerAttack(freq, time, Math.min(1, vol));
  bendVoice.frequency.setValueAtTime(freq, time);
  bendVoice.frequency.rampTo(target, Math.max(0.05, dur * 0.4), time);
  bendVoice.triggerRelease(time + dur);
}

function playVibratoNote(time, freq, dur, vol) {
  getAudioCtx();
  vibratoFx.wet.value = 1;
  bendVoice.triggerAttackRelease(freq, dur, time, Math.min(1, vol));
}

function playSine(time, freq, vol) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.connect(env); env.connect(ctx.destination);
  osc.type = 'sine'; osc.frequency.value = freq;
  env.gain.setValueAtTime(vol * 0.4, time);
  env.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.start(time); osc.stop(time + 0.35);
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
  return [];
}

// ── Beat display ──────────────────────────────────────────────────────────
function buildBeatDisplay(beats) {
  const bd = document.getElementById('beat-display');
  bd.innerHTML = '';
  for (let i = 0; i < beats; i++) {
    const d = document.createElement('div');
    d.className = 'beat-dot' + (i === 0 ? ' accent' : '');
    d.id = `beat-dot-${i}`;
    bd.appendChild(d);
  }
}

let lastLitBeat = -1;
function lightBeat(b, beats) {
  if (lastLitBeat >= 0) {
    const old = document.getElementById(`beat-dot-${lastLitBeat}`);
    if (old) { old.classList.remove('active'); }
  }
  const cur = document.getElementById(`beat-dot-${b % beats}`);
  if (cur) cur.classList.add('active');
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

  while (metroNextTime < ctx.currentTime + LOOK_AHEAD) {
    const isAccent = (metroBeat % beats) === 0;
    const beatInBar = metroBeat % beats;
    const t = metroNextTime;

    // Click
    playClick(t, isAccent, vol);

    // Backing chords / bass on beat 1 of each pattern
    if (chords.length > 0) {
      const patLen = chords.length;
      const patBeat = metroBeat % (patLen * beats);
      const barIdx = Math.floor(patBeat / beats);
      const chord = chords[barIdx % chords.length][0];

      if (isAccent && chord) {
        const root = CHROMATIC.indexOf(norm(state.key));
        const baseHz = midiToHz(36 + root); // low bass
        playBass(t, baseHz * Math.pow(2, chord.notes[0]/12), beatDur * beats * 0.9, vol);
        // Upper chord tones
        const chordHz = chord.notes.slice(1).map(n => midiToHz(48 + root + n));
        playChord(t, chordHz, beatDur * beats * 0.85, vol);

        // Update chord display
        const beatTime = (metroNextTime - ctx.currentTime) * 1000;
        setTimeout(() => {
          document.getElementById('chord-display').textContent = chord.label;
        }, Math.max(0, beatTime));
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
  if (metroRunning) {
    clearInterval(metroScheduler);
    metroRunning = false;
    metroBeat = 0;
    btn.textContent = '▶ START';
    btn.classList.remove('running');
    document.getElementById('chord-display').textContent = '';
    // Clear beat dots
    document.querySelectorAll('.beat-dot').forEach(d=>d.classList.remove('active'));
  } else {
    const ctx = getAudioCtx();
    const beats = parseInt(document.getElementById('time-sig').value);
    buildBeatDisplay(beats);
    metroNextTime = ctx.currentTime + 0.05;
    metroBeat = 0;
    metroRunning = true;
    btn.textContent = '■ STOP';
    btn.classList.add('running');
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
  if (el) { el.classList.add('run-highlight'); lastHighlightEl = el; }
}

function playRunNote(note) {
  const soundType = document.getElementById('run-sound').value;
  const vol = parseInt(document.getElementById('vol-slider').value) / 100;
  if (soundType === 'muted') return;
  const ctx = getAudioCtx();
  const freq = fretToHz(note.string, note.fret);
  if (soundType === 'pluck') playPluck(ctx.currentTime, freq, vol);
  else if (soundType === 'sine') playSine(ctx.currentTime, freq, vol);
}

function runStep() {
  if (!runRunning || runIdx >= runNotes.length) {
    if (runRunning && runIdx >= runNotes.length) {
      stopRun();
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

function stopRun() {
  runRunning = false;
  clearTimeout(runTimeout);
  if (lastHighlightEl) { lastHighlightEl.classList.remove('run-highlight'); lastHighlightEl = null; }
  const btn = document.getElementById('run-btn');
  btn.textContent = '▶ RUN SCALE';
  btn.classList.remove('running');
  document.getElementById('run-display').textContent = 'Run complete. Press again to repeat.';
}

function toggleRun() {
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
    runRunning = true;
    runIdx = 0;
    btn.textContent = '■ STOP';
    btn.classList.add('running');
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
