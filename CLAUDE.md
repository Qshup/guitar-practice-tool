# Guitar Practice Tool

A browser-based practice tool built for a ~7-month guitarist (Yamaha Pacifica)
studying the vocabulary of Mark Knopfler, Mick Ronson, Eddie Hazel, Frank
Zappa, and Dean Ween. Pure static HTML/CSS/JS — no build step.

- `npm start` — `live-server` on :8080, opens your default browser. (It used
  to hardcode a Windows Brave path, `C:\Program Files\BraveSoftware\…`, which
  simply fails on macOS; it now just uses the system default browser so the
  script is portable.)
- `npm run serve` — same server, `--no-browser`. Use this when driving the
  page from an already-open tab or from browser automation.

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

## Visual Design System (css/styles.css)

A dedicated session took the app from functional-but-plain to an intentional
visual identity — "feel alive, polished, genuinely satisfying to use," no new
features, pure UI/UX polish plus a real backing-track rhythm rewrite. This
section documents the resulting system so later sessions extend it
consistently instead of reintroducing ad-hoc colors/spacing/timings.

### Refinement pass (second design session)

The first design session established the system below but only partly applied
it — a later pass measured the drift and closed it. What it found:

- **166 places bypassed the font variables** (111 literal
  `'Inter', Arial, sans-serif`, 55 literal `'Courier New', monospace`), and
  `body` itself defaulted to `--font-mono`, so anything without an explicit
  font inherited Courier. Body default is now `--font-body`.
- **~218 raw grey hexes** (`#222 #333 #444 #555 #666 #888 #999 #ccc #ddd
  #2a2a2a`) did the work of `--text`/`--text-dim`/`--border`. All routed to
  tokens; `--text-mute` and `--border-hover` were added because the greys
  encoded three text tiers and two border tiers that the palette didn't name.
- **38 off-palette accents** — `#fb8c00` orange ×16 (now `--warning`),
  `#c0392b` ×10 (now `--error`), `#4cff50` neon green (now `--success`).
- **13 cold-tinted panels** (`#0d1a0d` green-black metronome/practice,
  `#0d0d1a` blue-black mic/camera/upload) in an otherwise warm palette —
  pre-redesign leftovers reading as a different design language. They now sit
  on `--surface` and carry identity in a 2px accent left border.
- **Type was 7-11px for almost everything** (88 declarations at ≤9px), too
  small for a tablet at arm's length. Now a six-step scale, `--fs-micro`
  (9px) through `--fs-xl` (17px).
- **No `@media` rules at all** — see "Responsive" below.
- **No `max-width`** — on a 2560px display panels ran edge to edge and
  sliders stretched past 2400px. Body is now a centred 1680px column; the nav
  stays full-bleed with its contents aligned to that column via
  `padding: 0 max(20px, calc((100vw - 1680px) / 2 + 20px))`.
- **Primary CTAs were three different colours** — `.btn-go` green,
  `.btn-run` blue, `.game-btn-start` green — while the palette reserves amber
  for primary actions. All amber now, leaving `--success`/`--blue` purely
  semantic.
- **One focus rule in the whole stylesheet**, so keyboard navigation was
  invisible. Global `:focus-visible` added, plus a
  `prefers-reduced-motion` block.

Two real bugs surfaced while looking:

1. **The active Study sub-tab label was invisible.** `.subtab-btn` elements
   are `<button>`s, so the generic `button.active { background:
   var(--btn-active) }` rule filled them with the light `--text` colour,
   while `.subtab-btn.active` (higher specificity) only overrode `color` — to
   another light value. Fixed with an explicit `background: transparent`, and
   the indicator moved to amber so the app has one tab-bar language instead
   of two. A scripted contrast audit across all six modes confirmed this was
   the only instance.
2. **The 12th-fret double inlay was diagonal, not stacked.**
   `buildFretInlays` offset the two dots `left-5`/`left+5` while CSS offset
   them vertically. Both now share the fret centre, and `.fret-inlay` uses
   `translateX(-50%)` so `left` means centre rather than left edge.

### Palette (`:root` custom properties)

