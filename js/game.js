// Safe getElementById helper — prevents null dereference errors
function ges(id) { return document.getElementById(id) || {style:{},textContent:'',innerHTML:'',className:'',classList:{add:()=>{},remove:()=>{},toggle:()=>{}}}; }

// ═══════════════════════════════════════════════════════════════════════════
// CHORD SWITCHING MINI-GAME ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// ── Full chord diagram data ───────────────────────────────────────────────
// Format: name, frets[6] (low E to high e, -1=muted), fingers[6]
const GAME_CHORDS = {
  // Open major
  'C':   { f:[-1,3,2,0,1,0], fingers:[0,3,2,0,1,0] },
  'G':   { f:[3,2,0,0,0,3],  fingers:[2,1,0,0,0,3] },
  'D':   { f:[-1,-1,0,2,3,2],fingers:[0,0,0,1,3,2] },
  'A':   { f:[-1,0,2,2,2,0], fingers:[0,0,2,3,4,0] },
  'E':   { f:[0,2,2,1,0,0],  fingers:[0,2,3,1,0,0] },
  'F':   { f:[-1,-1,3,2,1,1],fingers:[0,0,4,3,1,1] },
  'Bb':  { f:[-1,1,3,3,3,1], fingers:[0,1,3,4,2,1] },

  // Open minor
  'Am':  { f:[-1,0,2,2,1,0], fingers:[0,0,2,3,1,0] },
  'Em':  { f:[0,2,2,0,0,0],  fingers:[0,2,3,0,0,0] },
  'Dm':  { f:[-1,-1,0,2,3,1],fingers:[0,0,0,2,3,1] },

  // Barre chords (E shape)
  'Bm':  { f:[-1,2,4,4,3,2], fingers:[0,1,3,4,2,1], barre:2 },
  'F#m': { f:[-1,2,4,4,2,2], fingers:[0,1,3,4,1,1], barre:2 },
  'C#m': { f:[-1,4,6,6,5,4], fingers:[0,1,3,4,2,1], barre:4 },
  'Gm':  { f:[3,5,5,3,3,3],  fingers:[1,3,4,1,1,1], barre:3 },
  'Fm':  { f:[1,3,3,1,1,1],  fingers:[1,3,4,1,1,1], barre:1 },
  'Bbm': { f:[6,8,8,6,6,6],  fingers:[1,3,4,1,1,1], barre:6 },

  // Barre (A shape)
  'B':   { f:[-1,2,4,4,4,2], fingers:[0,1,3,3,3,1], barre:2 },
  'Eb':  { f:[-1,6,8,8,8,6], fingers:[0,1,3,3,3,1], barre:6 },

  // Dom 7ths
  'C7':  { f:[-1,3,2,3,1,0], fingers:[0,3,2,4,1,0] },
  'G7':  { f:[3,2,0,0,0,1],  fingers:[3,2,0,0,0,1] },
  'D7':  { f:[-1,-1,0,2,1,2],fingers:[0,0,0,2,1,3] },
  'A7':  { f:[-1,0,2,0,2,0], fingers:[0,0,2,0,3,0] },
  'E7':  { f:[0,2,0,1,0,0],  fingers:[0,2,0,1,0,0] },
  'B7':  { f:[-1,2,4,2,4,2], fingers:[0,1,3,2,4,1] },
  'F7':  { f:[1,3,1,2,1,1],  fingers:[1,3,1,2,1,1], barre:1 },

  // Add/sus — needed for the progression presets below (Knopfler staples)
  'Cadd9': { f:[-1,3,2,0,3,0], fingers:[0,3,2,0,4,0] },
  'Dsus2': { f:[-1,-1,0,2,3,0], fingers:[0,0,0,1,2,0] },
};

const CHORD_SETS = {
  open:     ['C','G','D','A','E','F'],
  minor:    ['Am','Em','Dm','Bm','F#m','C#m','Gm'],
  barre_e:  ['F','Bb','B','Bm','F#m','Gm','Fm','Bbm'],
  barre_a:  ['B','Bb','Eb','C#m'],
  dom7:     ['C7','G7','D7','A7','E7','B7','F7'],
  caged_key: null, // built dynamically
  custom:   null,

  // ── Common-transition presets ──────────────────────────────────────────
  preset_g_cadd9:   ['G','Cadd9'],
  preset_am_f:      ['Am','F'],
  preset_e_a:       ['E','A'],
  preset_dm_am:     ['Dm','Am'],
  preset_a_d_e:     ['A','D','E'],
  preset_em_c_g_d:  ['Em','C','G','D'],

  // ── Player-specific modes ──────────────────────────────────────────────
  player_knopfler: ['G','D','Cadd9','Em','Am','Dsus2'],
  player_ronson:   ['E','A','B','D','C#m','F#m'],
  player_hazel:    ['Em','Am','Dm','C','G','F'],
  player_deanween: ['E','A','D','G','C'], // "with genre jumps" — random order below leans into that
  player_zappa:    ['E','G','Bb','F#m','C7'], // deliberately unrelated-feeling jumps, not a diatonic progression
};

// Preset metadata: label, description, a sane default play order, and (for
// the BPM-ramp milestone in scheduleGameBeat/gradeSwitch) a target tempo to
// notify at — a rough "you could play this at a real song's speed" marker,
// not tied to one specific recording.
const PROGRESSION_PRESET_META = {
  preset_g_cadd9:   { label: 'G → Cadd9',        note: 'Knopfler staple',        order: 'sequential', targetBpm: 120 },
  preset_am_f:      { label: 'Am → F',           note: 'Minor-key staple',       order: 'sequential', targetBpm: 110 },
  preset_e_a:       { label: 'E → A',            note: 'Blues/rock staple',      order: 'sequential', targetBpm: 130 },
  preset_dm_am:     { label: 'Dm → Am',          note: 'Hazel Dorian movement',  order: 'sequential', targetBpm: 90 },
  preset_a_d_e:     { label: 'A → D → E',        note: 'Classic rock I–IV–V',    order: 'sequential', targetBpm: 140 },
  preset_em_c_g_d:  { label: 'Em → C → G → D',   note: 'Ronson anthemic',        order: 'sequential', targetBpm: 130 },
  player_knopfler:  { label: 'Knopfler Mode',    note: 'G D Cadd9 Em Am Dsus2',  order: 'sequential', targetBpm: 148 },
  player_ronson:    { label: 'Ronson Mode',      note: 'E A B D C#m F#m',        order: 'sequential', targetBpm: 136 },
  player_hazel:     { label: 'Hazel Mode',       note: 'Em Am Dm C G F',         order: 'sequential', targetBpm: 90 },
  player_deanween:  { label: 'Dean Ween Mode',   note: 'E A D G C — genre jumps',order: 'random',      targetBpm: 100 },
  player_zappa:     { label: 'Zappa Mode',       note: 'Unusual movements',      order: 'random',      targetBpm: 120 },
};

