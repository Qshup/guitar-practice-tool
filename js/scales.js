// ── Constants ────────────────────────────────────────────────────────────────
const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CIRCLE_ORDER = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const CIRCLE_DISPLAY = ['C','G','D','A','E','B','F#\nGb','Db\nC#','Ab','Eb','Bb','F'];
const STRINGS = ['E','A','D','G','B','E'];
const STRING_LABELS = ['E','A','D','G','B','e'];
const FRETS = 16, FRET_W = 52;
const ENHARMONIC = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B','Fb':'E','E#':'F','B#':'C'};
function norm(n) { return ENHARMONIC[n]||n; }
function noteAt(o,f) { return CHROMATIC[(CHROMATIC.indexOf(norm(o))+f)%12]; }

// ── Scale Definitions ────────────────────────────────────────────────────────
const ALL_SCALES = [
  // Pentatonic
  { id:'minpent',  name:'Minor Pentatonic',  group:'Pentatonic', zappa:true,  intervals:[0,3,5,7,10],    note:'Zappa\'s most-used base scale', zappaNote:'His foundation — he built everything outward from this' },
  { id:'majpent',  name:'Major Pentatonic',  group:'Pentatonic', zappa:false, intervals:[0,2,4,7,9],     note:'' },
  { id:'blues',    name:'Blues Scale',       group:'Pentatonic', zappa:true,  intervals:[0,3,5,6,7,10],  note:'b5 = blue note', zappaNote:'Used constantly, especially over static one-chord vamps' },
  // Modal
  { id:'natmin',   name:'Natural Minor',     group:'Modal',      zappa:true,  intervals:[0,2,3,5,7,8,10],note:'Aeolian', zappaNote:'Standard minor foundation, often mixed with Dorian' },
  { id:'majscl',   name:'Major Scale',       group:'Modal',      zappa:false, intervals:[0,2,4,5,7,9,11],note:'Ionian' },
  { id:'mixo',     name:'Mixolydian',        group:'Modal',      zappa:true,  intervals:[0,2,4,5,7,9,10],note:'Major, b7', zappaNote:'One of his signature modes. "I use this a lot" — FZ. Hear it on Inca Roads, Yo Mama' },
  { id:'dorian',   name:'Dorian',            group:'Modal',      zappa:true,  intervals:[0,2,3,5,7,9,10],note:'Minor, raised 6th', zappaNote:'His go-to for vamp-based solos. Soulful and open-ended' },
  { id:'phrygian', name:'Phrygian',          group:'Modal',      zappa:true,  intervals:[0,1,3,5,7,8,10],note:'Minor, b2', zappaNote:'Exotic and tense. Zappa used this for dark atmospheric passages' },
  { id:'lydian',   name:'Lydian',            group:'Modal',      zappa:true,  intervals:[0,2,4,6,7,9,11],note:'Major, #4', zappaNote:'Critical Zappa mode. Bright and otherworldly. Hear it on Inca Roads, Watermelon in Easter Hay. His most theoretically important scale' },
  { id:'harmmin',  name:'Harmonic Minor',    group:'Modal',      zappa:true,  intervals:[0,2,3,5,7,8,11],note:'Natural minor, raised 7th', zappaNote:'Used for dramatic classical tension in composed passages' },
  { id:'lydmixo',  name:'Lydian Dominant',   group:'Modal',      zappa:true,  intervals:[0,2,4,6,7,9,10],note:'Lydian + b7 (Mixolydian)', zappaNote:'Lydian #4 + flat 7. His most advanced blend — bright but bluesy. Very common in late-period Zappa' },
  // Blues extended
  { id:'bluesext', name:'Minor Blues Ext',   group:'Blues',      zappa:true,  intervals:[0,2,3,5,6,7,10],note:'Blues + passing tones', zappaNote:'Full blues vocabulary with chromatic passing tones' },
  // Zappa specialty
  { id:'diminished',name:'Diminished (HW)', group:'Zappa',      zappa:true,  intervals:[0,1,3,4,6,7,9,10],note:'Half-whole diminished', zappaNote:'8-note symmetrical scale. Creates angular, atonal Zappa runs' },
  { id:'wholetone', name:'Whole Tone',       group:'Zappa',      zappa:true,  intervals:[0,2,4,6,8,10],   note:'All whole steps', zappaNote:'Every interval equal = dreamy, floating, unresolved. Zappa used this for surreal passages' },
  { id:'chromatic', name:'Chromatic',        group:'Zappa',      zappa:true,  intervals:[0,1,2,3,4,5,6,7,8,9,10,11], note:'All 12 notes', zappaNote:'Total chromaticism — Zappa would freely move through all 12 notes at speed' },
];

