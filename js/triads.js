// ═══════════════════════════════════════════════════════════════════════════
// TRIAD SYSTEM — the bridge between single notes and full chords
// ═══════════════════════════════════════════════════════════════════════════
//
// Built for a player who already knows the theory and needs it under the
// fingers. Everything here is generated from intervals rather than stored as
// shapes, so any root and any quality works and nothing can be silently wrong
// in a way a hand-typed shape table could be.
//
// The four adjacent string sets, named by the strings a guitarist would say
// out loud. Internally strings are 0 = low E … 5 = high e (see STRINGS in
// scales.js), so each set is listed LOW to HIGH for voicing purposes.

const TRIAD_STRING_SETS = [
  { id: '123', label: 'Strings 1-2-3 (e B G)', strings: [3, 4, 5] },  // G B e
  { id: '234', label: 'Strings 2-3-4 (B G D)', strings: [2, 3, 4] },  // D G B
  { id: '345', label: 'Strings 3-4-5 (G D A)', strings: [1, 2, 3] },  // A D G
  { id: '456', label: 'Strings 4-5-6 (D A E)', strings: [0, 1, 2] },  // E A D
];

const TRIAD_QUALITIES = {
  major:      { label: 'Major',      intervals: [0, 4, 7],  symbol: '' },
  minor:      { label: 'Minor',      intervals: [0, 3, 7],  symbol: 'm' },
  diminished: { label: 'Diminished', intervals: [0, 3, 6],  symbol: '°' },
  augmented:  { label: 'Augmented',  intervals: [0, 4, 8],  symbol: '+' },
};

const TRIAD_INVERSIONS = [
  { id: 'root',   label: 'Root position',    bassDegree: 0, sub: 'root on bottom' },
  { id: 'first',  label: '1st inversion',    bassDegree: 1, sub: 'third on bottom' },
  { id: 'second', label: '2nd inversion',    bassDegree: 2, sub: 'fifth on bottom' },
];

const TRIAD_MAX_FRET = 16;

function triadPitchClasses(rootName, quality) {
  const q = TRIAD_QUALITIES[quality] || TRIAD_QUALITIES.major;
  const rootIdx = CHROMATIC.indexOf(norm(rootName));
  return q.intervals.map(i => (rootIdx + i) % 12);
}

// Which chord tone a pitch class is, for colouring: 0 root, 1 third, 2 fifth.
function triadToneRole(pc, pcs) { return pcs.indexOf(pc); }

// Lowest fret on `stringIdx` (>= minFret) that sounds pitch class `pc`.
function fretForPitchClass(stringIdx, pc, minFret) {
  const openPc = CHROMATIC.indexOf(norm(STRINGS[stringIdx]));
  for (let f = Math.max(0, minFret); f <= TRIAD_MAX_FRET + 6; f++) {
    if ((openPc + f) % 12 === pc) return f;
  }
  return null;
}

// One voicing: three notes on one string set. Candidates are enumerated per
// string and filtered by musical truth rather than by fret arithmetic.
//
// The naive approach — walk up the strings requiring each fret to be >= the
// last — is wrong on a guitar. Because the B string is tuned a major third
// above G rather than a fourth, the top note of a triad frequently sits at a
// LOWER fret number than the middle note. Requiring ascending frets silently
// dropped real shapes: A minor second inversion on the top set (G9 B10 e8) was
// rejected and the search ran off to fret 20.
//
// What actually defines a voicing is: the three pitch classes are the triad,
// the pitches ascend from the lowest string to the highest, the lowest
// SOUNDING note is the inversion's bass tone, and the whole thing fits under
// the hand.
function triadStringPitch(stringIdx, fret) {
  const openPc = CHROMATIC.indexOf(norm(STRINGS[stringIdx]));
  // Absolute semitone value, so voicings can be compared by real pitch.
  const openAbs = [0, 5, 10, 15, 19, 24];   // E A D G B e in semitones from low E
  return openAbs[stringIdx] + fret;
}

