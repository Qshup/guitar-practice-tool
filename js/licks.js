// ═══════════════════════════════════════════════════════════════════════════
// LICK CAPTURE AND VOCABULARY BUILDER
// ═══════════════════════════════════════════════════════════════════════════
//
// You play something good, and only afterwards decide it was worth keeping.
// So capture is retroactive: the audio and the notes are already in hand when
// you press the button (mic.js's ring buffer and onset history), and pressing
// it just decides to keep the last 8 seconds.
//
// Everything here is derived, never stored as a lookup table — the scale a
// lick fits, the intervals it uses, which notes were chord tones against
// whatever the backing track was playing, and the six motif developments.
// That is deliberate and it is the same standard the rest of this project
// holds: a hand-typed table of "licks that fit Dorian" can be silently wrong
// and you would never know. Interval arithmetic can be checked.
//
// The honest limit, stated here because the UI states it too: a monophonic
// pitch detector hears one note at a time. A lick with two notes ringing
// together is transcribed as whichever the detector locked onto. This is
// vocabulary capture for single-note lines, which is what soloing is.

// ── Interval vocabulary ───────────────────────────────────────────────────
const LICK_INTERVALS = [
  { semi: 0,  short: 'unison', name: 'unison',          colour: 'a repeated note' },
  { semi: 1,  short: 'm2',     name: 'minor 2nd',       colour: 'the tightest, most tense step there is' },
  { semi: 2,  short: 'M2',     name: 'major 2nd',       colour: 'an ordinary step — the connective tissue of a line' },
  { semi: 3,  short: 'm3',     name: 'minor 3rd',       colour: 'the blues interval; sounds vocal and slightly mournful' },
  { semi: 4,  short: 'M3',     name: 'major 3rd',       colour: 'bright and sweet — the interval that sounds happy' },
  { semi: 5,  short: 'P4',     name: 'perfect 4th',     colour: 'open and suspended, wants to move' },
  { semi: 6,  short: 'TT',     name: 'tritone',         colour: 'the most unstable interval in music — it demands resolution' },
  { semi: 7,  short: 'P5',     name: 'perfect 5th',     colour: 'hollow and strong; the most stable leap' },
  { semi: 8,  short: 'm6',     name: 'minor 6th',       colour: 'a wide, aching leap' },
  { semi: 9,  short: 'M6',     name: 'major 6th',       colour: 'wide and sweet — a country/western leap' },
  { semi: 10, short: 'm7',     name: 'minor 7th',       colour: 'bluesy and unresolved' },
  { semi: 11, short: 'M7',     name: 'major 7th',       colour: 'a very exposed, jazzy stretch' },
  { semi: 12, short: '8ve',    name: 'octave',          colour: 'the same note, relocated — pure emphasis' },
];
function lickIntervalInfo(semi) {
  const a = Math.abs(semi);
  return LICK_INTERVALS[a] || { semi: a, short: a + 'st', name: a + ' semitones', colour: 'a very wide leap' };
}

// ── Fretboard placement ───────────────────────────────────────────────────
// A pitch does not tell you where it was played — E4 exists on four strings.
// This picks the path a hand would actually take: minimum total fret travel,
// with a mild cost for crossing strings and a mild preference for the lower
// neck, solved exactly with a small dynamic program rather than greedily
// (greedy commits to a cheap first note and pays for it for the rest of the
// phrase).
const LICK_MAX_FRET = 22;

function lickFretPositions(midis, allowedStrings, minFret) {
  if (!midis.length) return [];
  const allowed = allowedStrings && allowedStrings.length ? allowedStrings : [0, 1, 2, 3, 4, 5];
  const floor = minFret || 0;
  const cands = midis.map(m => {
    const out = [];
    for (const s of allowed) {
      const f = m - STRING_MIDI[s];
      // An open string is always allowed even under a position floor — you do
      // not re-finger an open E to play in 5th position.
      if (f >= 0 && f <= LICK_MAX_FRET && (f >= floor || f === 0)) out.push({ string: s, fret: f });
    }
    return out;
  });
  // A note outside the guitar's range is kept as a note with no position
  // rather than dropped — usually an octave error from the detector, and
  // hiding it would make the transcription look cleaner than it is.
  const place = (c) => c.length ? c : [null];
  const cost = (prev, cur) => {
    if (!prev || !cur) return 0;
    return Math.abs(cur.fret - prev.fret) + 0.5 * Math.abs(cur.string - prev.string);
  };
  let layer = place(cands[0]).map(c => ({ c, total: c ? c.fret * 0.05 : 0, path: [c] }));
  for (let i = 1; i < cands.length; i++) {
    const next = [];
    for (const cur of place(cands[i])) {
      let best = null;
      for (const st of layer) {
        const t = st.total + cost(st.c, cur) + (cur ? cur.fret * 0.05 : 0);
        if (!best || t < best.total) best = { c: cur, total: t, path: st.path.concat([cur]) };
      }
      next.push(best);
    }
    layer = next;
  }
  return layer.reduce((a, b) => (a.total <= b.total ? a : b)).path;
}

