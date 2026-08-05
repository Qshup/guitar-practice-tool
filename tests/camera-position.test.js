// Camera-informed note placement: the mic says WHAT and WHEN, the camera says
// WHERE. These exercise fvPositionForPitch's matching rules directly.
const vm=require('vm'), fs=require('fs'), path=require('path');
const P=path.join(__dirname,'..')+'/';
const src=[
  "const STRING_MIDI=[40,45,50,55,59,64];",
  "let fvHomography=[1,0,0,0,1,0,0,0,1];",
  "function getAudioCtx(){ return { currentTime: globalThis.__now }; }",
  fs.readFileSync(P+'js/fretboard-vision.js','utf8')
     .match(/const FV_HISTORY_SEC[\s\S]*?function fvClearReadingHistory\(\) \{ fvReadingHistory = \[\]; \}/)[0],
  fs.readFileSync(P+'js/fretboard-vision.js','utf8')
     .match(/function fvPositionForPitch[\s\S]*?\n\}/)[0],
  "Object.assign(globalThis,{fvRecordReading,fvRecentReadings,fvClearReadingHistory,fvPositionForPitch,STRING_MIDI});",
].join('\n');
const ctx=vm.createContext({console, performance, __now:100});
vm.runInContext(src, ctx);
const {fvRecordReading,fvPositionForPitch,fvClearReadingHistory,fvRecentReadings}=ctx;
const R=[];const t=(n,ok,x)=>R.push([n,ok,x]);
const at=(time,fn)=>{ ctx.__now=time; fn(); };

// E4 (midi 64) is playable on 4 strings. Say it was really played on the LOW E
// string at fret 24... use a realistic one: string 2 (D) fret 14 = 64.
fvClearReadingHistory();
at(10, ()=>fvRecordReading([{string:2, fret:14, note:'E', confidence:0.9}]));
let p=fvPositionForPitch(64, 10.02);
t('camera resolves E4 to the string it was actually played on', p && p.string===2 && p.fret===14, p?`s${p.string}f${p.fret}`:'null');
t('match reported as exact', p && p.match==='exact', p&&p.match);

// Outside the correlation window -> no claim
t('no claim when the reading is far in the past', fvPositionForPitch(64, 12.0)===null);
t('no claim when the reading is in the future', fvPositionForPitch(64, 5.0)===null);

// Reading lands slightly AFTER the pick attack (camera holds over 5 frames)
fvClearReadingHistory();
at(20.25, ()=>fvRecordReading([{string:1, fret:19, note:'E', confidence:0.8}]));
p=fvPositionForPitch(64, 20.0);
t('tolerates the camera confirming shortly after the attack', p && p.string===1, p?`s${p.string}f${p.fret}`:'null');

// Pitch the camera never saw -> null, so the caller falls back to the solve
fvClearReadingHistory();
at(30, ()=>fvRecordReading([{string:2, fret:14, note:'E', confidence:0.9}]));
t('unseen pitch returns null rather than guessing', fvPositionForPitch(60, 30.0)===null);

// Octave slip: detector says E5, camera saw E4 under the finger
fvClearReadingHistory();
at(40, ()=>fvRecordReading([{string:2, fret:14, note:'E', confidence:0.9}]));
p=fvPositionForPitch(76, 40.0);
t('octave slip matched against what the camera saw', p && p.match==='octave' && p.midi===64, p?p.match+' midi'+p.midi:'null');

// Exact match must beat an octave match when both are visible
fvClearReadingHistory();
at(50, ()=>fvRecordReading([
  {string:2, fret:14, note:'E', confidence:0.9},   // 64
  {string:0, fret:12, note:'E', confidence:0.9},   // 52 -> octave from 64
]));
p=fvPositionForPitch(64, 50.0);
t('exact match preferred over an octave match', p && p.match==='exact' && p.string===2, p?p.match+' s'+p.string:'null');

// Higher-confidence reading wins between two exact matches
fvClearReadingHistory();
at(60, ()=>fvRecordReading([{string:2, fret:14, note:'E', confidence:0.55}]));
at(60.05, ()=>fvRecordReading([{string:1, fret:19, note:'E', confidence:0.95}]));
p=fvPositionForPitch(64, 60.0);
t('higher-confidence sighting wins', p && p.string===1, p?`s${p.string} conf${p.confidence}`:'null');

// History ages out
fvClearReadingHistory();
at(100, ()=>fvRecordReading([{string:2, fret:14, note:'E', confidence:0.9}]));
at(200, ()=>fvRecordReading([{string:3, fret:9,  note:'E', confidence:0.9}]));
t('history prunes beyond the window', fvRecentReadings(40).length===1);

let n=0;for(const[a,ok,x]of R){console.log((ok?'  PASS  ':'! FAIL  ')+a+(x?'   ('+x+')':''));if(ok)n++;}
console.log(`\n${n}/${R.length} passed`);
if(n!==R.length) process.exit(1);
