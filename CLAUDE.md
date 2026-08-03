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
- **Study** (`study.js`, `quiz.js`) — flashcard-style drilling, Fretboard
  Quiz, Theory, Listen & Repeat, and Chord Game sub-tabs.
- **Riffs** (`riffs.js`) — a library of short signature riffs per scale,
  tagged by player/technique, each with a tab display and a Play button.
- **Songs** (`songs.js`) — a Songsterr-style synced practice player: scrolling
  chord/tab track, section markers, drag-to-loop, self-grading, tempo control,
  and three selectable parts (Rhythm/Lead-Solo/Bass) per song.
- **Tuner** (`tuner.js`) — standalone view, reuses the shared mic engine.

Shared: `game.js` (chord-diagram drawing + chord data used by Songs/Chords),
`progress.js` (localStorage practice tracking), `nav.js` (mode switching),
`mic.js` (shared microphone engine — pitch detection, onset/technique
detection, calibration — used by Scales/Chords/Tuner/Listen & Repeat),
`camera.js` (webcam hand tracking, toggled from a nav-bar icon rather than
its own mode — see "Camera Architecture" below), `upload.js` (personal song
upload, adds cards into the Songs grid — see "Personal Song Upload" below).

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
  **Fires twice per note**: an `early: true` pitch-only event ~30-90ms after
  the attack (as soon as one confident pitch reading comes in), then the
  original full-envelope `early: false` event after the whole
  `ENVELOPE_WINDOW_MS`. This was added after real testing showed Scales'
  note matching landing 2-3 notes behind on any real-tempo run — waiting
  for the full envelope before saying anything read as "wrong note" even
  when the eventual pitch was correct. `evt.technique` is always `null` on
  the early firing, so technique-label consumers (mic.js's own
  `showMicTechniqueLabel` subscriber) naturally only react to the late one
  without needing an explicit `early` check.

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

**Scales note matching** (`scalesHandleMicOnset` in `audio.js`): reacts only
to the `early: true` onset firing (see above — the `evt.early` guard is the
first line of the function), on the nearest dot in the *currently
displayed* scale-position box by pitch (a monophonic detector can't know
which string was played, so "nearest dot in the box you're looking at"
stands in for "which dot you just played"). Green (`.quiz-correct`) within
`TUNING_TOLERANCE_CENTS` (15¢) of that dot's exact pitch, amber
(`.quiz-close`) if further off but still the nearest box note, or a red
flash on the fretboard border if nothing in the box is within 60¢ of what
was heard.

**Chords strum-timing grading** (`chordsHandleMicOnset` in `chords.js`):
each `chordRunStep()` chord change stamps `chordChangeTime`; the next onset
within ±600ms is graded on-time (±200ms)/early/late, and a chord change with
no onset by the time the *next* one fires is graded missed. Chord *identity*
is always self-graded (✓ Got it / ✗ Missed buttons) — deliberately not
attempted from the mic, since a monophonic pitch detector cannot reliably
decompose a strummed chord.

**Detection thresholds are a first pass, tune them against real playing.**
`micNoiseGate`/`micSensitivity` defaults, `MIC_MIN_ONSET_GAP`, the pitch/RMS
thresholds inside `classifyTechnique`, and the note-matching cents tolerances
were all picked by ear during this session, not measured against an actual
guitar+mic+room. Expect the first real test to surface false positives/
negatives that need threshold adjustment — this is expected next-pass work,
not a sign anything is broken.

## Camera Architecture (js/camera.js)

Webcam hand tracking via **MediaPipe Tasks Vision** (`HandLandmarker`),
served entirely from local files — `js/vendor/mediapipe/` (the WASM runtime
+ `vision_bundle.mjs`) and `models/hand_landmarker.task` (the model, ~7.8MB)
— so no requests go to Google when the feature is used. These are real
vendored binaries (verified: the `.wasm` file is a genuine WebAssembly
module, the model file matches its expected size), not stubs.

**Why an ES module**: MediaPipe Tasks Vision's documented API is an ES
import (`import { HandLandmarker, FilesetResolver } from '...'`), so
`camera.js` is the one file in this project loaded as
`<script type="module">` rather than a classic script. Two consequences,
both handled explicitly:
- Its top-level declarations aren't automatically global — every function
  index.html's inline `onclick=` handlers or other files need
  (`toggleCamera`, `recalibrateCamera`, `onHandUpdate`, `analyzeHandCurl`,
  `compareHandToChord`, `CURL_THRESHOLD`, `FINGER_JOINTS`) is explicitly
  assigned onto `window` at the bottom of the file.