```
--bg: #0f0e0d          --surface: #1c1a18       --surface-2: #242220
--border: #2e2b28      --amber: #c8a84b         --amber-dim: #8a713a
--amber-glow: rgba(200,168,75,0.35)             --blue: #4a9eff
--blue-dim: #3a7ecc    --text: #f0ece6          --text-dim: #8a8078
--success: #4a9e6a     --error: #c85a4a         --radius: 0px
```

**Amber is the single accent color, used sparingly** — active nav tab,
primary CTA glow, root-note fretboard dot, slider thumbs, success pulses.
Blue is the secondary/reference accent (tuning readouts, chord-tone badges).
Everything else is neutral. A prior broad find/replace (`perl -i -pe`, not
`sed` — see "macOS sed gotcha" note further down) mapped old hardcoded hex
values (`#fff`, `#5c8fff`, `#4caf50`, `#e53935`, `#ccb84a`, `#1a1a1a`, `#111`)
onto these variables; **new code should reference the variables directly**,
never reintroduce raw hex for anything that isn't a one-off (like the
per-artist song gradients below, which are intentionally outside the palette).

### Typography

- **Headings/nav/titles**: `var(--font-heading)` = `'Rajdhani', 'Inter',
  Arial, sans-serif` (Google Fonts CDN link in `<head>`).
- **Body/labels/UI text**: `var(--font-body)` = `'Inter', Arial, sans-serif`
  (replaced plain `Arial` throughout).
- **Tabs/frets/numeric readouts**: `var(--font-mono)` = `'Courier New',
  monospace` — kept deliberately, matches the ASCII-tab aesthetic elsewhere
  in the app (riff tabs, song tabs, BPM/frequency readouts).

### Texture

- `body::before` — a subtle inline-SVG `feTurbulence` noise overlay,
  `mix-blend-mode: overlay`, `opacity: .035`. Barely visible, keeps large
  flat dark panels from reading as flat/digital.
- Inset top-highlight (`inset 0 1px 0 rgba(255,255,255,.05)`-style
  box-shadow) on card-like surfaces (`.info-card`, `.practice-panel`,
  `.song-card`, `.upload-panel`, `.camera-panel`, `.metronome-bar`,
  `.progress-panel`, etc. — one grouped selector) for a faint "lit from
  above" edge.
- Faint amber glow (`box-shadow` with `var(--amber-glow)`) on active/focused
  interactive elements — nav active tab, running buttons, slider thumb hover,
  success pulses.
- Top nav is frosted glass: `backdrop-filter: blur(12px) saturate(1.2)` over
  a translucent `rgba(15,14,13,.72)` background.

### Corner radius — sharp, everywhere

`--radius: 0px`, chosen deliberately over rounded corners ("more
professional" per direct feedback). **Every** `border-radius` in the
stylesheet either uses `var(--radius)` or is a genuine circle (`50%` — dots,
avatars, round icon buttons). If you add a new badge/button/panel, don't
introduce a bare pixel radius — route it through the variable so a future
radius change is one edit, not a grep-and-replace.

### Transition timings — four tokens, no ad-hoc durations

```
--ease-hover: 120ms ease                    /* button/card hover, most interactions */
--ease-active: 60ms ease                    /* :active press-down, snappy */
--ease-panel: 250ms cubic-bezier(.2,.8,.2,1) /* slide-open panels (compact toolbar) */
--ease-fade: 200ms ease                     /* mode-switch panel fade (modeFadeIn) */
```

A stylesheet-wide audit (this session) converted every stray `.15s`/`.2s`/
`.12s`/`.06s` hover/press transition it found onto these four tokens.
**Deliberately left alone**: real-time animations tied to audio/data timing
rather than a hover affordance — the metronome beat-dot pulse (`.05s`), the
timer-ring countdown (`stroke-dashoffset .05s linear`), the tuner needle's
position glide (`left .08s linear`), and progress-bar width fills (`.3s`/
`.06s linear`). Don't route those through the hover/active tokens — they're
tuned to their own visual timing, not an interaction-feedback purpose.

### Buttons & interactive elements

- Press-scale: `:active { transform: scale(0.98) }` via `--ease-active`.
- Primary-action buttons (`.btn-go`, `.btn-run`, `.game-btn-start`) get an
  amber glow on hover; destructive/stop buttons (anything with `.running`)
  shift red (`#c0392b`-family) instead.
- **Range sliders** (`input[type=range]`, global, no per-mode override):
  fully custom via `-webkit-appearance:none`/`-moz-range-*` — a circular
  amber thumb (grows + glows on hover) and an amber-filled track. The fill
  percentage comes from a `--range-progress` CSS custom property kept in
  sync by `nav.js`'s bottom section: a delegated `input` listener (covers
  every slider) plus a `MutationObserver` on `document.body` (covers
  sliders rendered later, e.g. Songs' room knob or the Chord Game's BPM
  slider, which don't exist in the DOM yet when `nav.js` first runs).
- **Success micro-feedback** (`audio.js`, "Success micro-feedback" section):
  `pulseSuccess(el)` (amber `box-shadow` ring pulse, `.success-pulse`
  class + `successPulse` keyframe), `bounceStreak(el)` (scale-up-then-settle
  bounce, `.streak-bounce` + `streakBounce` keyframe), and
  `playSuccessChime()` (a quick two-note major-third "ding," 880Hz + 1108Hz
  sine, matching the interval Listen & Repeat's pre-existing correct-answer
  sound already used — this session extended that same feel everywhere
  rather than inventing a new one). Wired into: Fretboard Quiz's clean-clear
  branch, Chord Game's correct-switch branch, Listen & Repeat's streak
  update (chime was already there; pulse/bounce added), and Scale
  Run-Through's genuine completion (`stopRun(true)` — a `completed` flag
  distinguishes "the run finished" from "the user pressed stop early," so
  the celebration only fires on the former).