const CIRCLE_5THS_ORDER = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];

// ── Game state ─────────────────────────────────────────────────────────────
let gameRunning = false;
let gameScheduler = null;
let gameChordIndex = 0;
let gameDeck = [];
let gameBeat = 0;
let gameNextTime = 0;
let gameCurrentChord = null;
let gamePrevChord = null;
let gameNextChordPreview = null;
let gameStreak = 0;
let gameBestStreak = 0;
let gameTotalSwitched = 0;
let gameGot = 0, gameMissed = 0;
let gameSessionStart = null;
let gameSessionTimer = null;
let gameHistory = [];
let gameMissedCounts = {};
let gameSelectedSet = 'open';
let gamePendingGrade = false;

// ═══════════════════════════════════════════════════════════════════════════
// KEY PRACTICE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// Diatonic chord qualities for major scale degrees: I ii iii IV V vi vii°
const DIATONIC_QUALITIES = ['maj','min','min','maj','maj','min','dim'];
const DIATONIC_NUMERALS  = ['I','ii','iii','IV','V','vi','vii°'];
const MAJOR_SCALE_INTERVALS = [0,2,4,5,7,9,11];

// All 12 keys with display names
const ALL_PRACTICE_KEYS = [
  {note:'C',  label:'C',  sharps:0},
  {note:'G',  label:'G',  sharps:1},
  {note:'D',  label:'D',  sharps:2},
  {note:'A',  label:'A',  sharps:3},
  {note:'E',  label:'E',  sharps:4},
  {note:'B',  label:'B',  sharps:5},
  {note:'F#', label:'F#', sharps:6},
  {note:'Db', label:'Db', sharps:-5},
  {note:'Ab', label:'Ab', sharps:-4},
  {note:'Eb', label:'Eb', sharps:-3},
  {note:'Bb', label:'Bb', sharps:-2},
  {note:'F',  label:'F',  sharps:-1},
];

// Which keys are currently active for practice
let activeKeySet = new Set(['C']);

// Generate the 7 diatonic chords for a key
function getDiatonicChords(keyNote) {
  const root = CHROMATIC.indexOf(norm(keyNote));
  return MAJOR_SCALE_INTERVALS.map((interval, degree) => {
    const noteIdx = (root + interval) % 12;
    const noteName = CHROMATIC[noteIdx];
    const quality = DIATONIC_QUALITIES[degree];
    const chordName = quality === 'maj' ? noteName :
                      quality === 'min' ? noteName + 'm' :
                      quality === 'dim' ? noteName + 'm' : noteName; // treat dim as minor for playability
    return {
      chord: chordName,
      noteName,
      quality,
      degree,
      numeral: DIATONIC_NUMERALS[degree],
      key: keyNote
    };
  });
}

// Build the key toggle grid
function buildKeyToggleGrid() {
  const grid = document.getElementById('key-toggle-grid');
  if (!grid) return;
  grid.innerHTML = '';

  ALL_PRACTICE_KEYS.forEach(k => {
    const isActive = activeKeySet.has(k.note);
    const btn = document.createElement('button');
    btn.className = 'chord-set-pill' + (isActive ? ' active' : '');
    btn.style.cssText = 'font-size:10px;font-weight:bold;padding:5px 2px;text-align:center;border-radius:3px;width:100%';
    btn.textContent = k.label;
    btn.dataset.key = k.note;
    btn.onclick = () => {
      if (activeKeySet.has(k.note)) {
        if (activeKeySet.size > 1) { // always keep at least one
          activeKeySet.delete(k.note);
          btn.classList.remove('active');
        }
      } else {
        activeKeySet.add(k.note);
        btn.classList.add('active');
      }
      if (gameSelectedSet === 'key_practice') {
        rebuildGameDeck();
      }
      updateKeyInfoBox();
    };
    grid.appendChild(btn);
  });
}

// Update the key info box showing what chords are in each selected key
function updateKeyInfoBox() {
  const box = document.getElementById('key-info-box');
  if (!box) return;
  const lines = [];
  activeKeySet.forEach(k => {
    const chords = getDiatonicChords(k);
    const incMajor = document.getElementById('q-major')?.checked;
    const incMinor = document.getElementById('q-minor')?.checked;
    const incDom7  = document.getElementById('q-dom7')?.checked;
    const incDim   = document.getElementById('q-dim')?.checked;
    const filtered = chords.filter(c => {
      if (c.quality === 'maj' && !incDom7) return incMajor;
      if (c.quality === 'min') return incMinor;
      if (c.quality === 'dim') return incDim;
      return true;
    });
    const chordList = filtered.map(c => `<span style="color:#5c8fff">${c.numeral}</span>=${c.chord}`).join(' ');
    lines.push(`<span style="color:#fff;font-weight:bold">${k}:</span> ${chordList}`);
  });
  box.innerHTML = lines.join('<br>');
}

// Build deck from selected keys
function buildKeyPracticeDeck() {
  const incMajor = document.getElementById('q-major')?.checked ?? true;
  const incMinor = document.getElementById('q-minor')?.checked ?? true;
  const incDom7  = document.getElementById('q-dom7')?.checked ?? false;
  const incDim   = document.getElementById('q-dim')?.checked  ?? false;

  let allChords = [];
  activeKeySet.forEach(keyNote => {
    const diatonic = getDiatonicChords(keyNote);
    diatonic.forEach((c, i) => {
      // Filter by quality toggles
      if (c.quality === 'maj' && i === 4 && incDom7) {
        // V chord — add as dom7 if toggle on
        const dom7name = c.noteName + '7';
        if (GAME_CHORDS[dom7name]) allChords.push(dom7name);
        else if (incMajor && GAME_CHORDS[c.chord]) allChords.push(c.chord);
      } else if (c.quality === 'maj' && incMajor) {
        if (GAME_CHORDS[c.chord]) allChords.push(c.chord);
      } else if (c.quality === 'min' && incMinor) {
        if (GAME_CHORDS[c.chord]) allChords.push(c.chord);
      } else if (c.quality === 'dim' && incDim) {
        // Use minor proxy since we don't have dim fingerings for all
        if (GAME_CHORDS[c.chord]) allChords.push(c.chord);
      }
    });
  });

  // Deduplicate
  allChords = [...new Set(allChords)];

  // Update deck preview
  const preview = document.getElementById('deck-preview');
  if (preview) {
    preview.textContent = allChords.length
      ? allChords.join('  ·  ')
      : 'No chords match — check quality toggles';
  }

  updateKeyInfoBox();
  return allChords.length ? allChords : ['C','Am','F','G'];
}

