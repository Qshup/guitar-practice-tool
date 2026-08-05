# Guitar Practice Tool

A browser-based practice tool built for a ~7-month guitarist (Yamaha Pacifica)
studying the vocabulary of Mark Knopfler, Mick Ronson, Eddie Hazel, Frank
Zappa, and Dean Ween. Pure static HTML/CSS/JS — no build step.

**This app must be SERVED, not opened as a file.** Double-clicking
`index.html` in Finder gives a `file://` page where the camera silently cannot
work, and the failure is very confusing because almost everything else does:

- `camera.js` is the app's one `<script type="module">`. Module scripts are
  CORS-checked and a `file://` page is an opaque origin, so the import of
  `vendor/mediapipe/vision_bundle.mjs` is refused. The file never executes, so
  the `window.toggleCamera = toggleCamera` line at its bottom never runs, and
  the nav button's `onclick` throws `ReferenceError` into the console.
- MediaPipe's wasm/model fetches and AlphaTab's dynamic `import()` fail for the
  same reason.
- The **27 classic `<script src>` tags load fine**, which is exactly why this
  is hard to diagnose: scales, chords, the mic, and lick capture all work, and
  only the camera and Guitar Pro import are dead.

`checkPageOrigin()` in nav.js detects `location.protocol === 'file:'` and shows
a banner explaining it, rather than leaving a silent ReferenceError.
`Start Guitar Tool.command` is a double-clickable launcher for anyone who does
not want to use a terminal.

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

### Icon system (`<defs>` sprite at the top of index.html)

All structural chrome — nav, mode headers, section titles, empty states,
action buttons — uses one inline SVG sprite. This replaced platform emoji
(🎸🎹📚♪🎵🎤📷🔄🔊🔍💾), which rendered differently on every OS and shared no
visual language; they were the single biggest thing making the nav read as a
web page rather than an app.

- All symbols are 24×24, stroke-based, `stroke-width: 1.6`, `currentColor` —
  so an icon inherits the amber active state, the dim rest state and any
  hover colour with no per-icon rules.
- Sizes come from the class: `.nav-icon` 17px, `.mode-icon` 19px, `.btn-icon`
  13px, `.empty-icon-svg` 30px, `.logo-icon` 18px.
- **Every `<svg>` needs `viewBox="0 0 24 24"`.** Without it the artwork does
  not scale into the CSS box — it renders at full 24px coordinates and
  overflows, which is exactly what happened first time round (the hand icon
  sat on top of the "Fingers" label). If you add an icon usage, add the
  viewBox.
- Buttons carrying a `.btn-icon` must be `inline-flex`; in plain inline flow
  the SVG sits on the text baseline and overlaps the label.
- **Deliberately still text**: typographic glyphs (`▶ ✓ ✗ → ★ ▾`) are
  consistent across platforms already, and profile avatars
  (`PROFILE_AVATARS` in progress.js) are meant to be emoji.

### Scales layout: the fretboard is the hero

The 15-button scale list used to sit open above the neck, taking two full
rows and giving the fretboard — the actual point of the tool — no more
visual weight than a filter strip. It now collapses behind a
`.scale-picker-summary` bar that names the current scale, using the same
`max-height` expand pattern as the metronome toolbar; state persists as
`data.ui.scalePickerExpanded`. Key / Position / Overlay stay visible because
they change often; Scale Group moved inside the picker.

Two things this restructure required, worth knowing if you move it again:

- `filterGroup()` used to clear active state via `.controls .btn-row button`
  and match on button *text*. That broke on both counts — the group buttons
  moved into `.scale-picker-body`, and the text match depended on a `'★ '`
  prefix that no longer exists. It now scopes to
  `#scale-picker-body .ctrl-group .btn-row button`.
- The `'★ '` prefix is gone from scale buttons. 11 of the 15 scales are Zappa
  scales, so the star marked almost everything and carried no signal; the
  `.zappa-btn` class (already in the stylesheet) says the same thing without
  a glyph on every label.

`.fretboard-wrap` is now a framed `--surface` card with `width: max-content;
max-width: 100%`, and `.fretboard` itself is `width: max-content` — the neck
is exactly as long as its frets, instead of stretching to the container and
trailing bare wood past the last fret.

### Beat display renders to every `.beat-display`

`buildBeatDisplay`/`lightBeat` (audio.js) key dots by `data-beat` rather than
by `id`, because there are now two containers: the expanded metronome panel
and the always-visible compact toolbar row. Ids must be unique, so the old
`beat-dot-${i}` lookup would only ever have lit the first copy. The compact
one fills what was ~1000px of dead space in the toolbar with the live pulse.

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