function buildTriadVoicing(rootName, quality, setIdx, inversionIdx, startFret) {
  const set = TRIAD_STRING_SETS[setIdx];
  const pcs = triadPitchClasses(rootName, quality);
  const bassDegree = TRIAD_INVERSIONS[inversionIdx].bassDegree;
  const bassPc = pcs[bassDegree];
  const want = new Set(pcs);

  // Candidate frets per string within a hand-sized window above startFret.
  const lo = Math.max(0, (startFret || 0) - 1);
  const candidates = set.strings.map(sIdx => {
    const openPc = CHROMATIC.indexOf(norm(STRINGS[sIdx]));
    const out = [];
    for (let f = lo; f <= Math.min(TRIAD_MAX_FRET, lo + 7); f++) {
      if (want.has((openPc + f) % 12)) out.push(f);
    }
    return out;
  });
  if (candidates.some(c => !c.length)) return null;

  let best = null;
  candidates[0].forEach(f0 => {
    candidates[1].forEach(f1 => {
      candidates[2].forEach(f2 => {
        const frets = [f0, f1, f2];
        const notes = set.strings.map((sIdx, i) => ({
          string: sIdx, fret: frets[i],
          pc: (CHROMATIC.indexOf(norm(STRINGS[sIdx])) + frets[i]) % 12,
          abs: triadStringPitch(sIdx, frets[i]),
        }));
        // Each of the three tones exactly once.
        const pcSet = new Set(notes.map(n => n.pc));
        if (pcSet.size !== 3) return;
        if (![...want].every(pc => pcSet.has(pc))) return;
        // Pitches must ascend across the set — a voicing stacks upward.
        if (!(notes[0].abs < notes[1].abs && notes[1].abs < notes[2].abs)) return;
        // The lowest sounding note defines the inversion.
        if (notes[0].pc !== bassPc) return;
        const span = Math.max(...frets) - Math.min(...frets);
        if (span > 4) return;                       // grabbable shapes only
        const score = Math.min(...frets) * 10 + span;
        if (!best || score < best.score) {
          best = {
            score, span,
            notes: notes.map(n => ({ string: n.string, fret: n.fret, pc: n.pc, role: triadToneRole(n.pc, pcs) })),
            lowFret: Math.min(...frets), highFret: Math.max(...frets),
          };
        }
      });
    });
  });
  if (!best) return null;
  return {
    setId: set.id, setLabel: set.label, inversion: TRIAD_INVERSIONS[inversionIdx].id,
    inversionLabel: TRIAD_INVERSIONS[inversionIdx].label,
    notes: best.notes, lowFret: best.lowFret, highFret: best.highFret, span: best.span,
  };
}

// Every voicing of a triad: 4 string sets x 3 inversions, taking the lowest
// playable position of each.
function allTriadVoicings(rootName, quality) {
  const out = [];
  TRIAD_STRING_SETS.forEach((set, si) => {
    TRIAD_INVERSIONS.forEach((inv, ii) => {
      let v = null;
      // Scan upward for the first position where the shape is playable.
      for (let start = 0; start <= TRIAD_MAX_FRET && !v; start++) {
        v = buildTriadVoicing(rootName, quality, si, ii, start);
      }
      if (v) out.push(v);
    });
  });
  return out;
}

// ── Voice leading ──────────────────────────────────────────────────────────
// Between two chords, which inversion of the target moves the least. Cost is
// total fret distance across the three voices; a tone that keeps the same
// pitch class is a common tone and costs nothing extra, which is exactly the
// thing that makes a progression sound smooth rather than jumpy.
function voiceLeadingBetween(fromRoot, fromQuality, toRoot, toQuality, setIdx) {
  const fromVoicings = TRIAD_INVERSIONS.map((_, ii) => {
    let v = null;
    for (let s = 0; s <= TRIAD_MAX_FRET && !v; s++) v = buildTriadVoicing(fromRoot, fromQuality, setIdx, ii, s);
    return v;
  }).filter(Boolean);
  const toVoicings = TRIAD_INVERSIONS.map((_, ii) => {
    const list = [];
    for (let s = 0; s <= TRIAD_MAX_FRET; s++) {
      const v = buildTriadVoicing(toRoot, toQuality, setIdx, ii, s);
      if (v && !list.some(x => x.lowFret === v.lowFret)) list.push(v);
    }
    return list;
  }).flat();
  if (!fromVoicings.length || !toVoicings.length) return null;

  let best = null;
  fromVoicings.forEach(from => {
    toVoicings.forEach(to => {
      let cost = 0;
      const moves = from.notes.map((n, i) => {
        const t = to.notes[i];
        const delta = t.fret - n.fret;
        cost += Math.abs(delta);
        return { string: n.string, fromFret: n.fret, toFret: t.fret, delta, common: n.pc === t.pc };
      });
      if (!best || cost < best.cost) best = { from, to, moves, cost, commonTones: moves.filter(m => m.common).length };
    });
  });
  return best;
}

