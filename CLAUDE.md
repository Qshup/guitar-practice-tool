# Guitar Practice Tool

A browser-based practice tool built for a ~7-month guitarist (Yamaha Pacifica)
studying the vocabulary of Mark Knopfler, Mick Ronson, Eddie Hazel, Frank
Zappa, and Dean Ween. Pure static HTML/CSS/JS — no build step. `npm start`
runs `live-server` for local dev (see `package.json`).

## Modes (js/nav.js)

- **Scales** (`scales.js` + Scale Run-Through in `audio.js`) — fretboard
  diagrams, circle of 5ths, and an animated scale run-through.
- **Chords** (`chords.js`, `caged.js`) — chord reference, CAGED system, chord
  run practice.
- **Study** (`study.js`, `quiz.js`) — flashcard-style drilling.
- **Riffs** (`riffs.js`) — a library of short signature riffs per scale,
  tagged by player/technique, each with a tab display and a Play button.
- **Songs** (`songs.js`) — a Songsterr-style synced practice player: scrolling
  chord/tab track, section markers, drag-to-loop, self-grading, tempo control,
  and three selectable parts (Rhythm/Lead-Solo/Bass) per song.
- **Tuner** (`tuner.js`) — standalone view, reuses the shared mic engine.

Shared: `game.js` (chord-diagram drawing + chord data used by Songs/Chords),
`progress.js` (localStorage practice tracking), `nav.js` (mode switching),
`mic.js` (shared microphone engine — pitch detection, onset/technique
detection, calibration — used by Scales/Chords/Tuner/Listen & Repeat).

## Audio Architecture

### Two engines, split by mode