- Module scripts always finish loading *after every classic `<script>` has
  already fully run*, regardless of where the module's `<script>` tag sits
  in the document — the reverse of the ordering constraint documented above
  for `mic.js`/Scales (see that section). So the `onHandUpdate(...)`
  registration calls for Chords/Scales/Listen & Repeat's handler functions
  live inside `camera.js` itself, at its own bottom, referencing functions
  defined in the earlier classic scripts — never the other way around.

**Zero resources when off**: nothing (camera stream, MediaPipe model, RAF
loop) is touched until the nav-bar 📷 button is pressed. Turning it back off
stops the video tracks, cancels the detection loop, *and* calls
`handLandmarker.close()` to free the WASM-side memory — not just pausing.

**Fixed after real testing surfaced it**: `MEDIAPIPE_WASM_PATH`/
`MEDIAPIPE_MODEL_PATH` are now built as absolute URLs via
`new URL(path, import.meta.url)` rather than bare relative strings — a bare
string is ambiguous between "relative to the document" and "relative to
this module," and at least one interpretation resolved to the wrong path.
Also, `enableCamera()`'s video-playback and model-loading steps previously
had no error handling at all: any failure left the button stuck on
"… connecting" forever with zero visible feedback, indistinguishable from
the whole feature silently not working. Now wrapped in try/catch with a
real error message and a full state reset (button, status text, stream).

**Pipeline**: `getUserMedia` → `HandLandmarker.detectForVideo()` each frame
→ skeleton drawn on `#camera-overlay-canvas` (mirrored via CSS
`scaleX(-1)`, the same as looking in a mirror) → confidence % from the
handedness classifier's score → `onHandUpdate(fn)` subscribers (same
subscriber-list pattern as `mic.js`'s `onMicOnset`/`onMicLevel`).

**Calibration** (hold hand flat for 3s, `startCalibration()`): samples
wrist-to-middle-fingertip pixel distance as a stable proxy for "how big/
close the hand reads at this distance." This is a **hand** calibration only
— there is no guitar-neck-position calibration step (not requested), which
is the direct cause of the next limitation.