// Preset key combinations
function selectKeyPreset(preset) {
  activeKeySet.clear();
  const presets = {
    'common': ['C','G','D','A','E'],
    'flat':   ['F','Bb','Eb','Ab'],
    'minor':  ['Am','Em','Dm'],
    'all':    ALL_PRACTICE_KEYS.map(k=>k.note),
    'circle': ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'],
  };
  (presets[preset]||['C']).forEach(k => {
    if(ALL_PRACTICE_KEYS.find(x=>x.note===k)) activeKeySet.add(k);
  });
  buildKeyToggleGrid();
  rebuildGameDeck();
}

// ── Override selectChordSet to handle key_practice ────────────────────────
let gamePresetTargetBpm = null; // set when a progression/player preset is chosen — drives the milestone in gradeSwitch()

function selectChordSet(setId, el) {
  document.querySelectorAll('.chord-set-pill').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  gameSelectedSet = setId;
  ges('caged-key-game-row').style.display = setId==='caged_key'?'':'none';
  ges('custom-chord-row').style.display = setId==='custom'?'':'none';
  ges('key-practice-panel').style.display = setId==='key_practice'?'':'none';

  const meta = PROGRESSION_PRESET_META[setId];
  gamePresetTargetBpm = meta ? meta.targetBpm : null;
  const orderSel = document.getElementById('game-order');
  if (meta && orderSel) orderSel.value = meta.order;
  updateBpmMilestoneUI();

  rebuildGameDeck();
}

// ── Override rebuildGameDeck to use key practice ──────────────────────────
function rebuildGameDeck() {
  const order = document.getElementById('game-order').value;
  let chords = [];

  if (gameSelectedSet === 'key_practice') {
    chords = buildKeyPracticeDeck();
  } else if (gameSelectedSet === 'caged_key') {
    const key = document.getElementById('game-caged-key').value;
    const root = CHROMATIC.indexOf(norm(key));
    const majorScale = [0,2,4,5,7,9,11];
    const qualities = ['','m','m','','','m','m'];
    chords = majorScale.map((deg,i) => {
      const n = CHROMATIC[(root+deg)%12];
      return n + qualities[i];
    }).filter(c => GAME_CHORDS[c]);
  } else if (gameSelectedSet === 'custom') {
    const raw = document.getElementById('custom-chord-input').value;
    chords = raw.split(',').map(s=>s.trim()).filter(c=>GAME_CHORDS[c]);
    if (!chords.length) chords = ['C','Am','F','G'];
  } else {
    chords = [...(CHORD_SETS[gameSelectedSet] || CHORD_SETS.open)];
  }

  if (!chords.length) chords = ['C','G','Am','F'];

  if (order === 'random') {
    for(let i=chords.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[chords[i],chords[j]]=[chords[j],chords[i]];}
  } else if (order === 'circle5') {
    chords.sort((a,b) => {
      const ai = CIRCLE_5THS_ORDER.indexOf(a.replace(/m|7/g,''));
      const bi = CIRCLE_5THS_ORDER.indexOf(b.replace(/m|7/g,''));
      return ai - bi;
    });
  } else if (order === 'hardest') {
    chords.sort((a,b) => (gameMissedCounts[b]||0) - (gameMissedCounts[a]||0));
  }

  gameDeck = chords;
  gameChordIndex = 0;
  buildGameBeatDots();
  renderGameChords();
}

// ── Init key practice ─────────────────────────────────────────────────────
buildKeyToggleGrid();
updateKeyInfoBox();
// Default: key practice mode visible
ges('key-practice-panel').style.display = '';
gameSelectedSet = 'key_practice';

// Add preset quick-select row under the key grid
(function() {
  const panel = document.getElementById('key-practice-panel');
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;margin-top:-4px';
  presetRow.innerHTML = `
    <span style="font-family:Arial;font-size:8px;color:#444;align-self:center;letter-spacing:.08em;text-transform:uppercase">Presets:</span>
    <button onclick="selectKeyPreset('common')" style="padding:2px 7px;font-size:8px;font-family:Arial;border:1px solid #333;background:#1a1a1a;color:#666;cursor:pointer">Common</button>
    <button onclick="selectKeyPreset('flat')"   style="padding:2px 7px;font-size:8px;font-family:Arial;border:1px solid #333;background:#1a1a1a;color:#666;cursor:pointer">Flat keys</button>
    <button onclick="selectKeyPreset('all')"    style="padding:2px 7px;font-size:8px;font-family:Arial;border:1px solid #333;background:#1a1a1a;color:#666;cursor:pointer">All 12</button>
    <button onclick="selectKeyPreset('circle')" style="padding:2px 7px;font-size:8px;font-family:Arial;border:1px solid #333;background:#1a1a1a;color:#666;cursor:pointer">Circle</button>
  `;
  const toggleGrid = document.getElementById('key-toggle-grid');
  if (toggleGrid && toggleGrid.parentNode) {
    toggleGrid.parentNode.insertBefore(presetRow, toggleGrid.nextSibling);
  }
})();

// ── Build beat dots ─────────────────────────────────────────────────────────
function buildGameBeatDots() {
  const beats = parseInt(document.getElementById('game-beats').value);
  const el = document.getElementById('game-beat-dots');
  el.innerHTML = '';
  for (let i=0;i<beats;i++) {
    const d = document.createElement('div');
    d.className = 'game-beat-dot' + (i===0?' accent':'');
    d.id = `gbdot-${i}`;
    el.appendChild(d);
  }
}

let lastGameBeatLit = -1;
function lightGameBeat(b) {
  const beats = parseInt(document.getElementById('game-beats').value);
  if (lastGameBeatLit>=0) {
    const old = document.getElementById(`gbdot-${lastGameBeatLit%beats}`);
    if(old){old.classList.remove('lit','accent','warn'); if(lastGameBeatLit%beats===0) old.classList.add('accent');}
  }
  const cur = document.getElementById(`gbdot-${b%beats}`);
  if(cur){
    const isWarn = document.getElementById('game-warn').checked && (b%beats === beats-1);
    cur.classList.add(isWarn?'warn':'lit');
  }
  lastGameBeatLit = b%beats;
}