const KEYS = ['E','A','D','G','B','F#','C','Bb'];

// ── Zappa content ─────────────────────────────────────────────────────────────
const ZAPPA_CARDS = [
  {
    title:'Key Techniques',
    content:`<ul>
      <li><span class="highlight">Rhythmic displacement</span> — play 5 notes in space of 4, 7 in space of 8. Odd groupings over even time.</li>
      <li><span class="highlight">Whammy bar</span> — extreme dips, flutter, and pitch wobble mid-phrase (SG or Strat into Marshall)</li>
      <li><span class="highlight">Tremolo picking</span> — extremely fast single-note picking on one note, then release into a phrase</li>
      <li><span class="highlight">Legato hammer-ons</span> — long fluid runs with minimal picking, left hand does the work</li>
      <li><span class="highlight">Low string soloing</span> — deliberately solo on D/A/E strings where others avoid it, muddy on purpose</li>
      <li><span class="highlight">Dynamics as expression</span> — whisper quiet to full-blast within a single phrase</li>
      <li><span class="highlight">Pick angle variety</span> — punch the string, brush it, use pick edge. Mutant attack sounds.</li>
    </ul>`
  },
  {
    title:'Rhythmic Approach',
    content:`<ul>
      <li>Practice in <span class="highlight">7/8</span> and <span class="highlight">11/8</span> — count 1-2-3, 1-2-3, 1-2 for 7/8</li>
      <li>Triplets over straight 8ths — play 3 where 2 should go, constantly</li>
      <li><span class="highlight">Quintuplets</span> — 5 notes over 4 beats. This is his most identifiable rhythmic signature</li>
      <li>Never lock into the groove — float above it, land on unexpected beats</li>
      <li>Long sustained notes followed by sudden bursts of 16th notes</li>
      <li>Practice with a metronome then deliberately play AGAINST it</li>
    </ul>`
  },
  {
    title:'Scale Approach (Zappa\'s own words)',
    content:`<ul>
      <li>"Harmonically <span class="highlight">pentatonic or poly-scale oriented</span>" — he mixed scales freely</li>
      <li>"<span class="highlight">The Mixolydian mode</span>, which I use a lot" — his quote, Guitar Player 1995</li>
      <li><span class="highlight">Lydian</span> was his most theoretically important scale — bright, floating, unresolved</li>
      <li><span class="highlight">Dorian</span> for vamp-based solos over static bass notes</li>
      <li><span class="highlight">Phrygian</span> for dark, tense, exotic passages</li>
      <li>Often <span class="highlight">mixed modes mid-solo</span> — start Dorian, shift to Mixolydian, touch Lydian</li>
      <li>Chromatic passing tones between any scale degree at any time</li>
    </ul>`
  },
  {
    title:'3 Songs to Practice First',
    content:`<ul>
      <li><span class="highlight">Black Napkins</span> — slow, spacious, emotional. Best intro to his sustain and dynamics. E minor / Dorian.</li>
      <li><span class="highlight">Watermelon in Easter Hay</span> — his most emotional solo. Long phrases over Lydian. Learn this slowly and make every note cry.</li>
      <li><span class="highlight">Inca Roads</span> — quintessential Zappa vamp solo. Two-chord Mixolydian vamp. Study how he builds over a static harmony.</li>
    </ul>`
  },
  {
    title:'Gear & Tone',
    content:`<ul>
      <li>Your <span class="highlight">Pacifica</span> is close — Zappa used Strat-style guitars (SG, Roxy-era Strat)</li>
      <li>Bridge pickup, high gain Marshall-style crunch</li>
      <li><span class="highlight">Sustain</span> is everything — let notes feed back and ring</li>
      <li>Whammy bar if you have one — he used it as a melodic tool not just effect</li>
      <li>Mid-heavy tone — scoop the lows slightly, boost mids</li>
      <li>Volume swells — use your guitar's volume knob to swell into notes</li>
    </ul>`
  },
  {
    title:'Practice Philosophy',
    content:`<ul>
      <li>Zappa <span class="highlight">never practiced</span> — he only played during tours and sessions. Everything was real-time.</li>
      <li>The goal is <span class="highlight">instant composition</span> — every solo should sound like a piece being written live</li>
      <li>One tonal center. Let the <span class="highlight">rhythm section hold the chord</span> while you explore freely above it</li>
      <li>Think like a <span class="highlight">composer</span>, not a soloist — motifs, development, resolution</li>
      <li>Record yourself. Zappa obsessively documented everything. Listen back critically.</li>
      <li>Mix <span class="highlight">blues vocabulary with modal playing</span> — start bluesy then drift into Lydian or Phrygian</li>
    </ul>`
  },
];

