// Mirror of mic.js's ring read + WAV writer, exercised directly.
const RATE = 100; // small rate so the maths is checkable by hand
const SEC = 12;
let ring = new Float32Array(RATE*SEC), w = 0, filled = 0;
function write(arr){ for(const v of arr){ ring[w]=v; w=(w+1)%ring.length; } filled=Math.min(ring.length, filled+arr.length); }
function readLast(seconds){
  if(!filled) return null;
  const want = Math.min(Math.ceil(seconds*RATE), filled);
  const out = new Float32Array(want);
  let r = (w - want + ring.length) % ring.length;
  for(let i=0;i<want;i++){ out[i]=ring[r]; r=(r+1)%ring.length; }
  return {samples:out, duration: want/RATE};
}
const results = [];
// 1. under-filled: only 3s written, ask for 8s -> get 3s, in order
write(Array.from({length:300},(_,i)=>i));
let r = readLast(8);
results.push(['underfilled length', r.samples.length===300]);
results.push(['underfilled ordered oldest-first', r.samples[0]===0 && r.samples[299]===299]);
// 2. exactly 8s of the most recent, mid-ring
ring=new Float32Array(RATE*SEC); w=0; filled=0;
write(Array.from({length:1000},(_,i)=>i));   // 10s written into a 12s ring
r = readLast(8);
results.push(['8s window length', r.samples.length===800]);
results.push(['8s window is the NEWEST 8s', r.samples[0]===200 && r.samples[799]===999]);
// 3. wrapped ring: write past capacity
ring=new Float32Array(RATE*SEC); w=0; filled=0;
write(Array.from({length:2000},(_,i)=>i));   // 20s into a 12s ring -> wraps
r = readLast(8);
results.push(['wrapped length', r.samples.length===800]);
results.push(['wrapped contiguity', r.samples.every((v,i)=> i===0 || v===r.samples[i-1]+1)]);
results.push(['wrapped newest', r.samples[799]===1999 && r.samples[0]===1200]);
// 4. ask for more than ring capacity
r = readLast(30);
results.push(['clamped to ring capacity', r.samples.length===1200 && r.samples[1199]===1999]);
// 5. WAV header
function wav(samples, sampleRate){
  const buf=new ArrayBuffer(44+samples.length*2), view=new DataView(buf);
  const str=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  str(0,'RIFF'); view.setUint32(4,36+samples.length*2,true); str(8,'WAVE');
  str(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,1,true); view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  str(36,'data'); view.setUint32(40,samples.length*2,true);
  let off=44; for(let i=0;i<samples.length;i++,off+=2){const s=Math.max(-1,Math.min(1,samples[i]));view.setInt16(off,s<0?s*0x8000:s*0x7fff,true);}
  return Buffer.from(buf);
}
const b = wav(new Float32Array([0, 1, -1, 0.5]), 44100);
results.push(['wav RIFF', b.toString('ascii',0,4)==='RIFF']);
results.push(['wav WAVE', b.toString('ascii',8,12)==='WAVE']);
results.push(['wav data chunk size', b.readUInt32LE(40)===8]);
results.push(['wav total size', b.length===52 && b.readUInt32LE(4)===44]);
results.push(['wav peak +1 -> 32767', b.readInt16LE(46)===32767]);
results.push(['wav peak -1 -> -32768', b.readInt16LE(48)===-32768]);
results.push(['wav mono 16bit 44.1k', b.readUInt16LE(22)===1 && b.readUInt16LE(34)===16 && b.readUInt32LE(24)===44100]);
let pass=0; for(const [n,ok] of results){ console.log((ok?'  PASS  ':'! FAIL  ')+n); if(ok)pass++; }
console.log(`\n${pass}/${results.length} passed`);
