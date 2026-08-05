const fs=require('fs'), vm=require('vm'), P=require('path').join(__dirname,'..')+'/';
const scales=fs.readFileSync(P+'js/scales.js','utf8');
const harmony=fs.readFileSync(P+'js/harmony.js','utf8');
const src = [
  scales.match(/const CHROMATIC = \[[^\]]*\];/)[0],
  scales.match(/const ALL_SCALES = \[[\s\S]*?\n\];/)[0],
  'const STRING_MIDI=[40,45,50,55,59,64];',
  "const HARMONY_ROLES={root:{label:'Root'},third:{label:'3rd'},fifth:{label:'5th'},seventh:{label:'7th'},ninth:{label:'9th'},sixth:{label:'6th / 13th'},eleventh:{label:'11th (4th)'},avoid:{label:'Tension'}};",
  harmony.match(/function harmonicRole[\s\S]*?\n}/)[0],
  fs.readFileSync(P+'js/licks.js','utf8'),
  // lexical top-level bindings are not context properties; publish explicitly
  `Object.assign(globalThis, {CHROMATIC, ALL_SCALES, STRING_MIDI, HARMONY_ROLES, harmonicRole,
     LICK_INTERVALS, lickIntervalInfo, lickFretPositions, lickIdentifyScales,
     lickIntervalSequence, lickChordToneRoles, lickContour, lickRhythm, lickExplain, lickAnalyse,
     lickTabLines, lickDiatonicShift, lickApplyRhythm, lickAlternateStringSet, lickVariations,
     lickFingerprint, lickSharedRun, lickConnections, lickVocabularyStats, LICK_RHYTHM_PATTERNS});`,
].join('\n');
const ctx = vm.createContext({console});
vm.runInContext(src, ctx);
module.exports = ctx;