// ── State ─────────────────────────────────────────────────────────────────────
let state = { scaleId:'minpent', key:'E', pos:0, group:'all', showFingers:false };
function currentScale() { return ALL_SCALES.find(s=>s.id===state.scaleId); }
function getScaleNotes(key,intervals) {
  const root=CHROMATIC.indexOf(norm(key));
  return intervals.map(i=>CHROMATIC[(root+i)%12]);
}
function allScaleFrets(key,intervals) {
  const notes=getScaleNotes(key,intervals), result=[];
  for(let s=0;s<6;s++) for(let f=0;f<FRETS;f++){
    const n=noteAt(STRINGS[s],f), order=notes.indexOf(n);
    if(order>=0) result.push({string:s,fret:f,note:n,order:order+1});
  }
  return result;
}
function getBoxNotes(key,intervals,posNum) {
  const notes=getScaleNotes(key,intervals);
  let rootFret=CHROMATIC.indexOf(norm(key));
  const posOffsets=[0,3,5,7,10];
  let sf=rootFret+posOffsets[posNum%posOffsets.length];
  if(sf>15) sf-=12;
  const result=[];
  for(let s=0;s<6;s++) for(let fOff=-1;fOff<=5;fOff++){
    const f=sf+fOff; if(f<0||f>=FRETS) continue;
    const n=noteAt(STRINGS[s],f), order=notes.indexOf(n);
    if(order>=0) result.push({string:s,fret:f,note:n,order:order+1});
  }
  return result;
}