### Layout: top nav + compact toolbar

- `.app-nav` is `position: fixed; top: 0`, frosted glass, icon+text nav
  buttons, active tab = amber text + amber bottom border (tab-bar style,
  replacing the old per-mode fill-color scheme). A `.nav-spacer` div (same
  height as the nav, 62px) pushes page content below it since the nav is
  removed from normal flow.
- The old separate metronome bar + mic bar are now wrapped in a
  `.compact-toolbar`: an always-visible 44px `.compact-row` (inline-editable
  BPM via `contenteditable` + `compactBpmEdited()`, play button synced to
  `toggleMetronome()`, a `compactTapTempo()` button, a mic toggle synced to
  `toggleMicEnabled()`) that expands via `toggleComboExpanded()` — a
  `max-height` transition on `.compact-expanded` using `--ease-panel` —
  to reveal the original full controls, unchanged internally. Expanded/
  collapsed state persists per-profile (`data.ui.compactExpanded`, same
  pattern as `metronomeCollapsed`/`micBarCollapsed`).
- Each mode panel (`#mode-panel-*`) gets a subtle background radial-gradient
  tint matching its character (Scales = warm fretboard brown, Chords =
  cooler blue-grey, Study = deeper purple-grey, Riffs = warmer amber, Songs
  = darkest/most cinematic) and a `.mode-header` (icon + title + one-line
  sub-label) replacing the old single global `<h1>`/subtitle.

### Fretboard redesign (`scales.js` + `styles.css`)

Wood-grain rosewood gradient background, metallic nut, silver fret-line
gradients, gold/bronze gradient string coloring for the wound low strings
(D/A/low-E) vs. silver for the plain high strings (e/B/G).

The refinement pass took the neck further, because it still read as a flat
brown rectangle with lines on it: the board now carries **cylindrical
shading** (a neck is round, so its top and bottom edges fall away from the
light) plus a coarser grain layer under the fine one; **fret wire** is a
3px rounded nickel bar whose cross-section runs dark edge → bright crown →
dark edge, rather than a 1.5px flat line; **position inlays** went from 8px
of dark brown at `opacity: .5` (effectively invisible, though they are the
main way you navigate a real neck at a glance) to 13px mother-of-pearl with
an off-centre highlight; **strings** cast a shadow onto the board; and the
**nut** got the same rounded cross-section treatment in bone tones.