**Accuracy limitation — read this before trusting the feedback text**:
without knowing where the fretboard is in the camera frame, this cannot
report an absolute fret or string number. `analyzeHandCurl()` (curl = how
bent each finger is: fingertip-to-wrist distance vs. base-knuckle-to-wrist
distance) only tells you *which fingers are actively curled/fretting*.
Chord and Scale feedback below compare that — plus rough relative
finger-to-finger ordering — against a shape's *known* finger assignment
(`GAME_CHORDS[name].fingers` for Chords, `assignFingers()` for Scales). This
is a genuinely useful first-pass signal ("your ring finger isn't engaged and
this shape needs it") but it is not a precise fret reader, and specific
per-string claims (e.g. "ring finger is muting the B string") are the
hardest thing to get right this way — treat any such wording in the UI as
aspirational until a neck-calibration step exists to actually ground it.

- **Chords** (`compareHandToChord`, `chordsHandleHandUpdate` in `chords.js`):
  compares curled/extended fingers against `chordModeState.key`'s
  `GAME_CHORDS[...].fingers`, throttled to one update per 600ms.
- **Scales** (`scalesHandleHandUpdate`/`reportScaleFingerMatch` in
  `audio.js`): caches the latest hand-curl reading every camera frame;
  when `scalesHandleMicOnset` (mic.js's onset handler) confirms a note, it
  reads that cached curl state and compares the most-curled finger against
  `assignFingers(boxNotes)`'s recommendation for that exact string/fret —
  this is the one place camera and mic are genuinely correlated per-note.
- **Listen & Repeat** (`lrHandleHandUpdate`/`lrCameraMicSummary` in
  `listenrepeat.js`): coarser by design — samples hand-tracking confidence
  across the whole response window and combines it with the existing
  pitch-grading summary at round end, rather than attempting the same
  per-note correlation Scales does. Precise per-note camera+mic correlation
  for Listen & Repeat is real future work, not implemented this pass.

## Personal Song Upload (js/upload.js)

An "⬆ Upload Song" button in Songs mode opens a panel (drag-drop or file
picker + a metadata form) that saves parsed songs to a personal library in
`localStorage` (`PERSONAL_SONGS_KEY`) and merges them into `SONG_LIBRARY` via
`registerExternalSong()` — from that point on they're indistinguishable from
built-in songs to every other part of the app (full playback, speed, loop,
practice overlay, self-grading, progress tracking), tagged with a
"PERSONAL" badge and Edit/Delete buttons on their card
(`song.personal === true`).

Four formats, three fully offline:
- **JSON** (`parseJsonSong`) — direct passthrough; must already match the
  schema documented earlier in this file.
- **Chord chart** (`parseChordChart`) — `"1: Dm"` lines, or a bare
  space-separated chord list for bars 1..N. Fills `chords[]` only (no
  melody) — `rhythmFeel`/`bassFeel` default to `'sparse'`/`'roots'`.
- **Plain-text ASCII tab** (`parseAsciiTab`) — standard 6-line tab
  (`e|...|`/`B|...|`/etc.), bar boundaries from `|` characters (matching
  this app's own riff-tab convention), each character column treated as a
  fixed time-slot within its bar. Handles `b` (bend, `7b9` = fret 7 bent to
  fret 9's pitch), `h` (hammer-on), `p` (pull-off), `/` `\` (slide), `~`
  (vibrato), `x` (mute), `<n>` (harmonic). Fills `leadBars` only — no chord
  chart is derivable from a tab, so `chords[]` falls back to a flat
  placeholder (every bar = the song's key) and the preview UI says so
  explicitly rather than pretending otherwise.
- **Guitar Pro** (`.gp`/`.gp3`/`.gp4`/`.gp5`/`.gpx` via AlphaTab,
  `parseGuitarProFile`/`scoreToSongData`) — **the one exception to this
  project's local-only-assets rule**: loaded from
  `cdn.jsdelivr.net/npm/@coderline/alphatab@1.6.0` via a dynamic `import()`,
  not vendored. AlphaTab's modern bundle splits into dynamically-imported
  chunks that couldn't be reliably hand-vendored without live-testing
  against a real browser (unavailable this session) — attempting it risked
  shipping a bundle silently missing a chunk it needs at runtime, which is
  worse than an honest CDN dependency for the one format that's already the
  least tested. **This whole path is unverified against a real GP file** —
  the AlphaTab → internal-schema mapping in `scoreToSongData` is written
  from documented API shape, not confirmed against actual output. If it
  throws, the error is surfaced as-is (not swallowed) so it's debuggable;
  Plain Text Tab and JSON work fully offline regardless of whether this path
  works.

Edit (`editPersonalSongMeta`) and delete (`deletePersonalSong`) use
`prompt()`/`confirm()` — intentionally minimal, matching the scope of "I can
edit metadata and delete personal songs," not a full form-based editor.

## Chord Switching Game (Study > Chord Game)

Lives in `game.js`, rendered inside Study mode's `#study-subtab-game` panel
(`index.html`) — moved out of a Chords-mode floating drawer this session.
The interval-colored guitar-neck silhouette (root white / 3rd blue / 5th
green / 7th orange, `getIntervalColor` in `drawGuitarNeck`) and the current/
next/prev chord-card layout (`renderGameChords`) already existed; this pass
enlarged them for the new full-page context (current chord: 220px canvas,
56px name, glow highlight — see `.chord-card-wrap.current` in styles.css)
and added:

- **Progression presets** (`CHORD_SETS`/`PROGRESSION_PRESET_META` in
  `game.js`): 6 common transitions + 5 player-specific modes (Knopfler/
  Ronson/Hazel/Dean Ween/Zappa), each with a default play order (sequential
  for real progressions, random for Dean Ween's "genre jumps" and Zappa's
  "unusual movements") and a target BPM for the milestone below.
- **Difficulty ramp** (`maybeRampDifficulty`, called from `gradeSwitch`'s
  success branch): +5 BPM every 5 correct switches in a row, shown as a
  progress bar (`#game-bpm-progress-fill`) against the active preset's
  target tempo, with a one-time milestone message
  (`showGameMilestone`/`.game-message.milestone`) on reaching it. **Only
  accumulates when self-grading is active** (the "Auto-advance chords"
  checkbox, on by default, hides the ✓/✗ buttons and skips `gradeSwitch`
  entirely — a pre-existing behavior, not something this pass changed) —
  same caveat "Best Streak" has always had.
- Mode switching now stops the game from `nav.js` (leaving Study, not
  Chords) and `switchStudySubtab` (leaving the game sub-tab specifically).

Restructuring the HTML from a `position:fixed` drawer into a plain
`subtab-panel` briefly broke `mode-panel-chords`'s closing tag during
editing (nesting every later mode inside it) — verified fixed via a script
that tracks div depth per `mode-panel` open (see git history if this class
of bug recurs; the fix was a purely structural HTML edit, not a logic
change).

## User Profiles (js/progress.js)

Name + emoji avatar, no password. Each profile's entire progress
object lives under its own localStorage key (`PROGRESS_KEY + '_' + id`,
`activeProgressKey()`) — `loadProgress()`/`saveProgress()` always read/write
through that, so nothing elsewhere in the app needed to change. First run
after this feature was added migrates any pre-existing single-profile data
(the old flat `gpt_progress` key) into a new default profile
(`ensureProfilesInitialized`), so nobody's history disappeared.

Switching, creating, or deleting a profile calls `location.reload()` rather
than trying to hot-swap: every mode's in-memory state (Scales' `state`,
Chords' `chordModeState`, song/riff player state, …) is scattered across
many files with no single reset hook, and a reload is the simplest reliable
way to re-initialize all of it against the newly active profile — building
a proper hot-swap would mean adding a reset function to every file that
holds state. Reasonable given "simple profile system... no passwords" was
the brief; revisit if reload-on-switch ever feels too heavy.

UI: the profile chip in the Practice Progress panel header
(`#profile-chip`/`toggleProfileMenu`/`renderProfileMenu`).

## Progress Export (js/progress.js)

`exportProgressJSON()` — an "⬇ Export" button next to the profile chip
downloads the active profile's full progress object as a timestamped JSON
file (includes which profile it came from). Plain `Blob` + object-URL
download, no server involved.

## State Persistence Beyond Progress Data

Every graded action already called `saveProgress()` before this pass — that
part of the brief was already satisfied. What was missing: Scales' and
Chords' *current selection* (which scale/key/position, which chord/shape/
type) lived in a plain in-memory object with a hardcoded default and reset
on every page reload, even though switching between modes *within* a
running page always preserved it fine (nothing unmounts on tab switch in
this app — there's no framework doing that). Added:

- `saveScalesState()`/`restoreScalesState()` in `scales.js`, hooked into
  `render()` (runs after every mutation) and `nav.js`'s `initNav()`.
- `saveChordsState()`/`restoreChordsState()` in `chords.js`, hooked into
  `renderChordFretboard()` and `initNav()`.

Both restore functions also resync the relevant buttons' `.active` classes,
since those were built once at load against the hardcoded default and don't
automatically reflect a later `Object.assign()` onto the state object.
**Not** persisted (reasonable scope boundary, not done): Riffs/Songs filter
selections, Songs' in-progress practice-view session, Study sub-tab internal
scroll position — resetting these on reload is a much smaller UX cost than
Scales/Chords losing their whole active selection.

## Obsidian Vault Export (js/obsidian.js)

No Obsidian plugin needed — writes a `.md` file straight into a folder
Obsidian is already watching, using the **File System Access API**
(`showDirectoryPicker`, Chromium-only: Brave/Chrome/Edge — feature-detected
via `obsidianSupported()`, gracefully unavailable elsewhere). The user picks
the vault folder once (`chooseObsidianVault`); the returned
`FileSystemDirectoryHandle` is stored in IndexedDB (`gpt_obsidian` — handles
aren't JSON-serializable, so this can't live in localStorage next to
everything else). Browsers require re-confirming write permission each
session even with a stored handle (`getObsidianVaultHandle` calls
`queryPermission` then falls back to `requestPermission`, which must run
from a user gesture — every call site here already is one).

**Hooked into one place**: Songs mode's existing "Finish & Review" self-grade
flow (`songSaveSelfGrade()`), since that already collects every field the
summary needs — duration (`songPracticeState.accumulatedSeconds`), what was
practiced (the song title), section scores (clean/needs-work per section),
and a free-text focus-next-time note. After saving, a dismissible "📤 Export
to Obsidian" button appears (`offerObsidianExport`/
`handleObsidianExportClick`) rather than an interrupting `confirm()` —
ignorable if you don't want it that round. **Not wired into** Scale Run /
Chord Game / Listen & Repeat's own session-end points — natural follow-up,
since each would need its own "what to put in the summary" mapping the way
Songs' self-grade flow already provides for free.

## Performance Notes

- **Camera loop throttled to ~30fps** (`CAMERA_TARGET_INTERVAL_MS` in
  `camera.js`), not raw `requestAnimationFrame` (~60fps) — MediaPipe
  inference is the single most expensive per-frame operation in the app,
  and hand-tracking for chord/finger feedback doesn't need 60fps precision.
- **Mic's meter and onset-detection loops were merged** (`mic.js`): both
  used to run as independent RAF loops that each called
  `getFloatTimeDomainData` + computed RMS on the same buffer every frame.
  Since they're always started/stopped together (`micSetEnabled`), there
  was no reason for two reads — `startMicMeterLoop` now does the single
  read and calls `pollOnsetFromFrame(rms)` inline.
- **MediaPipe and AlphaTab are genuinely lazy** — verified, not just
  claimed: `ensureHandLandmarker()` only runs from `enableCamera()` (the
  camera nav-button click), `loadAlphaTab()`'s dynamic `import()` only runs
  from `parseGuitarProFile()` (choosing GP format + clicking Parse). Neither
  loads anything at page load.
- **Known remaining redundancy, not fixed this pass**: Listen & Repeat runs
  its *own* onset-capture loop (`lrMicPollTick`) and level-meter loop
  (`lrStartMeterLoop` in `listenrepeat.js`) independently of `mic.js`'s
  shared loop — a deliberate scope boundary from the Task 2 mic work (LR
  keeps its pre-existing, tested polling logic rather than being folded
  into the pub/sub system other modes use). If the global Mic bar is also
  on while an LR round is running, that's 2-3 loops reading the same
  analyser per frame. Fully unifying this would mean giving LR's
  quiz-grading logic the same subscriber treatment Scales/Chords get —
  real follow-up work, deliberately not risked this late in a long session
  against LR's existing working behavior.
- No 60fps jank measurements were actually taken (no browser tools this
  session) — the above are structural fixes based on code review, not
  profiler output. Verify with real usage.

## Future Direction

**Desktop app**: when this stops being "open index.html in a browser" and
becomes a real standalone app, **Electron** is the recommended path — it
wraps this exact web app (no rewrite) while dropping every browser-sandbox
restriction that currently shapes the architecture: full filesystem access
(the Obsidian export above could write directly instead of going through
the File System Access API's picker-and-permission dance), native MIDI
without Web MIDI's permission prompt, and camera/mic access without a
getUserMedia permission gate or the iframe-sandboxing restrictions
`micUnavailableMessage()`/the camera panel currently have to account for.
Everything documented in this file about lazy-loading, local-only assets,
and browser API feature-detection would simplify or disappear entirely in
an Electron build — worth revisiting those decisions at that point rather
than assuming they still make sense.

**MIDI controller integration** (see "MIDI readiness" above for the
`playSampledNote` hook itself — this extends that with a verification
loop): once real MIDI hardware is available to test against, the plan is
(1) wire `navigator.requestMIDIAccess()` per the existing documented
snippet to trigger the same sample-playback path every mode already uses,
then (2) *also* feed the same `noteon` events through the mic-engine's
pitch-comparison logic (`scalesHandleMicOnset`'s nearest-note matching, or
a MIDI-specific variant of it) to verify the controller's reported note
number actually matches the pitch the tool expects at that fret/string —
catching a mis-mapped or detuned controller rather than trusting its note
numbers blindly. No code for this yet; it needs real hardware to develop
against, which wasn't available this session.

**Custom sample recording** (future feature, not started): let the user
record their *own* instrument playing each note of the scale/chromatic
range through the mic (already-built pitch detection identifies which note
was just played and confirms tuning accuracy before accepting a take),
building a personal sample set with the same shape `SAMPLE_INSTRUMENTS`/
`playSampledNote` already expect — meaning it would plug into the existing
sample-based engine as a new instrument option with no engine changes, and
sidesteps any question of sample licensing since every sample would be the
user's own recording. Would need: a guided recording flow (probably reusing
the mic-calibration/level-meter UI patterns from `mic.js`), trimming/
silence-detection per take, and a storage plan (IndexedDB, like the
Obsidian vault handle — raw audio is too large for localStorage's ~5-10MB
budget across ~50-70 notes × several velocity layers if it ever went that
far).