### Spacing and weight scales

- **Spacing** — `--sp-1` (4px) through `--sp-6` (36px). Card padding and every
  `margin-top`/`margin-bottom` route through these; there used to be eleven
  different ad-hoc margin values doing the same job, which is why the vertical
  rhythm wandered.
- **Weight** — three steps, not two. 400 body / **600** emphasis and labels /
  **700** reserved for true headings (`h1`, `.app-logo`, `.mode-header`,
  `.scale-picker-current`, `.song-card-title`, `.score-val`, `.tuner-note`,
  `.compact-bpm-value`, `.riff-title`). Previously 62 rules said
  `font-weight: bold` and nothing said anything else, so weight carried no
  hierarchy at all — and 700 on 9-11px text just renders muddy.

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

## Durable Storage (js/storage.js)

Progress lives in **both** stores, deliberately:

- **localStorage** — the synchronous working mirror. Every read hits this.
- **IndexedDB** — the durable backing store, written through on every save.

Why not IndexedDB alone (the obvious ask): `loadProgress()`/`saveProgress()`
are synchronous and called from several hundred sites across every file,
including at script-load time in `scales.js` before `progress.js` has run.
IndexedDB has no synchronous API, so removing localStorage means making every
one of those call sites async — a rewrite of the app's control flow for a
storage change. The split gets the durability (history survives localStorage
eviction and private-window resets) with zero changes to the sync API.

`recoverFromDurableStore()` runs on boot, repopulates the mirror for any key
localStorage lost, and reloads. `migrateLocalStorageToDurable()` runs on
**every** load over **every** `gpt_` key — it has to be convergent, not
one-shot: `gpt_profiles` is only written when first created, so an existing
profile never triggered a write-through and the one-shot version raced past
it. Losing that one key is worse than losing a progress key, because recovery
would then restore history under a profile id the app no longer knows about
and the data comes back invisible. `deleteProfile` uses `durableRemove`, not
`localStorage.removeItem` — otherwise boot recovery resurrects deleted data.

**Progress import** (`triggerProgressImport`) is the counterpart export never
had. The merge is non-destructive and idempotent: counters take `max()` rather
than summing and per-day records keep whichever side logged more practice, so
nothing incoming lowers an existing value and re-importing the same file twice
is a no-op. `ui` state is deliberately not merged — panel collapse is a local
device preference, not history.

## Lick Capture & Vocabulary Builder (js/licks.js, Study > Licks)

Capture is **retroactive** — you decide a phrase was worth keeping *after*
playing it — so both the audio and the notes are already in hand when the
button is pressed. Two rolling histories in `mic.js` make that possible:

- **PCM ring buffer** (`micCaptureLastSeconds`). 12s of raw Float32 in a ring,
  encoded to a 16-bit mono WAV on demand. MediaRecorder cannot do this:
  webm/ogg chunks after the first carry no container header, so keeping "the
  tail" of a continuous recording does not give a decodable file. Uses a
  `ScriptProcessorNode` — deprecated in favour of AudioWorklet, taken
  deliberately because a worklet needs a separate fetched module file and this
  project's rule is local, no-build assets; the per-callback work is one array
  copy. Gated on `micEnabled` like every other loop.
- **Onset history** (`micRecentOnsets`). Last 40s of confirmed pitched onsets.
  Lives in mic.js, not licks.js, so the phrasing and chord-tone trainers read
  the same history rather than each accumulating their own.

**Everything is derived, never tabulated.** Scale fit, intervals, chord-tone
roles, the three variations — all interval arithmetic, which can be checked.
A hand-typed table of "licks that fit Dorian" can be silently wrong forever.

### Scale identification is the hard part, and it has two traps

1. **Identical pitch-class sets.** E minor pentatonic and G major pentatonic
   are the *same five notes*. Nothing in the set separates them — only which
   note behaves like home. Root evidence is scored explicitly: where the line
   ends, where it starts, most frequent, lowest.
2. **Bigger scales trivially contain smaller ones**, and Chromatic contains
   everything. So a scale is rewarded for being small (`specificity`) and for
   having its degrees actually *used* (`coverage`), and Chromatic is excluded
   from the top answer unless nothing else fits.

**The final-note weight was too high and produced a wrong answer**: E-G-B-D
over an Em→G vamp came back as *B Natural Minor* purely because the line ended
on B. Ending on the 5th is completely ordinary. Two fixes — the last-note
weight dropped (0.45 → 0.30) and `coverage` rose (18 → 24) so a scale the line
*fills* beats a larger one that merely contains it; and `lickIdentifyScales`
now takes the **chord roots that were actually sounding**, which is the
strongest tonic evidence available and was being ignored. The vamp's first
chord is treated as a near-declaration of the tonic.

