// ═══════════════════════════════════════════════════════════════════════════
// CAGED SYSTEM + CHORD MEMORIZATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

// ── Chord type definitions (intervals from root) ──────────────────────────
const CHORD_TYPES = [
  { id:'maj',   label:'Major',      formula:'1 3 5',       intervals:[0,4,7] },
  { id:'min',   label:'Minor',      formula:'1 b3 5',      intervals:[0,3,7] },
  { id:'7',     label:'Dom 7',      formula:'1 3 5 b7',    intervals:[0,4,7,10] },
  { id:'maj7',  label:'Maj 7',      formula:'1 3 5 7',     intervals:[0,4,7,11] },
  { id:'min7',  label:'Min 7',      formula:'1 b3 5 b7',   intervals:[0,3,7,10] },
  { id:'sus2',  label:'Sus2',       formula:'1 2 5',       intervals:[0,2,7] },
  { id:'sus4',  label:'Sus4',       formula:'1 4 5',       intervals:[0,5,7] },
  { id:'dim',   label:'Dim',        formula:'1 b3 b5',     intervals:[0,3,6] },
  { id:'aug',   label:'Aug',        formula:'1 3 #5',      intervals:[0,4,8] },
  { id:'add9',  label:'Add9',       formula:'1 2 3 5',     intervals:[0,2,4,7] },
  { id:'min9',  label:'Min9',       formula:'1 b3 5 b7 9', intervals:[0,3,7,10,14] },
  { id:'power', label:'Power',      formula:'1 5',         intervals:[0,7] },
];

// ── CAGED shape data ───────────────────────────────────────────────────────
// For each shape: the open chord template (relative fret positions per string)
// and the root string. When transposed to key K, barre fret = K's offset from open shape's root.
// Format: strings array index 0=low E, 5=high e
// value: relative fret from barre (or -1 = muted, 0 = open/barre)
// rootStr: which string has the root note
const CAGED_SHAPES = {
  C: {
    // Open C: x32010
    template: [-1, 3, 2, 0, 1, 0],
    rootStr: 1, // A string (open A is not root, but C shape root is on A string at fret 3)
    openKey: 'C',
    openRootFret: 3, // fret on A string for open C
    tip: 'Root is on the A string. Index finger covers the barre, ring and pinky cover upper strings.',
    cagedPos: 0
  },
  A: {
    // Open A: x02220
    template: [-1, 0, 2, 2, 2, 0],
    rootStr: 1,
    openKey: 'A',
    openRootFret: 0,
    tip: 'Root is on the A string (open or barre). Three fingers bunch up on strings 2-4.',
    cagedPos: 1
  },
  G: {
    // Open G: 320003
    template: [3, 2, 0, 0, 0, 3],
    rootStr: 0,
    openKey: 'G',
    openRootFret: 3,
    tip: 'Root is on the low E string. The widest stretch — pinky and ring finger reach to top strings.',
    cagedPos: 2
  },
  E: {
    // Open E: 022100
    template: [0, 2, 2, 1, 0, 0],
    rootStr: 0,
    openKey: 'E',
    openRootFret: 0,
    tip: 'Root is on the low E string. Most common barre chord shape. Index covers barre, ring/pinky stack.',
    cagedPos: 3
  },
  D: {
    // Open D: xx0232
    template: [-1, -1, 0, 2, 3, 2],
    rootStr: 3,
    openKey: 'D',
    openRootFret: 0,
    tip: 'Root is on the D string. Finger tips must arch to avoid muting high e. Often used higher up the neck.',
    cagedPos: 4
  },
};

// CAGED open key root frets on root strings (for transposition calculation)
const OPEN_ROOT_MIDI = { C:48, A:45, G:43, E:40, D:50 }; // MIDI of root in open position

// Color per shape
const SHAPE_COLORS = { C:'#e53935', A:'#fb8c00', G:'#c8b800', E:'#43a047', D:'#1e88e5' };

// ── State ─────────────────────────────────────────────────────────────────
let cagedState = {
  shape: 'C',
  key: 'C',
  type: 'maj',
};