// ── Finger assignment ─────────────────────────────────────────────────────────
// Assigns finger 1-4 to each fret in a position box based on fret spacing.
// The lowest fret in the box = index (1), each +1 fret up = next finger.
// For a standard 4-fret box this maps perfectly 1:1.
// For stretched boxes (5-fret spans) the index covers frets 1 and 2 on lowest strings,
// pinky covers the stretch — we use the same approach real players do.
function assignFingers(boxNotes) {
  if (!boxNotes.length) return {};
  const fretMap = {}; // fret -> finger number
  const allFrets = [...new Set(boxNotes.map(n => n.fret))].sort((a,b) => a-b);
  // Unique frets across all strings in box
  if (allFrets.length === 0) return {};
  const minFret = allFrets[0];
  const maxFret = allFrets[allFrets.length - 1];
  const span = maxFret - minFret;

  // Map each fret to a finger (1-4)
  // Standard rule: fret 0 (open) = no finger (0)
  // Within a box, compress to 4 fingers:
  // If span <= 3: direct 1:1 mapping (minFret=1, +1=2, +2=3, +3=4)
  // If span == 4: index covers 2 frets on some strings (normal in pentatonic)
  // We assign by position rank in the sorted unique fret list
  allFrets.forEach((f, idx) => {
    if (f === 0) { fretMap[f] = 0; return; } // open string, no finger
    if (span <= 3) {
      fretMap[f] = (f - minFret) + 1; // 1,2,3,4
    } else {
      // span of 4 or 5: compress to 4 fingers
      // Divide span into 4 equal zones
      const zone = (f - minFret) / span;
      if (zone < 0.25) fretMap[f] = 1;
      else if (zone < 0.5) fretMap[f] = 2;
      else if (zone < 0.75) fretMap[f] = 3;
      else fretMap[f] = 4;
    }
  });

  // Build per-note finger map keyed by string-fret
  const result = {};
  boxNotes.forEach(n => {
    const finger = (n.fret === 0) ? 0 : (fretMap[n.fret] || 0);
    result[`${n.string}-${n.fret}`] = finger;
  });
  return result;
}
function buildScaleSelector() {
  const sel = document.getElementById('scale-selector');
  sel.innerHTML = '';
  const filtered = state.group === 'all' ? ALL_SCALES :
    state.group === 'Zappa' ? ALL_SCALES.filter(s=>s.zappa) :
    ALL_SCALES.filter(s=>s.group===state.group);
  filtered.forEach(s => {
    const b = document.createElement('button');
    b.textContent = (s.zappa ? '★ ' : '') + s.name;
    b.dataset.sid = s.id;
    if(s.zappa) b.style.borderColor = '#553';
    if(s.id === state.scaleId) { b.classList.add('active'); if(s.zappa) { b.style.background='#ccb84a'; b.style.color='#000'; b.style.borderColor='#ccb84a'; } }
    b.onclick = () => {
      state.scaleId = s.id;
      buildScaleSelector();
      render();
      buildScalesList();
    };
    sel.appendChild(b);
  });
}

function filterGroup(g, btn) {
  state.group = g;
  document.querySelectorAll('.controls .btn-row button').forEach(b => {
    if(['all','Pentatonic','Modal','Blues','Zappa'].includes(b.textContent.replace('★ ','').trim()) ||
       ['All','Pentatonic','Modal','Blues'].includes(b.textContent)) b.classList.remove('active');
  });
  btn.classList.add('active');
  buildScaleSelector();
}

