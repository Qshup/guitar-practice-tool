const ctx=require('./_harness.js');
const {CHROMATIC,lickIdentifyScales}=ctx;
const pc=n=>CHROMATIC.indexOf(n);
const R=[];const t=(n,ok,x)=>R.push([n,ok,x]);

// The exact case that came out wrong in the browser: E G B D over an Em -> G
// vamp, ending on B. Ending on the 5th must not make B the tonic.
const EGBD=[52,55,59,62,55,59];
let m=lickIdentifyScales(EGBD,3,[pc('E'),pc('G')]);
t('E G B D over Em->G is NOT called B-rooted', m[0].keyName!=='B', m[0].keyName+' '+m[0].scaleName);
t('E G B D over Em->G resolves to E', m[0].keyName==='E', m[0].keyName+' '+m[0].scaleName);

// Without any chord context it must still prefer the scale the line FILLS
// over a bigger scale that merely contains it.
m=lickIdentifyScales(EGBD,3,[]);
t('no chord context: still prefers the tighter scale', m[0].keyName==='E', m[0].keyName+' '+m[0].scaleName);

// Chord context must not steamroll a line that is plainly in another key.
m=lickIdentifyScales([60,62,64,65,67,69,71,72],3,[pc('C')]);
t('C major line over C stays C major', m[0].keyName==='C'&&m[0].scaleId==='majscl', m[0].keyName+' '+m[0].scaleName);

// The same 5 notes disambiguated by resolution must STILL work with no chords.
const A=[52,55,57,59,62,64];            // E G A B D E
const B=[55,57,59,62,64,67];            // G A B D E G
t('E-resolving pentatonic still reads E', lickIdentifyScales(A,3,[])[0].keyName==='E', lickIdentifyScales(A,3,[])[0].keyName);
t('G-resolving pentatonic still reads G', lickIdentifyScales(B,3,[])[0].keyName==='G', lickIdentifyScales(B,3,[])[0].keyName);

// Chord context should RAISE the vamp's root among the candidates, but it must
// not override strong melodic evidence. A line that starts on E, ends on E and
// has E as its lowest and most frequent note is E-centred even over a G chord
// (they are the same five notes) — so the assertion is that G is offered as an
// alternative, not that it wins.
const withG=lickIdentifyScales(A,3,[pc('G')]);
const withNone=lickIdentifyScales(A,3,[]);
t('G vamp lifts G into the offered alternatives', withG.some(m=>m.keyName==='G'), withG.map(m=>m.keyName+' '+m.scaleName).join(' | '));
const rankG=a=>a.findIndex(m=>m.keyName==='G');
t('G ranks no worse with a G vamp than without',
  rankG(withG)>=0 && (rankG(withNone)<0 || rankG(withG)<=rankG(withNone)),
  'withG idx='+rankG(withG)+' withNone idx='+rankG(withNone));

let p=0;for(const[n,ok,x]of R){console.log((ok?'  PASS  ':'! FAIL  ')+n+(x?'   ('+x+')':''));if(ok)p++;}
console.log(`\n${p}/${R.length} passed`);
