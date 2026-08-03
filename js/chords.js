// ═══════════════════════════════════════════════════════════════════════════
// CHORDS MODE — chord fretboard overlay, chord run-through
// (top-level Scales↔Chords↔Study↔Riffs↔Songs navigation lives in js/nav.js)
// ═══════════════════════════════════════════════════════════════════════════

// ── Reference / Practice sub-tabs ──────────────────────────────────────────
function switchChordSubtab(tab) {
  document.querySelectorAll('#mode-panel-chords .subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === tab));
  document.querySelectorAll('#mode-panel-chords .subtab-panel').forEach(p => p.classList.toggle('active', p.id === `chords-subtab-${tab}`));
  if (tab === 'practice') updateChordPracticeStatus();
  const data = loadProgress();
  data.ui.activeChordSubtab = tab;
  saveProgress(data);
}

// ── Chord Switching Game drawer ────────────────────────────────────────────
function openGameDrawer() {
  document.getElementById('game-drawer').classList.add('open');
}
function closeGameDrawer() {
  if (typeof gameRunning !== 'undefined' && gameRunning) stopGame();
  document.getElementById('game-drawer').classList.remove('open');
  updateChordPracticeStatus();
}
function updateChordPracticeStatus() {
  const el = document.getElementById('chord-practice-status');
  if (!el) return;
  if (typeof activeKeySet === 'undefined') { el.textContent = ''; return; }
  const keys = [...activeKeySet].join(', ');
  const streak = typeof gameStreak !== 'undefined' ? gameStreak : 0;
  const best = typeof gameBestStreak !== 'undefined' ? gameBestStreak : 0;
  el.textContent = `Key Practice — ${keys}  ·  Streak ${streak} (best ${best})`;
}

// Chord mode state
let chordModeState = {
  key: 'E',
  shape: 'E',
  type: 'maj',
};

const CAGED_ORDER_LIST = ['C','A','G','E','D'];
const CHORD_KEYS_LIST = ['E','A','D','G','B','F#','C','Bb','Eb','Ab','Db','F'];
const CHORD_TYPE_LIST = [
  {id:'maj',label:'Maj'},{id:'min',label:'Min'},{id:'7',label:'Dom7'},
  {id:'maj7',label:'Maj7'},{id:'min7',label:'m7'},{id:'sus2',label:'Sus2'},
  {id:'sus4',label:'Sus4'},{id:'dim',label:'Dim'},{id:'aug',label:'Aug'},
  {id:'power',label:'5th'},
];
const SHAPE_COLORS_MAP = {C:'#e53935',A:'#fb8c00',G:'#c8b800',E:'#43a047',D:'#1e88e5'};

// ── Build chord mode controls ─────────────────────────────────────────────
function buildChordModeControls() {
  // Key buttons
  const kb = document.getElementById('chord-key-btns');
  kb.innerHTML = '';
  CHORD_KEYS_LIST.forEach((k,i) => {
    const b = document.createElement('button');
    b.textContent = k; b.dataset.group = 'chord-key';
    if (k === chordModeState.key) b.classList.add('active');
    b.onclick = () => {
      document.querySelectorAll('[data-group="chord-key"]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      chordModeState.key = k;
      renderChordFretboard();
      buildSeqPills();
    };
    kb.appendChild(b);
  });

  // Shape buttons
  const sb = document.getElementById('chord-shape-btns');
  sb.innerHTML = '';
  CAGED_ORDER_LIST.forEach(sh => {
    const b = document.createElement('button');
    b.textContent = sh; b.dataset.group = 'chord-shape';
    b.style.borderColor = SHAPE_COLORS_MAP[sh];
    if (sh === chordModeState.shape) { b.classList.add('active'); b.style.background = SHAPE_COLORS_MAP[sh]; b.style.color='#000'; }
    b.onclick = () => {
      document.querySelectorAll('[data-group="chord-shape"]').forEach(x => {
        x.classList.remove('active');
        x.style.background = '#2a2a2a'; x.style.color = '#aaa';
      });
      b.classList.add('active');
      b.style.background = SHAPE_COLORS_MAP[sh];
      b.style.color = '#000';
      chordModeState.shape = sh;
      renderChordFretboard();
    };
    sb.appendChild(b);
  });

  // Chord type buttons
  const tb = document.getElementById('chord-type-btns2');
  tb.innerHTML = '';
  CHORD_TYPE_LIST.forEach(ct => {
    const b = document.createElement('button');
    b.textContent = ct.label; b.dataset.group = 'chord-type2';
    if (ct.id === chordModeState.type) b.classList.add('active');
    b.onclick = () => {
      document.querySelectorAll('[data-group="chord-type2"]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      chordModeState.type = ct.id;
      renderChordFretboard();
    };
    tb.appendChild(b);
  });

  // Sequence preset buttons
  const sqb = document.getElementById('chord-seq-btns');
  sqb.innerHTML = '';
  const seqs = [
    {label:'CAGED',val:'caged'},{label:'I-IV-V',val:'145'},
    {label:'I-V-vi-IV',val:'1564'},{label:'12-Bar',val:'12bar'},
    {label:'ii-V-I',val:'251'},{label:'Custom',val:'custom'},
  ];
  seqs.forEach(sq => {
    const b = document.createElement('button');
    b.textContent = sq.label; b.dataset.group = 'chord-seq';
    if (sq.val === 'caged') b.classList.add('active');
    b.onclick = () => {
      document.querySelectorAll('[data-group="chord-seq"]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      buildSeqPills(sq.val);
    };
    sqb.appendChild(b);
  });

  buildSeqPills('caged');
}

// ── Chord fretboard rendering ─────────────────────────────────────────────
function getChordFrets() {
  // Use the CAGED shape data (already defined below in the CAGED section)
  // We need it here too — read from the global CAGED_SHAPES defined later
  // Use a simplified inline version for the fretboard overlay
  const shapeTemplates = {
    C:[-1,3,2,0,1,0], A:[-1,0,2,2,2,0], G:[3,2,0,0,0,3], E:[0,2,2,1,0,0], D:[-1,-1,0,2,3,2]
  };
  const openKeys = {C:'C',A:'A',G:'G',E:'E',D:'D'};
  const OPEN_MIDI = {C:48,A:45,G:43,E:40,D:50};

  const sh = chordModeState.shape;
  const key = chordModeState.key;
  const targetMidi = CHROMATIC.indexOf(norm(key));
  const openMidi = CHROMATIC.indexOf(norm(openKeys[sh]));
  let barre = targetMidi - openMidi;
  if (barre < 0) barre += 12;

  return shapeTemplates[sh].map(f => f < 0 ? -1 : f + barre);
}

function getIntervalClass(noteIdx, rootIdx, type) {
  // Returns 'root','third','fifth','seventh','other' based on interval
  const diff = (noteIdx - rootIdx + 12) % 12;
  const ct = CHORD_TYPE_LIST.find(t=>t.id===type) ||
    [{id:'maj',intervals:[0,4,7]},{id:'min',intervals:[0,3,7]},{id:'7',intervals:[0,4,7,10]},
     {id:'maj7',intervals:[0,4,7,11]},{id:'min7',intervals:[0,3,7,10]},{id:'sus2',intervals:[0,2,7]},
     {id:'sus4',intervals:[0,5,7]},{id:'dim',intervals:[0,3,6]},{id:'aug',intervals:[0,4,8]},
     {id:'power',intervals:[0,7]}].find(t=>t.id===type);
  const intervals = ct ? (ct.intervals||[]) : [0,4,7];
  const pos = intervals.indexOf(diff);
  if (diff === 0) return 'chord-root';
  if (pos === 1) return 'chord-third';
  if (pos === 2) return 'chord-fifth';
  if (pos === 3) return 'chord-seventh';
  if (pos > 3) return 'chord-other';
  return 'chord-other';
}

// Chord type intervals inline (since CHORD_TYPES is defined later in the page)
const CHORD_INTERVALS_MAP = {
  maj:[0,4,7], min:[0,3,7], '7':[0,4,7,10], maj7:[0,4,7,11], min7:[0,3,7,10],
  sus2:[0,2,7], sus4:[0,5,7], dim:[0,3,6], aug:[0,4,8], add9:[0,2,4,7],
  min9:[0,3,7,10,14], power:[0,7]
};

function renderChordFretboard() {
  const fb = document.getElementById('chord-fretboard');
  fb.querySelectorAll('.string-row,.fret-numbers').forEach(e=>e.remove());

  const frets = getChordFrets();
  const key = chordModeState.key;
  const type = chordModeState.type;
  const rootMidi = CHROMATIC.indexOf(norm(key));
  const intervals = CHORD_INTERVALS_MAP[type] || [0,4,7];
  const chordNotes = intervals.map(i=>CHROMATIC[(rootMidi+i)%12]);
  const shape = chordModeState.shape;
  const color = SHAPE_COLORS_MAP[shape];

  // Determine fret range to highlight
  const activeFrets = frets.filter(f=>f>=0);
  const minFret = Math.min(...activeFrets);
  const maxFret = Math.max(...activeFrets);

  // Fret numbers row
  const fnRow = document.createElement('div'); fnRow.className='fret-numbers';
  for(let f=0;f<FRETS;f++){
    const d=document.createElement('div'); d.className='fret-num'; d.style.width=FRET_W+'px';
    d.textContent=[0,3,5,7,9,12,15].includes(f)?f:''; fnRow.appendChild(d);
  }
  fb.insertBefore(fnRow,fb.querySelector('.nut').nextSibling);

  const stringOrder=[5,4,3,2,1,0];
  stringOrder.forEach((si,rowIdx) => {
    const row=document.createElement('div'); row.className='string-row';
    const lbl=document.createElement('div'); lbl.className='string-name'; lbl.textContent=STRING_LABELS[si]; row.appendChild(lbl);
    const sl=document.createElement('div'); sl.className='string-line'; row.appendChild(sl);
    const fd=document.createElement('div'); fd.className='frets';

    for(let f=0;f<FRETS;f++){
      const cell=document.createElement('div'); cell.className='fret-cell'; cell.style.width=FRET_W+'px';
      const dot=document.createElement('div'); dot.className='note-dot';
      const chordFret = frets[si];

      if(chordFret < 0) {
        // Muted string — show × on fret 0 cell
        if(f===0){
          dot.classList.add('chord-muted'); dot.textContent='×';
        } else { dot.classList.add('empty'); }
      } else if(f === chordFret) {
        // Active chord tone
        const noteName = noteAt(STRINGS[si], f);
        const noteIdx = CHROMATIC.indexOf(norm(noteName));
        const intervalClass = getIntervalClass(noteIdx, rootMidi, type);
        dot.classList.add('chord-dot', intervalClass);
        dot.textContent = noteName;
        // finger badge
        if(state.showFingers) {
          const fingerMap = assignChordFingers(frets);
          const finger = fingerMap[si];
          if(finger && finger > 0) {
            dot.style.position = 'relative';
            const badge = document.createElement('div');
            badge.className = `finger-badge finger-${finger}`;
            badge.textContent = finger;
            dot.appendChild(badge);
          }
        }
      } else {
        // Show all other chord notes on neck faintly
        const noteName = noteAt(STRINGS[si], f);
        if(chordNotes.includes(norm(noteName))) {
          dot.classList.add('scale-note'); dot.textContent=noteName;
        } else {
          dot.classList.add('empty');
        }
      }
      cell.appendChild(dot); fd.appendChild(cell);
    }
    row.appendChild(fd); fb.appendChild(row);
  });

  // Canvas arrows — highlight barre range
  const canvas = document.getElementById('chord-arrow-canvas');
  canvas.width = fb.offsetWidth||900; canvas.height = fb.offsetHeight||300;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(minFret > 0) {
    const LEFT=52, fretNumH=28, topPad=10, rowH=38;
    const x1=LEFT+(minFret-0.5)*FRET_W, x2=LEFT+(maxFret+0.5)*FRET_W;
    ctx.fillStyle = color+'18';
    ctx.fillRect(x1, fretNumH+topPad, x2-x1, 6*rowH);
    ctx.strokeStyle = color+'44'; ctx.lineWidth=1;
    ctx.strokeRect(x1, fretNumH+topPad, x2-x1, 6*rowH);
  }

  // Update chord display info
  const typeSuffix = {maj:'',min:'m','7':'7',maj7:'maj7',min7:'m7',sus2:'sus2',sus4:'sus4',dim:'°',aug:'+',add9:'add9',min9:'m9',power:'5'}[type]||'';
  document.getElementById('chord-run-display').textContent =
    `${key}${typeSuffix}  ·  ${shape} shape  ·  ${frets.map((f,i)=>f<0?'x':f).join('-')}  ·  Notes: ${chordNotes.join(' ')}`;

  // Also update circle of 5ths
  renderCircle(chordNotes);
}

function assignChordFingers(frets) {
  const active = frets.map((f,i)=>({si:i,f})).filter(x=>x.f>=0);
  if(!active.length) return {};
  const minF = Math.min(...active.map(x=>x.f));
  const maxF = Math.max(...active.map(x=>x.f));
  const span = maxF - minF;
  const result = {};
  active.forEach(({si,f}) => {
    if(f===0){result[si]=0;return;}
    if(span===0){result[si]=1;return;}
    const zone=(f-minF)/Math.max(span,1);
    result[si]=zone<0.25?1:zone<0.5?2:zone<0.75?3:4;
  });
  return result;
}

// ── Chord sequence pills ──────────────────────────────────────────────────
let currentSeq = [];
let chordRunRunning = false;
let chordRunIdx = 0;
let chordRunTimeout = null;

const SCALE_DEGREES = {
  '145': [0,5,7], '1564': [0,7,9,5], '12bar': [0,0,0,0,5,5,0,0,7,5,0,0],
  '251': [2,7,0], 'caged': null, 'custom': null
};

function buildSeqPills(seqId) {
  const key = chordModeState.key;
  const rootMidi = CHROMATIC.indexOf(norm(key));
  const display = document.getElementById('chord-seq-display');
  display.innerHTML = '';

  if(seqId === 'caged' || !seqId) {
    currentSeq = CAGED_ORDER_LIST.map(sh => ({shape:sh, key, type:chordModeState.type}));
  } else if(seqId === 'custom') {
    currentSeq = [];
    display.innerHTML = '<span style="font-family:Arial;font-size:9px;color:#555">Click chord dots on fretboard to build sequence (coming soon)</span>';
    return;
  } else if(SCALE_DEGREES[seqId]) {
    currentSeq = SCALE_DEGREES[seqId].map(deg => {
      const noteKey = CHROMATIC[(rootMidi+deg)%12];
      // Pick best CAGED shape for this key
      const shapes = ['E','A','C','G','D'];
      return {shape:shapes[Math.floor(Math.random()*shapes.length)], key:noteKey, type:chordModeState.type};
    });
  }

  currentSeq.forEach((c,i) => {
    const pill = document.createElement('div');
    pill.className='chord-seq-pill'; pill.id=`seq-pill-${i}`;
    const suf={maj:'',min:'m','7':'7',maj7:'maj7',min7:'m7',sus2:'sus2',sus4:'sus4',dim:'°',aug:'+',power:'5'}[c.type]||'';
    pill.textContent=`${c.key}${suf}`;
    pill.title=`${c.shape} shape`;
    pill.style.borderColor=SHAPE_COLORS_MAP[c.shape]||'#333';
    display.appendChild(pill);
  });
}

// ── Chord run-through engine ───────────────────────────────────────────────
function toggleChordRun() {
  const btn = document.getElementById('chord-run-btn');
  if(chordRunRunning) {
    stopChordRun();
    document.getElementById('chord-run-display').textContent='Stopped.';
  } else {
    if(!currentSeq.length) buildSeqPills('caged');
    getAudioCtx();
    chordRunRunning=true; chordRunIdx=0;
    btn.textContent='■ STOP'; btn.classList.add('running');
    chordRunStep();
  }
}

function chordRunStep() {
  if(!chordRunRunning) return;
  if(chordRunIdx >= currentSeq.length) {
    chordRunIdx=0; // loop
  }
  const chord = currentSeq[chordRunIdx];
  const order = document.getElementById('chord-run-order').value;

  // Update state and fretboard
  chordModeState.key = chord.key;
  chordModeState.shape = chord.shape;
  chordModeState.type = chord.type;

  // Update key button
  document.querySelectorAll('[data-group="chord-key"]').forEach(b=>{
    b.classList.toggle('active', b.textContent===chord.key);
  });
  document.querySelectorAll('[data-group="chord-shape"]').forEach(b=>{
    const sh=b.textContent;
    b.classList.toggle('active',sh===chord.shape);
    b.style.background=sh===chord.shape?SHAPE_COLORS_MAP[sh]:'#2a2a2a';
    b.style.color=sh===chord.shape?'#000':'#aaa';
  });

  renderChordFretboard();

  // Highlight pill
  document.querySelectorAll('.chord-seq-pill').forEach((p,i)=>{
    p.classList.toggle('active-chord', i===chordRunIdx);
    if(i<chordRunIdx) p.classList.add('done-chord'); else p.classList.remove('done-chord');
  });

  // Play chord sound
  playChordSound(chord);

  // Strum-timing grading: the moment a new chord appears is "the beat" the
  // next strum should land on. If the previous chord's window never saw a
  // strum, it was missed. Chord IDENTITY is graded by the self-grade buttons
  // below (renderChordTimingStatus / chordSelfGrade) — not from the mic —
  // per the explicit design call that a monophonic detector can't reliably
  // identify a strummed chord.
  if (chordGradingEnabled) {
    if (chordChangeTime != null) { chordTimingResult = 'missed'; renderChordTimingStatus(); }
    chordChangeTime = getAudioCtx().currentTime;
    chordTimingResult = null;
    showChordSelfGradeRow(chord);
  }

  chordRunIdx++;
  const speed = parseInt(document.getElementById('chord-run-speed').value);
  chordRunTimeout = setTimeout(chordRunStep, speed);
}

// ── Strum-timing grading (mic.js's onMicOnset) ──────────────────────────────
let chordGradingEnabled = false;
let chordChangeTime = null; // ctx.currentTime of the most recent chord change — the "beat" to grade against
let chordTimingResult = null; // 'onTime' | 'early' | 'late' | 'missed'

function toggleChordGrading(btn) {
  chordGradingEnabled = !chordGradingEnabled;
  if (btn) { btn.textContent = chordGradingEnabled ? '🎤 Grading On' : '🎤 Grade My Strums'; btn.classList.toggle('active', chordGradingEnabled); }
  const status = document.getElementById('chord-grading-status');
  if (chordGradingEnabled && !micEnabled && status) status.textContent = 'Turn on the mic in the bar above first.';
  else if (!chordGradingEnabled && status) status.textContent = '';
  if (!chordGradingEnabled) document.getElementById('chord-selfgrade-row').style.display = 'none';
}

function chordsHandleMicOnset(evt) {
  if (!chordGradingEnabled || chordChangeTime == null) return;
  const panel = document.getElementById('mode-panel-chords');
  if (!panel || !panel.classList.contains('active')) return;
  const dtMs = (evt.time - chordChangeTime) * 1000;
  const TIGHT_MS = 200, WIDE_MS = 600;
  if (dtMs < -WIDE_MS || dtMs > WIDE_MS) return; // unrelated to this chord change
  chordTimingResult = Math.abs(dtMs) <= TIGHT_MS ? 'onTime' : (dtMs > 0 ? 'late' : 'early');
  chordChangeTime = null; // consumed — a missed-check won't fire for this chord anymore
  renderChordTimingStatus();
}
onMicOnset(chordsHandleMicOnset);

function renderChordTimingStatus() {
  const el = document.getElementById('chord-grading-status');
  if (!el) return;
  const label = { onTime: '✓ On time', early: '~ A little early', late: '~ A little late', missed: '— No strum detected' }[chordTimingResult] || '';
  el.textContent = label;
  el.className = 'chord-grading-status ' + (chordTimingResult || '');
}

// Chord identity is self-graded — a strummed chord's individual notes can't
// be reliably picked apart by a monophonic pitch detector.
function showChordSelfGradeRow(chord) {
  const row = document.getElementById('chord-selfgrade-row');
  const label = document.getElementById('chord-selfgrade-label');
  if (!row || !label) return;
  const suf = { maj:'',min:'m','7':'7',maj7:'maj7',min7:'m7',sus2:'sus2',sus4:'sus4',dim:'°',aug:'+',power:'5' }[chord.type] || '';
  label.textContent = `Was that ${chord.key}${suf}?`;
  row.style.display = '';
}
function chordSelfGrade(success) {
  const status = document.getElementById('chord-grading-status');
  if (status) status.textContent += success ? '  ·  ✓ Chord correct' : '  ·  ✗ Chord missed';
  document.getElementById('chord-selfgrade-row').style.display = 'none';
}

// ── Camera hand-shape feedback (js/camera.js) ───────────────────────────────
// See camera.js's file header for the accuracy caveat — this compares which
// fingers are curled/fretting against the target chord's known finger
// assignment, not an absolute fret/string reading.
let lastChordHandFeedbackTime = 0;
function chordsHandleHandUpdate(hand) {
  const panel = document.getElementById('mode-panel-chords');
  const el = document.getElementById('camera-chord-feedback');
  if (!panel || !panel.classList.contains('active') || !el) return;
  const now = performance.now();
  if (now - lastChordHandFeedbackTime < 600) return; // throttle — don't rewrite the tip every frame
  lastChordHandFeedbackTime = now;
  if (!hand.present) { el.textContent = 'Show your fretting hand to the camera to check your shape.'; return; }
  const tips = compareHandToChord(hand, chordModeState.key);
  el.textContent = tips ? tips.join('  ·  ') : 'Analyzing hand position…';
}

function stopChordRun() {
  chordRunRunning=false;
  clearTimeout(chordRunTimeout);
  const btn=document.getElementById('chord-run-btn');
  btn.textContent='▶ RUN CHORDS'; btn.classList.remove('running');
  document.querySelectorAll('.chord-seq-pill').forEach(p=>p.classList.remove('active-chord'));
  chordChangeTime = null;
  chordTimingResult = null;
  const selfGradeRow = document.getElementById('chord-selfgrade-row');
  if (selfGradeRow) selfGradeRow.style.display = 'none';
}

function playChordSound(chordObj) {
  const soundType = document.getElementById('chord-run-sound').value;
  if(soundType==='muted') return;
  const vol = parseInt(document.getElementById('vol-slider').value)/100;
  const ctx = getAudioCtx();
  const frets = (() => {
    const shapeTemplates={C:[-1,3,2,0,1,0],A:[-1,0,2,2,2,0],G:[3,2,0,0,0,3],E:[0,2,2,1,0,0],D:[-1,-1,0,2,3,2]};
    const openKeys={C:'C',A:'A',G:'G',E:'E',D:'D'};
    const sh=chordObj.shape, key=chordObj.key;
    const targetMidi=CHROMATIC.indexOf(norm(key));
    const openMidi=CHROMATIC.indexOf(norm(openKeys[sh]));
    let barre=targetMidi-openMidi; if(barre<0) barre+=12;
    return shapeTemplates[sh].map(f=>f<0?-1:f+barre);
  })();

  const activeFrets = frets.map((f,i)=>({f,si:i})).filter(x=>x.f>=0);
  const now = ctx.currentTime;

  if(soundType==='block') {
    activeFrets.forEach(({f,si})=>{
      playPluck(now, fretToHz(si,f), vol*0.6);
    });
  } else {
    // Arpeggiated strum (low to high)
    activeFrets.forEach(({f,si},i)=>{
      playPluck(now+i*0.04, fretToHz(si,f), vol*0.55);
    });
  }
}

// ── Init mode controls ─────────────────────────────────────────────────────
buildChordModeControls();