// Key and position buttons
const keyBtns = document.getElementById('key-btns');
KEYS.forEach((k,i) => {
  const b = document.createElement('button');
  b.textContent = k; b.dataset.group = 'key';
  if(i===0) b.classList.add('active');
  b.onclick = () => {
    document.querySelectorAll('[data-group="key"]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.key=k; render(); buildScalesList();
  };
  keyBtns.appendChild(b);
});

const posBtns = document.getElementById('pos-btns');
['P1','P2','P3','P4','P5'].forEach((p,i) => {
  const b = document.createElement('button');
  b.textContent = p; b.dataset.group = 'pos';
  if(i===0) b.classList.add('active');
  b.onclick = () => {
    document.querySelectorAll('[data-group="pos"]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.pos=i; render();
  };
  posBtns.appendChild(b);
});

// ── Scales list ───────────────────────────────────────────────────────────────
function buildScalesList() {
  const wrap = document.getElementById('scales-list');
  wrap.innerHTML = '';
  const groups = ['Pentatonic','Modal','Blues','Zappa'];
  groups.forEach(g => {
    const inGroup = ALL_SCALES.filter(s=>s.group===g);
    if(!inGroup.length) return;
    const gl = document.createElement('div');
    gl.className = 'group-label'; gl.textContent = g;
    wrap.appendChild(gl);
    const grid = document.createElement('div');
    grid.className = 'scales-grid';
    inGroup.forEach(s => {
      const notes = getScaleNotes(state.key, s.intervals);
      const div = document.createElement('div');
      div.className = 'scale-entry' + (s.id===state.scaleId?' active-scale':'') + (s.zappa?' zappa-scale':'');
      div.dataset.sid = s.id;
      div.innerHTML = `<div class="scale-entry-name">${s.name} — ${state.key}${s.zappa?' <span class="zappa-tag">★ ZAPPA</span>':''}</div>
        <div class="scale-entry-notes">${notes.join(' · ')}</div>
        ${s.note?`<div class="scale-entry-note">${s.note}</div>`:''}`;
      div.onclick = () => { state.scaleId=s.id; buildScaleSelector(); render(); buildScalesList(); };
      grid.appendChild(div);
    });
    wrap.appendChild(grid);
  });
}

// ── Circle of 5ths ────────────────────────────────────────────────────────────
function renderCircle(scaleNotes, svgId, legendId) {
  svgId = svgId || 'circle-svg'; legendId = legendId || 'circle-legend';
  const svg = document.getElementById(svgId);
  const cx=110,cy=110,R=78,labelR=98;
  function circIdx(n) {
    const nn=norm(n); let i=CIRCLE_ORDER.indexOf(nn);
    if(i<0){const f={'F#':'Gb','Gb':'F#','Db':'C#','C#':'Db','Ab':'G#','G#':'Ab','Eb':'D#','D#':'Eb','Bb':'A#','A#':'Bb'};i=CIRCLE_ORDER.indexOf(f[nn]||nn);}
    return i;
  }
  function pos(idx,r){const a=(idx/12)*2*Math.PI-Math.PI/2;return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};}
  const rootIdx=circIdx(scaleNotes[0]);
  const scaleIdxs=[...new Set(scaleNotes.map(n=>circIdx(norm(n))).filter(i=>i>=0))];
  let out='';
  out+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#2a2a2a" stroke-width="1"/>`;
  // Connection polygon
  if(scaleIdxs.length>1){
    scaleIdxs.forEach((idx,i)=>{
      const a=pos(idx,R),b=pos(scaleIdxs[(i+1)%scaleIdxs.length],R);
      out+=`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(255,255,255,0.15)" stroke-width="1.2"/>`;
    });
  }
  const sc = currentScale();
  for(let i=0;i<12;i++){
    const p=pos(i,R),lp=pos(i,labelR);
    const inScale=scaleIdxs.includes(i),isRoot=i===rootIdx;
    const orderInScale=scaleNotes.map(n=>circIdx(norm(n))).indexOf(i);
    const dotR=11;
    const isZappa = sc && sc.zappa && inScale;
    if(isRoot){
      out+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotR}" fill="${isZappa?'#ccb84a':'#fff'}"/>`;
      out+=`<text x="${p.x.toFixed(1)}" y="${(p.y+4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#000" font-family="Arial" font-weight="bold">1</text>`;
    } else if(inScale){
      const greys=['#ccc','#999','#777','#555','#3a3a3a','#2a2020','#1a1530','#111'];
      const gi=Math.min(orderInScale,greys.length-1);
      const fill = isZappa ? `hsl(48,${50-orderInScale*5}%,${40-orderInScale*3}%)` : greys[gi];
      out+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotR}" fill="${fill}" stroke="${isZappa?'#ccb84a':'none'}" stroke-width="${isZappa?1:0}"/>`;
      out+=`<text x="${p.x.toFixed(1)}" y="${(p.y+4).toFixed(1)}" text-anchor="middle" font-size="9" fill="${orderInScale>2?'#eee':'#000'}" font-family="Arial" font-weight="bold">${orderInScale+1}</text>`;
    } else {
      out+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${dotR}" fill="none" stroke="#2a2a2a" stroke-width="1"/>`;
    }
    const display=CIRCLE_DISPLAY[i].replace('\n',' / ');
    const fw=inScale?'bold':'normal', fc=inScale?(isZappa?'#ccb84a':'#ddd'):'#2e2e2e';
    out+=`<text x="${lp.x.toFixed(1)}" y="${(lp.y+3).toFixed(1)}" text-anchor="middle" font-size="${inScale?9:8}" fill="${fc}" font-family="Arial" font-weight="${fw}">${display}</text>`;
  }
  out+=`<text x="${cx}" y="${cy-5}" text-anchor="middle" font-size="9" fill="#333" font-family="Arial">Circle</text>`;
  out+=`<text x="${cx}" y="${cy+7}" text-anchor="middle" font-size="9" fill="#333" font-family="Arial">of 5ths</text>`;
  svg.innerHTML=out;
  document.getElementById(legendId).innerHTML=
    `<span style="color:${sc&&sc.zappa?'#ccb84a':'#fff'}">●</span> Root &nbsp;<span style="color:#999">●</span> Scale notes in order<br>${sc&&sc.zappa?'<span style="color:#ccb84a">★ Zappa scale active</span>':'Lines connect active notes'}`;
}