// ── Draw chord diagram for game ─────────────────────────────────────────────
function drawGameChord(canvas, chordName, size=150) {
  const chord = GAME_CHORDS[chordName];
  if (!chord) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const padL=22, padR=10, padT=28, padB=14;
  const numStr=6, numFrets=5;
  const W=canvas.width, H=canvas.height;
  const strW=(W-padL-padR)/(numStr-1);
  const fretH=(H-padT-padB)/numFrets;

  const active = chord.f.filter(f=>f>=0);
  const minFret = active.length ? Math.min(...active) : 0;
  const startFret = minFret<=1 ? 0 : minFret-1;

  // Fret numbers
  ctx.fillStyle='#444'; ctx.font='8px Arial'; ctx.textAlign='right';
  for(let f=0;f<numFrets;f++){
    const fn=startFret+f+1;
    if(fn>0) ctx.fillText(fn, padL-4, padT+f*fretH+fretH/2+3);
  }

  // Nut
  if(startFret===0){
    ctx.fillStyle='#888'; ctx.fillRect(padL,padT-4,(numStr-1)*strW,4);
  }

  // Fret lines
  for(let f=0;f<=numFrets;f++){
    ctx.strokeStyle='#2a2a2a'; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(padL,padT+f*fretH); ctx.lineTo(padL+(numStr-1)*strW,padT+f*fretH); ctx.stroke();
  }

  // Strings
  for(let s=0;s<numStr;s++){
    ctx.strokeStyle='#444'; ctx.lineWidth=0.8+(5-s)*0.25;
    ctx.beginPath();
    ctx.moveTo(padL+s*strW,padT); ctx.lineTo(padL+s*strW,padT+numFrets*fretH); ctx.stroke();
  }

  // Barre bar
  if(chord.barre && chord.barre > 0){
    const bf=chord.barre-startFret-1;
    if(bf>=0&&bf<numFrets){
      ctx.fillStyle='rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.roundRect(padL-3,padT+bf*fretH+3,(numStr-1)*strW+6,fretH-6,6);
      ctx.fill();
    }
  }

  // Dots
  const fingerColors = ['#fff','#e53935','#43a047','#1e88e5','#8e24aa'];
  chord.f.forEach((f,si) => {
    const x=padL+si*strW;
    if(f<0){
      ctx.fillStyle='#333'; ctx.font='bold 10px Arial'; ctx.textAlign='center';
      ctx.fillText('×',x,padT-7); return;
    }
    if(f===0&&startFret===0){
      ctx.strokeStyle='#555'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(x,padT-7,4,0,Math.PI*2); ctx.stroke(); return;
    }
    const fr=f-startFret-1;
    if(fr<0||fr>=numFrets) return;
    const y=padT+fr*fretH+fretH/2;
    const finger=chord.fingers?chord.fingers[si]:0;
    ctx.beginPath(); ctx.arc(x,y,fretH*0.36,0,Math.PI*2);
    ctx.fillStyle=fingerColors[Math.min(finger,4)]; ctx.fill();
    if(finger>0){
      ctx.fillStyle='#000'; ctx.font=`bold ${Math.round(fretH*0.35)}px Arial`; ctx.textAlign='center';
      ctx.fillText(finger,x,y+fretH*0.12);
    }
  });
}

// ── Render game chord display ──────────────────────────────────────────────
const renderGameChords = function() {
  const row = document.getElementById('chord-cards-row');
  if (!row) return;
  row.innerHTML = '';
  if (!gameDeck.length) return;

  const cur = gameDeck[gameChordIndex % gameDeck.length];
  const next = gameDeck[(gameChordIndex+1) % gameDeck.length];
  const prev = gameChordIndex > 0 ? gameDeck[(gameChordIndex-1+gameDeck.length)%gameDeck.length] : null;

  // Full-page Study sub-tab now (moved out of a 520px Chords-mode drawer),
  // so the current chord can be genuinely large — "unmistakably clear" per
  // the brief — while prev/next stay small and CSS (.chord-card-wrap.current
  // etc.) pushes the size gap even further via scale/opacity.
  const cards = [];
  if (prev && gameRunning) cards.push({name:prev, cls:'prev-card', size:110, label:'PREV'});
  cards.push({name:cur, cls:'current', size:220, label:'NOW →'});
  cards.push({name:next, cls:'next-card', size:140, label:'NEXT'});

  cards.forEach(card => {
    const wrap = document.createElement('div');
    wrap.className = `chord-card-wrap ${card.cls}`;

    const lbl = document.createElement('div');
    lbl.className = 'chord-card-label';
    lbl.textContent = card.label;

    // Big chord name
    const nameEl = document.createElement('div');
    nameEl.className = 'chord-name-display';
    const base = card.name.replace(/m$|7$|maj7$|m7$|sus2$|sus4$|dim$|aug$|add9$/,'');
    const suffix = card.name.slice(base.length);
    nameEl.innerHTML = base + (suffix?`<span class="chord-type-small">${suffix}</span>`:'');

    const canvas = document.createElement('canvas');
    canvas.className = 'game-chord-canvas';
    canvas.width = card.size; canvas.height = card.size * 1.3;
    setTimeout(()=>drawGameChord(canvas, card.name, card.size), 0);

    wrap.appendChild(lbl);
    wrap.appendChild(nameEl);
    wrap.appendChild(canvas);
    row.appendChild(wrap);
  });

  gameCurrentChord = cur;
  document.getElementById('stat-bpm').textContent = document.getElementById('game-bpm').value + ' BPM';
  setTimeout(drawGuitarNeck, 30);
}

// ── Timer ring ─────────────────────────────────────────────────────────────
const RING_CIRC = 213.6;
function updateRing(progress) {
  // progress 0..1 (1=full, 0=empty)
  const offset = RING_CIRC * (1-progress);
  ges('ring-fill').style.strokeDashoffset = offset;
  const ring = document.getElementById('timer-ring');
  ring.classList.toggle('warning', progress < 0.35 && progress > 0.15);
  ring.classList.toggle('critical', progress <= 0.15);
}

// ── Flash ──────────────────────────────────────────────────────────────────
function flashArena() {
  const fl = document.getElementById('game-flash');
  fl.classList.add('flash');
  setTimeout(()=>fl.classList.remove('flash'), 120);
}

// ── Strum chord sound ──────────────────────────────────────────────────────
function strumGameChord(chordName) {
  if (!document.getElementById('game-strum').checked) return;
  const chord = GAME_CHORDS[chordName];
  if (!chord) return;
  getAudioCtx();
  const vol = 0.45;
  const ctx = getAudioCtx();
  chord.f.forEach((f,si) => {
    if (f < 0) return;
    const delay = si * 0.03; // strum delay
    playPluck(ctx.currentTime + delay, fretToHz(si, f), vol);
  });
}

// ── Core game scheduler ───────────────────────────────────────────────────
const GAME_LOOKAHEAD = 0.12;
const GAME_INTERVAL = 25;

