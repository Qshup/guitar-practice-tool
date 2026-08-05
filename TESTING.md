# Testing with a guitar plugged in

Everything in this project splits into two piles: what can be proved by
arithmetic or in a browser, and what needs ears and an instrument. The first
pile is covered — `npm test` runs 77 unit tests, and every feature is checked
in a real browser before it ships. This file is the second pile.

Run `npm start`, allow the mic when Brave asks, and work down the list.

**The mic must be on for any of this.** The master switch is the mic bar —
`▶ MIC ON`, or the mic button in the compact toolbar. Nothing captures,
matches or grades while it is off, by design.

---

## 0. Calibrate first — everything below depends on it

The detection thresholds shipped as reasoned guesses, not measurements. If you
skip this, false positives here are expected and mean nothing.

1. Mic bar → **Calibrate**.
2. Six guided steps: silence, soft, hard, then bend / vibrato / slide.
3. Play each prompt the way you actually play, not exaggerated.

Afterwards, check the passive readout in the mic bar names the note you are
playing. If it lags or drops quiet notes, raise Sensitivity or lower the Noise
Gate before blaming anything downstream.

---

## 1. THE ONE TO DO FIRST — lick capture end to end

This is the highest-value test in the session because every claim it makes is
derived, and one wrong note in the transcription changes the whole analysis.

**Play exactly this, slowly, one note per beat at 80bpm, and let each ring:**

```
E minor pentatonic, position 1
e|------------------|
B|-------------3--5-|
G|----0--2--4-------|
D|-2----------------|
A|------------------|
E|------------------|
   E  G  A  B  D  E
```

Then hit **Capture Lick** in the mic bar.

**What must be true:**

| Check | Expected |
|---|---|
| Note sequence | `E G A B D E` — exactly six, in order |
| Scale identified | **E Minor Pentatonic**, 100% fit, 5 of 5 degrees |
| Tab shown | matches the frets you actually played (2,0,2,4,3,5) |
| Audio playback | plays back what you just played, ~8s |
| Shape | "ascending, spanning 12 semitones" |

**If the notes are wrong**, that is the pitch detector, not the theory — the
theory is unit-tested. Recalibrate, move the mic closer, use the neck pickup,
and roll tone back. Distortion and pick attack both confuse pitch detection.

**Then test the retroactive part properly**: noodle for 30 seconds, play
something you like, and hit Capture *after* you have finished playing it. The
whole design assumes you never decide in advance. It should catch the last 8
seconds including the phrase you just finished.

### 1b. Chord-tone analysis (needs the backing track)

1. Metronome bar → set a backing style (Minor or Hazel), press play.
2. Solo over it in the same key for a few bars.
3. Capture.

The analysis should name the chords it heard (`Over the Em → G that was
playing…`) and count chord tones vs tension notes. **Play a deliberate wrong
note** — an F over an Em — and confirm it comes back as a tension note rather
than being quietly counted as fine.

The interesting one: play the **same note over two different chords** and
confirm it is described differently. G over Em is the 3rd; G over G is the
Root. That per-note tracking is the feature.

### 1c. Variations

On any saved lick, press **▶ Hear it** on each of the three variations.

- **Sequence** should sound like the same idea moved up — recognisably related,
  not identical. If it sounds like the same lick at a different pitch, the
  diatonic shift is wrong (it should change the intervals, not just transpose).
- **Rhythm** must be the *same notes* — verify by ear that no pitch changed.
- **String set** must sound identical in pitch to the original and be fingered
  somewhere else. Play it from the tab and confirm it is the same lick.

---

## 2. Camera — the fix from this session

The camera failure was never the camera; the practice-planner overlay was
covering the nav bar and swallowing the click.

1. Load the page. **Leave the "Plan today's practice" panel open.**
2. Click **Camera Off** in the nav *while the planner is still up*.
3. Brave should raise a camera permission request. Allow it.

**Expected:** button flips to `Camera On`, video feed appears, MediaPipe
skeleton overlay tracks your hand. Every other nav button should also work
with the planner open — that was the actual bug and it affected all nine.

Then calibrate the neck: click the four corners of *your* fretboard in the
preview (nut/low-E, nut/high-e, 12th/high-e, 12th/low-E) and confirm the drawn
fret lines land on your real frets. They should get closer together going up
the neck — if they are evenly spaced, the geometry is wrong.

Fret a chord and check it names it. Known limit: a monocular camera cannot tell
a finger resting near the board from one pressing it, which is why low
confidence renders dimmed rather than hidden.

---

## 3. Listen & Repeat — the mic refactor from this session

The risk here is a regression, since working code was rewired.

1. Study → Listen & Repeat → **Start**. Play back the sequences as prompted.
2. Grading should work exactly as it did before.

**Then test the three things the refactor was for:**

- **One permission prompt.** Reload, turn the mic on in the mic bar, then go to
  Listen & Repeat. It must **not** ask for the mic a second time.
- **Off means off.** Start a round, then turn the mic off in the mic bar
  mid-round. LR must stop listening, its meter must zero, and it must say
  "Mic is off". Previously LR carried on with the bar showing "off".
- **Trailing notes.** Play a note *right at the end* of the response window.
  It should still be counted — notes are admitted by when they were played, not
  when the analysis finished.

Also: with the mic bar on and an LR round running, playing should feel no
worse than before. That path used to run three loops over the same buffer.

---

## 4. Backing track feel — still unverified, still needs ears

Composed by reasoning with no audio available. Nobody has confirmed these
sound like what they claim. Listen to each with a guitar in hand:

| Style | The claim to check |
|---|---|
| `blues` | Does it actually **shuffle**? Hi-hat on the 1st and 3rd triplet |
| `minor` | Does the chord stab sit **behind** the beat, on the "and"? |
| `knopfler` | Does it read as **fingerpicking** rather than strumming? |
| `hazel` | Do the upbeat stabs **groove**, or read as a metronome exercise? |
| `zappa` in 7/8 | Does the melodic fragment fold correctly, no flat tail on 4-7? |

## 5. Mixer balance — also needs ears

Levels are verified correct to 1e-6 against spec, but the spec itself was
chosen without hearing it. Play along with a backing track at performance
volume: **your guitar must be the loudest thing.** Percussion sits at 21–37% of
the instrument level deliberately. If drums fight your playing, adjust the
Backing bus in the mixer (metronome bar → Mixer) rather than the master.

---

## What is NOT in this file yet

Built but not yet in this session's scope: the Phrasing trainer, Chord Tone
Targeting trainer, Motif development tools and Personal Sound Profile are not
built (see the session notes in git). When they land, this file needs sections
for what to play to verify phrase-boundary detection, beat-1 chord-tone
landing, and motif extraction.

## Reporting a failure usefully

The unit tests cover the maths, so a failure here is almost always detection,
not theory. Worth recording when something misbehaves:

- what you played (tab or note names), tempo, pickup and tone setting
- what the tool said instead
- whether you had calibrated, and your Sensitivity / Noise Gate values

That last line is the difference between a fixable report and a shrug.