// ── Fret grid builder (shared DOM-building boilerplate) ────────────────────
// Clears container, builds the fret-number row and 6 string rows of
// .fret-cell > .note-dot, and calls decorate(cell, dot, string, fret) for
// each cell so the caller supplies note/highlight content. Returns the
// visual string order (high e on top) used for arrow/coordinate math.
function buildFretGrid(container, decorate, fretsCount) {
  fretsCount = fretsCount || FRETS;
  container.querySelectorAll('.string-row,.fret-numbers').forEach(e=>e.remove());
  const fnRow=document.createElement('div'); fnRow.className='fret-numbers';
  for(let f=0;f<fretsCount;f++){
    const d=document.createElement('div'); d.className='fret-num'; d.style.width=FRET_W+'px';
    d.textContent=[0,3,5,7,9,12,15].includes(f)?f:''; fnRow.appendChild(d);
  }
  container.insertBefore(fnRow,container.querySelector('.nut').nextSibling);

  const stringOrder=[5,4,3,2,1,0];
  stringOrder.forEach(si=>{
    const row=document.createElement('div'); row.className='string-row';
    const label=document.createElement('div'); label.className='string-name'; label.textContent=STRING_LABELS[si]; row.appendChild(label);
    const sl=document.createElement('div'); sl.className='string-line'; row.appendChild(sl);
    const fd=document.createElement('div'); fd.className='frets';
    for(let f=0;f<fretsCount;f++){
      const cell=document.createElement('div'); cell.className='fret-cell'; cell.style.width=FRET_W+'px';
      const dot=document.createElement('div'); dot.className='note-dot';
      decorate(cell,dot,si,f);
      cell.appendChild(dot); fd.appendChild(cell);
    }
    row.appendChild(fd); container.appendChild(row);
  });
  return stringOrder;
}

// ── Fretboard ─────────────────────────────────────────────────────────────────
function render() {
  saveScalesState(); // function declaration below is hoisted — available here regardless of textual order
  const sc=currentScale();
  const fb=document.getElementById('fretboard');
  const allNotes=allScaleFrets(state.key,sc.intervals);
  const boxNotes=getBoxNotes(state.key,sc.intervals,state.pos);
  const boxMap={},allMap={};
  boxNotes.forEach(n=>{boxMap[`${n.string}-${n.fret}`]=n;});
  allNotes.forEach(n=>{allMap[`${n.string}-${n.fret}`]=n;});

  const fingerMap = state.showFingers ? assignFingers(boxNotes) : {};

  const stringOrder = buildFretGrid(fb, (cell,dot,si,f) => {
    const k=`${si}-${f}`, bn=boxMap[k], an=allMap[k];
    if(bn){
      dot.classList.add(`order-${bn.order}`);
      dot.textContent=bn.note;
      if(sc.zappa) dot.classList.add('zappa-note');
      // Finger badge
      if(state.showFingers){
        const finger = fingerMap[k];
        if(finger && finger > 0){
          dot.classList.add('finger-mode');
          dot.style.position = 'relative';
          const badge = document.createElement('div');
          badge.className = `finger-badge finger-${finger}`;
          badge.textContent = finger;
          dot.appendChild(badge);
        }
      }
    } else if(an){
      dot.classList.add('scale-note'); dot.textContent=an.note;
    } else {
      dot.classList.add('empty');
    }
  });

  const canvas=document.getElementById('arrow-canvas');
  canvas.width=fb.offsetWidth||900; canvas.height=fb.offsetHeight||300;
  drawArrows(canvas,boxNotes,stringOrder);

  const scaleNotes=getScaleNotes(state.key,sc.intervals);
  renderCircle(scaleNotes);
  renderInfo(sc,scaleNotes);

  // Zappa panel
  const zp=document.getElementById('zappa-panel');
  const zb=document.getElementById('zappa-banner');
  if(sc.zappa){
    zp.style.display='block';
    zb.classList.add('visible');
    zb.innerHTML=`<strong>★ ZAPPA SCALE — ${sc.name}</strong> &nbsp;|&nbsp; ${sc.zappaNote||''}`;
  } else {
    zp.style.display='none';
    zb.classList.remove('visible');
  }

  // Update active in list
  document.querySelectorAll('.scale-entry').forEach(el=>{
    el.classList.toggle('active-scale',el.dataset.sid===state.scaleId);
  });
}