function scheduleGameBeat() {
  const ctx = getAudioCtx();
  const bpm = parseInt(document.getElementById('game-bpm').value);
  const beatsPerChord = parseInt(document.getElementById('game-beats').value);
  const useClick = document.getElementById('game-sound').checked;
  const beatDur = 60 / bpm;
  const totalBeats = beatsPerChord;

  while (gameNextTime < ctx.currentTime + GAME_LOOKAHEAD) {
    const beatInChord = gameBeat % totalBeats;
    const isAccent = beatInChord === 0;
    const t = gameNextTime;

    // Click sound
    if (useClick) playClick(t, isAccent, 0.5);

    // Visual beat light + ring update
    const b = gameBeat;
    const bic = beatInChord;
    const timeUntil = (t - ctx.currentTime) * 1000;
    setTimeout(() => {
      lightGameBeat(bic);
      const progress = 1 - (bic / totalBeats);
      updateRing(progress);
      const _rt = document.getElementById('ring-text'); if (_rt) _rt.textContent = totalBeats - bic;
      const _bbl = document.getElementById('beat-bar-label'); if (_bbl) _bbl.textContent = `Beat ${bic+1} of ${totalBeats}  ·  ${bpm} BPM`;
    }, Math.max(0, timeUntil));

    // On beat 1 of each chord cycle — advance chord
    if (beatInChord === 0 && gameBeat > 0) {
      const advanceAt = Math.max(0, timeUntil);
      setTimeout(() => {
        if (!gameRunning) return;
        // Show grade buttons briefly
        if (!document.getElementById('game-autoadvance').checked) {
          ges('btn-got').style.display='inline-block';
          ges('btn-missed').style.display='inline-block';
          gamePendingGrade = true;
        }
        advanceGameChord();
      }, advanceAt);
    }

    gameNextTime += beatDur;
    gameBeat++;
  }
}

const advanceGameChord = function() {
  gamePrevChord = gameCurrentChord;
  gameChordIndex = (gameChordIndex + 1) % gameDeck.length;
  gameTotalSwitched++;
  flashArena();
  renderGameChords();

  const newChord = gameDeck[gameChordIndex];
  strumGameChord(newChord);
  // Update neck display
  setTimeout(drawGuitarNeck, 50);

  // Log
  gameHistory.unshift(`→ ${newChord}`);
  if (gameHistory.length > 20) gameHistory.pop();
  updateHistoryLog();

  document.getElementById('game-total-switched').textContent = gameTotalSwitched;
  document.getElementById('stat-played').textContent = gameTotalSwitched;

  // Auto-grade if enabled
  if (document.getElementById('game-autoadvance').checked) {
    ges('btn-got').style.display='none';
    ges('btn-missed').style.display='none';
  }
}

function gradeSwitch(success) {
  if (gamePrevChord && gameCurrentChord && typeof recordChordPairResult === 'function') {
    recordChordPairResult(gamePrevChord, gameCurrentChord, success);
  }
  if (success) {
    gameStreak++;
    gameGot++;
    if (gameStreak > gameBestStreak) {
      gameBestStreak = gameStreak;
      document.getElementById('game-best').textContent = gameBestStreak;
      document.getElementById('stat-best').textContent = gameBestStreak;
    }
    gameHistory[0] = '✓ ' + (gameHistory[0]||'');
    maybeRampDifficulty();
    if (typeof pulseSuccess === 'function') pulseSuccess(document.querySelector('.game-arena'));
    if (typeof playSuccessChime === 'function') playSuccessChime();
  } else {
    gameStreak = 0;
    gameMissed++;
    const cn = gameCurrentChord;
    gameMissedCounts[cn] = (gameMissedCounts[cn]||0)+1;
    // Find hardest
    const hardest = Object.entries(gameMissedCounts).sort((a,b)=>b[1]-a[1])[0];
    if (hardest) document.getElementById('stat-hardest').textContent = `${hardest[0]} (${hardest[1]}×)`;
    gameHistory[0] = '✗ ' + (gameHistory[0]||'');
  }
  document.getElementById('game-streak').textContent = gameStreak;
  if (success && typeof bounceStreak === 'function') bounceStreak(document.getElementById('game-streak'));
  document.getElementById('stat-got').textContent = gameGot;
  document.getElementById('stat-missed').textContent = gameMissed;
  const total = gameGot + gameMissed;
  const gAccEl = document.getElementById('game-accuracy');
  gAccEl.textContent = total>0 ? Math.round(gameGot/total*100)+'%' : '—';
  gAccEl.classList.toggle('is-empty', !(total>0));
  ges('btn-got').style.display='none';
  ges('btn-missed').style.display='none';
  updateHistoryLog();
  gamePendingGrade = false;
}

function skipChord() {
  if (!gameRunning) return;
  gameChordIndex = (gameChordIndex+1) % gameDeck.length;
  renderGameChords();
  strumGameChord(gameDeck[gameChordIndex]);
}

function updateHistoryLog() {
  const _hl = document.getElementById('history-log'); if (_hl) _hl.innerHTML = gameHistory.slice(0,20).join('<br>') || 'No history yet';
}

// ── Toggle game ────────────────────────────────────────────────────────────
function toggleGame() {
  const btn = document.getElementById('game-start-btn');
  if (gameRunning) {
    stopGame();
    btn.textContent='▶ START'; btn.classList.remove('running');
    ges('game-skip-btn').style.display='none';
    ges('btn-got').style.display='none';
    ges('btn-missed').style.display='none';
    document.getElementById('game-message').textContent='Stopped. Press START to play again.';
    document.getElementById('game-message').className='game-message';
  } else {
    startGame();
    btn.textContent='■ STOP'; btn.classList.add('running');
    ges('game-skip-btn').style.display='inline-block';
    document.getElementById('game-message').textContent='';
  }
}

// ── Difficulty ramp — every 5 correct switches in a row, nudge the BPM up ──
const GAME_BPM_RAMP_STEP = 5;
let gameMilestoneShown = false;

function maybeRampDifficulty() {
  if (gameStreak === 0 || gameStreak % 5 !== 0) return;
  const slider = document.getElementById('game-bpm');
  if (!slider) return;
  const max = parseInt(slider.max, 10);
  const newBpm = Math.min(max, parseInt(slider.value, 10) + GAME_BPM_RAMP_STEP);
  slider.value = newBpm;
  document.getElementById('game-bpm-val').textContent = newBpm + ' BPM';
  updateBpmMilestoneUI();
  if (gamePresetTargetBpm && newBpm >= gamePresetTargetBpm && !gameMilestoneShown) {
    gameMilestoneShown = true;
    showGameMilestone(`🎉 ${gameStreak} in a row — you've hit ${gamePresetTargetBpm} BPM, this preset's target tempo!`);
  }
}