It deliberately does **not** let chord context steamroll melodic evidence: a
line starting on E, ending on E, with E lowest and most frequent still reads as
E-centred over a G chord — they are the same five notes. G is raised into the
offered alternatives instead of overriding.

### Chord context is recorded independently of the overlay

`harmonyRecordChord(chord, time)` timestamps each vamp bar onto the
**AudioContext clock**, the same clock as mic onsets, so "was that note a chord
tone" is answerable *per note* long afterwards — including across a chord
change mid-lick. It is deliberately **not** gated on `harmonyState.enabled`
(unlike `harmonySetChord`): painting the neck is a display choice, but the
harmonic context is data every analysis feature needs.

Roles come from `harmonicRole()` in harmony.js — the same classifier the neck
overlay paints with, so the two can never disagree.

### Fret placement is a dynamic program

A pitch does not say where it was played; E4 exists on four strings.
`lickFretPositions` minimises total fret travel with a small DP (greedy commits
to a cheap first note and pays for it across the whole phrase). It accepts an
optional string set and a **position floor**, both needed by the variations.

**Notes outside the guitar's range are kept with a null position**, not
dropped — usually an octave error from the detector, and hiding it would make
the transcription look cleaner than it is.

### The three variations, and why the string-set one was hard

- **Sequence** — `lickDiatonicShift` moves by scale *degrees*, not semitones,
  so the intervals genuinely change (C-E-G → D-F-A is M3+m3 → m3+M3). That
  difference is the whole point of the device; semitone transposition would
  just be the same lick elsewhere. Non-scale notes keep their chromatic offset
  from the degree below so a passing tone stays a passing tone.
- **Rhythm** — same pitches, proportional gap patterns so they read the same
  at any tempo. Picks whichever pattern is least like what you actually played.
- **String set** — searching 3-string windows alone found **no alternative at
  all** for an octave-spanning line: any window containing the original strings
  just reproduces the original placement (it *is* the minimum-travel one), and
  windows that exclude them need a 9-fret span. Fixed by searching **position
  floors** as well as string windows — "play it in 5th position" is the
  relocation a guitarist actually wants, and the new string set falls out of it.

### Storage: the IndexedDB version bump that bit

Licks live in their own `licks` store (blob + notes + analysis), never mirrored
to localStorage. Bumping `IDB_VERSION` to 3 exposed a hazard worth keeping in
mind:

**An IndexedDB version is a one-way door per browser profile.** Once the
database reaches version N, `onupgradeneeded` never fires for N again. During
this session live-server auto-reloaded the page after the version bump was
saved but *before* the matching `createObjectStore` was — so the database
landed on v3 permanently missing the `licks` store, and no reload could fix it.
It failed **silently**, because every accessor ends in `.catch(() => [])`, so a
missing store read as an empty library.

Two fixes, both worth keeping:
- `idbOpen()` verifies the required stores exist after opening and reopens at
  `version + 1` to create any that are missing — an unrecoverable state becomes
  self-correcting on the next load.
- The open is **version-less first**, landing on whatever version actually
  exists, with `IDB_VERSION` treated as a floor. The first repair attempt
  hardcoded the version and left the DB at v4, so every subsequent load threw
  `VersionError: requested version (3) is less than the existing version (4)` —
  a worse bug than the one being repaired.

### Honest limits

A monophonic detector hears one note at a time, so a lick with two notes
ringing together is transcribed as whichever the detector locked onto. This is
single-note-line capture, which is what soloing is. Stated in the UI too.

## Spaced Repetition (fretboard quiz)

`recordFretboardQuizAnswer` records **every** answer with a timestamp, not
just failures. Per item: box 1-5, correct, incorrect, lastSeen,
lastSeenSession. Correct promotes one box (capped at 5); wrong drops straight
to box 1.

Leitner intervals are split by pacing unit on purpose:
- **Boxes 1-3 — sessions** (1/2/4). Short-term recall should return the same
  or next time you sit down.
- **Boxes 4-5 — calendar days** (7/14). Once something is genuinely known,
  "4 sessions" could be four days or four weeks and only elapsed time tracks
  real forgetting.

`generateFromItemKey` (quiz.js) is what makes this real SRS rather than a
weighting heuristic — itemKeys are fully deterministic
(`note:{key}:{scaleId}:pos{n}:deg{n}`), so a due item is rebuilt **exactly**.
The old missed-item logic parsed the key only to recover its tier and then
asked a random question of that tier, so it never re-tested the actual item.

## Practice Session Spine (js/session.js)