// ── Scale identification ──────────────────────────────────────────────────
// Which scale does this line live in? Two things make this harder than
// set-matching:
//
// 1. Identical pitch-class sets. E minor pentatonic and G major pentatonic are
//    the SAME five notes. Nothing in the note set separates them — only which
//    note behaves like home does. So root evidence is scored explicitly:
//    where the line ends (strongest — a phrase resolves to its tonic), where
//    it starts, which note is most frequent, and which is lowest.
// 2. Bigger scales trivially win on containment. Chromatic contains
//    everything. So a scale is rewarded for being SMALL and for having its
//    degrees actually used — a 7-note scale where the line only touches 3
//    degrees is a worse description than a 5-note scale it fills completely.
// `chordRootPcs` is the sequence of chord roots that were sounding, oldest
// first, when a backing track was running. It is by far the strongest tonic
// evidence available and ignoring it produced a genuinely wrong answer in
// testing: E-G-B-D played over an Em→G vamp came back as "B Natural Minor",
// because the line happens to END on B. Ending on the 5th is completely
// ordinary — it is weak evidence, and it was outweighing everything else.
function lickIdentifyScales(midis, limit, chordRootPcs) {
  if (!midis.length) return [];
  const pcCount = {};
  midis.forEach(m => { const pc = ((m % 12) + 12) % 12; pcCount[pc] = (pcCount[pc] || 0) + 1; });
  const playedPcs = Object.keys(pcCount).map(Number);
  const total = midis.length;
  const firstPc = ((midis[0] % 12) + 12) % 12;
  const lastPc = ((midis[midis.length - 1] % 12) + 12) % 12;
  const lowestPc = ((Math.min(...midis) % 12) + 12) % 12;
  const maxCount = Math.max(...Object.values(pcCount));
  const chords = Array.isArray(chordRootPcs) ? chordRootPcs : [];
  const results = [];

  for (let root = 0; root < 12; root++) {
    for (const sc of ALL_SCALES) {
      const scalePcs = sc.intervals.map(i => (root + i) % 12);
      const inScale = playedPcs.filter(pc => scalePcs.includes(pc));
      const fitWeight = inScale.reduce((s, pc) => s + pcCount[pc], 0) / total;
      const coverage = inScale.length / sc.intervals.length;
      // Smallest scale in the table is the 5-note pentatonic, largest the
      // 12-note chromatic; map that span onto 1..0 so specificity is
      // comparable across the set.
      const specificity = 1 - (sc.intervals.length - 5) / 7;
      let rootEvidence = 0;
      if (lastPc === root)  rootEvidence += 0.30;   // where a phrase lands — real, but a 5th ending is common
      if (firstPc === root) rootEvidence += 0.20;
      if ((pcCount[root] || 0) === maxCount) rootEvidence += 0.20;
      if (lowestPc === root) rootEvidence += 0.10;
      if (chords.length) {
        // The chord the vamp starts on is the closest thing to a declared
        // tonic; being any chord root at all is weaker but still counts.
        if (chords[0] === root) rootEvidence += 0.45;
        else if (chords.includes(root)) rootEvidence += 0.15;
      }
      const score = fitWeight * 100                  // containment dominates
                  + (fitWeight === 1 ? 25 : 0)       // a perfect fit is categorically better
                  + coverage * 24                    // a scale the line actually FILLS describes it better
                  + specificity * 14
                  + Math.min(1, rootEvidence) * 30;
      results.push({
        scaleId: sc.id, scaleName: sc.name, rootPc: root, keyName: CHROMATIC[root],
        intervals: sc.intervals, note: sc.note, zappa: !!sc.zappa, zappaNote: sc.zappaNote || '',
        fit: fitWeight, coverage, degreesUsed: inScale.length, score,
        outside: playedPcs.filter(pc => !scalePcs.includes(pc)).map(pc => CHROMATIC[pc]),
      });
    }
  }
  results.sort((a, b) => b.score - a.score);
  // Chromatic fits every line by definition, so it is never a useful answer
  // unless genuinely nothing else contains the notes.
  const nonChromatic = results.filter(r => r.scaleId !== 'chromatic');
  const ranked = nonChromatic.length && nonChromatic[0].fit === 1 ? nonChromatic : results;
  const seen = new Set();
  const out = [];
  for (const r of ranked) {
    const key = r.scaleId + ':' + r.rootPc;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= (limit || 3)) break;
  }
  return out;
}

// ── Interval sequence ─────────────────────────────────────────────────────
function lickIntervalSequence(midis) {
  const out = [];
  for (let i = 1; i < midis.length; i++) {
    const semi = midis[i] - midis[i - 1];
    const info = lickIntervalInfo(semi);
    out.push({ semi, dir: semi > 0 ? 'up' : semi < 0 ? 'down' : 'same',
               short: info.short, name: info.name, colour: info.colour });
  }
  return out;
}

// ── Chord-tone roles ──────────────────────────────────────────────────────
// Per note, against whatever chord was actually sounding at that note's
// timestamp — not against one chord snapshotted at capture time. Uses
// harmony.js's harmonicRole so the classification is the same one the neck
// overlay paints, rather than a second opinion that could disagree with it.
function lickChordToneRoles(notes) {
  if (typeof harmonyChordAt !== 'function' || typeof harmonicRole !== 'function') return null;
  let any = false;
  const roles = notes.map(n => {
    const chord = harmonyChordAt(n.time);
    if (!chord) return null;
    any = true;
    const interval = ((n.midi % 12) - chord.rootPc + 24) % 12;
    const role = harmonicRole(interval, chord.intervals);
    return { chordLabel: chord.label, chordRoot: chord.rootName, role,
             roleLabel: (HARMONY_ROLES[role] || {}).label || role, interval };
  });
  return any ? roles : null;
}

// ── Contour ───────────────────────────────────────────────────────────────
function lickContour(midis) {
  if (midis.length < 2) return { shape: 'single note', range: 0 };
  const range = Math.max(...midis) - Math.min(...midis);
  const peakIdx = midis.indexOf(Math.max(...midis));
  const troughIdx = midis.indexOf(Math.min(...midis));
  const net = midis[midis.length - 1] - midis[0];
  let shape;
  if (peakIdx > 0 && peakIdx < midis.length - 1 && peakIdx >= midis.length * 0.3) shape = 'arc — it rises to a peak and comes back down';
  else if (troughIdx > 0 && troughIdx < midis.length - 1) shape = 'valley — it dips and recovers';
  else if (net > 2) shape = 'ascending';
  else if (net < -2) shape = 'descending';
  else shape = 'level — it stays in one register';
  return { shape, range, net, peakIdx, troughIdx };
}

// ── Rhythm ────────────────────────────────────────────────────────────────
function lickRhythm(notes) {
  if (notes.length < 2) return { gaps: [], evenness: 1, notesPerSec: 0 };
  const gaps = [];
  for (let i = 1; i < notes.length; i++) gaps.push(notes[i].time - notes[i - 1].time);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const varr = gaps.reduce((a, g) => a + (g - mean) * (g - mean), 0) / gaps.length;
  const cv = mean > 0 ? Math.sqrt(varr) / mean : 0;   // coefficient of variation
  const span = notes[notes.length - 1].time - notes[0].time;
  return { gaps, meanGap: mean, evenness: Math.max(0, 1 - cv), notesPerSec: span > 0 ? (notes.length - 1) / span : 0 };
}