// Progress bar showing current BPM against the active preset's target tempo
// (or the slider's own range, if no preset/target is selected).
function updateBpmMilestoneUI() {
  const slider = document.getElementById('game-bpm');
  const fill = document.getElementById('game-bpm-progress-fill');
  const label = document.getElementById('game-bpm-progress-label');
  if (!slider || !fill) return;
  const cur = parseInt(slider.value, 10);
  const min = parseInt(slider.min, 10), max = parseInt(slider.max, 10);
  const target = gamePresetTargetBpm;
  const denom = target ? Math.max(1, target - min) : Math.max(1, max - min);
  const pct = Math.max(0, Math.min(1, (cur - min) / denom));
  fill.style.width = `${Math.round(pct * 100)}%`;
  fill.classList.toggle('reached', !!(target && cur >= target));
  if (label) label.textContent = target ? `${cur} / ${target} BPM (preset target)` : `${cur} BPM`;
}

function showGameMilestone(msg) {
  const el = document.getElementById('game-message');
  if (el) { el.textContent = msg; el.className = 'game-message milestone'; }
}

function startGame() {
  getAudioCtx();
  rebuildGameDeck();
  if (typeof recordGameSession === 'function') recordGameSession();
  gameRunning=true;
  gameBeat=0;
  gameChordIndex=0;
  gameTotalSwitched=0;
  gameStreak=0; gameBestStreak=0;
  gameGot=0; gameMissed=0;
  gameHistory=[];
  gameMilestoneShown=false;
  updateBpmMilestoneUI();
  gameSessionStart=Date.now();
  if(gameSessionTimer) clearInterval(gameSessionTimer);
  gameSessionTimer=setInterval(()=>{
    const s=Math.floor((Date.now()-gameSessionStart)/1000);
    document.getElementById('stat-time').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  },1000);

  renderGameChords();
  strumGameChord(gameDeck[0]);
  buildGameBeatDots();

  const ctx=getAudioCtx();
  gameNextTime=ctx.currentTime+0.05;
  scheduleGameBeat();
  gameScheduler=setInterval(scheduleGameBeat, GAME_INTERVAL);
}

function stopGame() {
  gameRunning=false;
  clearInterval(gameScheduler);
  clearInterval(gameSessionTimer);
  updateRing(1);
  document.getElementById('ring-text').textContent='—';
  document.getElementById('beat-bar-label').textContent='Press START to begin';
  document.querySelectorAll('.game-beat-dot').forEach(d=>{
    d.classList.remove('lit','warn');
  });
}

// ── Init game ──────────────────────────────────────────────────────────────
// Sync beats-per-chord slider label
document.getElementById('game-beats').addEventListener('input', () => {
  if (gameRunning) { buildGameBeatDots(); }
});
document.getElementById('game-bpm').addEventListener('input', () => {
  document.getElementById('game-bpm-val').textContent = document.getElementById('game-bpm').value + ' BPM';
  updateBpmMilestoneUI();
});

rebuildGameDeck();
renderGameChords();
buildGameBeatDots();
updateBpmMilestoneUI();

// ═══════════════════════════════════════════════════════════════════════════
// GUITAR NECK DISPLAY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

let fretMode = 'static';
let fretProgressionPos = 0; // current fret position for progress mode
let cagedWalkIndex = 0;     // which CAGED shape we're walking through

const CAGED_WALK_ORDER = ['E','A','C','G','D']; // low to high on neck

// Fret positions for each CAGED shape of a given key (approx start fret)
function getCagedStartFrets(key) {
  const rootMidi = CHROMATIC.indexOf(norm(key));
  const result = {};
  ['E','A','C','G','D'].forEach(sh => {
    const openMidi = {E:40,A:45,C:48,G:43,D:50}[sh];
    let diff = rootMidi - (openMidi % 12);
    if (diff < 0) diff += 12;
    result[sh] = diff;
  });
  return result;
}