Answers "what should I practice for the next 30 minutes?" — the gap nothing
else filled. Reads history already being collected: stalest scale (scanning
`days[].scalesPracticed` backwards), the SRS due queue, weakest chord pair by
success rate with a 3-attempt minimum, least-played riff, focus-matched song.
Every activity carries a reason drawn from real data.

Durations are proportions of the total, so a 15-minute plan is the same shape
as a 60-minute one rather than a truncated version. The planner is an
**option, never a gate**: skip dismisses it for an hour, an active plan never
blocks navigation, and the nav bar only reports progress.

**`.session-start` must never cover the nav — this is what broke the camera.**
The planner shows unprompted on load as a `position: fixed` overlay. It was
written `inset: 0; z-index: 400` against a nav at `z-index: 200`, so it laid a
full-viewport click-catcher across the whole nav bar. `elementFromPoint` at
the Camera button's centre returned `#session-start`, not the button, so
`toggleCamera()` was never called and the camera looked completely dead —
while camera.js, its `window` exports, the vendored MediaPipe assets and
`getUserMedia` were all fine the entire time. It is now
`inset: var(--nav-h) 0 0 0`, so it dims and blocks the page content it is
asking about while the nav stays live.

Nav height is now a single token, `--nav-h` (62px, 56px under the 768px
breakpoint), read by `.app-nav`, `.nav-spacer` and this overlay — it had been
a bare `62px`/`56px` in three places, and an overlay hard-coding its own
geometry is precisely how this happened.

The distinction to preserve: `.shortcuts-overlay` and `.mic-cal-overlay`
(both `z-index: 500`, full `inset: 0`) are **user-invoked** and genuinely
modal, so covering the nav is correct for them. Anything that appears on its
own must not trap the user. If you add a self-opening overlay, inset it below
`--nav-h`.

The general lesson, since this is the second class of "the code is right but
the click never arrives" bug here: when a handler appears not to fire, check
that the click actually reaches the element (`document.elementFromPoint` on
its centre) *before* reading the handler's code. Both this and the duplicate
`class=` attribute bugs were invisible to code review and obvious to one
measurement.

Riffs have **no `id` field** — riffs.js identifies them positionally as
`` `${groupIndex}-${riffIndex}` `` and `recordRiffPlayed` stores
`{ playCount, title, lastPlayed }`. Reading `r.id` made "least played" return
the first riff every time; anything ranking riffs must use the positional key.

## Keyboard Shortcuts (js/shortcuts.js)

Space (metronome), M (mic), R (scale run), G (chord game), arrows
(position/chord), 1-5 (jump position), Tab (cycle modes), ? (help), Esc.