**String coloring is keyed off `data-string`, never `:nth-child`** — and it
matters that it stays that way. This selector has been wrong twice. The
redesign session tried to fix an off-by-one by moving the rules from
`:nth-child(2..7)` to `(3..8)`, documenting the DOM order as `.nut`(1),
`.fret-numbers`(2), then string-rows from (3). That order was wrong: an
`.arrow-canvas` sits at (3), so the rows actually start at (4) and the real
low-E row at (9) fell outside the rule range entirely and rendered
completely unstyled. The coloring had therefore *still* never applied
correctly, in either version. The underlying problem is that `buildFretGrid`
is shared by **six** fretboards (Scales, Fretboard Quiz, Listen & Repeat ×2,
Songs ×2) whose containers hold different sibling elements, so any
positional selector is correct on at most one of them. `buildFretGrid` now
sets `row.dataset.string = si` (the real index into
`STRING_LABELS = ['E','A','D','G','B','e']`, so 0 = low E, 5 = high e) and
the CSS matches `.string-row[data-string="N"]`. Verified in-browser across
all six fretboards: e/B/G silver at 0.8/1.0/1.3px, D/A/E bronze at
1.8/2.4/3.2px. Don't reintroduce a positional selector here.
Position markers (frets 3/5/7/9/12) are now real DOM elements
(`buildFretInlays()` in `scales.js`, `.fret-inlay`/`.fret-inlay.double`)
rather than a pseudo-element hack. Note dots get an inner highlight via
`box-shadow: inset`; the root-note dot additionally gets a white
radial-gradient fill, amber border, and amber glow.

### Songs mode: per-artist visual identity

Library cards (`buildSongLibraryGrid()` in `songs.js`) get a CSS class from
`playerSlug(song.playerTag)` (`player-knopfler`, `player-ronson`,
`player-hazel`, `player-dean-ween`, `player-zappa`) driving a low-opacity
gradient `::before` layer — Knopfler blue-green, Ronson red-purple, Hazel
purple-black, Dean Ween a multi-stop "psychedelic" gradient, Zappa a
repeating angular amber stripe pattern. These five gradients are
intentionally outside the core palette (`css/styles.css`, search
`.song-card.player-` and `.song-practice-header::before` for the exact
values) — they're a per-artist identity accent, not part of the app-wide
design language, so don't try to fold them into `:root`. The practice view
(`renderSongPracticeShell()`) carries the same gradient behind its header
(`view.className` gets the `player-*` class) with a "Now Practicing" eyebrow
and a much larger title, and the main transport bar (`.song-transport-bar-main`)
docks as a `position: sticky; bottom: 12px` frosted-blur bar so playback
controls stay reachable while scrolling the tab/chord track — a CSS-only
"floating bottom bar" that didn't require restructuring the existing
transport markup or any of its `onclick` wiring.

### Empty states

`.empty-state`/`.empty-state-icon`/`.empty-state-title`/`.empty-state-sub` —
a dashed-border card with an icon, a title, and a one-line suggestion.
Applied to Songs' and Riffs' "nothing matches these filters" states
(`#songs-filtered-empty`, `#riff-filtered-empty`), replacing a bare
inline-styled grey line. The persistent mic-status text and Tuner hint got a
lighter touch (icon prefix, palette colors) rather than a full empty-state
card, since they're single-line status readouts, not empty grids.

### A note on how these edits were verified

The redesign session had no browser available, so every change was verified
statically: `node --check` per edited file, a "concat check" (every classic
script concatenated in `index.html`'s exact load order, then `node --check`,
to catch cross-file redeclaration issues — vendor files `Tone.js`/`pitchy.js`
are excluded from this check, since `Tone.js` lacks a trailing newline and
merges with the next file's first line when naively concatenated; that's a
harmless artifact of the check itself, not a real bug), a Node div-count
script for HTML structural balance, a `{`/`}` count for CSS brace balance,
and a grep of every `onclick=`/`onchange=`/`oninput=` handler in `index.html`
against `function <name>(` definitions across all JS files.

**A later session did open it in a real browser, and the static suite had
missed three real bugs** — recorded here because the pattern is instructive,
not to re-litigate the redesign:

1. **An uncaught `ReferenceError` on every single page load.** `scales.js`
   loads at `index.html:1222`, `progress.js` at 1229; the init `render()` at
   the bottom of `scales.js` called `saveScalesState()` → `loadProgress()`
   before that function existed. Scales state persistence had therefore
   *never once saved* since the feature was added, and the thrown exception
   also aborted the rest of `scales.js`'s init block, silently killing the
   `window.addEventListener('resize', …)` fretboard-redraw handler below it.
   Fixed with a `typeof loadProgress !== 'function'` guard in
   `saveScalesState()` and `saveChordsState()` — the same defensive idiom
   `progress.js`'s own init already uses for its forward dependencies.
   Skipping that first save is correct, not a workaround: `nav.js`'s
   `initNav()` runs `restoreScalesState()` after every script has loaded,
   and that render saves properly.
2. **`restoreScalesState()` didn't resync the Fingers overlay.** It resynced
   the key and position buttons but not the Fingers button/legend, so after
   a reload with the overlay on, the fretboard drew finger numbers while the
   button still read "👆 Fingers" and the legend stayed hidden.
3. **The fretboard string coloring was still wrong** — see the Fretboard
   redesign section above for the full story.

Note what static checking cannot catch: all three files passed `node
--check` cleanly the whole time, because none of these are syntax errors —
they're load-order, state-sync, and DOM-shape errors that only exist at
runtime. **Static verification tells you the code parses, not that it
runs.** Open the app.

What *is* now browser-verified: clean console on load, all six modes and all
five Study sub-tabs render without throwing, Scales state persistence
round-trips through a reload, slider `--range-progress` fill computes
correctly, all 10 song cards carry their `player-*` gradient class, the song
practice view opens with its sticky transport bar, and
`getStyleBeatEvents()` returns well-formed events for all 8 backing-track
styles across 4/3/7/11 time signatures.

**Still unverified — needs ears and a guitar, not a browser**: whether the
backing-track rhythm patterns actually *sound* like the swing / behind-the-
beat / syncopation they're described as (see "Backing Track Rhythm Engine"),
whether the mic detection thresholds hold up against real playing, and the
Guitar Pro import path against a real `.gp` file.

### Responsive (added in the refinement pass)

The stylesheet had **no `@media` rules at all**, so every layout was frozen at
its desktop shape. Three breakpoints now exist:

- **1024px** — the 4-column `.game-layout` drops to 2.
- **768px — the primary target** (tablet propped next to a guitar). Nav gaps
  and button padding tighten so all seven nav buttons plus logo and Progress
  fit without the horizontal scroll they used to trigger; the 2-column
  `.info-box`/`.zappa-grid` and the 4-column `.game-layout` go single-column;
  `.progress-stats-row` goes 4→2; `.bottom-section` stacks; the hard-coded
  320px camera preview becomes fluid; tap targets and slider thumbs grow.
- **560px** — nav labels hide (`.nav-label`, wrapped in spans for this
  purpose — the camera one keeps its `#camera-btn-label` id since camera.js
  writes to it), leaving recognisable icons; grids go single-column.

Verified at 768px by loading the app in a 768px-wide iframe, which gives a
real viewport so the media queries actually evaluate — `resize_window` was
blocked by the maximised browser window. Result: media query active, no
horizontal overflow, nav no longer scrolls.

### macOS `sed` gotcha (if you need bulk find/replace again)

BSD `sed` (what macOS ships, not GNU `sed`) doesn't support `\b`
word-boundary regex in its default mode — `sed -i '' 's/#fff\b/.../g'`
silently matches almost nothing. Use `perl -i -pe 's/#fff\b/.../g'` instead;
it supports `\b` correctly. Verify with a grep occurrence-count before/after
either way.

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

### Backing Track Rhythm Engine (`scheduleMetro`/`getStyleBeatEvents` in `audio.js`)

The metronome's backing track (`#vamp-style`) used to fire one bass note +
one chord stab on beat 1 of every bar, plus a plain click on every beat — no
swing, no syncopation, just a chord change marker. A design-polish session
rebuilt this into a real per-beat rhythm-pattern engine without touching the
outer scheduling loop's timing model (still Web-Audio-clock-scheduled,
`LOOK_AHEAD`/`SCHEDULE_INTERVAL` unchanged):

- `getVampChords(key, style)` still returns the per-bar chord progression
  (unchanged shape — array of bars, each `[{label, notes: [absolute
  semitone offsets from the KEY's root]}]`). Two new styles were added here:
  `'knopfler'` (I-IV-I-V, Celtic/folk movement) and `'hazel'` (i-IV, a
  2-chord Dorian vamp).