function setFretMode(mode, btn) {
  fretMode = mode;
  document.querySelectorAll('.fret-mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  fretProgressionPos = 0;
  cagedWalkIndex = 0;
  drawGuitarNeck();
}

// ── Draw the full guitar silhouette + neck ────────────────────────────────
function drawGuitarNeck(canvasId, chordNameOverride, modeOverride) {
  const canvas = document.getElementById(canvasId || 'guitar-full-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // ── Guitar body silhouette ── Strat/Pacifica-style double cutaway, not a soundhole acoustic blob
  const neckW = 36, neckX = W/2 - neckW/2;
  const headX = W/2 - 20, headW = 40;
  const neckTop = 60, neckBottom = 380;
  const bodyY = 340;
  const bridgeY = neckBottom + 22;
  const bx = W/2;

  const bodyTop = bodyY;
  const bodyBottom = H - 20;
  const waistY = bodyTop + (bodyBottom - bodyTop) * 0.28;
  const lowerY = bodyTop + (bodyBottom - bodyTop) * 0.62;
  const upperBoutHalfW = 46;
  const waistHalfW = 40;
  const lowerBoutHalfW = 62;
  const hornTipHalfW = 56;
  const hornLeftLen = 24;  // upper (bass-side) horn — shorter, like a real offset double-cutaway
  const hornRightLen = 38; // lower (treble-side) horn — longer, gives upper-fret access

  ctx.fillStyle = '#1a1200';
  ctx.strokeStyle = '#4a3a10';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx - neckW/2, bodyTop);
  ctx.bezierCurveTo(bx - neckW/2 - 6, bodyTop - hornLeftLen*0.5, bx - hornTipHalfW*0.6, bodyTop - hornLeftLen, bx - hornTipHalfW, bodyTop - hornLeftLen*0.6);
  ctx.bezierCurveTo(bx - upperBoutHalfW, bodyTop, bx - waistHalfW, waistY - 10, bx - waistHalfW, waistY);
  ctx.bezierCurveTo(bx - waistHalfW - 4, waistY + 20, bx - lowerBoutHalfW, lowerY - 10, bx - lowerBoutHalfW, lowerY);
  ctx.bezierCurveTo(bx - lowerBoutHalfW, bodyBottom - 10, bx - lowerBoutHalfW*0.5, bodyBottom, bx, bodyBottom);
  ctx.bezierCurveTo(bx + lowerBoutHalfW*0.5, bodyBottom, bx + lowerBoutHalfW, bodyBottom - 10, bx + lowerBoutHalfW, lowerY);
  ctx.bezierCurveTo(bx + lowerBoutHalfW, waistY + 20, bx + waistHalfW + 4, waistY - 10, bx + waistHalfW, waistY);
  ctx.bezierCurveTo(bx + waistHalfW, bodyTop - 5, bx + upperBoutHalfW, bodyTop - hornRightLen*0.7, bx + hornTipHalfW, bodyTop - hornRightLen);
  ctx.bezierCurveTo(bx + hornTipHalfW*0.5, bodyTop - hornRightLen*0.5, bx + neckW/2 + 10, bodyTop - hornRightLen*0.3, bx + neckW/2, bodyTop);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Pickups (3 single-coils, HSS/SSS-ish layout) between the bridge and neck join
  ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = '#333';
  [0.18, 0.36, 0.52].forEach(t => {
    const py = bodyTop + (bodyBottom - bodyTop) * t;
    ctx.beginPath();
    ctx.roundRect(bx - 16, py, 32, 9, 3);
    ctx.fill(); ctx.stroke();
  });

  // Control knobs
  ctx.fillStyle = '#ddd'; ctx.strokeStyle = '#888';
  [[bx - 22, bodyTop + (bodyBottom-bodyTop)*0.72], [bx + 22, bodyTop + (bodyBottom-bodyTop)*0.72], [bx, bodyTop + (bodyBottom-bodyTop)*0.82]].forEach(([kx,ky]) => {
    ctx.beginPath(); ctx.arc(kx, ky, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  });

  // Bridge with individual saddles
  ctx.fillStyle='#3a2a08'; ctx.strokeStyle='#6a5020'; ctx.lineWidth=1;
  ctx.fillRect(bx-25, bridgeY, 50, 6); ctx.strokeRect(bx-25, bridgeY, 50, 6);
  ctx.fillStyle = '#999';
  for (let i=0;i<6;i++) { ctx.fillRect(bx-22+i*8, bridgeY+1.5, 4, 3); }

  // Neck background
  ctx.fillStyle='#2a1a06';
  ctx.strokeStyle='#5a3a10';
  ctx.lineWidth=1;
  const neckTopW = neckW * 0.85;
  ctx.beginPath();
  ctx.moveTo(bx - neckTopW/2, neckTop);
  ctx.lineTo(bx + neckTopW/2, neckTop);
  ctx.lineTo(bx + neckW/2, neckBottom);
  ctx.lineTo(bx - neckW/2, neckBottom);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Headstock
  ctx.fillStyle='#2a1a06'; ctx.strokeStyle='#5a3a10'; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(bx-neckTopW/2, neckTop);
  ctx.lineTo(bx+neckTopW/2, neckTop);
  ctx.lineTo(bx+18, neckTop-36);
  ctx.bezierCurveTo(bx+22, neckTop-44, bx+14, neckTop-50, bx, neckTop-46);
  ctx.bezierCurveTo(bx-14, neckTop-50, bx-22, neckTop-44, bx-18, neckTop-36);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Tuning pegs
  ctx.fillStyle='#888';
  const pegOffsets = [-14,-8,-2,2,8,14];
  pegOffsets.forEach((ox,i) => {
    const side = i<3 ? -1 : 1;
    const row = i<3 ? i : i-3;
    const px = bx + side*16;
    const py = neckTop - 20 - row*10;
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill();
  });

  // Nut
  ctx.fillStyle='#999';
  ctx.fillRect(bx-neckTopW/2-1, neckTop-2, neckTopW+2, 4);

  // ── Frets ──
  // Physically-accurate spacing: fret n sits at 1 - 1/2^(n/12) of the scale length
  // (frets compress logarithmically toward the body), normalized so fret NUM_FRETS
  // still lands exactly at neckBottom.
  const NUM_FRETS = 15;
  const fretPositions = []; // y positions of frets
  const maxFretRatio = 1 - 1 / Math.pow(2, NUM_FRETS / 12);
  for (let f=0; f<=NUM_FRETS; f++) {
    const ratio = (1 - 1 / Math.pow(2, f / 12)) / maxFretRatio;
    const y = neckTop + ratio * (neckBottom - neckTop);
    fretPositions.push(y);
    if (f > 0) {
      const wAtY = neckW * (1 - ratio*0.15) + neckTopW * ratio * 0.15;
      const lx = bx - wAtY/2 - 1;
      const rx = bx + wAtY/2 + 1;
      ctx.strokeStyle = f===0 ? '#bbb' : '#6a5a2a';
      ctx.lineWidth = f===0 ? 2 : 0.8;
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(rx, y); ctx.stroke();
    }
  }

  // Fret inlays (dots at 3,5,7,9,12)
  [3,5,7,9,12].forEach(fret => {
    if (fret >= NUM_FRETS) return;
    const y1 = fretPositions[fret-1], y2 = fretPositions[fret];
    const midY = (y1+y2)/2;
    if (fret===12) {
      // Double dot
      ctx.fillStyle='#3a3020';
      ctx.beginPath(); ctx.arc(bx-5, midY, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx+5, midY, 2.5, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.fillStyle='#3a3020';
      ctx.beginPath(); ctx.arc(bx, midY, 2.5, 0, Math.PI*2); ctx.fill();
    }
  });

  // ── 6 strings ──
  const NUM_STRINGS = 6;
  const stringXPositions = [];
  for (let s=0; s<NUM_STRINGS; s++) {
    const neckWAtBottom = neckW;
    const neckWAtTop = neckTopW;
    // Interpolate string x across neck width
    const spacing = (s / (NUM_STRINGS-1));
    // At top
    const xTop = (bx - neckTopW/2 + 3) + spacing * (neckTopW - 6);
    // At bottom
    const xBot = (bx - neckW/2 + 3) + spacing * (neckW - 6);
    stringXPositions.push({top: xTop, bot: xBot, xBot});
    ctx.strokeStyle='#8a7a3a';
    ctx.lineWidth = 0.5 + (NUM_STRINGS-1-s)*0.25;
    ctx.globalAlpha=0.7;
    ctx.beginPath();
    ctx.moveTo(xTop, neckTop);
    ctx.lineTo(xBot, bridgeY);
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  // ── Highlight current chord ──
  const chordName = chordNameOverride || gameCurrentChord || (gameDeck.length ? gameDeck[gameChordIndex%gameDeck.length] : null);
  if (!chordName || !GAME_CHORDS[chordName]) {
    ges('fret-pos-label').textContent = 'No chord selected';
    return;
  }

  const chord = GAME_CHORDS[chordName];
  let chordFrets = [...chord.f]; // copy

  // Apply fretboard mode
  const mode = modeOverride || fretMode;
  let posOffset = 0;
  let posLabel = '';

  if (mode === 'progress') {
    posOffset = fretProgressionPos;
    posLabel = `Position: fret ${posOffset}`;
    // Shift all non-muted frets up by posOffset
    chordFrets = chord.f.map(f => f < 0 ? -1 : f === 0 ? posOffset : f + posOffset - (chord.barre||0));
  } else if (mode === 'caged_walk') {
    const key = chordName.replace(/m$|7$|maj7$|m7$/,'');
    const startFrets = getCagedStartFrets(key);
    const shapes = CAGED_WALK_ORDER;
    const sh = shapes[cagedWalkIndex % shapes.length];
    posOffset = startFrets[sh] || 0;
    posLabel = `${sh} shape · fret ${posOffset}`;
    chordFrets = chord.f.map(f => f < 0 ? -1 : f === 0 ? posOffset : f + posOffset);
  } else if (mode === 'all_pos') {
    posLabel = 'All positions shown';
  } else {
    posLabel = `Open / fret ${Math.max(0,...chord.f.filter(f=>f>=0))} pos`;
  }

  ges('fret-pos-label').textContent = posLabel;

  // Draw chord dots on neck
  const rootNote = chordName.replace(/m$|7$|maj7$|m7$|dim$|aug$/,'');
  const rootMidi = CHROMATIC.indexOf(norm(rootNote));
  // GAME_CHORDS entries have no .type field — quality is only encoded in the name
  // suffix (bare/m/7). Derive it from the name itself rather than a field that's
  // always undefined (which silently made every chord color as if it were major).
  const chordIntervals = /7$/.test(chordName) ? CHORD_INTERVALS_MAP['7']
                        : /m$/.test(chordName) ? CHORD_INTERVALS_MAP['min']
                        : CHORD_INTERVALS_MAP['maj'];

  const dotColors = { root:'#fff', third:'#5c8fff', fifth:'#4caf50', seventh:'#fb8c00', other:'#aaa' };

  function getIntervalColor(noteName) {
    const nMidi = CHROMATIC.indexOf(norm(noteName));
    const diff = (nMidi - rootMidi + 12) % 12;
    if (diff===0) return dotColors.root;
    if (diff===chordIntervals[1]) return dotColors.third;
    if (diff===chordIntervals[2]) return dotColors.fifth;
    if (chordIntervals[3] && diff===chordIntervals[3]) return dotColors.seventh;
    return dotColors.other;
  }

  // Barre bar
  if (chord.barre && chord.barre > 0) {
    const bf = mode==='static' ? chord.barre : posOffset + (chord.barre||0);
    if (bf >= 1 && bf <= NUM_FRETS) {
      const y1 = fretPositions[bf-1], y2 = fretPositions[bf];
      const midY = (y1+y2)/2;
      const ratio = (bf-1)/NUM_FRETS;
      const wAtY = neckTopW + (neckW-neckTopW)*ratio;
      const lx = bx - wAtY/2 + 3, rx = bx + wAtY/2 - 3;
      ctx.fillStyle='rgba(229,57,53,0.35)';
      ctx.strokeStyle='rgba(229,57,53,0.8)';
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.roundRect(lx, midY-5, rx-lx, 10, 5);
      ctx.fill(); ctx.stroke();
    }
  }

  // All-positions mode: show all places this chord root appears
  if (mode === 'all_pos') {
    // Show dots at every position this chord can be played
    [0,2,5,7,9,12].forEach(baseFret => {
      chord.f.forEach((f,si) => {
        if (f<0) return;
        const actualFret = f===0 ? 0 : f + baseFret;
        if (actualFret > NUM_FRETS || actualFret < 0) return;
        const strX = stringXPositions[si];
        const ratio = baseFret/NUM_FRETS;
        const sx = strX.top + (strX.bot-strX.top)*ratio;
        const fy = actualFret===0 ? neckTop-5 : (fretPositions[actualFret-1]+fretPositions[actualFret])/2;
        const noteName = noteAt(STRINGS[si], actualFret);
        const col = getIntervalColor(noteName);
        ctx.beginPath(); ctx.arc(sx, fy, 4.5, 0, Math.PI*2);
        ctx.fillStyle=col+'99'; ctx.fill();
      });
    });
  }

  // Draw main chord dots
  chordFrets.forEach((f, si) => {
    if (f < 0) {
      // Muted — draw X on headstock area
      const strX = stringXPositions[si];
      ctx.fillStyle='#444'; ctx.font='bold 8px Arial'; ctx.textAlign='center';
      ctx.fillText('×', strX.top, neckTop - 8);
      return;
    }
    const actualFret = f;
    if (actualFret > NUM_FRETS) return;

    const ratio = si / (NUM_STRINGS-1);
    const strX = stringXPositions[si];
    // Interpolate x position along string
    const fRatio = actualFret===0 ? 0 : (actualFret-0.5)/NUM_FRETS;
    const sx = strX.top + (strX.bot-strX.top)*fRatio;
    const fy = actualFret===0 ? neckTop - 6 : (fretPositions[actualFret-1]+fretPositions[Math.min(actualFret,NUM_FRETS)])/2;

    const noteName = noteAt(STRINGS[si], actualFret);
    const col = getIntervalColor(noteName);
    const isRoot = norm(noteName)===norm(rootNote);
    const finger = chord.fingers ? chord.fingers[si] : 0;

    // Glow
    if (isRoot) {
      ctx.beginPath(); ctx.arc(sx, fy, 9, 0, Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fill();
    }

    // Dot
    ctx.beginPath(); ctx.arc(sx, fy, isRoot?7:6, 0, Math.PI*2);
    ctx.fillStyle=col; ctx.fill();
    ctx.strokeStyle='#000'; ctx.lineWidth=0.8; ctx.stroke();

    // Finger number inside
    if (finger>0) {
      ctx.fillStyle='#000'; ctx.font=`bold 7px Arial`; ctx.textAlign='center';
      ctx.fillText(finger, sx, fy+2.5);
    } else {
      // Note name
      ctx.fillStyle=isRoot?'#000':'#000'; ctx.font='bold 6px Arial'; ctx.textAlign='center';
      ctx.fillText(noteName, sx, fy+2);
    }
  });
}

// ── Neck update hooks (called directly, no override needed) ────────────────
// advanceGameChord and renderGameChords already exist above as const expressions
// Just add neck draw via a post-call wrapper invoked from scheduleGameBeat

const _gfm = document.getElementById('game-fret-mode'); if (_gfm) _gfm.addEventListener('change', e => {
  fretMode = e.target.value;
  fretProgressionPos = 0;
  cagedWalkIndex = 0;
  drawGuitarNeck();
});

// Initial draw
setTimeout(drawGuitarNeck, 100);
