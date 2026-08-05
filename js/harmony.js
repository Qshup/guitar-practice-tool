// ═══════════════════════════════════════════════════════════════════════════
// HARMONIC AWARENESS OVERLAY
// ═══════════════════════════════════════════════════════════════════════════
//
// The fretboard normally shows every scale note as equally valid. That is not
// how harmony works: over a given chord some notes are home, some add colour,
// and some are leaning against the chord and want to resolve. This colours the
// neck by what each note is DOING against the chord currently sounding, and
// updates as the backing track moves.
//
// A note on "avoid": nothing here is forbidden. The avoid tint marks notes
// that create real tension against this specific chord — they are some of the
// most expressive notes available, they just need somewhere to go. The classic
// case is the perfect 4th over a major chord: it sits a semitone above the
// major third and smothers it unless it moves.

const HARMONY_ROLES = {
  root:    { label: 'Root',        cls: 'h-root',    hint: 'home base — lands feel finished' },
  third:   { label: '3rd',         cls: 'h-third',   hint: 'decides major or minor' },
  fifth:   { label: '5th',         cls: 'h-fifth',   hint: 'stable and strong' },
  seventh: { label: '7th',         cls: 'h-seventh', hint: 'adds motion, wants to resolve' },
  ninth:   { label: '9th',         cls: 'h-ninth',   hint: 'openness — safe to linger' },
  sixth:   { label: '6th / 13th',  cls: 'h-sixth',   hint: 'sweet and melodic' },
  eleventh:{ label: '11th (4th)',  cls: 'h-eleventh',hint: 'floating — suspends the chord' },
  avoid:   { label: 'Tension',     cls: 'h-avoid',   hint: 'leans against the chord — resolve it' },
};

let harmonyState = { enabled: false, showLegend: true, chord: null };

// Interval (0-11) from the chord root -> harmonic role.
// `quality` is derived from the chord's own tones so the same interval can mean
// different things: a minor 3rd is a chord tone over a minor chord and a
// tension note over a major one.
function harmonicRole(interval, chordIntervals) {
  const has = i => chordIntervals.includes(i);
  const isMinor = has(3) && !has(4);
  const isMajor = has(4);

  if (interval === 0) return 'root';
  if (interval === 3 && isMinor) return 'third';
  if (interval === 4 && isMajor) return 'third';
  if (interval === 7) return 'fifth';
  if (interval === 6 && has(6)) return 'fifth';        // diminished fifth is the chord's fifth
  if (interval === 8 && has(8)) return 'fifth';        // augmented
  if ((interval === 10 || interval === 11) && (has(10) || has(11))) return 'seventh';
  if (interval === 10) return 'seventh';               // b7 over a triad still reads as a 7th colour

  if (interval === 2) return 'ninth';
  if (interval === 9) return 'sixth';
  if (interval === 5) {
    // The perfect 4th is the classic avoid note over a MAJOR chord — it sits a
    // semitone above the major third and swallows it. Over a minor chord it is
    // a perfectly good colour tone.
    return isMajor ? 'avoid' : 'eleventh';
  }
  // Remaining chromatic degrees lean against the chord.
  if (interval === 1) return 'avoid';                  // b9
  if (interval === 3 && isMajor) return 'avoid';       // minor 3rd over major
  if (interval === 4 && isMinor) return 'avoid';       // major 3rd over minor
  if (interval === 6) return 'avoid';                  // tritone against a non-dim chord
  if (interval === 8) return 'avoid';                  // b6 against a non-aug chord
  if (interval === 11) return 'avoid';                 // major 7th over a b7 context
  return 'avoid';
}

// Turns a vamp chord (label + semitone offsets from the KEY root) into
// something classifiable: an absolute root pitch class plus its intervals.
function harmonyChordFromVamp(keyName, chord) {
  if (!chord || !chord.notes || !chord.notes.length) return null;
  const keyPc = CHROMATIC.indexOf(norm(keyName));
  const rootPc = (keyPc + chord.notes[0] + 1200) % 12;
  const intervals = chord.notes.map(n => ((n - chord.notes[0]) % 12 + 12) % 12);
  if (!intervals.includes(0)) intervals.unshift(0);
  return { label: chord.label, rootPc, rootName: CHROMATIC[rootPc], intervals };
}

// Called by the metronome scheduler each time the vamp moves to a new bar.
function harmonySetChord(chordObj) {
  if (!harmonyState.enabled) return;
  const sig = chordObj ? chordObj.label + ':' + chordObj.rootPc : null;
  if (harmonyState._sig === sig) return;    // same chord, nothing to repaint
  harmonyState._sig = sig;
  harmonyState.chord = chordObj;
  applyHarmonyColouring();
  renderHarmonyReadout();
}