- `getStyleBeatEvents(style, beatInBar, beats, chordRoot)` is new — for
  **one quarter-note beat**, it returns sub-events with a fractional
  `offset` (0 = on the beat, 0.5 = the straight 8th "and," 0.667 = the
  swung/triplet "and"), each `{type: 'kick'|'snare'|'hihat'|'bass'|'chord'|
  'pluck'|'ghost-chord', ...}`. `scheduleMetro()`'s per-beat loop calls this
  once per beat and schedules every returned sub-event at
  `t + offset*beatDur` — this is what layers swing/syncopation/ghost-notes
  onto the existing beat-by-beat scheduler without a full step-sequencer
  rewrite.
- **Percussion** (`playKick`/`playSnare`/`playHihat`, raw Web Audio —
  oscillator thump for kick, filtered noise burst for snare/hihat, a shared
  cached noise buffer via `getNoiseBuffer()`) is a baseline applied to every
  style except `'none'`: kick on beat 1, snare/rim on the backbeat (beat 3
  in 4/4+, beat 2 in 3/4), closed hi-hat on straight 8ths — **except blues**,
  which explicitly wants hi-hat only on beats 2 & 4 per the brief, so that
  style overrides the default hi-hat placement. Percussion gain is
  deliberately low (kick ≤`vol*.26`, snare ≤`vol*.17`, hihat ≤`vol*.08` vs.
  bass up to `vol*.9` and chords up to `vol*.35`) — **the guitar/bass must
  always be the loudest thing**, drums are a felt rhythmic anchor, not a
  full mix element.
- **Per-style feel**, all expressed as `offset`/`type` combinations in
  `getStyleBeatEvents`:
  - `blues` — root/5th alternating bass, comp chord stab pushed to the
    swung `0.667` "and" (the triplet-feel shuffle push).
  - `minor` — walking bass cycling root→b3→5th→b7 across the bar; a quiet
    `ghost-chord` pre-echo (very short, `velocity: 0.18`) leads into the
    real chord stab landing at `offset: 0.58` — deliberately *past* the
    beat's exact-half point, the "behind the beat" lag.
  - `mixo` — straight (unswung) eighths: bass on the beat and the "and,"
    chord chuck landing with the off-beat bass note — a country/train-beat
    feel.
  - `knopfler` — bass on beat 1, then arpeggiated chord tones (3rd, 5th,
    octave) climbing through beats 2-3-4 via the `chordVoice` synth (a
    `'pluck'` event, single-note `playChord` call) — a fingerpicked-arpeggio
    read without a dedicated new voice.
  - `hazel` — bass only on beat 1 and the "and of 3" (`offset: 0.5` on
    `beatInBar === 2`), chord stabs landing on every beat's off-beat — the
    "chords on the upbeats" syncopated funk-Dorian feel.
  - `zappa` — unchanged root+chord-on-the-beat vamp, **plus**: when the
    time signature is 7 or 11 (the "★ = Zappa" options in `#time-sig`), the
    beats beyond a standard 4 (`beatInBar >= 4`) play a short melodic
    fragment (`'pluck'` events cycling a 5-note sequence built from
    `chordRoot`) that deliberately alternates the natural-4th/#4th and
    b7/nat-7 — hinting ambiguously at Mixolydian vs. Lydian rather than
    committing to one, which is the actual harmonic ambiguity Zappa's own
    writing leans on.
  - `drone` — unchanged in spirit (single sustained root+5th+octave chord
    per bar), just re-expressed as one `bass` event with `dur: beats`
    (rings the full bar instead of one beat).
- `chord.notes[0]` is always treated as "this chord's root, in semitones
  from the key's tonic" — every pattern above derives 3rds/5ths/7ths as
  offsets from that (`chordRoot+4`, `chordRoot+7`, etc.) rather than reading
  fixed array indices, so the patterns work correctly regardless of whether
  a given bar's chord is a triad or a 7th voicing.
- **Untested against a real guitar** — like the mic detection thresholds
  elsewhere in this doc, these rhythm feels were composed by ear/reasoning
  during a session with no audio playback available (no browser). Listen to
  each style against the actual song material before trusting the "swing"/
  "behind the beat"/"syncopation" claims land the way they're described.

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