// ── Plain-English explanation ─────────────────────────────────────────────
// Every sentence below is generated from a measurement made above. Nothing
// here is a stock phrase picked by scale name — if it says the line is mostly
// stepwise with one leap, that was counted; if it says you resolved to the 5th,
// that came from the chord that was actually sounding on that note.
function lickExplain(a) {
  const parts = [];
  const top = a.scaleMatches[0];
  const n = a.notes.length;

  if (top) {
    const fitTxt = top.fit === 1
      ? `All ${n} notes sit inside ${top.keyName} ${top.scaleName}`
      : `${Math.round(top.fit * 100)}% of what you played sits inside ${top.keyName} ${top.scaleName}` +
        (top.outside.length ? ` — the outliers were ${top.outside.join(', ')}, which read as chromatic passing tones` : '');
    const character = top.note ? ` (${top.note})` : '';
    parts.push(`${fitTxt}${character}. You used ${top.degreesUsed} of its ${top.intervals.length} degrees.`);
    if (top.zappa && top.zappaNote) parts.push(`On this scale specifically: ${top.zappaNote.replace(/\s+$/, '')}.`);
  }

  // Interval character — counted, not assumed.
  if (a.intervals.length) {
    const steps = a.intervals.filter(i => Math.abs(i.semi) <= 2 && i.semi !== 0).length;
    const leaps = a.intervals.filter(i => Math.abs(i.semi) >= 5);
    const tally = {};
    a.intervals.forEach(i => { if (i.semi !== 0) tally[Math.abs(i.semi)] = (tally[Math.abs(i.semi)] || 0) + 1; });
    const commonest = Object.entries(tally).sort((x, y) => y[1] - x[1])[0];
    if (steps / a.intervals.length > 0.6) {
      parts.push(`The motion is mostly stepwise — ${steps} of ${a.intervals.length} moves are a tone or less. That is what makes it sound like a melody rather than an exercise.`);
    } else if (leaps.length / a.intervals.length > 0.5) {
      parts.push(`This is a leaping line — ${leaps.length} of ${a.intervals.length} moves are a 4th or wider. Wide intervals are what stop a phrase sounding like a scale run.`);
    }
    if (commonest) {
      const info = lickIntervalInfo(Number(commonest[0]));
      parts.push(`Your most-used interval is the ${info.name} (${commonest[1]}×) — ${info.colour}.`);
    }
    const tri = a.intervals.filter(i => Math.abs(i.semi) === 6).length;
    if (tri) parts.push(`There ${tri === 1 ? 'is a tritone' : `are ${tri} tritones`} in here. That is the most unstable interval available and it is why those moments feel like they are falling forward.`);
  }

  // Harmonic context — only when a backing track was actually running.
  if (a.chordRoles) {
    const named = a.chordRoles.filter(Boolean);
    const chordTones = named.filter(r => ['root', 'third', 'fifth', 'seventh'].includes(r.role));
    const tensions = named.filter(r => r.role === 'avoid');
    const chords = [...new Set(named.map(r => r.chordLabel))];
    parts.push(`Over the ${chords.join(' → ')} that was playing, ${chordTones.length} of ${named.length} notes were chord tones and ${tensions.length} were tension notes.`);
    const last = named[named.length - 1];
    if (last) {
      const resolved = ['root', 'third', 'fifth'].includes(last.role);
      parts.push(resolved
        ? `You landed on the ${last.roleLabel.toLowerCase()} of ${last.chordRoot} — ${last.role === 'root' ? 'the phrase sounds finished' : 'stable, but it leaves the line open rather than fully closed'}.`
        : `Your last note was the ${last.roleLabel.toLowerCase()} against ${last.chordRoot}, so the phrase ends unresolved — it is still leaning somewhere. That is a real choice, not a mistake, but it wants an answer.`);
    }
  } else {
    parts.push('No backing track was running, so there is no harmonic context to judge this against — the note choices are reported on their own terms.');
  }

  // Shape and rhythm.
  parts.push(`Shape: ${a.contour.shape}, spanning ${a.contour.range} semitones.`);
  if (a.rhythm.notesPerSec > 0) {
    const even = a.rhythm.evenness > 0.75 ? 'evenly spaced' : a.rhythm.evenness > 0.45 ? 'loosely spaced' : 'very uneven — the spacing itself is part of the phrasing';
    parts.push(`You played ${n} notes at about ${a.rhythm.notesPerSec.toFixed(1)} per second, ${even}.`);
  }

  if (a.techniques.length) {
    parts.push(`Technique detected: ${a.techniques.join(', ')}.`);
  }

  // Say plainly where the fingering came from. A pitch does not identify a
  // string, so without the camera the tab below is a reasonable solve and not
  // a record of what your hand did — and the difference matters if you are
  // going to read it back.
  const p = a.placement;
  if (p && p.total) {
    if (p.seen === p.total) {
      parts.push(`Positions: all ${p.total} notes were seen on the neck by the camera, so the tab is where you actually played them.`);
    } else if (p.seen) {
      parts.push(`Positions: ${p.seen} of ${p.total} notes were seen by the camera; the other ${p.total - p.seen} are placed by the most economical fingering, so those strings are an estimate.`);
    } else {
      parts.push('Positions: the camera did not corroborate these notes, so the tab shows the easiest fingering for the pitches — a pitch alone cannot say which string you used. Calibrate the neck to capture the real positions.');
    }
    if (p.octaveFixed) {
      parts.push(`${p.octaveFixed} note${p.octaveFixed > 1 ? 's were' : ' was'} corrected by an octave against what the camera saw — pitch detectors slip octaves on the wound strings.`);
    }
  }
  return parts;
}

// ── Orchestrator ──────────────────────────────────────────────────────────
// Resolve each note's position, preferring what the camera actually SAW over
// what the pitch implies.
//
// This is the fix for "the capture didn't match the string I was playing". The
// mic gives what and when; it cannot give where, because a pitch does not
// identify a string (E4 exists on four). lickFretPositions solves for the
// most economical fingering, which is a sensible guess and frequently the
// wrong string — if you played E4 on the low E string at fret 12, the solver
// will happily place it at fret 0 of the high e.
//
// So: if the neck is calibrated and the camera corroborated a note at that
// moment, use its string and fret. Otherwise fall back to the solve, and MARK
// which notes were seen versus inferred so the UI can say so rather than
// presenting a guess with the same confidence as a measurement.
function lickResolvePositions(notes) {
  const midis = notes.map(n => n.midi);
  const inferred = lickFretPositions(midis);
  const canSee = typeof fvPositionForPitch === 'function';
  let seen = 0, octaveFixed = 0;
  notes.forEach((n, i) => {
    const cam = canSee && typeof n.absTime === 'number' ? fvPositionForPitch(n.midi, n.absTime) : null;
    if (cam) {
      n.string = cam.string; n.fret = cam.fret; n.source = 'camera';
      n.camConfidence = cam.confidence;
      if (cam.match === 'octave') {
        // The camera saw this note an octave from what the detector reported.
        // Geometry beats waveform interpretation here: trust the camera and
        // correct the pitch, which also fixes the note name.
        n.midi = cam.midi;
        n.noteName = CHROMATIC[((cam.midi % 12) + 12) % 12];
        octaveFixed++;
      }
      seen++;
    } else {
      const p = inferred[i];
      n.string = p ? p.string : null;
      n.fret = p ? p.fret : null;
      n.source = 'inferred';
    }
  });
  return { seen, octaveFixed, total: notes.length };
}