// ── Arrows ────────────────────────────────────────────────────────────────────
function drawArrows(canvas,boxNotes,stringOrder){
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  if(boxNotes.length<2) return;
  const fretNumH=28,rowH=38,topPad=10,LEFT=52;
  function coords(si,fret){const rowIdx=stringOrder.indexOf(si);return{x:LEFT+fret*FRET_W+FRET_W/2,y:fretNumH+topPad+rowIdx*rowH+rowH/2};}
  for(let si=0;si<6;si++){
    const sn=boxNotes.filter(n=>n.string===si).sort((a,b)=>a.fret-b.fret);
    for(let i=0;i<sn.length-1;i++){const a=coords(sn[i].string,sn[i].fret),b=coords(sn[i+1].string,sn[i+1].fret);drawArrow(ctx,a.x,a.y,b.x,b.y,'rgba(255,255,255,0.2)',1);}
  }
  const path=[];
  for(let row=stringOrder.length-1;row>=0;row--){
    const si=stringOrder[row];
    boxNotes.filter(n=>n.string===si).sort((a,b)=>a.fret-b.fret).forEach(n=>path.push(n));
  }
  const sc=currentScale();
  ctx.strokeStyle=sc&&sc.zappa?'rgba(204,184,74,0.55)':'rgba(255,255,255,0.45)';
  ctx.lineWidth=1.5; ctx.setLineDash([4,4]); ctx.beginPath();
  if(path.length){const s=coords(path[0].string,path[0].fret);ctx.moveTo(s.x,s.y);path.slice(1).forEach(p=>{const c=coords(p.string,p.fret);ctx.lineTo(c.x,c.y);});}
  ctx.stroke(); ctx.setLineDash([]);
}
function drawArrow(ctx,x1,y1,x2,y2,color,width){
  const hl=6,angle=Math.atan2(y2-y1,x2-x1);
  ctx.strokeStyle=color; ctx.lineWidth=width;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.fillStyle=color; ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-hl*Math.cos(angle-Math.PI/6),y2-hl*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x2-hl*Math.cos(angle+Math.PI/6),y2-hl*Math.sin(angle+Math.PI/6));
  ctx.closePath(); ctx.fill();
}