Two invariants worth preserving: every handler bails when focus is in an
input/textarea/select/**contenteditable** (the compact BPM field is
contenteditable — stealing Space or a digit from it would be worse than having
no shortcuts), and `preventDefault` runs only on the handled path, so Space
still scrolls and Tab still moves focus everywhere else.

## Mic Calibration (js/mic.js, bottom)

The detection constants are no longer guesses. Six guided steps — silence,
soft, hard, then bend / vibrato / slide separately (you cannot segment three
techniques out of one capture; you have to prompt for them individually).

Derivation: gate sits 20% above the **95th percentile** of silence (not the
max, so one cough doesn't set the session threshold), then is lowered if it
would exceed your softest playing — a slightly noisy gate beats one that
silently drops quiet notes. Sensitivity scales the hard peak toward ~0.6 RMS.
Technique thresholds land at ~60% of what you actually played.

`classifyTechnique`'s numbers are now `micTech` state rather than literals, so
they can be calibrated and persist per profile in `micCalibration`. Sliders
remain for fine-tuning.

**Load order**: `loadMicCalibration()` is called from `nav.js`'s `initNav()`,
NOT at the bottom of mic.js — mic.js loads at index.html:1284 and progress.js
at 1290, so a call there finds no `loadProgress` and silently skips. Same trap
that made `saveScalesState` throw.

## Rhythm Training (js/rhythm.js, Study > Rhythm)

Three trainers for the material the Zappa guide teaches but nothing drilled:

- **Subdivision** — quarter/eighth/triplet/16th/quintuplet over any meter
  including 7 and 11. Tap along; each tap is graded against the scheduled
  event time.
- **Polyrhythm** — 3, 5 or 7 against 4, as two rows (top is yours, bottom
  plays), locking on the first cell of each cycle.
- **Displacement** — snare marks phrase entry on beat 1, the "and" of 1,
  beat 2, the "and" of 2, beat 3, or the "e" of 1.

Grading: ≤45ms locked, ≤100ms close. The stats line reports **signed** average
too, so it names rushing vs dragging rather than only magnitude. Results feed
`data.rhythm`, keyed per trainer+setting.

Runs its **own** Web Audio scheduler rather than hooking `scheduleMetro` —
that loop is built around one chord-vamp-per-beat, and grafting sub-beat grids
and two simultaneous pulse trains onto it would mean rewriting it. BPM and
time signature are still read from `#bpm-slider`/`#time-sig`.

Two gotchas preserved in code: **Space taps the grid** while this sub-tab is
open (shortcuts.js checks `rhythmPanelActive()` first) — taking Space for the
metronome here would make the trainer unusable with a guitar in hand. And
`rhyStart` bails with a visible message if the AudioContext won't resume,
because a frozen `currentTime` makes the scheduler's while-loop exit every
tick and the trainer would *look* active while producing nothing.

**`switchStudySubtab` validates its argument.** The panel is
`study-subtab-listen`, not `listenrepeat`; the function matches ids literally,
so a wrong name used to deactivate every panel and render Study blank with no
error. It now warns and returns.

## Recorded Takes (storage.js + listenrepeat.js + progress.js)

Audio blobs live in a dedicated `takes` object store (IndexedDB **v2**) and
are **never** mirrored to localStorage — a few MB of audio would blow its
~5MB budget, and the `gpt_`-prefixed mirror logic must not sweep them.

"Keep this take" appears once a recording finishes and saves the blob with
date, sequence, scale, key, round accuracy, profile id, mime type and size.
Listing/rename/delete live in the **progress panel**, not Listen & Repeat,
because comparing takes over time is a progress question. Loading is lazy and
object URLs are revoked on re-render rather than leaked.

If you bump `IDB_VERSION` again, re-verify that the `kv` store and boot
recovery still work afterwards — that was checked for v1→v2 and is the main
risk of a schema change here.

## Mixer (audio.js) — master → bus → source

Every trigger site used to read `#vol-slider` and apply its own multiplier
(`vol*0.6`, `vol*0.85`, bare `vol`). Those were tuned against the **old
synthesised engine** and carried over unchanged when playback moved to
samples, which is why levels did not sit together.

`mixVol(sourceKey, scale)` is now the only way to ask "how loud". Three
stages: master (`#vol-slider`) → bus (`click` / `instrument` / `backing`,
user-controllable, persisted in `ui.mixer`) → fixed per-source level.

Shipped levels: metronome 0.70, scale run 0.75, chord strum 0.65, backing bass
0.45, backing chords 0.35, Listen & Repeat 0.75, riff 0.75, song 0.70.
Percussion sits at **21–37% of the instrument level** — the guitar you are
playing must always be the loudest thing.

All buses default to **unity**. Do not discount the backing bus "for safety":
the source levels already put backing under the instrument, and an 0.85 bus
double-applied it and pushed backing to 0.383/0.297 instead of 0.45/0.35.
`loadMixerSettings()` always rebuilds from defaults — only assigning when a
saved value existed left stale in-memory gains and broke Reset.

Relative accents *within* a source stay as the `scale` argument (a bent riff
note is still 1.15× its neighbours); absolute level comes from the mixer.

## Motion

- **Mode switches overlap**: outgoing lifts 8px and fades on an ease-IN over
  160ms while incoming rises from 8px below on an ease-OUT over 200ms, so
  there is no blank frame. Sub-tabs: 120/100ms, 5px.
- **`.exiting` is absolutely positioned**, so it needs an explicit `top` or it
  jumps to the top of the document (measured 2288px vs an incoming panel at
  130px). And that top must be **measured before any class is mutated** —
  `NAV_MODES` puts `scales` before `songs`, so measuring inside the loop read
  the outgoing panel's position *after* the incoming one was already in flow.
- **Sliding nav indicator** (`moveNavIndicator`) travels between tabs instead
  of a border toggling; re-measures on resize.
- **Feedback**: `springStreak()` (overshoot 1.15 then settle),
  `pulseSuccess()`/`pulseError()`, `playSuccessChime()`/`playErrorThud()`.
  Wrong-answer branches previously had no feedback at all.
- **Collapse** uses a `.collapsible` max-height transition, not `display:none`.

## Songs library — Guitar Pro only

`SONG_LIBRARY` is **deliberately empty**. Ten hand-written songs were removed:
they were stylistically-composed approximations, not transcriptions, and an
inaccurate chart teaches the wrong notes until they are muscle memory. Old
data is in git history at `5b5ef50`.

Guitar Pro is the first and default upload format. **Verified**: the AlphaTab
CDN module loads and exposes `AlphaTabApi`, and a corrupt buffer is rejected
with "No compatible importer found for file" rather than hanging. Still
unverified: `scoreToSongData`'s mapping of a real parsed score.

## Guitar Pro import — verified, and how

The whole Songs mode depends on this path, so it was verified properly by
generating real `Score` objects with AlphaTab's own **alphaTex** importer
(`new at.importer.AlphaTexImporter()`), which needs no `.gp` file. Four
defects were found and fixed:

1. **String mapping was mirrored.** The code did `6 - note.string` on a
   comment claiming "string 1 = high e". It is the opposite — string 1 reads
   **E2** and string 6 reads **E4** in standard tuning. Every import came out
   mirrored. Now `note.string - 1`, verified **by pitch**: AlphaTab's reported
   MIDI equals what our `(string, fret)` sounds through `fretToHz`, 8/8 notes.
2. **Duration was inverted.** `beat.duration` is an enum (Whole=1, Half=2,
   Quarter=4, Eighth=8), not a beat count. Use
   `playbackDuration / 960`.
3. **`tracks[0]` was hardcoded.** Real files are multi-track and track 0 is
   routinely drums. There is now a picker; the default is the 6-string track
   with the most notes.
4. **Chords were fabricated** — every bar backfilled with the previous chord
   or `'E'`. Now reads real chord names or returns none, and says so.

`playbackStart` was already correct: it is **bar-relative**.

If you touch this file, re-verify by pitch rather than by index. Both the
string and duration bugs looked plausible on inspection and were only visible
when the numbers were checked against what actually sounds.

## Content accuracy standard

The rule this project now holds: **if something claims to be a particular
recording, it has to actually be one.**

- `SONG_LIBRARY` is empty. Ten composed approximations were deleted rather
  than shipped as chord charts.
- `RIFF_LIBRARY` is kept, because a short lick that teaches a technique is
  genuinely useful practice material — but it is framed as *style exercises,
  not transcriptions*, in the section subtitle and in a comment at the head of
  the array. The two riffs that referenced a specific song were retitled
  ("Fingerpicked Drone — Sultans style", "Lydian Float — Watermelon style") so
  the claim is unambiguous in the library grid, where the title is all you see.

## Trend charts (js/trends.js)

Four hand-drawn SVG charts. **Not all the data existed**: practice time and
scale coverage come from `days[].scaleSeconds`/`scalesPracticed`, but
`chordPairs` stores no tempo and no dates, and quiz/LR kept only lifetime
totals. Chord BPM and per-session accuracy therefore start accumulating from
this build, and the empty state says so rather than showing a blank chart.

One point per series per day — BPM keeps the day's best, accuracy the latest.
Charts state direction in words ("up 22", "down 4") because a 74px sparkline
is easy to misread.

## Field names that have bitten twice

- `chordPairs[k]` = `{ attempts, correct, bestStreak, curStreak }` — **not**
  `success`/`fail`. session.js read the wrong names, so "your X → Y transition
  is weakest" never appeared in a real plan.
- `days[k]` = `{ scaleSeconds, scalesPracticed, riffsPlayed, gameSessions,
  listenRepeatSequences, songSessions }` — **not** `totalSeconds`. The import
  merge compared the wrong field, so both sides were always 0 and an imported
  day with more practice could never win.
- `riffTotals[k]` is keyed `` `${groupIndex}-${riffIndex}` `` with
  `{ playCount, title, lastPlayed }` — riffs have no `id`.

## Audio Architecture

### Two engines, split by mode

**Sample-based guitar engine** (`audio.js`, bottom section — "SAMPLE-BASED
GUITAR ENGINE"). Powers **Scale Run-Through, Riffs, and Songs** (including
Songs' "related riffs" mini-player). Real recorded guitar/bass notes instead
of synthesis.

**Tone.js synthesis voices** (`audio.js`, top section — Karplus-Strong pluck,
bend/vibrato mono-synth). **No longer power any musical content.** The Chords
strum (`playChordSound`) and the Chord Game strum (`strumGameChord`) were the
last two and now call `playSampledNote`; Listen & Repeat's sequences already
did. The only remaining synthesis is Listen & Repeat's correct-answer chime
(880Hz + 1108.7Hz) and the metronome click/percussion — correctly, since a
"ding" is not a guitar note.

**App-wide voice**: `currentInstrument()`/`setCurrentInstrument()` (persisted
in `ui.instrument`) is read by every sampled surface, so choosing Acoustic in
Scales also changes the Chords and Chord Game strum. Previously each surface
had its own selector or a hardcoded voice (Listen & Repeat was pinned to an
`LR_INSTRUMENT` constant), which is half of why the app sounded like different
instruments in different modes. `syncInstrumentSelectors()` runs at init so
every selector shows the persisted voice rather than its markup default.
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

**Mic ownership: `micSetEnabled()` is the only way in.** `initMic()` opens the
stream but does *not* set `micEnabled` or start the shared loops — it is an
internal helper, not an entry point. Listen & Repeat used to call it directly
from four places, which meant LR held a live mic entirely outside the master
switch: **turning the mic off in the mic bar had no effect on it**, and the bar
showed "off" while LR was still capturing. (The single-permission-prompt
property was never at risk — LR always shared the one stream — but the on/off
state was never shared at all.)

Everything now goes through `micSetEnabled(true|false)`, which broadcasts to
`onMicState(fn)` subscribers. Two consequences worth preserving:

- `syncMicBarUI()` is an `onMicState` subscriber rather than inline in the
  click handler, so the bar reflects the truth no matter who flipped the
  switch — LR's own "Connect Mic" button turns the mic on and the bar follows.
  It deliberately reads `micEnabled` rather than the broadcast argument, so it
  cannot be desynced by a stray call.
- `lrHandleMicState(false)` stops LR listening, zeroes its meter, stops the
  mic monitor (otherwise you still *hear* yourself after "mic off") and stops
  an in-progress recording via `micRecorder.stop()`, which preserves the take
  rather than discarding it.

`micSetEnabled` is idempotent — it early-returns if already in the requested
state, so it does not re-fire the broadcast or restart the loop.

**LR admits notes by onset time, not arrival time.** `lrHandleMicOnset` checks
`evt.time >= lrListenWindowStart`. mic.js's full-envelope event lands ~450ms
after the attack, so a note played just before the response window closes
arrives just after it; judging by arrival dropped exactly the notes at the end
of a phrase. LR's old local capture had the same bug in a different form (its
sampler bailed the instant `lrListening` went false, discarding the note
mid-capture). LR also records `technique` per note now, which it never had —
it comes free from the shared envelope.

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

## Fretboard Vision — camera note/chord readout (js/fretboard-vision.js)

**This removes the accuracy limitation documented below.** The camera can now
name the fret, string, notes and chord you are playing, because it finally
knows where the neck is.

You calibrate once by clicking four corners of **your** neck in the preview
(nut/low-E, nut/high-e, 12th/high-e, 12th/low-E). Then:

1. **Homography, not a stretch.** The neck is a plane seen at an angle, so the
   camera→neck mapping is projective. Verified on a synthetic trapezoid: all
   four corners land exactly on the unit square, and the visual centre maps to
   u=0.333 rather than 0.5 — the foreshortening a bilinear stretch misses.
2. **Real fret geometry.** Fret n sits at `1 - 2^(-n/12)` of scale length, so
   the marked nut→12th span is half the scale and spacing narrows going up.
   Verified: fret 12 at the span end, fret 5 at u=0.5017 (the 5th fret really
   is a quarter of scale length), round-trip exact. An even split would put
   fret 5 about a whole fret out.
3. Fingertips inside the quad → (string, fret) → note names → matched against
   `GAME_CHORDS`.

### Why the neck would not calibrate at all, and the rule that follows

Three defects stacked, and the first is the important one.

1. **`.camera-calibration-status` covered the canvas and ate every click.** It
   is `position: absolute; inset: 0` over the video area with default
   `pointer-events: auto`. Neck calibration works by clicking four corners *on
   the canvas underneath it*, so not one click ever landed. Worse, the branch
   that left it up is the **expected** one when the camera is aimed at a
   fretboard: `finishCalibration()` bails when it collects fewer than 10 hand
   samples, and it used to set an error message and `return` **without hiding
   the element** — your hand is not flat, spread and facing the camera when you
   are pointing it at a neck. Both status overlays are now
   `pointer-events: none` (they are readouts, never interactive) and the
   failure branch self-hides after 4s.
2. **The "camera is off" guard was dead code.** `fvStartNeckCalibration` read a
   bare `cameraEnabled`, which is a module-scoped `let` inside camera.js and
   therefore always `undefined` to a classic script — `typeof cameraEnabled
   !== 'undefined'` can never be true from outside the module, so calibration
   started happily with no video and four clicks into a black canvas. camera.js
   now exports `window.isCameraEnabled()`. It also used `alert()`, which blocks
   the page; it is an inline status now.
3. **The canvas click listener was bound only inside `enableCamera()`**, so any
   route that did not pass through the enable path left the canvas inert.
   `fvBindCanvas()` runs at load; camera.js keeps its `dataset.fvBound` guard so
   whichever runs first wins.

**The rule, now the THIRD time it has bitten** (planner over the nav, camera
status over the canvas, and the file:// banner over the nav while adding it —
caught by its own test before shipping): a full-bleed element near the top of
the page is a click-catcher unless you place it in normal flow with no stacking
context of its own. This is exactly
the practice-planner bug in a different place. When a handler appears not to
fire, check `document.elementFromPoint` on the target's centre *before* reading
the handler's code.

### Camera-informed note capture (`fvPositionForPitch`)

The microphone can say **what** and **when**. It cannot say **where**: a pitch
does not identify a string, because E4 exists on four of them. Lick capture
originally solved for the most economical fingering, which is a fair guess and
routinely the wrong string — E4 played at the 14th fret of the D string came
back as an open high e. That is the "capture didn't match the string I was
playing" report, and it was pitch-only capture working as designed rather than
a detection failure.

`fvRecordReading` keeps a 40s history of stable camera readings timestamped on
the **AudioContext clock** — the same clock as mic onsets — so a reading and an
onset can be lined up directly. `fvPositionForPitch(midi, time)` then answers
"where was this actually played":

- The correlation window is **asymmetric** (−0.18s / +0.35s). The camera runs
  at ~30fps and holds a reading over 5 frames to beat MediaPipe's jitter, so
  the frame confirming a note usually lands *after* the pick attack the mic
  timestamped.
- An **octave-off** camera sighting is accepted and the camera's octave wins.
  Pitch detectors slip octaves on the wound strings; the camera is measuring
  geometry rather than interpreting a waveform. Exact matches always outrank
  octave matches.
- It returns **null** when the camera cannot corroborate the pitch, and the
  caller falls back to the solve. Silence is the correct answer — asserting a
  string the camera did not see would be worse than admitting a guess.

Every note carries `source: 'camera' | 'inferred'`, the analysis carries a
`placement` tally, and both the explanation and a badge on the card say which
notes were **seen** and which were **estimated**. A measured position and a
guessed one must never look alike.

**Curl is not a contact gate — do not make it one again.** `fingerCurl`
measures tip-vs-base distance from the *wrist*; it answers "which fingers are
engaged in this shape", not "is this fingertip on the board". Used as a hard
gate it rejected fingers demonstrably on the correct fret. Containment in the
calibrated quad is the contact test (that is what calibration buys); curl only
weights a confidence value, and low-confidence notes render dimmed/dashed
rather than being hidden.

The overlay draws the neck outline plus fret lines at their true non-linear
positions, so you can *see* whether the mapping lines up rather than trusting
it. Clicks account for the preview's CSS mirror (`x → 1-x`). Corners persist
per profile and restore via `initNav`. Readings are held over 5 frames because
MediaPipe jitters enough to flicker between adjacent frets.

Verified: E major fingering → A2=B, D2=E, G1=G# → "E". Am → D2=E, G2=A, B1=C →
"Am". Monocular vision still cannot distinguish a finger resting near the
board from one pressing it — hence the visible confidence.

## Design tokens: single sources of truth

Two places had the same values written twice and drifted apart. Both are now
one definition:

- **Scale-degree ramp** (`--deg-1-bg` … `--deg-7-bd`). The fretboard note dots
  and the legend explaining them were separate literals; the legend still
  showed the pre-redesign grey/brown/purple ramp after the dots moved to the
  warm one, so **the key described colours the fretboard no longer used**.
- **Chord-Game neck canvas.** `dotColors` in game.js reads `--text`/`--blue`/
  `--success`/`--warning` through a `cssVar()` helper (canvas cannot use
  `var()`), and the HTML legend beneath it uses the same tokens. They were
  near-miss literals (`#5c8fff` vs `--blue`, `#4caf50` vs `--success`).

`index.html` now has **zero** inline styles carrying `font-family`, raw hex or
px font-sizes — the remaining `style=` attributes are `display:none` initial
state and a handful of layout one-offs. Utility classes (`.u-note`,
`.u-caps`, `.u-textarea`, …) cover what the inline styles used to.

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
- **Listen & Repeat's duplicate loops — fixed.** LR used to run its own
  onset-capture loop (`lrMicPollTick`) and level-meter loop
  (`lrStartMeterLoop`) over `mic.js`'s shared analyser, so with the mic bar
  on during a round that was three RAF loops and up to three `findPitch`
  calls per frame on the same buffer. Both are gone; LR is now a plain
  `onMicOnset`/`onMicLevel` subscriber like Scales and Chords, and `mic.js`
  is the only file that touches `micAnalyser`/`micPitchDetector` at all
  (verified by grep). See "Mic ownership" below for the behavioural half of
  that fix, which mattered more.
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