// Paints the Scales fretboard. Runs over the dots already rendered by
// scales.js rather than re-rendering, so it composes with finger overlays,
// mic matching and everything else already on the neck.
function applyHarmonyColouring() {
  const fb = document.getElementById('fretboard');
  if (!fb) return;
  const dots = fb.querySelectorAll('.note-dot');
  const chord = harmonyState.chord;
  const off = !harmonyState.enabled || !chord;

  // Only touch a dot whose role actually changed. The naive version stripped
  // every class from every dot and re-added them on each bar, which for ~100
  // dots meant a full class churn several times a second during a vamp.
  dots.forEach(d => {
    let want = null;
    if (!off && !d.classList.contains('empty')) {
      const si = parseInt(d.dataset.string, 10), f = parseInt(d.dataset.fret, 10);
      if (!isNaN(si) && !isNaN(f)) {
        const pc = (CHROMATIC.indexOf(norm(STRINGS[si])) + f) % 12;
        const interval = ((pc - chord.rootPc) % 12 + 12) % 12;
        want = HARMONY_ROLES[harmonicRole(interval, chord.intervals)].cls;
      }
    }
    if (d.dataset.hRole === (want || '')) return;      // already correct
    if (d.dataset.hRole) d.classList.remove(d.dataset.hRole);
    if (want) { d.classList.add('harmony-on', want); d.dataset.hRole = want; }
    else { d.classList.remove('harmony-on'); delete d.dataset.hRole; }
  });
}

function renderHarmonyReadout() {
  const el = document.getElementById('harmony-readout');
  if (!el) return;
  if (!harmonyState.enabled) { el.innerHTML = ''; return; }
  const c = harmonyState.chord;
  if (!c) {
    el.innerHTML = `<span class="harmony-idle">Start the backing track — the neck will recolour as each chord arrives.</span>`;
    return;
  }
  el.innerHTML = `<span class="harmony-now">Now sounding: <strong>${c.label}</strong></span>` +
    `<span class="harmony-sub">every note on the neck is coloured by what it does against this chord</span>`;
}

function renderHarmonyLegend() {
  const el = document.getElementById('harmony-legend');
  if (!el) return;
  if (!harmonyState.enabled || !harmonyState.showLegend) { el.innerHTML = ''; return; }
  const order = ['root', 'third', 'fifth', 'seventh', 'ninth', 'sixth', 'eleventh', 'avoid'];
  el.innerHTML = order.map(k => {
    const r = HARMONY_ROLES[k];
    return `<span class="h-legend-item"><span class="h-swatch ${r.cls}"></span>` +
           `<span class="h-legend-label">${r.label}</span><span class="h-legend-hint">${r.hint}</span></span>`;
  }).join('') +
  `<button class="h-legend-hide" onclick="harmonyToggleLegend()">Hide legend</button>`;
}

function harmonyToggleLegend() {
  harmonyState.showLegend = !harmonyState.showLegend;
  harmonySave();
  renderHarmonyLegend();
  const btn = document.getElementById('harmony-legend-btn');
  if (btn) btn.textContent = harmonyState.showLegend ? 'Hide legend' : 'Show legend';
}

function harmonyToggle() {
  harmonyState.enabled = !harmonyState.enabled;
  harmonyState._sig = null;
  const btn = document.getElementById('harmony-toggle-btn');
  if (btn) {
    btn.classList.toggle('active', harmonyState.enabled);
    btn.textContent = harmonyState.enabled ? 'Harmony ON' : 'Harmony';
  }
  const wrap = document.getElementById('harmony-bar');
  if (wrap) wrap.classList.toggle('visible', harmonyState.enabled);
  harmonySave();
  // If the vamp is not running there is no chord yet — show the key's own
  // tonic triad so the colours mean something immediately rather than
  // showing nothing until you press play.
  if (harmonyState.enabled && !harmonyState.chord && typeof state !== 'undefined') {
    const sc = typeof currentScale === 'function' ? currentScale() : null;
    const minorish = sc && /minor|dorian|phrygian|aeolian/i.test(sc.name) && !/major/i.test(sc.name);
    harmonyState.chord = {
      label: state.key + (minorish ? 'm' : ''), rootPc: CHROMATIC.indexOf(norm(state.key)),
      rootName: state.key, intervals: minorish ? [0, 3, 7] : [0, 4, 7],
    };
  }
  applyHarmonyColouring();
  renderHarmonyReadout();
  renderHarmonyLegend();
}

function harmonySave() {
  if (typeof loadProgress !== 'function') return;
  const d = loadProgress();
  d.ui.harmony = { enabled: harmonyState.enabled, showLegend: harmonyState.showLegend };
  saveProgress(d);
}
function harmonyLoad() {
  if (typeof loadProgress !== 'function') return;
  const h = loadProgress().ui.harmony;
  if (!h) return;
  harmonyState.showLegend = h.showLegend !== false;
  if (h.enabled) { harmonyState.enabled = false; harmonyToggle(); }
}

// scales.js re-renders the whole grid on every state change, which wipes the
// harmony classes — reapply after it does.
function harmonyReapplyAfterRender() {
  if (harmonyState.enabled) applyHarmonyColouring();
}