// ── Info Cards ────────────────────────────────────────────────────────────────
function renderInfo(sc,scaleNotes,boxId) {
  const box=document.getElementById(boxId||'info-box');
  const moods={
    minpent:'Dark, emotional, bluesy. Backbone of Hazel, Ronson, Dean Ween. Zappa\'s own foundation.',
    majpent:'Bright, open, melodic. Knopfler lives here. Country-tinged and resolved.',
    blues:'Tension and release. The b5 blue note creates that aching bent quality.',
    natmin:'Full minor scale. More melodic color than pentatonic.',
    majscl:'Bright and complete. Classical, resolved, Knopfler and Ronson phrasing.',
    mixo:'Major feel with bluesy flat 7. Rock and jazz fusion. Zappa: "I use this a lot."',
    dorian:'Minor with raised 6th — soulful and hopeful. Hazel\'s mode. Zappa vamp favorite.',
    phrygian:'Dark, tense, exotic. Spanish/flamenco color. Zappa used for atmospheric passages.',
    lydian:'Bright and floating — #4 creates the otherworldly quality. Zappa\'s most important modal scale.',
    harmmin:'Raised 7th = classical dramatic tension pulling to root. Ronson + Zappa both.',
    lydmixo:'Lydian #4 + flat 7 = bright but bluesy. Zappa\'s most advanced modal blend.',
    bluesext:'Full blues vocabulary with chromatic passing tones. Maximum grit.',
    diminished:'Symmetrical 8-note scale. Angular, atonal, tense. Classic Zappa outside playing.',
    wholetone:'All whole steps = dreamy, floating, unresolved. Debussy meets Zappa.',
    chromatic:'All 12 notes. Total freedom. Zappa would freely move through all pitches at speed.',
  };
  const zg=document.getElementById('zappa-grid');
  if(sc.zappa){
    zg.innerHTML=ZAPPA_CARDS.map(c=>`<div class="zappa-card"><h4>${c.title}</h4><p>${c.content}</p></div>`).join('');
  }
  box.innerHTML=`
    <div class="info-card" style="grid-column:1/-1">
      <h3>${sc.name} — Key of ${state.key} · Position ${state.pos+1}</h3>
      <p>Notes in order:</p>
      <div class="pattern">${scaleNotes.join('  —  ')}</div>
      <p class="mood">${moods[sc.id]||''}</p>
      ${sc.note?`<p style="color:#555;font-size:9px;margin-top:3px;font-family:Arial">${sc.note}</p>`:''}
    </div>
    <div class="info-card">
      <h3>→ Horizontal</h3>
      <div class="pattern">+1 fret = half step
+2 frets = whole step
+7 frets = perfect 5th</div>
      <p class="mood">Slides, bends, runs. One breath — a voice speaking.</p>
    </div>
    <div class="info-card">
      <h3>↑ Vertical</h3>
      <div class="pattern">+5 frets = same note up
G→B string: +4 frets only</div>
      <p class="mood">Octave jumps and drones. Knopfler's open-string signature.</p>
    </div>
    <div class="info-card">
      <h3>↗ Diagonal</h3>
      <div class="pattern">Dashed line = ascending
path through position box</div>
      <p class="mood">How you climb through a position. Note order 1→7.</p>
    </div>
    <div class="info-card">
      <h3>↻ Circle</h3>
      <div class="pattern">Clockwise = +5ths bright
Counter = +4ths dark/jazz</div>
      <p class="mood">Where notes land tells you the emotional color of the scale.</p>
    </div>`;
}

// ── Finger Toggle ─────────────────────────────────────────────────────────────
function toggleFingers(btn) {
  state.showFingers = !state.showFingers;
  btn.classList.toggle('active', state.showFingers);
  btn.textContent = state.showFingers ? '👆 Fingers ON' : '👆 Fingers';
  document.getElementById('finger-legend').classList.toggle('visible', state.showFingers);
  render();
}

// ── State persistence — survives page reload, not just SPA tab switches ──────
// render() runs after every state mutation (key/scale/position/group/fingers
// buttons all call it), so hooking the save there covers every mutation site
// without needing one at each button handler individually.
function saveScalesState() {
  const data = loadProgress();
  data.ui.scalesState = { scaleId: state.scaleId, key: state.key, pos: state.pos, group: state.group, showFingers: state.showFingers };
  saveProgress(data);
}
function restoreScalesState() {
  const data = loadProgress();
  if (!data.ui.scalesState) return;
  Object.assign(state, data.ui.scalesState);
  // Key/position buttons are built once at load with a hardcoded default
  // highlighted — resync them to whatever state was actually restored.
  document.querySelectorAll('[data-group="key"]').forEach(b => b.classList.toggle('active', b.textContent === state.key));
  document.querySelectorAll('[data-group="pos"]').forEach((b, i) => b.classList.toggle('active', i === state.pos));
  buildScaleSelector();
  render();
}

// ── Init ──────────────────────────────────────────────────────────────────────
buildScaleSelector();
buildScalesList();
render();
window.addEventListener('resize',()=>{
  const canvas=document.getElementById('arrow-canvas'),fb=document.getElementById('fretboard');
  canvas.width=fb.offsetWidth; canvas.height=fb.offsetHeight;
  const sc=currentScale();
  drawArrows(canvas,getBoxNotes(state.key,sc.intervals,state.pos),[5,4,3,2,1,0]);
});
