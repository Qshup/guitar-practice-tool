const ctx=require('./_harness.js');
const {CHROMATIC, ALL_SCALES, STRING_MIDI, lickAnalyse, lickContour, lickRhythm, lickIdentifyScales}=ctx;
const N=n=>CHROMATIC.indexOf(n);
function seq(names, base){ let prev=null; return names.map((s,i)=>{ let m=12*base+N(s); if(prev!==null&&m<prev) m+=12*Math.ceil((prev-m)/12); prev=m; return {midi:m,noteName:s,time:i*0.25,technique:null}; }); }
const R=[];const t=(n,ok,x)=>R.push([n,ok,x]);

let a=lickAnalyse(seq(['E','G','A','B','D','E'],4));
t('E min pent (E G A B D resolving to E)', a.scaleMatches[0].keyName==='E'&&a.scaleMatches[0].scaleId==='minpent', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['G','A','B','D','E','G'],4));
t('SAME 5 notes resolving to G -> G maj pent', a.scaleMatches[0].keyName==='G'&&a.scaleMatches[0].scaleId==='majpent', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['C','D','E','F','G','A','B','C'],4));
t('C major', a.scaleMatches[0].keyName==='C'&&a.scaleMatches[0].scaleId==='majscl', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['E','F#','G','A','B','C#','D','E'],4));
t('E Dorian (raised 6th)', a.scaleMatches[0].keyName==='E'&&a.scaleMatches[0].scaleId==='dorian', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['A','C','D','D#','E','G','A'],3));
t('A blues (b5)', a.scaleMatches[0].keyName==='A'&&a.scaleMatches[0].scaleId==='blues', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['C','D','E','F#','G','A','B','C'],4));
t('C Lydian (#4)', a.scaleMatches[0].keyName==='C'&&a.scaleMatches[0].scaleId==='lydian', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['G','A','B','C','D','E','F','G'],3));
t('G Mixolydian (b7)', a.scaleMatches[0].keyName==='G'&&a.scaleMatches[0].scaleId==='mixo', a.scaleMatches[0].keyName+' '+a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['E','G','A','B','D'],4));
t('chromatic never wins for a diatonic line', a.scaleMatches[0].scaleId!=='chromatic', a.scaleMatches[0].scaleName);
a=lickAnalyse(seq(['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],4));
t('all 12 notes -> chromatic', a.scaleMatches[0].scaleId==='chromatic', a.scaleMatches[0].scaleName);

a=lickAnalyse(seq(['E','G'],4));
t('E->G minor 3rd up', a.intervals[0].semi===3&&a.intervals[0].name==='minor 3rd'&&a.intervals[0].dir==='up');
a=lickAnalyse([{midi:64,noteName:'E',time:0},{midi:58,noteName:'A#',time:.2}]);
t('descending tritone signed+named', a.intervals[0].semi===-6&&a.intervals[0].name==='tritone'&&a.intervals[0].dir==='down');
a=lickAnalyse([{midi:52,noteName:'E',time:0},{midi:64,noteName:'E',time:.2}]);
t('octave', a.intervals[0].name==='octave');

a=lickAnalyse(seq(['E','G','A','B','D','E'],4));
t('every placement sounds its own pitch', a.notes.every(n=>n.string===null||STRING_MIDI[n.string]+n.fret===n.midi));
const fr=a.notes.map(n=>n.fret), span=Math.max(...fr)-Math.min(...fr);
t('placement stays in one hand position (span<=5)', span<=5, 'span='+span+' frets='+JSON.stringify(fr));
a=lickAnalyse([{midi:20,noteName:'G#',time:0},{midi:64,noteName:'E',time:.2}]);
t('out-of-range note kept with null position', a.notes.length===2&&a.notes[0].fret===null&&a.notes[1].fret!==null);

t('arc detected', lickContour([60,64,67,72,67,62]).shape.startsWith('arc'), lickContour([60,64,67,72,67,62]).shape);
t('ascending', lickContour([60,62,64,67]).shape==='ascending');
t('descending', lickContour([72,69,67,64]).shape==='descending');
t('range measured', lickContour([60,72]).range===12);

const even=lickRhythm([{time:0},{time:.25},{time:.5},{time:.75}]);
t('even rhythm -> evenness ~1', even.evenness>0.95, even.evenness.toFixed(3));
const un=lickRhythm([{time:0},{time:.1},{time:1.2},{time:1.25}]);
t('uneven rhythm -> low evenness', un.evenness<0.6, un.evenness.toFixed(3));
t('notes/sec correct', Math.abs(even.notesPerSec-4)<0.01);

a=lickAnalyse(seq(['E','F#','G','A','B','C#','D','E'],4));
const txt=a.explanation.join(' ');
t('explanation names the scale', /E Dorian/.test(txt));
t('explanation reports no backing track', /No backing track/.test(txt));
t('explanation notes stepwise motion', /stepwise/.test(txt));
t('explanation counts degrees used', /of its 7 degrees/.test(txt));

let pass=0;for(const[n,ok,x]of R){console.log((ok?'  PASS  ':'! FAIL  ')+n+(x?'   ('+x+')':''));if(ok)pass++;}
console.log(`\n${pass}/${R.length} passed`);