// Build key buttons for CAGED
const cagedKeys = ['C','G','D','A','E','B','F#','Bb','Eb','Ab','Db','F'];
const cagedKeyBtns = document.getElementById('caged-key-btns');
cagedKeys.forEach((k,i) => {
  const b = document.createElement('button');
  b.textContent = k; b.dataset.group = 'caged-key';
  if (i===0) b.classList.add('active');
  b.onclick = () => {
    document.querySelectorAll('[data-group="caged-key"]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    cagedState.key = k;
    renderCaged();
    buildQuizDeck();
  };
  cagedKeyBtns.appendChild(b);
});

// Build chord type buttons
const typeRow = document.getElementById('chord-type-btns');
CHORD_TYPES.forEach((t,i) => {
  const b = document.createElement('button');
  b.className = 'chord-type-btn' + (i===0?' active':'');
  b.textContent = t.label; b.dataset.tid = t.id;
  b.onclick = () => {
    document.querySelectorAll('.chord-type-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    cagedState.type = t.id;
    renderCaged();
  };
  typeRow.appendChild(b);
});

function selectCagedShape(shape, btn) {
  document.querySelectorAll('.caged-shape-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  cagedState.shape = shape;
  renderCaged();
}

// ── Transposition helper ───────────────────────────────────────────────────
// Given shape S and target key K, compute the barre fret offset
function getBarreFret(shape, targetKey) {
  const targetMidi = CHROMATIC.indexOf(norm(targetKey));
  const openMidi = CHROMATIC.indexOf(norm(CAGED_SHAPES[shape].openKey));
  let diff = targetMidi - openMidi;
  if (diff < 0) diff += 12;
  return diff;
}

// Get actual fret numbers for a shape in a given key
function getShapeFrets(shape, key) {
  const barre = getBarreFret(shape, key);
  const template = CAGED_SHAPES[shape].template;
  return template.map(f => f < 0 ? -1 : f + barre);
}

// Get chord note names for display
function getChordNotes(key, type) {
  const ct = CHORD_TYPES.find(t=>t.id===type);
  if (!ct) return [];
  const root = CHROMATIC.indexOf(norm(key));
  return ct.intervals.map(i => CHROMATIC[(root+i)%12]);
}

// ── Draw chord diagram ─────────────────────────────────────────────────────
function drawChordDiagram(canvas, shape, key, type) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const barre = getBarreFret(shape, key);
  const frets = getShapeFrets(shape, key);
  const shapeData = CAGED_SHAPES[shape];
  const ct = CHORD_TYPES.find(t=>t.id===type);
  const color = SHAPE_COLORS[shape];

  // Layout
  const padL=28, padR=12, padT=30, padB=16;
  const numStrings=6, numFrets=5;
  const strW = (W-padL-padR)/(numStrings-1);
  const fretH = (H-padT-padB)/numFrets;

  // Determine starting fret to display
  const activeFrets = frets.filter(f=>f>=0);
  const minFret = Math.max(0, Math.min(...activeFrets));
  const startFret = minFret <= 1 ? 0 : minFret - 1;

  // Fret numbers on left
  ctx.fillStyle = '#555';
  ctx.font = '9px Arial';
  ctx.textAlign = 'right';
  for (let f=0;f<numFrets;f++) {
    const fn = startFret + f + 1;
    ctx.fillText(fn, padL-5, padT+f*fretH+fretH/2+4);
  }

  // Draw nut if starting at fret 0
  if (startFret === 0) {
    ctx.fillStyle = '#ccc';
    ctx.fillRect(padL, padT-4, (numStrings-1)*strW, 4);
  }

  // Fret lines
  for (let f=0;f<=numFrets;f++) {
    ctx.strokeStyle = f===0 && startFret===0 ? '#ccc' : '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT+f*fretH);
    ctx.lineTo(padL+(numStrings-1)*strW, padT+f*fretH);
    ctx.stroke();
  }

  // String lines
  for (let s=0;s<numStrings;s++) {
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1 + (5-s)*0.3;
    ctx.beginPath();
    ctx.moveTo(padL+s*strW, padT);
    ctx.lineTo(padL+s*strW, padT+numFrets*fretH);
    ctx.stroke();
  }

  // Barre bar if barre > 0
  if (barre > 0) {
    const bf = barre - startFret - 1;
    if (bf >= 0 && bf < numFrets) {
      ctx.fillStyle = color + 'aa';
      ctx.beginPath();
      ctx.roundRect(padL-4, padT+bf*fretH+4, (numStrings-1)*strW+8, fretH-8, 8);
      ctx.fill();
    }
  }

  // Dots
  const rootNote = norm(key);
  const chordNotes = getChordNotes(key, type);

  frets.forEach((f, si) => {
    const x = padL + si * strW;
    if (f < 0) {
      // Muted string
      ctx.fillStyle = '#555';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('×', x, padT-8);
      return;
    }
    if (f === 0 && startFret === 0) {
      // Open string circle
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, padT-8, 5, 0, Math.PI*2);
      ctx.stroke();
      return;
    }
    // Fretted note
    const fr = f - startFret - 1;
    if (fr < 0 || fr >= numFrets) return;
    const y = padT + fr*fretH + fretH/2;
    const noteName = noteAt(STRINGS[si], f);
    const isRoot = norm(noteName) === norm(key);

    ctx.beginPath();
    ctx.arc(x, y, fretH*0.38, 0, Math.PI*2);
    ctx.fillStyle = isRoot ? '#fff' : color;
    ctx.fill();

    // Note name inside dot
    ctx.fillStyle = isRoot ? '#000' : '#000';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(noteName, x, y+3);
  });

  // Interval labels under chord (below last fret)
  chordNotes.forEach((n,i) => {
    // find which strings play this note
    frets.forEach((f,si) => {
      if (f >= 0 && norm(noteAt(STRINGS[si],f)) === norm(n)) {
        const x = padL+si*strW;
        ctx.fillStyle = i===0?'#fff':'#666';
        ctx.font = '8px Arial';
        ctx.textAlign='center';
        ctx.fillText(ct.formula.split(' ')[Math.min(i,ct.formula.split(' ').length-1)], x, padT+numFrets*fretH+12);
      }
    });
  });
}

// ── Draw full neck with all 5 CAGED shapes ─────────────────────────────────
function drawCagedNeck(canvas, key, activeShape) {
  const ctx = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);

  const NUM_FRETS=17, NUM_STRINGS=6;
  const padL=30, padT=20, padR=10, padB=30;
  const fretW=(W-padL-padR)/NUM_FRETS;
  const strH=(H-padT-padB)/(NUM_STRINGS-1);

  // Neck background
  ctx.fillStyle='#2a1a08';
  ctx.fillRect(padL,padT,(W-padL-padR),(H-padT-padB));

  // Nut
  ctx.fillStyle='#aaa';
  ctx.fillRect(padL-3,padT,4,H-padT-padB);

  // Fret wires
  for(let f=0;f<=NUM_FRETS;f++){
    ctx.strokeStyle='#5a4a2a';
    ctx.lineWidth=f===0?3:1;
    ctx.beginPath();
    ctx.moveTo(padL+f*fretW,padT);
    ctx.lineTo(padL+f*fretW,H-padB);
    ctx.stroke();
  }

  // Strings
  for(let s=0;s<NUM_STRINGS;s++){
    ctx.strokeStyle='#c8b87a';
    ctx.lineWidth=0.5+(5-s)*0.3;
    ctx.globalAlpha=0.6;
    ctx.beginPath();
    ctx.moveTo(padL,padT+s*strH);
    ctx.lineTo(W-padR,padT+s*strH);
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  // Fret markers
  [3,5,7,9,12,15].forEach(f=>{
    ctx.fillStyle='#3a2a10';
    const x=padL+(f-0.5)*fretW, y=H-padB+10;
    ctx.font='8px Arial'; ctx.textAlign='center'; ctx.fillStyle='#555';
    ctx.fillText(f,x,y);
  });

  // String labels
  ['E','A','D','G','B','e'].forEach((s,i)=>{
    ctx.fillStyle='#555'; ctx.font='9px Arial'; ctx.textAlign='right';
    ctx.fillText(s,padL-6,padT+i*strH+4);
  });

  // Draw all 5 CAGED shapes
  const ORDER=['C','A','G','E','D'];
  ORDER.forEach(sh => {
    const barre=getBarreFret(sh,key);
    const frets=getShapeFrets(sh,key);
    const color=SHAPE_COLORS[sh];
    const isActive=sh===activeShape;

    frets.forEach((f,si)=>{
      if(f<0) return;
      const x=padL+(f===0?0:f-0.5)*fretW;
      const y=padT+si*strH;
      const noteName=noteAt(STRINGS[si],f);
      const isRoot=norm(noteName)===norm(key);

      ctx.beginPath();
      const r=isActive?6:4.5;
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fillStyle=isRoot?'#fff':(isActive?color:color+'88');
      ctx.fill();
      if(isActive){
        ctx.strokeStyle=color;
        ctx.lineWidth=1.5;
        ctx.stroke();
      }

      if(isActive){
        ctx.fillStyle=isRoot?'#000':'#000';
        ctx.font='bold 7px Arial';
        ctx.textAlign='center';
        ctx.fillText(noteName,x,y+2.5);
      }
    });

    // Shape label above
    if(barre>0 && barre<NUM_FRETS){
      const lx=padL+(barre-0.5)*fretW;
      ctx.fillStyle=isActive?color:color+'66';
      ctx.font=`${isActive?'bold ':''} 9px Arial`;
      ctx.textAlign='center';
      ctx.fillText(sh,lx,padT-6);
    } else if(barre===0){
      ctx.fillStyle=isActive?color:color+'66';
      ctx.font=`${isActive?'bold ':''} 9px Arial`;
      ctx.textAlign='center';
      ctx.fillText(sh,padL+8,padT-6);
    }
  });
}

// ── Render CAGED panel ─────────────────────────────────────────────────────
function renderCaged() {
  const { shape, key, type } = cagedState;
  const shapeData = CAGED_SHAPES[shape];
  const ct = CHORD_TYPES.find(t=>t.id===type);
  const barre = getBarreFret(shape, key);
  const color = SHAPE_COLORS[shape];
  const chordNotes = getChordNotes(key, type);

  // Chord name label
  const typeSuffix = type==='maj'?'':(type==='min'?'m':type==='7'?'7':type==='maj7'?'maj7':type==='min7'?'m7':type==='sus2'?'sus2':type==='sus4'?'sus4':type==='dim'?'°':type==='aug'?'+':type==='add9'?'add9':type==='min9'?'m9':type==='power'?'5':'');
  document.getElementById('caged-chord-name').textContent = key + typeSuffix;
  const stag = document.getElementById('caged-shape-tag');
  stag.textContent = shape + ' SHAPE';
  stag.style.color = color;

  // Draw chord diagram
  drawChordDiagram(document.getElementById('chord-canvas'), shape, key, type);

  // Info panel
  document.getElementById('ci-notes').textContent = chordNotes.join('  ');
  document.getElementById('ci-formula').textContent = ct.formula;
  document.getElementById('ci-rootstr').textContent = ['Low E','A','D','G','B','High e'][shapeData.rootStr] + ' string';
  document.getElementById('ci-barre').textContent = barre===0 ? 'Open (no barre)' : `Fret ${barre}`;
  document.getElementById('ci-tip').textContent = shapeData.tip;
  document.getElementById('ci-key-label').textContent = key;
  document.getElementById('caged-barre-note').textContent = barre > 0 ? `Barre at fret ${barre}` : 'Open position';

  // CAGED chain (shows order for this key)
  const chain = document.getElementById('caged-chain');
  const ORDER=['C','A','G','E','D'];
  chain.innerHTML = ORDER.map(s =>
    `<div class="caged-chain-item ${s===shape?'active-shape':''}" data-s="${s}" style="cursor:pointer" onclick="selectCagedShape('${s}',document.querySelector('[data-shape=\\'${s}\\']'))">${s}</div>`
  ).join('');

  // Draw neck
  drawCagedNeck(document.getElementById('caged-fb-canvas'), key, shape);
  document.getElementById('caged-neck-key').textContent = key;
}

// ── CAGED Explainer cards ─────────────────────────────────────────────────
const CAGED_EXPLAINER = [
  { shape:'C', color:'#e53935', text:'Root on A string. Open position starts at nut. Barre version slides up for other keys. Common in pop and folk.', frets:'e.g. key of D: barre fret 2' },
  { shape:'A', color:'#fb8c00', text:'Root on A string. Three fingers bunch together on strings 2-4. Very common barre chord. Used everywhere in rock.', frets:'e.g. key of B: barre fret 2' },
  { shape:'G', color:'#c8b800', text:'Root on low E string. Widest stretch. Often played with pinky and ring finger stretched to high strings. Knopfler uses this a lot.', frets:'e.g. key of A: barre fret 5' },
  { shape:'E', color:'#43a047', text:'Root on low E string. The most common barre chord shape in rock. Index covers all strings, ring/pinky stack on 4-5-6.', frets:'e.g. key of G: barre fret 3' },
  { shape:'D', color:'#1e88e5', text:'Root on D string. Used higher up the neck. Two fingers can sound muted — arch carefully. Often the hardest CAGED shape to barre cleanly.', frets:'e.g. key of E: barre fret 2' },
  { shape:'Why CAGED?', color:'#aaa', text:'These 5 open chord shapes tile the entire neck. Every major chord can be played in 5 different positions using one of these shapes. Learning all 5 gives you the whole neck.', frets:'C → A → G → E → D → C (repeats)' },
];

document.getElementById('caged-exp-grid').innerHTML = CAGED_EXPLAINER.map(c=>`
  <div class="caged-exp-card" style="border-left-color:${c.color}">
    <h4 style="color:${c.color}">${c.shape}</h4>
    <p>${c.text}</p>
    <div class="fret-pos">${c.frets}</div>
  </div>
`).join('');

// ── Flashcard quiz ─────────────────────────────────────────────────────────
let quizMode = 'name'; // name | notes | caged
let quizDeck = [];
let quizIdx = 0;
let quizCorrect = 0, quizTotal = 0;

function buildQuizDeck() {
  const key = cagedState.key;
  const deck = [];
  const ORDER=['C','A','G','E','D'];

  CHORD_TYPES.forEach(ct => {
    const notes = getChordNotes(key, ct.id);
    const suffix = ct.id==='maj'?'':(ct.id==='min'?'m':ct.id==='7'?'7':ct.id==='maj7'?'maj7':ct.id==='min7'?'m7':ct.id==='sus2'?'sus2':ct.id==='sus4'?'sus4':ct.id==='dim'?'°':ct.id==='aug'?'+':ct.id==='add9'?'add9':ct.id==='min9'?'m9':ct.id==='power'?'5':'');
    ORDER.forEach(sh => {
      const barre = getBarreFret(sh, key);
      deck.push({
        chord: key+suffix,
        chordType: ct.id,
        shape: sh,
        barre,
        notes,
        formula: ct.formula,
        label: ct.label,
        key,
        suffix
      });
    });
  });

  // Shuffle
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  quizDeck = deck;
  quizIdx = 0;
  renderCard();
}

function renderCard() {
  if (!quizDeck.length) return;
  const card = quizDeck[quizIdx % quizDeck.length];
  const fc = document.getElementById('flashcard');
  fc.classList.remove('revealed');

  const qEl = document.getElementById('fc-q');
  const subEl = document.getElementById('fc-sub');
  const ansEl = document.getElementById('fc-ans');

  if (quizMode === 'name') {
    qEl.textContent = card.chord;
    subEl.textContent = `${card.label} chord — ${card.key} key`;
    ansEl.textContent = `Notes: ${card.notes.join(' · ')}\nFormula: ${card.formula}\n${card.shape} shape · ${card.barre===0?'Open':'Barre fret '+card.barre}`;
  } else if (quizMode === 'notes') {
    qEl.style.fontSize = '14px';
    qEl.textContent = card.notes.join(' · ');
    subEl.textContent = 'What chord is this?';
    ansEl.textContent = `${card.chord}\n${card.label}\nFormula: ${card.formula}`;
  } else {
    qEl.style.fontSize = '18px';
    qEl.textContent = `${card.chord}\n${card.shape} shape`;
    subEl.textContent = 'What fret is the barre?';
    ansEl.textContent = `Barre fret: ${card.barre===0?'Open (0)':card.barre}\nRoot string: ${['Low E','A','D','G','B','High e'][CAGED_SHAPES[card.shape].rootStr]}`;
  }
  document.getElementById('quiz-result').textContent='';
  document.getElementById('quiz-score').textContent = `Score: ${quizCorrect} / ${quizTotal}`;
}

function revealCard() {
  document.getElementById('flashcard').classList.add('revealed');
  document.getElementById('fc-sub').textContent = 'Self grade →';
}

function nextCard() {
  quizIdx = (quizIdx+1) % quizDeck.length;
  renderCard();
}
function prevCard() {
  quizIdx = (quizIdx-1+quizDeck.length) % quizDeck.length;
  renderCard();
}
function shuffleCards() {
  for(let i=quizDeck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[quizDeck[i],quizDeck[j]]=[quizDeck[j],quizDeck[i]];}
  quizIdx=0; renderCard();
}
function gradeCard(correct) {
  quizTotal++;
  if(correct){quizCorrect++;document.getElementById('quiz-result').className='quiz-result correct';document.getElementById('quiz-result').textContent='✓ Nice.';}
  else{document.getElementById('quiz-result').className='quiz-result wrong';document.getElementById('quiz-result').textContent='✗ Keep drilling it.';}
  document.getElementById('quiz-score').textContent=`Score: ${quizCorrect} / ${quizTotal}`;
  if(!correct){
    // Move missed card to 3 positions ahead so it comes back soon
    const missed=quizDeck.splice(quizIdx%quizDeck.length,1)[0];
    const insertAt=Math.min((quizIdx%quizDeck.length)+3,quizDeck.length);
    quizDeck.splice(insertAt,0,missed);
  }
  setTimeout(nextCard, 600);
}
function setQuizMode(mode, btn) {
  quizMode=mode;
  document.querySelectorAll('.quiz-mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  quizIdx=0; renderCard();
}

// ── Init CAGED ─────────────────────────────────────────────────────────────
renderCaged();
buildQuizDeck();