// ── Triads inside a scale position ─────────────────────────────────────────
// Which voicings fall inside (or adjacent to) the box you are already in.
// The point is not "here are all the triads" but "here is the one your hand
// can already reach without moving".
function triadsNearPosition(rootName, quality, boxNotes) {
  if (!boxNotes || !boxNotes.length) return [];
  const frets = boxNotes.map(n => n.fret);
  const lo = Math.min(...frets), hi = Math.max(...frets);
  return allTriadVoicings(rootName, quality)
    .map(v => {
      // Distance from the box: 0 if fully inside.
      const below = Math.max(0, lo - v.lowFret);
      const above = Math.max(0, v.highFret - hi);
      return { ...v, distanceFromBox: below + above, insideBox: below === 0 && above === 0 };
    })
    .sort((a, b) => a.distanceFromBox - b.distanceFromBox);
}

// Diatonic triads of a major/minor key — used by the integration trainer to
// show which triads actually belong over the vamp.
const TRIAD_DEGREE_QUALITIES = {
  major: ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
  minor: ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
};
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

function diatonicTriads(keyName, mode) {
  const steps = mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS;
  const quals = TRIAD_DEGREE_QUALITIES[mode === 'minor' ? 'minor' : 'major'];
  const rootIdx = CHROMATIC.indexOf(norm(keyName));
  const numerals = mode === 'minor' ? ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
                                    : ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  return steps.map((st, i) => ({
    degree: i + 1, numeral: numerals[i],
    root: CHROMATIC[(rootIdx + st) % 12],
    quality: quals[i],
  }));
}