function lickAnalyse(rawNotes) {
  const notes = rawNotes.filter(n => n && typeof n.midi === 'number');
  const placement = lickResolvePositions(notes);
  const midis = notes.map(n => n.midi);
  const techniques = [...new Set(notes.map(n => n.technique).filter(Boolean))];
  // Chord roles are resolved BEFORE scale identification so the harmonic
  // context can inform which root the line is really in — see the note on
  // lickIdentifyScales.
  const chordRoles = lickChordToneRoles(notes);
  const chordRootPcs = chordRoles
    ? [...new Set(chordRoles.filter(Boolean).map(r => CHROMATIC.indexOf(r.chordRoot)))].filter(pc => pc >= 0)
    : [];
  const a = {
    notes,
    noteNames: notes.map(n => n.noteName),
    scaleMatches: lickIdentifyScales(midis, 3, chordRootPcs),
    intervals: lickIntervalSequence(midis),
    chordRoles,
    contour: lickContour(midis),
    rhythm: lickRhythm(notes),
    techniques,
    placement,
  };
  a.explanation = lickExplain(a);
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB RENDERING
// ═══════════════════════════════════════════════════════════════════════════
// Same convention as RIFF_LIBRARY's hand-written tabs: high e on top, low E on
// the bottom, one column per note. Generated rather than typed, so a tab can
// never disagree with the notes it claims to show.
function lickTabLines(notes) {
  const rows = [[], [], [], [], [], []];   // index = string index, 0 = low E
  const width = notes.map(n => (n.fret === null || n.fret === undefined ? 1 : String(n.fret).length));
  notes.forEach((n, i) => {
    for (let s = 0; s < 6; s++) {
      const cell = (n.string === s && n.fret !== null && n.fret !== undefined)
        ? String(n.fret).padEnd(width[i], '-')
        : '-'.repeat(width[i]);
      rows[s].push(cell);
    }
  });
  const labels = ['E', 'A', 'D', 'G', 'B', 'e'];
  return [5, 4, 3, 2, 1, 0].map(s => `${labels[s]}|-${rows[s].join('--')}-|`).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPMENT SUGGESTIONS — three ways to take the lick somewhere
// ═══════════════════════════════════════════════════════════════════════════

// Move a line by scale DEGREES rather than semitones. This is the difference
// between a sequence and a transposition: shifting C-E-G up one degree inside
// C major gives D-F-A, whose intervals are m3+m3 where the original was
// M3+m3. The shape is recognisably the same and the colour is different,
// which is the entire point of the device. Semitone transposition would just
// give the identical lick somewhere else.
//
// Notes outside the scale keep their chromatic offset from the degree below
// them, so a passing tone stays a passing tone instead of being flattened
// onto the nearest scale note.
function lickDiatonicShift(midis, rootPc, intervals, steps) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const len = sorted.length;
  return midis.map(m => {
    const rel = (((m % 12) + 12) % 12 - rootPc + 24) % 12;
    let idx = sorted.indexOf(rel);
    let offset = 0;
    if (idx < 0) {
      idx = 0;
      for (let i = 0; i < len; i++) if (sorted[i] < rel) idx = i;
      offset = rel - sorted[idx];
    }
    const ni = idx + steps;
    const oct = Math.floor(ni / len);
    const nrel = sorted[((ni % len) + len) % len] + offset;
    return m + (nrel - rel) + 12 * oct;
  });
}

// Rhythm variations are expressed as proportional gap patterns rather than
// absolute times, so they read the same at any tempo.
const LICK_RHYTHM_PATTERNS = [
  { id: 'even',    name: 'Straight',      gaps: [1],       why: 'every note the same length — the neutral reading' },
  { id: 'swing',   name: 'Swung',         gaps: [2, 1],    why: 'long-short triplet feel; this alone turns a scale run into a blues line' },
  { id: 'gallop',  name: 'Gallop',        gaps: [1, 1, 2], why: 'two quick notes pushing into a longer one — urgency without playing faster' },
  { id: 'dotted',  name: 'Dotted',        gaps: [3, 1],    why: 'a hard lean on the first note; the short note becomes a pickup into the next' },
  { id: 'front',   name: 'Front-loaded',  gaps: [1, 1, 1, 3], why: 'a burst then a rest — leaves space, which is the hardest thing to do' },
];

function lickApplyRhythm(count, pattern, unit) {
  const times = [0];
  for (let i = 1; i < count; i++) {
    const g = pattern.gaps[(i - 1) % pattern.gaps.length];
    times.push(times[i - 1] + g * unit);
  }
  return times;
}

// Where else on the neck can this exact line be played?
//
// Guitar strings overlap by a 4th, so most single-note lines are playable in
// two or three places. Two things this has to get right:
//
// - Windows must be wide enough for the line. A phrase spanning an octave
//   cannot fit on three adjacent strings without a huge fret stretch, so
//   restricting to 3-string sets found no alternative at all for exactly the
//   kind of lick most worth relocating. Four-string windows are included.
// - "Different" means a different place for your hand, which is a different
//   string group OR a different neck position. Scoring only string distance
//   missed the very common case of the same strings played ten frets up.
function lickAlternateStringSet(midis, currentStrings, currentFrets) {
  const used = currentStrings.filter(s => s !== null);
  const curString = used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;
  const curFrets = (currentFrets || []).filter(f => f !== null && f !== undefined);
  const curFret = curFrets.length ? curFrets.reduce((a, b) => a + b, 0) / curFrets.length : 0;
  const windows = [[0, 1, 2, 3, 4, 5], [0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5],
                   [0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]];
  // Position floors matter as much as string windows. Any window that still
  // contains the original strings just reproduces the original placement,
  // because that placement IS the minimum-travel one — searching windows alone
  // found no alternative at all for an octave-spanning line. Forcing the hand
  // up the neck ("play it in 5th position") is the relocation a guitarist
  // actually wants, and it is what makes the same shape land on a new string
  // set as a consequence.
  const floors = [0, 3, 5, 7, 9, 12];
  const options = [];
  for (const set of windows) {
    for (const floor of floors) {
      const pos = lickFretPositions(midis, set, floor);
      if (pos.some(p => !p)) continue;                     // not all notes reachable there
      const frets = pos.map(p => p.fret);
      const span = Math.max(...frets) - Math.min(...frets);
      if (span > 6) continue;                              // beyond one hand position
      const setString = pos.reduce((a, p) => a + p.string, 0) / pos.length;
      const setFret = frets.reduce((a, b) => a + b, 0) / frets.length;
      // A whole string of distance and four frets of distance are treated as
      // comparably "somewhere else" for the fretting hand.
      const distance = Math.abs(setString - curString) + Math.abs(setFret - curFret) / 4;
      options.push({ set, pos, span, distance, floor });
    }
  }
  options.sort((a, b) => (b.distance - a.distance) || (a.span - b.span));
  return options.find(o => o.distance >= 1) || null;
}

function lickVariations(lick) {
  const a = lick.analysis;
  const midis = lick.notes.map(n => n.midi);
  const top = a.scaleMatches && a.scaleMatches[0];
  const out = [];
  if (!midis.length) return out;
  const baseUnit = Math.max(0.12, a.rhythm.meanGap || 0.25);

  // 1 — same lick starting on a different scale degree
  if (top) {
    const shifted = lickDiatonicShift(midis, top.rootPc, top.intervals, 1);
    const pos = lickFretPositions(shifted);
    const notes = shifted.map((m, i) => ({
      midi: m, noteName: CHROMATIC[((m % 12) + 12) % 12],
      string: pos[i] ? pos[i].string : null, fret: pos[i] ? pos[i].fret : null,
      time: lick.notes[i].time - lick.notes[0].time,
    }));
    const before = lickIntervalSequence(midis).map(i => i.short).join(' ');
    const after = lickIntervalSequence(shifted).map(i => i.short).join(' ');
    out.push({
      id: 'sequence', title: 'Sequence — start a degree higher',
      why: `The same shape moved up one degree of ${top.keyName} ${top.scaleName}. Because you move by scale steps and not semitones, the intervals change with it: ${before || '—'} becomes ${after || '—'}. That is what makes a sequence sound developed rather than repeated. Knopfler builds whole solos this way.`,
      notes, tab: lickTabLines(notes),
    });
  }

  // 2 — same notes, different rhythm
  const current = a.rhythm.evenness > 0.7 ? 'even' : 'uneven';
  const pick = LICK_RHYTHM_PATTERNS.find(p => (current === 'even' ? p.id === 'swing' : p.id === 'even')) || LICK_RHYTHM_PATTERNS[1];
  const times = lickApplyRhythm(midis.length, pick, baseUnit);
  const rNotes = midis.map((m, i) => ({
    midi: m, noteName: lick.notes[i].noteName,
    string: lick.notes[i].string, fret: lick.notes[i].fret, time: times[i],
  }));
  out.push({
    id: 'rhythm', title: `Rhythm — play it ${pick.name.toLowerCase()}`,
    why: `Identical notes, redistributed in time: ${pick.why}. You played this ${current === 'even' ? 'fairly evenly' : 'unevenly'}, so this is the version that will sound least like what you already did. Changing rhythm alone is the cheapest way to get a second idea out of one lick.`,
    notes: rNotes, tab: lickTabLines(rNotes), rhythmPattern: pick,
  });

  // 3 — same shape on a different string set
  const alt = lickAlternateStringSet(midis, lick.notes.map(n => n.string), lick.notes.map(n => n.fret));
  if (alt) {
    const names = ['E', 'A', 'D', 'G', 'B', 'e'];
    const aNotes = midis.map((m, i) => ({
      midi: m, noteName: lick.notes[i].noteName,
      string: alt.pos[i].string, fret: alt.pos[i].fret,
      time: lick.notes[i].time - lick.notes[0].time,
    }));
    const altStrings = [...new Set(aNotes.map(n => n.string))].sort().map(s => names[s]).join('/');
    const lowest = Math.min(...aNotes.map(n => n.fret));
    const crossesB = aNotes.some(n => n.string === 4) !== lick.notes.some(n => n.string === 4);
    out.push({
      id: 'stringset', title: `String set — same notes on ${altStrings}${alt.floor ? `, ${lowest}th position` : ''}`,
      why: `The identical pitches, fingered on the ${altStrings} string${altStrings.includes('/') ? 's' : ''} instead${alt.floor ? `, with your hand up at the ${lowest}th fret` : ''}. `
         + (crossesB
             ? 'The fret pattern genuinely changes here because the B string is tuned a major 3rd above G rather than a 4th — every shape that crosses it shifts by a fret. '
             : 'Same intervals, new geometry under your fingers. ')
         + 'Learning a lick in two places is what stops it being welded to one box shape.',
      notes: aNotes, tab: lickTabLines(aNotes),
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// VOCABULARY CONNECTIONS
// ═══════════════════════════════════════════════════════════════════════════
// What your saved licks have in common. Over time this is the thing that shows
// you your own habits — that you reach for the same two intervals, or always
// resolve the same way — which is information you cannot get by listening to
// yourself in the moment.
function lickFingerprint(lick) {
  const midis = lick.notes.map(n => n.midi);
  const ivs = lickIntervalSequence(midis);
  const abs = ivs.map(i => Math.abs(i.semi)).filter(s => s !== 0);
  const counts = {};
  abs.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  return {
    intervalCounts: counts,
    intervalSet: new Set(abs),
    directions: ivs.map(i => i.dir).join(''),
    contour: lick.analysis.contour.shape,
    scaleId: lick.analysis.scaleMatches[0] ? lick.analysis.scaleMatches[0].scaleId : null,
    keyName: lick.analysis.scaleMatches[0] ? lick.analysis.scaleMatches[0].keyName : null,
    shape: ivs.map(i => i.semi).join(','),
  };
}

// Longest run of identical consecutive intervals shared by two licks — a
// shared melodic cell, not just a shared bag of intervals.
function lickSharedRun(aShape, bShape) {
  const A = aShape ? aShape.split(',').filter(s => s !== '') : [];
  const B = bShape ? bShape.split(',').filter(s => s !== '') : [];
  let best = 0;
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      if (A[i - 1] === B[j - 1]) { dp[i][j] = dp[i - 1][j - 1] + 1; best = Math.max(best, dp[i][j]); }
    }
  }
  return best;
}

function lickConnections(target, all) {
  const tf = lickFingerprint(target);
  const out = [];
  for (const other of all) {
    if (other.id === target.id) continue;
    const of = lickFingerprint(other);
    const shared = [...tf.intervalSet].filter(s => of.intervalSet.has(s));
    const union = new Set([...tf.intervalSet, ...of.intervalSet]);
    const jaccard = union.size ? shared.length / union.size : 0;
    const run = lickSharedRun(tf.shape, of.shape);
    const sameScale = tf.scaleId && tf.scaleId === of.scaleId;
    const sameContour = tf.contour === of.contour;
    const score = jaccard * 50 + run * 18 + (sameScale ? 15 : 0) + (sameContour ? 8 : 0);
    if (score < 20) continue;
    const reasons = [];
    if (run >= 2) reasons.push(`a shared ${run + 1}-note cell (${run} identical consecutive intervals)`);
    if (shared.length) reasons.push(`both lean on the ${shared.map(s => lickIntervalInfo(Number(s)).name).join(' and ')}`);
    if (sameScale) reasons.push(`both sit in ${of.scaleId === tf.scaleId ? tf.keyName === of.keyName ? `${tf.keyName} ` : '' : ''}${(ALL_SCALES.find(s => s.id === tf.scaleId) || {}).name || ''}`);
    if (sameContour) reasons.push(`the same ${tf.contour.split('—')[0].trim()} shape`);
    out.push({ lick: other, score, run, shared, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

// Aggregate tendencies across the whole library — the seed of the sound
// profile, and useful on its own once there are a few licks.
function lickVocabularyStats(all) {
  const intervalTotals = {}, scaleTotals = {}, techniqueTotals = {}, keyTotals = {};
  let notes = 0;
  for (const l of all) {
    const f = lickFingerprint(l);
    Object.entries(f.intervalCounts).forEach(([s, c]) => { intervalTotals[s] = (intervalTotals[s] || 0) + c; });
    if (f.scaleId) scaleTotals[f.scaleId] = (scaleTotals[f.scaleId] || 0) + 1;
    if (f.keyName) keyTotals[f.keyName] = (keyTotals[f.keyName] || 0) + 1;
    (l.analysis.techniques || []).forEach(t => { techniqueTotals[t] = (techniqueTotals[t] || 0) + 1; });
    notes += l.notes.length;
  }
  const rank = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  return {
    count: all.length, notes,
    intervals: rank(intervalTotals).map(([s, c]) => ({ semi: Number(s), name: lickIntervalInfo(Number(s)).name, count: c })),
    scales: rank(scaleTotals).map(([id, c]) => ({ id, name: (ALL_SCALES.find(s => s.id === id) || {}).name || id, count: c })),
    keys: rank(keyTotals).map(([k, c]) => ({ key: k, count: c })),
    techniques: rank(techniqueTotals).map(([t, c]) => ({ technique: t, count: c })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE
// ═══════════════════════════════════════════════════════════════════════════
const LICK_CAPTURE_SECONDS = 8;
const LICK_PLAYERS = ['—', 'Knopfler', 'Ronson', 'Hazel', 'Dean Ween', 'Zappa'];
const LICK_MOODS = ['—', 'dark', 'bright', 'tense', 'floating', 'aggressive', 'sweet', 'playful', 'mournful'];

let lickLibrary = [];
let lickObjectUrls = [];
let lickCaptureBusy = false;

function lickSetHint(msg, isError) {
  const el = document.getElementById('lick-toolbar-hint');
  if (el) { el.textContent = msg; el.classList.toggle('lick-hint-error', !!isError); }
}

async function captureLick() {
  if (lickCaptureBusy) return;
  if (typeof isMicEnabled !== 'function' || !isMicEnabled()) {
    lickSetHint('Mic is off — turn it on in the mic bar, play something, then capture.', true);
    if (typeof pulseError === 'function') pulseError(document.getElementById('lick-capture-btn'));
    return;
  }
  lickCaptureBusy = true;
  try {
    const audio = micCaptureLastSeconds(LICK_CAPTURE_SECONDS);
    const onsets = micRecentOnsets(LICK_CAPTURE_SECONDS);
    if (!onsets.length) {
      lickSetHint('Nothing pitched in the last 8 seconds — play a phrase, then capture it.', true);
      return;
    }
    // Times become relative to the first note so a saved lick is portable.
    const t0 = onsets[0].time;
    const notes = onsets.map(o => ({
      midi: o.midi, noteName: o.noteName, cents: o.cents,
      technique: o.technique, time: o.time - t0, absTime: o.time,
    }));
    const analysis = lickAnalyse(notes.map(n => ({ ...n, time: n.absTime, absTime: n.absTime })));
    // lickAnalyse works in absolute time (it has to, to line notes up against
    // the chord history); re-base afterwards for storage.
    analysis.notes.forEach((n, i) => { n.time = notes[i].time; });
    const top = analysis.scaleMatches[0];
    const record = {
      createdAt: Date.now(),
      profileId: (typeof getActiveProfileId === 'function' ? getActiveProfileId() : null),
      title: top ? `${top.keyName} ${top.scaleName} lick` : `${notes.length}-note lick`,
      durationSec: audio ? audio.duration : 0,
      audio: audio ? audio.blob : null,
      notes: analysis.notes.map(n => ({
        midi: n.midi, noteName: n.noteName, cents: n.cents,
        technique: n.technique, time: n.time, string: n.string, fret: n.fret,
        source: n.source, camConfidence: n.camConfidence,
      })),
      analysis: {
        scaleMatches: analysis.scaleMatches, intervals: analysis.intervals,
        chordRoles: analysis.chordRoles, contour: analysis.contour,
        rhythm: analysis.rhythm, techniques: analysis.techniques,
        placement: analysis.placement, explanation: analysis.explanation,
      },
      tags: {
        player: '—', mood: '—',
        technique: analysis.techniques.slice(),
        scale: top ? top.scaleName : '', key: top ? top.keyName : '',
      },
      rating: 0,
    };
    const id = await saveLick(record);
    record.id = id;
    lickSetHint(`Saved — ${notes.length} notes${top ? `, reads as ${top.keyName} ${top.scaleName}` : ''}.`);
    if (typeof pulseSuccess === 'function') pulseSuccess(document.getElementById('lick-capture-btn'));
    if (typeof playSuccessChime === 'function') playSuccessChime();
    await loadLickLibrary();
    // Jump the user to what they just captured.
    if (typeof switchMode === 'function') switchMode('study');
    if (typeof switchStudySubtab === 'function') switchStudySubtab('licks');
    const card = document.getElementById(`lick-card-${id}`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    lickSetHint('Capture failed: ' + (e && e.message ? e.message : e), true);
  } finally {
    lickCaptureBusy = false;
  }
}

// Scoped to the active profile, the same way every other body of practice data
// is. Licks saved before profiles existed (or with no id recorded) stay
// visible rather than vanishing.
async function loadLickLibrary() {
  const all = await listLicks();
  const me = typeof getActiveProfileId === 'function' ? getActiveProfileId() : null;
  lickLibrary = me ? all.filter(l => !l.profileId || l.profileId === me) : all;
  renderLickLibrary();
}

// ═══════════════════════════════════════════════════════════════════════════
// LIBRARY UI
// ═══════════════════════════════════════════════════════════════════════════
function lickReleaseUrls() {
  lickObjectUrls.forEach(u => URL.revokeObjectURL(u));
  lickObjectUrls = [];
}

function lickStarRow(l) {
  let h = '<span class="lick-stars" role="group" aria-label="rating">';
  for (let i = 1; i <= 5; i++) {
    h += `<button class="lick-star${i <= (l.rating || 0) ? ' on' : ''}" onclick="setLickRating(${l.id},${i})" title="${i} star${i > 1 ? 's' : ''}" aria-label="${i} star">★</button>`;
  }
  return h + `<button class="lick-star lick-star-clear" onclick="setLickRating(${l.id},0)" title="clear rating">×</button></span>`;
}

function lickTagSelect(l, field, options) {
  return `<select class="lick-tag-select" onchange="setLickTag(${l.id},'${field}',this.value)">`
    + options.map(o => `<option${(l.tags && l.tags[field]) === o ? ' selected' : ''}>${o}</option>`).join('')
    + '</select>';
}

function renderLickLibrary() {
  const host = document.getElementById('lick-library');
  if (!host) return;
  lickReleaseUrls();

  // Scale filter options, built from what is actually in the library.
  const sel = document.getElementById('lick-filter-scale');
  if (sel) {
    const scales = [...new Set(lickLibrary.map(l => l.tags && l.tags.scale).filter(Boolean))].sort();
    const cur = sel.value;
    sel.innerHTML = '<option value="">All</option>' + scales.map(s => `<option${s === cur ? ' selected' : ''}>${s}</option>`).join('');
  }
  const scaleFilter = sel ? sel.value : '';
  const starFilter = Number((document.getElementById('lick-filter-star') || {}).value || 0);
  const shown = lickLibrary.filter(l =>
    (!scaleFilter || (l.tags && l.tags.scale) === scaleFilter) &&
    (l.rating || 0) >= starFilter);

  renderLickVocabSummary();

  if (!lickLibrary.length) {
    host.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><svg class="empty-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><use href="#ico-mic"/></svg></div>
      <div class="empty-state-title">No licks captured yet</div>
      <div class="empty-state-sub">Turn the mic on, play something you like, and press Capture Lick. It keeps the last 8 seconds — you never have to decide in advance that a take is worth keeping.</div>
    </div>`;
    return;
  }
  if (!shown.length) {
    host.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><svg class="empty-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><use href="#ico-search"/></svg></div>
      <div class="empty-state-title">Nothing matches these filters</div>
      <div class="empty-state-sub">You have ${lickLibrary.length} lick${lickLibrary.length > 1 ? 's' : ''} saved — widen the scale or rating filter.</div>
    </div>`;
    return;
  }
  host.innerHTML = shown.map(l => renderLickCard(l)).join('');
  // Audio elements are wired after innerHTML so the object URLs can be tracked
  // and revoked on the next render rather than leaked.
  shown.forEach(l => {
    if (!l.audio) return;
    const el = document.getElementById(`lick-audio-${l.id}`);
    if (!el) return;
    const url = URL.createObjectURL(l.audio);
    lickObjectUrls.push(url);
    el.src = url;
  });
}

function renderLickCard(l) {
  const a = l.analysis || {};
  const top = (a.scaleMatches || [])[0];
  const noteLine = l.notes.map(n => n.noteName).join(' ');
  const ivLine = (a.intervals || []).map(i => `${i.dir === 'down' ? '↓' : i.dir === 'up' ? '↑' : '='}${i.short}`).join('  ');
  const alt = (a.scaleMatches || []).slice(1, 3);
  const roles = a.chordRoles ? a.chordRoles.filter(Boolean) : null;
  const date = new Date(l.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const variations = lickVariations(l);
  const connections = lickConnections(l, lickLibrary);

  return `<div class="lick-card" id="lick-card-${l.id}">
    <div class="lick-card-head">
      <div>
        <div class="lick-title" contenteditable="true" spellcheck="false"
             onblur="setLickTitle(${l.id}, this.textContent)">${l.title}</div>
        <div class="lick-meta">${date} · ${l.notes.length} notes · ${(l.durationSec || 0).toFixed(1)}s${top ? ` · ${Math.round(top.fit * 100)}% fit` : ''}</div>
      </div>
      <div class="lick-card-actions">
        ${lickStarRow(l)}
        <button class="quiz-mode-btn lick-delete" onclick="removeLick(${l.id})" title="delete this lick">Delete</button>
      </div>
    </div>

    ${l.audio ? `<audio class="lick-audio" id="lick-audio-${l.id}" controls preload="none"></audio>`
              : '<div class="lick-noaudio">No audio was captured for this lick (the mic ring buffer was empty).</div>'}

    <div class="lick-section">
      <div class="lick-section-title">What you played</div>
      <div class="lick-notes">${noteLine}</div>
      ${(() => { const p = a.placement; if (!p || !p.total) return '';
        const cls = p.seen === p.total ? 'seen' : p.seen ? 'mixed' : 'inferred';
        const txt = p.seen === p.total ? 'Positions seen by camera'
                  : p.seen ? `${p.seen}/${p.total} positions seen by camera` : 'Positions estimated from pitch';
        return `<span class="lick-source ${cls}" title="A pitch does not identify a string — only the camera can say which one you played.">${txt}</span>`; })()}
      ${ivLine ? `<div class="lick-intervals">${ivLine}</div>` : ''}
      <pre class="lick-tab">${lickTabLines(l.notes)}</pre>
    </div>

    <div class="lick-section">
      <div class="lick-section-title">Why it sounds like that</div>
      <ul class="lick-explain">${(a.explanation || []).map(p => `<li>${p}</li>`).join('')}</ul>
      ${alt.length ? `<div class="lick-alt-scales">Also fits: ${alt.map(s => `${s.keyName} ${s.scaleName} (${Math.round(s.fit * 100)}%)`).join(' · ')}</div>` : ''}
      ${roles && roles.length ? `<div class="lick-roles">${roles.map((r, i) =>
        `<span class="lick-role h-${r.role}" title="${r.chordLabel}: ${r.roleLabel}">${l.notes[i] ? l.notes[i].noteName : ''}<small>${r.roleLabel}</small></span>`).join('')}</div>` : ''}
    </div>

    <div class="lick-section">
      <div class="lick-section-title">Tags</div>
      <div class="lick-tags">
        <label>Player</label>${lickTagSelect(l, 'player', LICK_PLAYERS)}
        <label>Mood</label>${lickTagSelect(l, 'mood', LICK_MOODS)}
        <span class="lick-tag-static">Scale <b>${(l.tags && l.tags.scale) || '—'}</b></span>
        <span class="lick-tag-static">Key <b>${(l.tags && l.tags.key) || '—'}</b></span>
        <span class="lick-tag-static">Technique <b>${(l.tags && l.tags.technique && l.tags.technique.length) ? l.tags.technique.join(', ') : 'none detected'}</b></span>
      </div>
    </div>

    <div class="lick-section">
      <div class="lick-section-title">Where to take it</div>
      <div class="lick-variations">
        ${variations.map(v => `<div class="lick-variation">
          <div class="lick-var-title">${v.title}</div>
          <div class="lick-var-why">${v.why}</div>
          <div class="lick-var-notes">${v.notes.map(n => n.noteName).join(' ')}</div>
          <pre class="lick-tab">${v.tab}</pre>
          <button class="quiz-mode-btn" onclick="playLickVariation(${l.id},'${v.id}')">▶ Hear it</button>
        </div>`).join('')}
      </div>
    </div>

    ${connections.length ? `<div class="lick-section">
      <div class="lick-section-title">Connected to your other licks</div>
      <div class="lick-connections">${connections.map(c => `<div class="lick-connection">
        <button class="lick-conn-link" onclick="scrollToLick(${c.lick.id})">${c.lick.title}</button>
        <span class="lick-conn-why">${c.reasons.join('; ')}</span>
      </div>`).join('')}</div>
    </div>` : ''}
  </div>`;
}

function renderLickVocabSummary() {
  const host = document.getElementById('lick-vocab-summary');
  if (!host) return;
  if (lickLibrary.length < 2) { host.innerHTML = ''; return; }
  const s = lickVocabularyStats(lickLibrary);
  const iv = s.intervals.slice(0, 3);
  host.innerHTML = `<div class="lick-vocab">
    <div class="lick-vocab-title">Your vocabulary so far — ${s.count} licks, ${s.notes} notes</div>
    <div class="lick-vocab-row"><span>Intervals you reach for</span><b>${iv.map(i => `${i.name} (${i.count}×)`).join(', ') || '—'}</b></div>
    <div class="lick-vocab-row"><span>Scales your playing fits</span><b>${s.scales.slice(0, 3).map(x => `${x.name} (${x.count})`).join(', ') || '—'}</b></div>
    <div class="lick-vocab-row"><span>Keys</span><b>${s.keys.slice(0, 4).map(x => `${x.key} (${x.count})`).join(', ') || '—'}</b></div>
    ${s.techniques.length ? `<div class="lick-vocab-row"><span>Techniques</span><b>${s.techniques.map(x => `${x.technique} (${x.count})`).join(', ')}</b></div>` : ''}
  </div>`;
}

// ── Card actions ──────────────────────────────────────────────────────────
async function setLickRating(id, rating) {
  await updateLick(id, { rating });
  const l = lickLibrary.find(x => x.id === id);
  if (l) l.rating = rating;
  renderLickLibrary();
}
async function setLickTag(id, field, value) {
  const l = lickLibrary.find(x => x.id === id);
  if (!l) return;
  l.tags = Object.assign({}, l.tags, { [field]: value });
  await updateLick(id, { tags: l.tags });
}
async function setLickTitle(id, title) {
  const clean = (title || '').trim().slice(0, 80) || 'Untitled lick';
  const l = lickLibrary.find(x => x.id === id);
  if (l) l.title = clean;
  await updateLick(id, { title: clean });
}
async function removeLick(id) {
  if (!confirm('Delete this lick? The audio and analysis go with it.')) return;
  await deleteLick(id);
  await loadLickLibrary();
}
function scrollToLick(id) {
  const el = document.getElementById(`lick-card-${id}`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('lick-flash'); setTimeout(() => el.classList.remove('lick-flash'), 900); }
}

// Plays a variation through the shared sampled engine, so it sounds like the
// instrument every other mode uses rather than a separate beep.
function playLickVariation(lickId, varId) {
  const l = lickLibrary.find(x => x.id === lickId);
  if (!l) return;
  const v = lickVariations(l).find(x => x.id === varId);
  if (!v || typeof playSampledNote !== 'function') return;
  const ctx = getAudioCtx();
  const inst = typeof currentInstrument === 'function' ? currentInstrument() : 'clean';
  const t0 = ctx.currentTime + 0.08;
  v.notes.forEach((n, i) => {
    const next = v.notes[i + 1];
    const dur = next ? Math.max(0.12, next.time - n.time) : 0.6;
    playSampledNote(inst, t0 + n.time, midiToHz(n.midi), dur,
      typeof mixVol === 'function' ? mixVol('riff') : 0.75,
      { stringIdx: n.string });
  });
}
