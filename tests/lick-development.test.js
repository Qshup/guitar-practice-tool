const ctx=require('./_harness.js');
const {CHROMATIC,STRING_MIDI,ALL_SCALES,lickAnalyse,lickDiatonicShift,lickVariations,lickTabLines,
       lickConnections,lickVocabularyStats,lickSharedRun,lickAlternateStringSet}=ctx;
const N=n=>CHROMATIC.indexOf(n);
function seq(names,base){let p=null;return names.map((s,i)=>{let m=12*base+N(s);if(p!==null&&m<p)m+=12*Math.ceil((p-m)/12);p=m;return{midi:m,noteName:s,time:i*0.25,technique:null};});}
const R=[];const t=(n,ok,x)=>R.push([n,ok,x]);
const mkLick=(id,names,base)=>{const notes=seq(names,base||4);const a=lickAnalyse(notes);return{id,notes:a.notes,analysis:a};};

// --- diatonic shift: the defining property is that INTERVALS change ---
const Cmaj=[0,2,4,5,7,9,11];
let sh=lickDiatonicShift([60,64,67],0,Cmaj,1);  // C E G -> D F A
t('C-E-G up one degree in C major -> D-F-A', sh.join()==='62,65,69', sh.join());
t('...and the intervals genuinely changed (M3+m3 -> m3+M3)',
  (sh[1]-sh[0])===3 && (sh[2]-sh[1])===4);
sh=lickDiatonicShift([71],0,Cmaj,1);            // B -> C, crossing the octave
t('B up one degree wraps to C an octave up', sh[0]===72, String(sh[0]));
sh=lickDiatonicShift([60],0,Cmaj,-1);           // C down one -> B below
t('C down one degree -> B below', sh[0]===59, String(sh[0]));
// chromatic passing tone keeps its offset
sh=lickDiatonicShift([61],0,Cmaj,1);            // C# (not in scale) -> D#
t('non-scale note keeps its chromatic offset', sh[0]===63, String(sh[0]));

// --- variations ---
const lick=mkLick('L1',['E','G','A','B','D','E']);
const vars=lickVariations(lick);
t('three variations produced', vars.length===3, vars.map(v=>v.id).join(','));
const sv=vars.find(v=>v.id==='sequence');
t('sequence variation has same note count', sv.notes.length===lick.notes.length);
t('sequence variation actually differs in pitch', sv.notes.some((n,i)=>n.midi!==lick.notes[i].midi));
t('sequence placements sound their own pitch',
  sv.notes.every(n=>n.string===null||STRING_MIDI[n.string]+n.fret===n.midi));
const rv=vars.find(v=>v.id==='rhythm');
t('rhythm variation keeps every pitch identical', rv.notes.every((n,i)=>n.midi===lick.notes[i].midi));
t('rhythm variation changes the timing', rv.notes.some((n,i)=>Math.abs(n.time-(lick.notes[i].time-lick.notes[0].time))>1e-9));
t('rhythm variation times strictly increase', rv.notes.every((n,i)=>i===0||n.time>rv.notes[i-1].time));
const ss=vars.find(v=>v.id==='stringset');
if(ss){
  t('string-set variation keeps every pitch identical', ss.notes.every((n,i)=>n.midi===lick.notes[i].midi));
  t('string-set variation uses different strings', ss.notes.some((n,i)=>n.string!==lick.notes[i].string));
  t('string-set placements sound their own pitch', ss.notes.every(n=>STRING_MIDI[n.string]+n.fret===n.midi));
} else t('string-set variation produced', false, 'none found');

// --- tab rendering ---
const tab=lickTabLines(lick.notes);
const lines=tab.split('\n');
t('tab has 6 string rows', lines.length===6, String(lines.length));
t('tab is high-e first, low-E last', lines[0].startsWith('e|')&&lines[5].startsWith('E|'));
// every fret number in the tab must appear on the right row
const rowFor=s=>lines[5-s];
t('each note printed on its own string row',
  lick.notes.every(n=>rowFor(n.string).includes(String(n.fret))));
t('all rows equal length (columns align)', new Set(lines.map(l=>l.length)).size===1, lines.map(l=>l.length).join(','));

// --- connections ---
const a1=mkLick('A',['E','G','A','B','D','E']);           // m3 M2 M2 m3 ... 
const a2=mkLick('B',['E','G','A','B','D','E']);           // identical -> strong link
const a3=mkLick('C',['C','C#','D','D#','E'],5);           // all semitones -> unrelated
const conns=lickConnections(a1,[a2,a3]);
t('identical lick is the top connection', conns[0]&&conns[0].lick.id==='B', conns.map(c=>c.lick.id+':'+Math.round(c.score)).join(' '));
t('connection cites a shared cell', conns[0].reasons.some(r=>/shared \d+-note cell/.test(r)), conns[0].reasons.join(' | '));
t('unrelated chromatic lick scores far lower or is excluded',
  !conns.find(c=>c.lick.id==='C') || conns.find(c=>c.lick.id==='C').score < conns[0].score/2);
t('longest shared run found', lickSharedRun('3,2,2,3','9,3,2,2,7')===3, String(lickSharedRun('3,2,2,3','9,3,2,2,7')));
t('no shared run between disjoint shapes', lickSharedRun('3,2','7,11')===0);

// --- vocabulary stats ---
const stats=lickVocabularyStats([a1,a2,a3]);
t('stats count licks', stats.count===3);
t('stats rank intervals by frequency', stats.intervals[0].count>=stats.intervals[stats.intervals.length-1].count);
t('semitone-heavy lick shows m2 in the tally', stats.intervals.some(i=>i.semi===1), JSON.stringify(stats.intervals.slice(0,3)));
t('stats list scales used', stats.scales.length>0, stats.scales.map(s=>s.name+'x'+s.count).join(', '));

let pass=0;for(const[n,ok,x]of R){console.log((ok?'  PASS  ':'! FAIL  ')+n+(x?'   ('+x+')':''));if(ok)pass++;}
console.log(`\n${pass}/${R.length} passed`);