function triadName(root, quality) {
  return root + (TRIAD_QUALITIES[quality] ? TRIAD_QUALITIES[quality].symbol : '');
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIADS UI
// ═══════════════════════════════════════════════════════════════════════════

let triadState = { root: 'C', quality: 'major', view: 'reference', toRoot: 'F', toQuality: 'major', setIdx: 0 };

function triadSetState(patch) {
  Object.assign(triadState, patch);
  if (typeof loadProgress === 'function') {
    const d = loadProgress(); d.ui.triads = { ...triadState }; saveProgress(d);
  }
  renderTriads();
}
function loadTriadState() {
  if (typeof loadProgress !== 'function') return;
  const t = loadProgress().ui.triads;
  if (t) Object.assign(triadState, t);
}

// A compact chord-box for one voicing.
//
// Three things this has to get right that the first version did not:
//   1. Vertical fret lines. Without them you cannot read which fret a dot sits
//      on without checking the number row, which defeats the point of a
//      diagram — a guitarist reads position from the grid.
//   2. The three strings the set does not use are drawn as thin muted lines
//      rather than full-height empty rows. You still need to see WHICH strings
//      the voicing is on (top three vs bottom three is the whole distinction
//      between the sets), but they were eating half the height of every card.
//   3. Orientation matches the main fretboard — strings horizontal, frets
//      vertical — so the two read the same way round.
function triadMiniNeck(voicing, opts) {
  const o = Object.assign({ frets: 5 }, opts || {});
  const start = Math.max(0, voicing.lowFret - 1);
  const used = new Set(voicing.notes.map(n => n.string));
  const fretList = [];
  for (let f = start; f < start + o.frets; f++) fretList.push(f);

  let html = `<div class="triad-neck" role="img" aria-label="${voicing.inversionLabel}, frets ${voicing.lowFret} to ${voicing.highFret}">`;
  html += `<div class="triad-neck-fretnums"><span class="triad-neck-string"></span>` +
          fretList.map(f => `<span${f === 0 ? ' class="is-nut"' : ''}>${f}</span>`).join('') + `</div>`;
  for (let sIdx = 5; sIdx >= 0; sIdx--) {                 // high e at the top, as you look down at the neck
    const isUsed = used.has(sIdx);
    html += `<div class="triad-neck-row${isUsed ? '' : ' unused'}">` +
            `<span class="triad-neck-string${isUsed ? '' : ' dim'}">${STRING_LABELS[sIdx]}</span>`;
    fretList.forEach(f => {
      const n = voicing.notes.find(x => x.string === sIdx && x.fret === f);
      html += n
        ? `<span class="triad-cell"><span class="triad-dot role-${n.role}" title="${['Root','Third','Fifth'][n.role]} · ${STRING_LABELS[sIdx]} string, fret ${f}">${['R','3','5'][n.role]}</span></span>`
        : `<span class="triad-cell"></span>`;
    });
    html += `</div>`;
  }
  return html + `</div>`;
}

function renderTriadReference() {
  const voicings = allTriadVoicings(triadState.root, triadState.quality);
  const bySet = {};
  voicings.forEach(v => { (bySet[v.setId] || (bySet[v.setId] = [])).push(v); });
  return TRIAD_STRING_SETS.map(set => {
    const list = bySet[set.id] || [];
    if (!list.length) return '';
    return `<div class="triad-set-block">
      <div class="triad-set-title">${set.label}</div>
      <div class="triad-voicing-row">${list.map(v => `
        <div class="triad-voicing">
          <div class="triad-voicing-head">${v.inversionLabel}<span>frets ${v.lowFret}–${v.highFret}</span></div>
          ${triadMiniNeck(v)}
          <button class="triad-play" onclick="playTriadVoicing('${set.id}','${v.inversion}')">Play</button>
        </div>`).join('')}</div>
    </div>`;
  }).join('');
}

function findVoicing(setId, inversionId) {
  return allTriadVoicings(triadState.root, triadState.quality)
    .find(v => v.setId === setId && v.inversion === inversionId);
}

function playTriadVoicing(setId, inversionId) {
  const v = findVoicing(setId, inversionId);
  if (!v || typeof playSampledNote !== 'function') return;
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  const inst = typeof currentInstrument === 'function' ? currentInstrument() : 'clean';
  if (typeof ensureInstrumentReady === 'function') ensureInstrumentReady(inst);
  const vol = typeof mixVol === 'function' ? mixVol('chordStrum') : 0.6;
  v.notes.forEach((n, i) => {
    playSampledNote(inst, ctx.currentTime + i * 0.035, fretToHz(n.string, n.fret), 1.6, vol, { stringIdx: n.string });
  });
}

// ── Voice leading view ─────────────────────────────────────────────────────
function renderTriadVoiceLeading() {
  const vl = voiceLeadingBetween(triadState.root, triadState.quality, triadState.toRoot, triadState.toQuality, triadState.setIdx);
  if (!vl) return `<div class="triad-empty">No playable voicing pair on this string set.</div>`;
  const arrow = m => m.delta === 0 ? '=' : (m.delta > 0 ? `↑${m.delta}` : `↓${-m.delta}`);
  const rows = vl.moves.slice().reverse().map(m => `
    <div class="vl-row ${m.common ? 'common' : ''}">
      <span class="vl-string">${STRING_LABELS[m.string]}</span>
      <span class="vl-from">${m.fromFret}</span>
      <span class="vl-arrow ${m.delta === 0 ? 'stay' : m.delta > 0 ? 'up' : 'down'}">${arrow(m)}</span>
      <span class="vl-to">${m.toFret}</span>
      <span class="vl-note">${m.common ? 'common tone — stays put' : `moves ${Math.abs(m.delta)} fret${Math.abs(m.delta) === 1 ? '' : 's'}`}</span>
    </div>`).join('');
  return `<div class="triad-vl">
    <div class="triad-vl-head">
      <strong>${triadName(triadState.root, triadState.quality)} → ${triadName(triadState.toRoot, triadState.toQuality)}</strong>
      <span>${vl.from.inversionLabel} → ${vl.to.inversionLabel} · total movement ${vl.cost} fret${vl.cost === 1 ? '' : 's'}${vl.commonTones ? ` · ${vl.commonTones} common tone${vl.commonTones === 1 ? '' : 's'}` : ''}</span>
    </div>
    <div class="triad-vl-necks">
      <div><div class="triad-vl-label">From</div>${triadMiniNeck(vl.from)}</div>
      <div><div class="triad-vl-label">To</div>${triadMiniNeck(vl.to)}</div>
    </div>
    <div class="vl-moves">${rows}</div>
    <div class="triad-hint">Common tones are the notes you do not move. Keeping them under the same finger is what makes a change sound smooth instead of jumpy — and it is why this inversion was chosen over the others.</div>
  </div>`;
}

// ── Integration: triads inside the scale position you are already in ───────
function renderTriadIntegration() {
  if (typeof state === 'undefined' || typeof currentScale !== 'function') return '';
  const sc = currentScale();
  const boxNotes = getBoxNotes(state.key, sc.intervals, state.pos);
  const mode = /minor|dorian|phrygian|aeolian|pent/i.test(sc.name) && !/major/i.test(sc.name) ? 'minor' : 'major';
  const diatonic = diatonicTriads(state.key, mode);
  const rows = diatonic.map(d => {
    const near = triadsNearPosition(d.root, d.quality, boxNotes);
    const best = near[0];
    if (!best) return '';
    return `<div class="triad-int-row ${best.insideBox ? 'inside' : ''}">
      <span class="triad-int-numeral">${d.numeral}</span>
      <span class="triad-int-name">${triadName(d.root, d.quality)}</span>
      <span class="triad-int-where">${best.setLabel.replace(/Strings /, '')} · ${best.inversionLabel} · frets ${best.lowFret}–${best.highFret}</span>
      <span class="triad-int-reach">${best.insideBox ? 'in your box' : `${best.distanceFromBox} fret${best.distanceFromBox === 1 ? '' : 's'} away`}</span>
      <button class="triad-play" onclick="playDiatonicTriad('${d.root}','${d.quality}','${best.setId}','${best.inversion}')">Play</button>
    </div>`;
  }).join('');
  return `<div class="triad-int">
    <div class="triad-int-head">Triads inside <strong>${state.key} ${sc.name}</strong>, position ${state.pos + 1}</div>
    <div class="triad-hint">These are the diatonic triads of the key, ranked by how far they sit from the box your hand is already in. The ones marked <em>in your box</em> need no repositioning at all — that is the point: stop moving, start hearing the chord under the scale.</div>
    ${rows}
  </div>`;
}

function playDiatonicTriad(root, quality, setId, inversionId) {
  const v = allTriadVoicings(root, quality).find(x => x.setId === setId && x.inversion === inversionId);
  if (!v) return;
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  const inst = typeof currentInstrument === 'function' ? currentInstrument() : 'clean';
  if (typeof ensureInstrumentReady === 'function') ensureInstrumentReady(inst);
  const vol = typeof mixVol === 'function' ? mixVol('chordStrum') : 0.6;
  v.notes.forEach((n, i) => playSampledNote(inst, ctx.currentTime + i * 0.035, fretToHz(n.string, n.fret), 1.6, vol, { stringIdx: n.string }));
}

// ── Exercises ──────────────────────────────────────────────────────────────
function renderTriadExercises() {
  const voicings = allTriadVoicings(triadState.root, triadState.quality);
  const anchor = voicings.find(v => v.setId === '123') || voicings[0];
  const sweep = TRIAD_STRING_SETS.map(s => voicings.filter(v => v.setId === s.id)).flat();
  const sweepTab = sweep.map(v => `${v.setLabel.replace(/Strings /, '')} ${v.inversionLabel.replace(' position', '')}: ` +
    v.notes.map(n => `${STRING_LABELS[n.string]}${n.fret}`).join('-')).join('\n');

  // Chord melody: melody note on the top string, nearest voicing underneath.
  const scaleNotes = triadPitchClasses(triadState.root, triadState.quality);
  const melody = [0, 2, 4, 2].map(i => scaleNotes[i % 3]);
  const melodyRows = melody.map((pc, i) => {
    const f = fretForPitchClass(5, pc, 0);
    const under = voicings.find(v => v.setId === '234') || voicings[0];
    return `<div class="triad-cm-row"><span class="triad-cm-mel">melody: e${f}</span>` +
           `<span class="triad-cm-under">under it: ${under.notes.map(n => `${STRING_LABELS[n.string]}${n.fret}`).join(' ')}</span></div>`;
  }).join('');

  return `
  <div class="triad-ex">
    <div class="triad-ex-title">1 · Triad anchoring</div>
    <div class="triad-ex-body">Play this shape, then solo away from it and come back. The shape is your anchor — the point is that you can always find your way home to a chord tone.
      ${anchor ? triadMiniNeck(anchor) : ''}
      <div class="triad-hint">Start the backing track on a static chord and keep returning to these three notes. Landing on them is what makes a phrase sound finished.</div>
    </div>
  </div>
  <div class="triad-ex">
    <div class="triad-ex-title">2 · Triad sweeping</div>
    <div class="triad-ex-body">Every inversion across every string set, ascending then descending. This builds the physical connection between shapes so the neck stops feeling like separate boxes.
      <pre class="triad-sweep">${sweepTab}</pre>
    </div>
  </div>
  <div class="triad-ex">
    <div class="triad-ex-title">3 · Chord melody</div>
    <div class="triad-ex-body">Melody note on the top string with a voicing underneath — this is how one guitar sounds like three.
      ${melodyRows}
      <div class="triad-hint">Play the melody note and the voicing together. Keep the melody moving while the shape underneath stays put.</div>
    </div>
  </div>`;
}

// ── Shell ──────────────────────────────────────────────────────────────────
function renderTriads() {
  const el = document.getElementById('triads-body');
  if (!el) return;
  const roots = CHROMATIC;
  const view = triadState.view;
  const body =
    view === 'reference' ? renderTriadReference() :
    view === 'voiceleading' ? renderTriadVoiceLeading() :
    view === 'integration' ? renderTriadIntegration() :
    renderTriadExercises();

  el.innerHTML = `
    <div class="triad-controls">
      <div class="ctrl-group"><div class="ctrl-label">Root</div><div class="btn-row">
        ${roots.map(r => `<button class="${r === triadState.root ? 'active' : ''}" onclick="triadSetState({root:'${r}'})">${r}</button>`).join('')}
      </div></div>
      <div class="ctrl-group"><div class="ctrl-label">Quality</div><div class="btn-row">
        ${Object.entries(TRIAD_QUALITIES).map(([k, q]) => `<button class="${k === triadState.quality ? 'active' : ''}" onclick="triadSetState({quality:'${k}'})">${q.label}</button>`).join('')}
      </div></div>
      ${view === 'voiceleading' ? `
      <div class="ctrl-group"><div class="ctrl-label">Moving to</div><div class="btn-row">
        ${roots.map(r => `<button class="${r === triadState.toRoot ? 'active' : ''}" onclick="triadSetState({toRoot:'${r}'})">${r}</button>`).join('')}
      </div></div>
      <div class="ctrl-group"><div class="ctrl-label">Target quality</div><div class="btn-row">
        ${Object.entries(TRIAD_QUALITIES).map(([k, q]) => `<button class="${k === triadState.toQuality ? 'active' : ''}" onclick="triadSetState({toQuality:'${k}'})">${q.label}</button>`).join('')}
      </div></div>
      <div class="ctrl-group"><div class="ctrl-label">String set</div><div class="btn-row">
        ${TRIAD_STRING_SETS.map((s, i) => `<button class="${i === triadState.setIdx ? 'active' : ''}" onclick="triadSetState({setIdx:${i}})">${s.id}</button>`).join('')}
      </div></div>` : ''}
    </div>
    <div class="triad-legend">
      <span class="triad-legend-item"><span class="triad-dot role-0">R</span> Root</span>
      <span class="triad-legend-item"><span class="triad-dot role-1">3</span> Third — decides major or minor</span>
      <span class="triad-legend-item"><span class="triad-dot role-2">5</span> Fifth — stable</span>
    </div>
    <div class="triad-view">${body}</div>`;
}

function triadSetView(v) {
  triadState.view = v;
  document.querySelectorAll('#triads-view-row button').forEach(b => b.classList.toggle('active', b.dataset.tview === v));
  renderTriads();
}