**Sample-based guitar engine** (`audio.js`, bottom section — "SAMPLE-BASED
GUITAR ENGINE"). Powers **Scale Run-Through, Riffs, and Songs** (including
Songs' "related riffs" mini-player). Real recorded guitar/bass notes instead
of synthesis.

**Tone.js synthesis voices** (`audio.js`, top section — Karplus-Strong pluck,
bend/vibrato mono-synth). Still power **Chords** (chord-run preview + strum),
the **Chord Game**, and **Listen & Repeat**. Left unchanged — those are
ear-training/reference tools where the practice content itself (not tone
realism) is the point, and converting them was out of scope for this pass.
The metronome click and backing-track chords/bass (`playClick`/`playBass`/
`playChord`) are untouched everywhere.

### Why sample-based, and why this implementation specifically

The task brief asked to choose between:
- **Option A** — soundfont-player + a free electric guitar soundfont, with
  separate clean/overdriven/acoustic patches.
- **Option B** — WebAudioFont, loaded on demand.
- **Option C** — Tone.js Sampler over CC/MIT recorded single notes.

A prior session had already built a hand-rolled engine matching **Option A**'s
approach almost exactly: it pulls real guitar/bass note samples from
[gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (the
FluidR3_GM soundfont converted to per-instrument JS files of base64 mp3 data
URIs, MIT-licensed, CDN-hosted — no build step, no npm dependency), decodes
them once per instrument, and plays any requested pitch by picking the
nearest recorded note and correcting pitch with `playbackRate` — the same
technique the `soundfont-player` and `WebAudioFont` *libraries* use
internally. This was extended rather than replaced or swapped for an actual
npm dependency, because:

1. It already met nearly every requirement in the brief (per-technique
   articulation, on-demand loading, room reverb, tempo-independent pitch) —
   rebuilding on top of `soundfont-player` or `WebAudioFont` would have meant
   re-implementing bend/slide/vibrato/harmonic/mute articulation on top of a
   library that doesn't expose that, for no realism gain.
2. No new dependency, no bundler/build step needed — the project intentionally
   stays a flat `<script>`-tag static site.
3. Instrument patches already match the brief: `clean` (electric_guitar_clean),
   `crunch` (overdriven_guitar), `acoustic` (acoustic_guitar_steel), `bass`
   (electric_bass_finger) — see `SAMPLE_INSTRUMENTS` in `audio.js`.

This session's work was extending that engine's reach — it previously only
powered Songs' main practice player — to Scale Run-Through and Riffs (both
Riffs' own player and Songs' related-riffs mini-player), and adding the
instrument selector to all three surfaces per the brief.

### How a note is played (`playSampledNote` in `audio.js`)

Single entry point for every mode above:
`playSampledNote(instrumentKey, time, freq, dur, vol, opts)`

- **Correct pitch per fret**: `freq` comes from `fretToHz(string, fret)` →
  `midiToHz`; the nearest recorded sample is picked and pitch-corrected via
  `playbackRate`, so every fret/string combination sounds at its exact pitch.
- **Natural decay**: gain envelope rides the sample's own recorded decay,
  released early via `exponentialRampToValueAtTime` once `dur` elapses.
- **String choking**: `ringingByString[stringIdx]` tracks whichever source is
  currently ringing on a string; a new note on that string (`opts.stringIdx`)
  fades and stops the previous one (`stopRingingString`) before starting.
- **Bends** (`opts.technique === 'bend'`, `opts.bendTo` in semitones): ramps
  `playbackRate` from the fretted pitch up to the bend target mid-note.
- **Slides** (`'slide'`, `opts.fromFreq`): ramps `playbackRate` from the
  previous note's pitch into the new one.
- **Vibrato** (`'vibrato'`): an LFO into `source.detune`.
- **Harmonics** (`'harmonic'`): highpass-filtered, slightly louder and longer
  sustain than a normal pluck.
- **Palm mutes** (`'mute'`): lowpass-filtered, much shorter ring.
- **Room reverb**: `setSampleRoomAmount(0-1)` drives a shared convolver +
  short delay send (`sampleRoomGain`); each mode's Room slider calls this
  directly. It's one shared bus, so the last slider touched wins across modes
  — acceptable since only one mode plays at a time in practice.
- **Speed stays pitch-correct**: every mode's speed/tempo control changes
  *when* notes fire (Tone.Transport bpm for Songs, a ms-per-step or
  ms-per-note interval for Scale Run/Riffs) — never `playbackRate` for tempo.
  Pitch-shifting `playbackRate` is used *only* for the bend/slide pitch glide
  described above.

### MIDI readiness (not implemented — designed for later)

`playSampledNote(instrumentKey, time, freq, dur, vol, opts)` is already the
single call every mode uses to sound a note. A future Web MIDI handler needs
no engine changes — just translate `noteon`/`noteoff` into this same call:

```js
navigator.requestMIDIAccess().then(access => {
  for (const input of access.inputs.values()) {
    input.onmidimessage = (e) => {
      const [status, note, velocity] = e.data;
      if ((status & 0xf0) !== 0x90 || velocity === 0) {
        if ((status & 0xf0) === 0x80 || velocity === 0) stopRingingString(note, getAudioCtx().currentTime);
        return;
      }
      const freq = midiToHz(note);
      playSampledNote(currentInstrument(), getAudioCtx().currentTime, freq, 1.5, velocity / 127, { stringIdx: note });
    };
  }
});
```

MIDI notes don't carry a string/fret, so the MIDI note number itself doubles
as the `ringingByString` choke key (as opposed to a fretboard string index
0-5) — same mechanism, different key space, no conflict since the two never
overlap in practice (fretboard playback always passes 0-5 or `'bass'`).

### Instrument selector locations

- Scales: `#run-instrument` + `#run-room-slider` in the Scale Run-Through panel.
- Riffs: `#riff-instrument-select` + `#riff-room-slider` in the riff filter bar.
- Songs: `#song-part-select` (Rhythm/Lead/Bass — see "Songs mode: 3-part tabs"
  below) + `#song-room-slider` in the practice view header; each part's tone
  comes from the song's `defaultInstrument`, not a free-choice dropdown.

Scales/Riffs use the same four tone options: Electric Clean, Electric Crunch,
Acoustic, Bass — matching `SAMPLE_INSTRUMENT_LABELS` in `audio.js`.

## Songs mode: 3-part tabs (Rhythm / Lead-Solo / Bass)

Every song has three independently selectable, full-song-length parts
instead of one lead line over an auto-generated backing wash:

- **Lead/Solo** — hand-written note-by-note across every bar (`song.leadBars`,
  a sparse `{barNum: [...]}` map — missing bars just rest, same as a real
  lead part does during vocal sections). This is the only part that's
  actually authored per-song.
- **Rhythm** and **Bass** — generated at render/playback time from the song's
  real per-bar chord chart (`song.chords`, one chord name per bar) plus a
  named strum/bass-line feel (`song.rhythmFeel`/`song.bassFeel`, e.g.
  `'fingerstyle'`/`'driving'`/`'walking'`/`'pulse8'` — see `RHYTHM_FEELS`/
  `BASS_FEELS` in `songs.js`). Chord voicings come straight from
  `GAME_CHORDS` (game.js), so every note is a real, correctly-fretted tone
  for that chord — not a hand-transcribed audio recording, but not a
  droning single-chord placeholder either.

`getPartBarNotes(song, part, barIdx0)` is the single function that resolves
any part/bar to its note array — the Tab view (`renderSongScroller`) and the
playback engine (`songBuildPart`/`songPartCallback`) both call it, so they
can never disagree about what a part contains.

**Practicing along**: the Part selector (`#song-part-select`) picks which
part's tab is displayed and which part the "🔇 Go Silent (Play Along)"
toggle mutes — the other two parts keep playing as backing. Choke keys are
namespaced per part+string (`` `${part}-${string}` ``) so a rhythm strum
never chokes a still-ringing lead note.

**Known limitation** (per user feedback): these are stylistically-composed
parts, not transcriptions of the actual recordings, so tempo/feel won't
always match the record. A Guitar Pro file import (drop your own `.gp`/
`.gp3-5`/`.gpx` files, parsed via AlphaTab) is the planned fix — see
"Guitar Pro import" below.

## Guitar Pro import (planned / in progress)

`registerExternalSong(song)` in `songs.js` already accepts any object
matching the internal song schema and slots it into `SONG_LIBRARY` — a file
importer only needs to produce that shape. Chosen approach: **AlphaTab**
(`@coderline/alphatab`, MPL-2.0, browser UMD build via
`https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/alphaTab.min.js`
— no build step, fits this project's flat-`<script>`-tag setup) parses
`.gp`/`.gp3`/`.gp4`/`.gp5`/`.gpx` files into a `Score` (tracks → bars → beats
→ notes); a mapping layer converts that into `chords`/`rhythmFeel or explicit
rhythm notes`/`leadBars` per track and calls `registerExternalSong()`.

## Microphone Architecture (js/mic.js)

One shared mic engine — a single `getUserMedia` stream/analyser/pitch
detector for the whole app — used by Scales' live note matching, Chords'
strum-timing grading, the standalone Tuner, and Listen & Repeat's
ear-training grading. Browser-only (needs a real page origin, not the
artifact-preview iframe); works via `npm start` in a real browser tab.
`micUnavailableMessage()` tells the two failure modes (denied vs.
iframe-sandboxed) apart.

**Persistent Mic bar** (`#mic-bar` in `index.html`, mirrors the metronome
bar): on/off toggle, sensitivity slider (`setMicSensitivity`, multiplies
measured RMS before any gate comparison), noise-gate slider
(`setMicNoiseGate`, the RMS floor treated as silence), a level meter, and a
passive note/cents readout — this last one **is** the "doubles as a tuner"
feedback the task asked for, visible in every mode whenever the mic is on.
The dedicated Tuner view (`js/tuner.js`) is a bigger, focused presentation
of the exact same `onMicLevel()` stream, not a separate implementation.

**Two subscription systems**, both fire whether or not any UI is listening —
consumers just add/remove callbacks:
- `onMicLevel(fn)` — one shared `requestAnimationFrame` loop; fires every
  frame with `{rms, active, reading}`, where `reading` is the current pitch
  (or `null` below the noise gate). Drives the level meter, tuner, and any
  passive readout.
- `onMicOnset(fn)` — a separate onset-detection loop (RMS crosses the noise
  gate, debounced by `MIC_MIN_ONSET_GAP`); on each attack it samples the
  pitch/RMS envelope for `ENVELOPE_WINDOW_MS` (~450ms) and fires once with
  `{time, freq, noteName, cents, technique, samples}`. Scales' note-matching
  and Chords' strum-timing both subscribe here; each handler checks its own
  mode is the active panel before doing anything, so both can stay
  subscribed for the app's whole lifetime without needing nav.js wiring.

**Technique classification** (`classifyTechnique` in `mic.js`) reads the
onset envelope's pitch trace in cents-from-attack:
- **Vibrato** — the trace changes direction ≥3 times (regular oscillation).
- **Slide** — pitch moves >80¢ and stays there (two stable regions, no
  snap-back).
- **Bend** — pitch rises >25¢ after the attack and stays up.
- **Mute** — no clean pitch anywhere in the window despite energy above the
  gate (a percussive/muffled hit rather than a ringing note).
These are heuristic thresholds tuned by ear, not measured against real
playing — expect to retune `classifyTechnique`'s constants after trying it
with an actual guitar.

**Scales note matching** (`scalesHandleMicOnset` in `audio.js`): on each
onset, finds the nearest dot in the *currently displayed* scale-position box
by pitch (a monophonic detector can't know which string was played, so
"nearest dot in the box you're looking at" stands in for "which dot you just
played"). Green (`.quiz-correct`) within `TUNING_TOLERANCE_CENTS` (15¢) of
that dot's exact pitch, amber (`.quiz-close`) if further off but still the
nearest box note, or a red flash on the fretboard border if nothing in the
box is within 60¢ of what was heard.

**Chords strum-timing grading** (`chordsHandleMicOnset` in `chords.js`):
each `chordRunStep()` chord change stamps `chordChangeTime`; the next onset
within ±600ms is graded on-time (±200ms)/early/late, and a chord change with
no onset by the time the *next* one fires is graded missed. Chord *identity*
is always self-graded (✓ Got it / ✗ Missed buttons) — deliberately not
attempted from the mic, since a monophonic pitch detector cannot reliably
decompose a strummed chord.
