// ═══════════════════════════════════════════════════════════════════════════
// SONGS MODE — song library, filters, and a Songsterr-style synced practice
// player: scrolling chord/tab track, tempo-scaled synth playback (pitch-correct
// at any speed via Tone.Transport bpm scaling), section markers, drag-to-loop,
// a practice overlay (chord diagrams + scale/fretboard), and self-grading.
//
// Reuses: game.js (GAME_CHORDS/drawGameChord/fretToHz), audio.js (playSampledNote/
// ensureInstrumentReady/getAudioCtx — the sample-based guitar engine), scales.js (ALL_SCALES/getScaleNotes/
// getBoxNotes/allScaleFrets/buildFretGrid/STRINGS/STRING_LABELS/noteAt/norm),
// riffs.js (RIFF_LIBRARY — related riffs pulled by player tag, never duplicated),
// progress.js (recordSongSession/loadProgress — same localStorage tracker used
// by the chord game and Listen & Repeat).
//
// Chord progressions below are generic practice progressions in each song's
// key/style, not claimed to be exact transcriptions of the recordings — same
// spirit as the existing riff library.
//
// ── Data shape (kept deliberately GP-parser-ready) ─────────────────────────
// Every renderer/playback function below consumes exactly this shape:
//   { id, title, artist, playerTag, key, bpm, timeSig, difficulty (1-5),
//     soloScaleId, soloScaleKey, altScaleId, altScaleKey, tip,
//     sections: [{ id, label, startBar, endBar, solo? }],
//     bars: [{ bar, chord, notes: [{ string, fret, beat, dur, technique?, bendTo? }] }] }
// A future Guitar Pro file parser only needs to produce this same object and
// hand it to registerExternalSong() — nothing else in this file changes.
// ═══════════════════════════════════════════════════════════════════════════

function makeBars(chordSeq, notesByBar) {
  return chordSeq.map((chord, i) => ({ bar: i + 1, chord, notes: (notesByBar && notesByBar[i + 1]) || [] }));
}

const SECTION_COLORS = [
  { test: /solo|vamp/i, color: '#fb8c00' },
  { test: /lydian/i, color: '#ccb84a' },
  { test: /chorus/i, color: '#4caf50' },
  { test: /bridge/i, color: '#8e24aa' },
  { test: /verse/i, color: '#5c8fff' },
  { test: /theme|head|melody/i, color: '#5c8fff' },
  { test: /intro/i, color: '#888' },
  { test: /outro/i, color: '#666' },
];
function sectionColor(label) {
  const hit = SECTION_COLORS.find(s => s.test.test(label));
  return hit ? hit.color : '#555';
}

const SONG_LIBRARY = [
  {
    id: 'sultans-of-swing', title: 'Sultans of Swing', artist: 'Dire Straits', playerTag: 'Knopfler',
    key: 'Dm', bpm: 148, timeSig: 4, difficulty: 4, defaultInstrument: 'clean',
    soloScaleId: 'majpent', soloScaleKey: 'D', altScaleId: 'natmin', altScaleKey: 'D',
    tip: "Knopfler's solo famously leans on D major pentatonic OVER the Dm chords — a deliberate major/minor clash that gives it that bittersweet lift. Fingers, not a pick, for his percussive attack.",
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse1', label: 'Verse', startBar: 5, endBar: 12 },
      { id: 'chorus', label: 'Chorus / Hook', startBar: 13, endBar: 16 },
      { id: 'solo', label: 'Solo', startBar: 17, endBar: 24, solo: true },
      { id: 'outro', label: 'Outro', startBar: 25, endBar: 28 },
    ],
    bars: makeBars(
      ['Dm', 'C', 'Dm', 'C', 'Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Bb', 'C', 'Bb', 'C', 'Dm', 'C',
       'Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Dm', 'C'],
      {
        17: [{ string: 3, fret: 7, beat: 0, dur: 1 }, { string: 3, fret: 9, beat: 1, dur: 0.5 }, { string: 4, fret: 7, beat: 1.5, dur: 0.5 }, { string: 3, fret: 7, beat: 2, dur: 1 }, { string: 4, fret: 5, beat: 3, dur: 1, technique: 'vibrato' }],
        19: [{ string: 5, fret: 5, beat: 0, dur: 1, technique: 'bend', bendTo: 1 }, { string: 5, fret: 7, beat: 1, dur: 1 }, { string: 4, fret: 7, beat: 2, dur: 1 }, { string: 3, fret: 7, beat: 3, dur: 1, technique: 'vibrato' }],
        21: [{ string: 3, fret: 9, beat: 0, dur: 0.5 }, { string: 3, fret: 7, beat: 0.5, dur: 0.5, technique: 'pulloff' }, { string: 4, fret: 5, beat: 1, dur: 1 }, { string: 4, fret: 7, beat: 2, dur: 1 }, { string: 5, fret: 5, beat: 3, dur: 1, technique: 'vibrato' }],
        23: [{ string: 5, fret: 7, beat: 0, dur: 1 }, { string: 5, fret: 5, beat: 1, dur: 1 }, { string: 4, fret: 7, beat: 2, dur: 1 }, { string: 3, fret: 7, beat: 3, dur: 1, technique: 'vibrato' }],
      }
    ),
  },
  {
    id: 'romeo-and-juliet', title: 'Romeo and Juliet', artist: 'Dire Straits', playerTag: 'Knopfler',
    key: 'F', bpm: 116, timeSig: 4, difficulty: 3, defaultInstrument: 'acoustic',
    soloScaleId: 'majpent', soloScaleKey: 'F', altScaleId: 'majscl', altScaleKey: 'F',
    tip: 'Fingerstyle throughout — thumb keeps a steady bass pulse on the low strings while your fingers pick the melody on top. Let chords ring into each other rather than damping.',
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse', label: 'Verse', startBar: 5, endBar: 12, solo: true },
      { id: 'bridge', label: 'Bridge', startBar: 13, endBar: 16 },
      { id: 'outro', label: 'Outro', startBar: 17, endBar: 20 },
    ],
    bars: makeBars(
      ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'Dm', 'Bb', 'C'],
      {
        9: [{ string: 3, fret: 0, beat: 0, dur: 0.5 }, { string: 3, fret: 2, beat: 0.5, dur: 0.5, technique: 'hammer' }, { string: 3, fret: 5, beat: 1, dur: 1 }, { string: 5, fret: 1, beat: 2, dur: 1 }, { string: 5, fret: 3, beat: 3, dur: 1, technique: 'vibrato' }],
        11: [{ string: 3, fret: 7, beat: 0, dur: 1 }, { string: 3, fret: 5, beat: 1, dur: 0.5 }, { string: 3, fret: 2, beat: 1.5, dur: 0.5 }, { string: 5, fret: 1, beat: 2, dur: 1, technique: 'vibrato' }],
      }
    ),
  },
  {
    id: 'suffragette-city', title: 'Suffragette City', artist: 'David Bowie', playerTag: 'Ronson',
    key: 'A', bpm: 136, timeSig: 4, difficulty: 2, defaultInstrument: 'crunch',
    soloScaleId: 'minpent', soloScaleKey: 'A', altScaleId: 'majpent', altScaleKey: 'A',
    tip: 'Driving, palm-muted eighth-note strumming — attack and energy over subtlety. Lead lines are quick A minor pentatonic bursts, not long sustained phrases.',
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse', label: 'Verse', startBar: 5, endBar: 12 },
      { id: 'prechorus', label: 'Pre-Chorus', startBar: 13, endBar: 14 },
      { id: 'chorus', label: 'Chorus', startBar: 15, endBar: 19, solo: true },
      { id: 'outro', label: 'Outro', startBar: 20, endBar: 22 },
    ],
    bars: makeBars(
      ['A', 'D', 'A', 'D', 'A', 'D', 'A', 'D', 'A', 'D', 'A', 'G', 'G', 'A', 'D', 'A', 'D', 'G', 'A', 'A', 'D', 'G'],
      { 16: [{ string: 1, fret: 0, beat: 0, dur: 1, technique: 'mute' }, { string: 1, fret: 3, beat: 1, dur: 1 }, { string: 2, fret: 2, beat: 2, dur: 1 }, { string: 2, fret: 0, beat: 3, dur: 1, technique: 'vibrato' }] }
    ),
  },
  {
    id: 'moonage-daydream', title: 'Moonage Daydream', artist: 'David Bowie', playerTag: 'Ronson',
    key: 'A', bpm: 136, timeSig: 4, difficulty: 3, defaultInstrument: 'crunch',
    soloScaleId: 'minpent', soloScaleKey: 'A', altScaleId: 'mixo', altScaleKey: 'A',
    tip: 'The solo section is where Ronson opens up — lean on A minor pentatonic with wide bends, then let a Mixolydian passing tone or two sneak in for extra lift.',
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse', label: 'Verse', startBar: 5, endBar: 12 },
      { id: 'chorus', label: 'Chorus', startBar: 13, endBar: 16 },
      { id: 'solo', label: 'Solo', startBar: 17, endBar: 24, solo: true },
      { id: 'outro', label: 'Outro', startBar: 25, endBar: 28 },
    ],
    bars: makeBars(
      ['A', 'E', 'F#m', 'D', 'A', 'E', 'F#m', 'D', 'A', 'E', 'F#m', 'D', 'D', 'A', 'E', 'A',
       'A', 'E', 'F#m', 'D', 'A', 'E', 'F#m', 'D', 'A', 'E', 'D', 'A'],
      {
        17: [{ string: 1, fret: 0, beat: 0, dur: 1 }, { string: 1, fret: 3, beat: 1, dur: 1, technique: 'bend', bendTo: 2 }, { string: 2, fret: 0, beat: 2, dur: 1 }, { string: 2, fret: 2, beat: 3, dur: 1, technique: 'vibrato' }],
        19: [{ string: 2, fret: 2, beat: 0, dur: 1 }, { string: 2, fret: 0, beat: 1, dur: 1, technique: 'pulloff' }, { string: 1, fret: 3, beat: 2, dur: 1 }, { string: 1, fret: 0, beat: 3, dur: 1, technique: 'vibrato' }],
        21: [{ string: 0, fret: 5, beat: 0, dur: 1 }, { string: 0, fret: 8, beat: 1, dur: 1 }, { string: 1, fret: 5, beat: 2, dur: 1 }, { string: 1, fret: 7, beat: 3, dur: 1, technique: 'vibrato' }],
        23: [{ string: 1, fret: 7, beat: 0, dur: 1 }, { string: 1, fret: 10, beat: 1, dur: 1 }, { string: 0, fret: 8, beat: 2, dur: 1 }, { string: 0, fret: 5, beat: 3, dur: 1, technique: 'vibrato' }],
      }
    ),
  },
  {
    id: 'can-you-get-to-that', title: 'Can You Get to That', artist: 'Funkadelic', playerTag: 'Hazel',
    key: 'E', bpm: 104, timeSig: 4, difficulty: 3, defaultInstrument: 'clean',
    soloScaleId: 'dorian', soloScaleKey: 'E', altScaleId: 'minpent', altScaleKey: 'E',
    tip: 'Funky, syncopated strumming with emphasis on the off-beats. Keep the Dorian color (raised 6th, C#) in mind if you solo over this — it keeps it soulful rather than bluesy.',
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse', label: 'Verse', startBar: 5, endBar: 12, solo: true },
      { id: 'chorus', label: 'Chorus', startBar: 13, endBar: 16 },
      { id: 'outro', label: 'Outro', startBar: 17, endBar: 18 },
    ],
    bars: makeBars(
      ['E', 'A', 'B7', 'E', 'E', 'A', 'E', 'B7', 'E', 'A', 'B7', 'E', 'A', 'B7', 'E', 'E', 'E', 'A'],
      { 9: [{ string: 0, fret: 0, beat: 0, dur: 1 }, { string: 0, fret: 2, beat: 1, dur: 1 }, { string: 0, fret: 3, beat: 2, dur: 1 }, { string: 0, fret: 5, beat: 3, dur: 1, technique: 'vibrato' }] }
    ),
  },
  {
    id: 'maggot-brain', title: 'Maggot Brain', artist: 'Funkadelic', playerTag: 'Hazel',
    key: 'Em', bpm: 60, timeSig: 4, difficulty: 4, defaultInstrument: 'crunch',
    soloScaleId: 'minpent', soloScaleKey: 'E', altScaleId: 'dorian', altScaleKey: 'E',
    tip: "The entire solo lives on a single Em chord — no harmonic complexity to hide behind, every note has to justify itself. Prioritize space, dynamics, and sustain over speed; let notes ring and decay fully before the next one.",
    sections: [
      { id: 'intro', label: 'Intro (Spoken Word)', startBar: 1, endBar: 4 },
      { id: 'solo', label: 'Solo (Em Throughout)', startBar: 5, endBar: 20, solo: true },
      { id: 'outro', label: 'Outro', startBar: 21, endBar: 22 },
    ],
    bars: makeBars(
      Array(22).fill('Em'),
      {
        6: [{ string: 0, fret: 12, beat: 0, dur: 3, technique: 'vibrato' }],
        10: [{ string: 0, fret: 15, beat: 0, dur: 3, technique: 'bend', bendTo: 2 }],
        14: [{ string: 1, fret: 12, beat: 0, dur: 3, technique: 'vibrato' }],
        18: [{ string: 0, fret: 12, beat: 1, dur: 2, technique: 'harmonic' }],
      }
    ),
  },
  {
    id: 'transdermal-celebration', title: 'Transdermal Celebration', artist: 'Ween', playerTag: 'Dean Ween',
    key: 'E', bpm: 72, timeSig: 4, difficulty: 4, defaultInstrument: 'crunch',
    soloScaleId: 'minpent', soloScaleKey: 'E', altScaleId: 'blues', altScaleKey: 'E',
    tip: 'Loose, unpredictable phrasing — treat the rhythm almost like a lead line. The solo sections are straight E minor pentatonic, but play a little rough around the edges; over-cleanliness kills the character.',
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse', label: 'Verse', startBar: 5, endBar: 8 },
      { id: 'chorus', label: 'Chorus', startBar: 9, endBar: 12 },
      { id: 'solo', label: 'Solo (Pentatonic)', startBar: 13, endBar: 20, solo: true },
      { id: 'outro', label: 'Outro', startBar: 21, endBar: 22 },
    ],
    bars: makeBars(
      ['E', 'A', 'E', 'A', 'E', 'A', 'B', 'E', 'A', 'B', 'E', 'E', 'E', 'A', 'B', 'E', 'E', 'A', 'B', 'E', 'E', 'A'],
      {
        13: [{ string: 0, fret: 0, beat: 0, dur: 1 }, { string: 0, fret: 3, beat: 1, dur: 1 }, { string: 1, fret: 2, beat: 2, dur: 1 }, { string: 1, fret: 0, beat: 3, dur: 1, technique: 'vibrato' }],
        17: [{ string: 0, fret: 3, beat: 0, dur: 1, technique: 'bend', bendTo: 1 }, { string: 0, fret: 0, beat: 1, dur: 1 }, { string: 1, fret: 0, beat: 2, dur: 1 }, { string: 1, fret: 2, beat: 3, dur: 1, technique: 'vibrato' }],
      }
    ),
  },
  {
    id: 'black-napkins', title: 'Black Napkins', artist: 'Frank Zappa', playerTag: 'Zappa',
    key: 'Em', bpm: 92, timeSig: 4, difficulty: 3, defaultInstrument: 'crunch',
    soloScaleId: 'dorian', soloScaleKey: 'E', altScaleId: 'minpent', altScaleKey: 'E',
    tip: "A slow, spacious i–bVII vamp (Em to D) — Zappa's sustain and dynamics showcase. Let notes bloom and decay fully; this is about phrasing and tone, not speed.",
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'theme', label: 'Theme', startBar: 5, endBar: 8 },
      { id: 'solo', label: 'Solo (Dorian)', startBar: 9, endBar: 20, solo: true },
      { id: 'outro', label: 'Outro', startBar: 21, endBar: 22 },
    ],
    bars: makeBars(
      ['Em', 'D', 'Em', 'D', 'Em', 'D', 'C', 'D', 'Em', 'D', 'Em', 'D', 'Em', 'D', 'Em', 'D', 'Em', 'D', 'Em', 'D', 'Em', 'Em'],
      {
        9: [{ string: 0, fret: 0, beat: 0, dur: 2, technique: 'vibrato' }, { string: 0, fret: 2, beat: 2, dur: 1 }, { string: 0, fret: 3, beat: 3, dur: 1 }],
        13: [{ string: 1, fret: 0, beat: 0, dur: 1 }, { string: 1, fret: 2, beat: 1, dur: 1 }, { string: 1, fret: 4, beat: 2, dur: 1 }, { string: 1, fret: 5, beat: 3, dur: 1, technique: 'vibrato' }],
        17: [{ string: 0, fret: 7, beat: 0, dur: 1 }, { string: 0, fret: 9, beat: 1, dur: 1, technique: 'slide' }, { string: 0, fret: 10, beat: 2, dur: 1, technique: 'vibrato' }, { string: 0, fret: 0, beat: 3, dur: 1 }],
      }
    ),
  },
  {
    id: 'inca-roads', title: 'Inca Roads', artist: 'Frank Zappa', playerTag: 'Zappa',
    key: 'F', bpm: 120, timeSig: 4, difficulty: 5, defaultInstrument: 'clean',
    soloScaleId: 'mixo', soloScaleKey: 'F', altScaleId: 'majscl', altScaleKey: 'F',
    tip: "The solo section is a two-chord F–Eb Mixolydian vamp (I–bVII) — Zappa's signature move. Keep the phrasing floating and unpredictable rather than locking into the groove.",
    sections: [
      { id: 'head', label: 'Head', startBar: 1, endBar: 4 },
      { id: 'melody', label: 'Melody', startBar: 5, endBar: 12 },
      { id: 'vamp', label: 'Vamp / Solo (2-Chord)', startBar: 13, endBar: 20, solo: true },
      { id: 'outro', label: 'Outro', startBar: 21, endBar: 22 },
    ],
    bars: makeBars(
      ['F', 'Eb', 'F', 'Eb', 'F', 'Eb', 'Bb', 'F', 'F', 'Eb', 'Bb', 'F', 'F', 'Eb', 'F', 'Eb', 'F', 'Eb', 'F', 'Eb', 'F', 'Eb'],
      {
        13: [{ string: 0, fret: 1, beat: 0, dur: 1 }, { string: 0, fret: 3, beat: 1, dur: 1 }, { string: 0, fret: 5, beat: 2, dur: 1 }, { string: 0, fret: 6, beat: 3, dur: 1, technique: 'vibrato' }],
        17: [{ string: 0, fret: 8, beat: 0, dur: 1 }, { string: 0, fret: 10, beat: 1, dur: 1 }, { string: 0, fret: 11, beat: 2, dur: 1, technique: 'vibrato' }, { string: 0, fret: 1, beat: 3, dur: 1 }],
      }
    ),
  },
  {
    id: 'montana', title: 'Montana', artist: 'Frank Zappa', playerTag: 'Zappa',
    key: 'C', bpm: 132, timeSig: 4, difficulty: 5, defaultInstrument: 'clean',
    soloScaleId: 'lydian', soloScaleKey: 'C', altScaleId: 'mixo', altScaleKey: 'C',
    tip: "The marked Lydian section is the heart of it — the #4 (F#) gives Montana its floating, absurd brightness. Commit fully to the #4, don't resolve it early.",
    sections: [
      { id: 'intro', label: 'Intro', startBar: 1, endBar: 4 },
      { id: 'verse', label: 'Verse', startBar: 5, endBar: 12 },
      { id: 'lydian', label: 'Lydian Section', startBar: 13, endBar: 20, solo: true },
      { id: 'outro', label: 'Outro', startBar: 21, endBar: 24 },
    ],
    bars: makeBars(
      ['C', 'D', 'C', 'D', 'C', 'Bb', 'F', 'C', 'C', 'Bb', 'F', 'C', 'C', 'D', 'C', 'D', 'C', 'D', 'C', 'D', 'C', 'D', 'C', 'C'],
      {
        13: [{ string: 1, fret: 9, beat: 0, dur: 1, technique: 'vibrato' }, { string: 1, fret: 10, beat: 1, dur: 1 }, { string: 1, fret: 7, beat: 2, dur: 1 }, { string: 1, fret: 5, beat: 3, dur: 1 }],
        17: [{ string: 0, fret: 8, beat: 0, dur: 1 }, { string: 0, fret: 10, beat: 1, dur: 1 }, { string: 1, fret: 9, beat: 2, dur: 2, technique: 'vibrato' }],
      }
    ),
  },
];

// ── Guitar Pro import (future session) ──────────────────────────────────────
// A future GP5/GP7x parser only needs to build the object shape documented at
// the top of this file and hand it here — every renderer/playback function
// below works unmodified on either hardcoded or externally-parsed songs.
function registerExternalSong(song) {
  if (!song || !song.id) return;
  const idx = SONG_LIBRARY.findIndex(s => s.id === song.id);
  if (idx >= 0) SONG_LIBRARY[idx] = song; else SONG_LIBRARY.push(song);
  buildSongLibraryFilters();
  buildSongLibraryGrid();
}
async function loadGuitarProSongs() {
  // Future: fetch .gp/.gpx files from a /songs folder, parse each into the
  // shape above, and call registerExternalSong() per song. Intentionally
  // unimplemented until Guitar Pro support is built in a later session.
}

// ═══════════════════════════════════════════════════════════════════════════
// SONG GRID + FILTERS
// ═══════════════════════════════════════════════════════════════════════════
let songFilters = { artist: 'all', key: 'all', difficulty: 'all', scale: 'all' };

function diffTier(d) { return d <= 2 ? 'tier-easy' : d === 3 ? 'tier-mid' : 'tier-hard'; }
function diffDotsHTML(rating) {
  const tier = diffTier(rating);
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<div class="diff-dot${i <= rating ? ' filled ' + tier : ''}"></div>`;
  return out;
}

function buildSongLibraryFilters() {
  const artistSel = document.getElementById('songs-filter-artist');
  const keySel = document.getElementById('songs-filter-key');
  const scaleSel = document.getElementById('songs-filter-scale');
  if (!artistSel) return;
  const artists = [...new Set(SONG_LIBRARY.map(s => s.artist))].sort();
  const keys = [...new Set(SONG_LIBRARY.map(s => s.key))].sort();
  const scales = [...new Map(SONG_LIBRARY.map(s => [s.soloScaleId, ALL_SCALES.find(sc => sc.id === s.soloScaleId)])).entries()];

  artistSel.innerHTML = '<option value="all">All Artists</option>' + artists.map(a => `<option value="${a}">${a}</option>`).join('');
  keySel.innerHTML = '<option value="all">All Keys</option>' + keys.map(k => `<option value="${k}">${k}</option>`).join('');
  if (scaleSel) scaleSel.innerHTML = '<option value="all">All Scales</option>' + scales.map(([id, sc]) => `<option value="${id}">${sc ? sc.name : id}</option>`).join('');
}

function buildSongLibraryGrid() {
  const grid = document.getElementById('songs-grid');
  if (!grid) return;
  grid.innerHTML = '';
  SONG_LIBRARY.forEach(song => {
    const scale = ALL_SCALES.find(s => s.id === song.soloScaleId);
    const card = document.createElement('div');
    card.className = 'song-card';
    card.dataset.artist = song.artist;
    card.dataset.key = song.key;
    card.dataset.difficulty = song.difficulty;
    card.dataset.scale = song.soloScaleId;
    card.innerHTML = `
      <div class="song-card-title">${song.title}</div>
      <div class="song-card-artist">${song.artist}</div>
      <div class="song-card-meta">
        <span class="song-card-key">Key of ${song.key}</span>
        <span class="song-card-key">${song.bpm} BPM</span>
        ${scale ? `<span class="song-card-scale">${scale.name} · ${song.soloScaleKey}</span>` : ''}
      </div>
      <div class="song-card-diffdots">${diffDotsHTML(song.difficulty)}</div>
      <div class="song-card-coming">Click to open practice view</div>
    `;
    card.onclick = () => openSongPractice(song.id);
    grid.appendChild(card);
  });
}

function applySongFilters() {
  songFilters.artist = document.getElementById('songs-filter-artist').value;
  songFilters.key = document.getElementById('songs-filter-key').value;
  songFilters.difficulty = document.getElementById('songs-filter-difficulty').value;
  songFilters.scale = document.getElementById('songs-filter-scale').value;
  let visibleCount = 0;
  document.querySelectorAll('#songs-grid .song-card').forEach(card => {
    const matches =
      (songFilters.artist === 'all' || card.dataset.artist === songFilters.artist) &&
      (songFilters.key === 'all' || card.dataset.key === songFilters.key) &&
      (songFilters.difficulty === 'all' || card.dataset.difficulty === songFilters.difficulty) &&
      (songFilters.scale === 'all' || card.dataset.scale === songFilters.scale);
    card.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });
  const empty = document.getElementById('songs-filtered-empty');
  if (empty) empty.style.display = visibleCount ? 'none' : 'block';
}

function clearSongFilters() {
  ['songs-filter-artist', 'songs-filter-key', 'songs-filter-difficulty', 'songs-filter-scale'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = 'all';
  });
  applySongFilters();
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE VIEW — state
// ═══════════════════════════════════════════════════════════════════════════
const BAR_WIDTH = 110;
let songPracticeState = {
  song: null, view: 'both', speed: 1.0, customBpm: null, instrument: 'clean',
  running: false, loopStart: null, loopEnd: null, dragStartBar: null, dragging: false,
  lastBarNum: 0, tapTimes: [], sessionStartTime: null, accumulatedSeconds: 0,
};
let songTransportRef = null;
let songPart = null;
let songEndEventId = null;
let songRAF = null;
let songTapResetTimer = null;
let songSelfGradeChoices = {};
let songBarElements = {};

function getSongTransport() {
  getAudioCtx(); // ensures Tone context is set before Transport is fetched
  if (!songTransportRef) songTransportRef = Tone.getTransport();
  return songTransportRef;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPEN / CLOSE
// ═══════════════════════════════════════════════════════════════════════════
function openSongPractice(songId) {
  const song = SONG_LIBRARY.find(s => s.id === songId);
  if (!song) return;
  songTeardownPlayback();
  songPracticeState = { song, view: 'both', speed: 1.0, customBpm: null, instrument: song.defaultInstrument || 'clean', running: false, loopStart: null, loopEnd: null, dragStartBar: null, dragging: false, lastBarNum: 0, tapTimes: [], sessionStartTime: null, accumulatedSeconds: 0 };
  songSelfGradeChoices = {};

  document.getElementById('songs-filter-bar').style.display = 'none';
  document.getElementById('songs-grid').style.display = 'none';
  const empty = document.getElementById('songs-filtered-empty'); if (empty) empty.style.display = 'none';
  const view = document.getElementById('song-practice-view');
  view.style.display = '';

  renderSongPracticeShell();
  renderSongScroller();
  renderSongPracticeHistory();
  songUpdateOverlay(1);
  buildRelatedRiffCards(song);
  songSetupSampleLoadingUI();
  songEnsureInstrumentsLoaded(); // kick off loading immediately so it's likely done by the time Play is pressed
}

function closeSongPractice() {
  songTeardownPlayback();
  document.getElementById('song-practice-view').style.display = 'none';
  document.getElementById('songs-filter-bar').style.display = '';
  document.getElementById('songs-grid').style.display = '';
  applySongFilters();
}

function songTeardownPlayback() {
  if (songRAF) cancelAnimationFrame(songRAF);
  songRAF = null;
  if (songTransportRef) {
    songTransportRef.stop();
    songTransportRef.loop = false;
    if (songEndEventId !== null) { songTransportRef.clear(songEndEventId); songEndEventId = null; }
  }
  if (songPart) { songPart.stop(); songPart.dispose(); songPart = null; }
  if (typeof stopAllRingingSamples === 'function') stopAllRingingSamples();
}

// ═══════════════════════════════════════════════════════════════════════════
// SHELL — built dynamically so index.html only needs one empty container
// ═══════════════════════════════════════════════════════════════════════════
function renderSongPracticeShell() {
  const song = songPracticeState.song;
  const scale = ALL_SCALES.find(s => s.id === song.soloScaleId);
  const altScale = ALL_SCALES.find(s => s.id === song.altScaleId);
  const view = document.getElementById('song-practice-view');

  view.innerHTML = `
    <button class="song-back-btn" onclick="closeSongPractice()">← Back to Songs</button>
    <div class="song-practice-header">
      <div class="song-practice-title-row">
        <span class="song-practice-title">${song.title}</span>
        <span class="song-practice-artist">${song.artist}</span>
      </div>
      <div class="song-practice-meta">
        <span class="song-card-key">Key of ${song.key}</span>
        <span class="song-card-key">${song.bpm} BPM</span>
        <span class="song-card-scale">${scale ? scale.name : ''} · ${song.soloScaleKey}${altScale ? ` (alt: ${altScale.name})` : ''}</span>
        <div class="song-card-diffdots">${diffDotsHTML(song.difficulty)}</div>
      </div>
      <div class="song-practice-tip">${song.tip}</div>
    </div>

    <div class="song-transport-bar">
      <button class="game-btn game-btn-start" id="song-play-btn" onclick="songTogglePlay()">▶ PLAY</button>

      <div class="song-speed-row">
        <span class="song-transport-label">Speed</span>
        <button class="quiz-mode-btn song-speed-btn" data-speed="0.25" onclick="songSetSpeed(0.25,this)">0.25x</button>
        <button class="quiz-mode-btn song-speed-btn" data-speed="0.5" onclick="songSetSpeed(0.5,this)">0.5x</button>
        <button class="quiz-mode-btn song-speed-btn" data-speed="0.75" onclick="songSetSpeed(0.75,this)">0.75x</button>
        <button class="quiz-mode-btn song-speed-btn active" data-speed="1" onclick="songSetSpeed(1,this)">1.0x</button>
        <button class="game-btn game-btn-skip" onclick="songTapTempo()">Tap Tempo</button>
        <span class="song-bpm-readout" id="song-bpm-readout">${song.bpm} BPM</span>
        <span class="song-bpm-readout" id="song-bar-readout">Bar 1 / ${song.bars.length}</span>
      </div>

      <div class="song-view-toggle">
        <span class="song-transport-label">View</span>
        <button class="quiz-mode-btn song-view-btn" data-view="chord" onclick="songSetView('chord',this)">Chords</button>
        <button class="quiz-mode-btn song-view-btn" data-view="tab" onclick="songSetView('tab',this)">Tab</button>
        <button class="quiz-mode-btn song-view-btn active" data-view="both" onclick="songSetView('both',this)">Both</button>
      </div>

      <div class="song-loop-row">
        <span class="song-transport-label">Loop</span>
        <span class="song-loop-status" id="song-loop-status">Drag across the bars below to select a loop range</span>
        <button class="game-btn game-btn-skip" onclick="songClearLoop()">Clear Loop</button>
      </div>

      <button class="game-btn game-btn-skip" onclick="songFinishAndReview()">🏁 Finish &amp; Review</button>
    </div>

    <div class="song-transport-bar" style="gap:16px">
      <div style="display:flex;gap:5px;align-items:center">
        <span class="song-transport-label">Instrument</span>
        <select id="song-instrument-select" onchange="songSetInstrument(this.value)"
          style="background:#1a1a1a;color:#ccc;border:1px solid #333;padding:4px 8px;font-size:9px;font-family:'Courier New',monospace">
          <option value="clean"${(song.defaultInstrument || 'clean') === 'clean' ? ' selected' : ''}>Electric — Clean</option>
          <option value="crunch"${song.defaultInstrument === 'crunch' ? ' selected' : ''}>Electric — Crunch</option>
          <option value="acoustic"${song.defaultInstrument === 'acoustic' ? ' selected' : ''}>Acoustic</option>
          <option value="bass"${song.defaultInstrument === 'bass' ? ' selected' : ''}>Bass</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="song-transport-label">Room</span>
        <input type="range" id="song-room-slider" min="0" max="100" value="25" style="width:90px" oninput="songSetRoom(this.value)">
      </div>
      <span style="font-family:Arial,sans-serif;font-size:9px;color:#ccb84a;display:none" id="song-sample-loading"></span>
    </div>

    <div class="song-scroller-wrap" id="song-scroller-wrap">
      <div class="song-scroller view-both" id="song-scroller">
        <div class="song-markers-row" id="song-markers-row"></div>
        <div class="song-bars-row" id="song-bars-row"></div>
        <div class="song-playhead" id="song-playhead" style="left:0"></div>
      </div>
    </div>

    <div class="song-overlay-row">
      <div class="song-overlay-chord-panel">
        <div class="song-overlay-chord-block">
          <div class="song-overlay-chord-caption">Now</div>
          <canvas class="game-chord-canvas" id="song-overlay-cur-canvas" width="90" height="115"></canvas>
          <div class="song-overlay-chord-name" id="song-overlay-cur-name">—</div>
        </div>
        <div class="song-overlay-chord-block is-next">
          <div class="song-overlay-chord-caption">Next</div>
          <canvas class="game-chord-canvas" id="song-overlay-next-canvas" width="80" height="100"></canvas>
          <div class="song-overlay-chord-name" id="song-overlay-next-name">—</div>
        </div>
      </div>
      <div class="song-overlay-scale-panel">
        <div class="song-overlay-scale-label" id="song-overlay-scale-label">—</div>
        <div class="song-overlay-fretboard-wrap fretboard-wrap">
          <div class="fretboard" id="song-overlay-fretboard"><div class="nut"></div></div>
        </div>
      </div>
    </div>

    <div class="song-selfgrade-panel" id="song-selfgrade-panel" style="display:none">
      <h3>How did that go?</h3>
      <div id="song-selfgrade-rows"></div>
      <textarea class="song-selfgrade-notes" id="song-selfgrade-notes" placeholder="What specifically to work on next time..."></textarea>
      <div class="song-selfgrade-actions">
        <button class="game-btn game-btn-start" onclick="songSaveSelfGrade()">💾 Save Practice Notes</button>
        <span class="song-selfgrade-saved-msg" id="song-selfgrade-saved-msg"></span>
      </div>
      <div class="song-history-block" id="song-history-block"></div>
    </div>

    <div class="song-section" style="background:#111;border:1px solid #222;padding:16px">
      <h3 style="font-family:Arial,sans-serif;font-size:10px;color:#fff;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid #222;padding-bottom:6px;margin-bottom:12px">Practice Riffs In This Style</h3>
      <div class="riff-grid" id="song-related-riffs"></div>
    </div>
  `;

  renderSongSelfGradeRows();
}

// ═══════════════════════════════════════════════════════════════════════════
// SCROLLER — bar columns, markers, playhead, drag-to-loop
// ═══════════════════════════════════════════════════════════════════════════
function renderSongScroller() {
  const song = songPracticeState.song;
  const totalBars = song.bars.length;
  const markersRow = document.getElementById('song-markers-row');
  const barsRow = document.getElementById('song-bars-row');
  const totalWidth = totalBars * BAR_WIDTH;
  markersRow.style.width = totalWidth + 'px';
  barsRow.style.width = totalWidth + 'px';
  markersRow.innerHTML = '';
  barsRow.innerHTML = '';
  songBarElements = {};

  song.sections.forEach(sec => {
    const chip = document.createElement('div');
    chip.className = 'song-marker-chip';
    chip.style.left = ((sec.startBar - 1) * BAR_WIDTH) + 'px';
    chip.style.width = ((sec.endBar - sec.startBar + 1) * BAR_WIDTH - 2) + 'px';
    chip.style.background = sectionColor(sec.label);
    chip.textContent = sec.label;
    chip.title = `Jump to ${sec.label} (bar ${sec.startBar})`;
    chip.onclick = () => songSeekToBar(sec.startBar);
    markersRow.appendChild(chip);
  });

  song.bars.forEach(bar => {
    const col = document.createElement('div');
    col.className = 'song-bar-col';
    col.style.width = BAR_WIDTH + 'px';
    col.dataset.bar = bar.bar;
    col.innerHTML = `
      <div class="song-bar-num">${bar.bar}</div>
      <div class="song-bar-chord">${bar.chord}</div>
      <div class="song-bar-tab">
        ${[0, 1, 2, 3, 4, 5].map(row => `<div class="song-tab-string-line" style="top:${row * 16 + 6}px"></div>`).join('')}
        ${bar.notes.map(n => {
          const left = (n.beat / song.timeSig) * 100;
          const top = (5 - n.string) * 16 + 6;
          const cls = n.technique === 'bend' ? ' technique-bend' : n.technique === 'vibrato' ? ' technique-vibrato' : '';
          return `<div class="song-tab-note${cls}" style="left:${left}%;top:${top}px" title="${STRING_LABELS[n.string]} string, fret ${n.fret}">${n.fret}</div>`;
        }).join('')}
      </div>
    `;
    col.addEventListener('mousedown', () => songLoopDragStart(bar.bar));
    col.addEventListener('mouseenter', () => songLoopDragOver(bar.bar));
    barsRow.appendChild(col);
    songBarElements[bar.bar] = col;
  });

  document.removeEventListener('mouseup', songLoopDragEnd);
  document.addEventListener('mouseup', songLoopDragEnd);
  applySongViewClass();
}

function applySongViewClass() {
  const scroller = document.getElementById('song-scroller');
  if (scroller) scroller.className = 'song-scroller view-' + songPracticeState.view;
}
function songSetView(view, btn) {
  songPracticeState.view = view;
  document.querySelectorAll('.song-view-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applySongViewClass();
}

// ── Drag-to-loop ─────────────────────────────────────────────────────────
function songLoopDragStart(barNum) {
  songPracticeState.dragging = true;
  songPracticeState.dragStartBar = barNum;
  songRenderLoopPreview(barNum, barNum);
}
function songLoopDragOver(barNum) {
  if (!songPracticeState.dragging) return;
  songRenderLoopPreview(songPracticeState.dragStartBar, barNum);
}
function songLoopDragEnd() {
  if (!songPracticeState.dragging) return;
  songPracticeState.dragging = false;
  const a = songPracticeState.dragStartBar, b = songPracticeState.lastDragBar || a;
  const start = Math.min(a, b), end = Math.max(a, b);
  if (start === end) { songClearLoop(); return; }
  songPracticeState.loopStart = start;
  songPracticeState.loopEnd = end;
  const t = getSongTransport();
  t.setLoopPoints(`${start - 1}:0:0`, `${end}:0:0`);
  t.loop = true;
  const status = document.getElementById('song-loop-status');
  if (status) { status.textContent = `Looping bars ${start}–${end}`; status.classList.add('loop-active'); }
  songHighlightLoopBars();
}
function songRenderLoopPreview(a, b) {
  songPracticeState.lastDragBar = b;
  const start = Math.min(a, b), end = Math.max(a, b);
  Object.entries(songBarElements).forEach(([barNum, el]) => {
    el.classList.toggle('loop-region', +barNum >= start && +barNum <= end);
  });
}
function songHighlightLoopBars() {
  const { loopStart, loopEnd } = songPracticeState;
  Object.entries(songBarElements).forEach(([barNum, el]) => {
    el.classList.toggle('loop-region', loopStart != null && +barNum >= loopStart && +barNum <= loopEnd);
  });
}
function songClearLoop() {
  songPracticeState.loopStart = null;
  songPracticeState.loopEnd = null;
  if (songTransportRef) songTransportRef.loop = false;
  const status = document.getElementById('song-loop-status');
  if (status) { status.textContent = 'Drag across the bars below to select a loop range'; status.classList.remove('loop-active'); }
  Object.values(songBarElements).forEach(el => el.classList.remove('loop-region'));
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYBACK ENGINE — Tone.Transport + Tone.Part, tempo-scaled, pitch-correct
// ═══════════════════════════════════════════════════════════════════════════
function songBeatsToSeconds(beats) {
  const bpm = getSongTransport().bpm.value;
  return beats * (60 / bpm);
}

function songBarPosition(barIdx0, beat) {
  const whole = Math.floor(beat);
  const sixteenths = Math.round((beat - whole) * 4);
  return `${barIdx0}:${whole}:${sixteenths}`;
}

function songPartCallback(time, ev) {
  const vol = parseInt(document.getElementById('vol-slider')?.value || '60') / 100;
  const leadInstrument = songPracticeState.instrument || 'clean';
  const barDurSec = songBeatsToSeconds(songPracticeState.song.timeSig);
  if (ev.type === 'bass') {
    const chord = GAME_CHORDS[ev.chord];
    if (!chord) return;
    const si = chord.f.findIndex(f => f >= 0);
    if (si >= 0) playSampledNote('bass', time, fretToHz(si, chord.f[si]) / 2, barDurSec * 0.95, vol * 0.9, { stringIdx: 'bass' });
  } else if (ev.type === 'chord') {
    const chord = GAME_CHORDS[ev.chord];
    if (!chord) return;
    chord.f.forEach((f, si) => { if (f >= 0) playSampledNote(leadInstrument, time + si * 0.02, fretToHz(si, f), barDurSec * 0.9, vol * 0.55, { stringIdx: si }); });
  } else if (ev.type === 'note') {
    const freq = fretToHz(ev.string, ev.fret);
    const durSec = songBeatsToSeconds(ev.dur);
    playSampledNote(leadInstrument, time, freq, durSec, vol * 0.85, {
      technique: ev.technique, bendTo: ev.bendTo, fromFreq: ev.fromFreq, stringIdx: ev.string,
    });
  }
}

function songBuildPart() {
  const song = songPracticeState.song;
  const t = getSongTransport();
  t.timeSignature = song.timeSig;
  const bpm = songPracticeState.customBpm || Math.round(song.bpm * songPracticeState.speed);
  t.bpm.value = bpm;

  const events = [];
  song.bars.forEach(bar => {
    const barIdx0 = bar.bar - 1;
    events.push({ time: `${barIdx0}:0:0`, type: 'bass', chord: bar.chord });
    events.push({ time: `${barIdx0}:0:0`, type: 'chord', chord: bar.chord });
    bar.notes.forEach((n, ni) => {
      const ev = { time: songBarPosition(barIdx0, n.beat), type: 'note', string: n.string, fret: n.fret, dur: n.dur, technique: n.technique, bendTo: n.bendTo };
      if (n.technique === 'slide' && ni > 0) {
        const prev = bar.notes[ni - 1];
        ev.fromFreq = fretToHz(prev.string, prev.fret);
      }
      events.push(ev);
    });
  });

  songPart = new Tone.Part((time, ev) => songPartCallback(time, ev), events);
  songPart.start(0);

  const totalBars = song.bars.length;
  songEndEventId = t.scheduleOnce(() => songHandleEnd(), `${totalBars}:0:0`);
}

// ── Sample loading orchestration (bass + whichever lead instrument is selected) ──
function songEnsureInstrumentsLoaded() {
  return Promise.all([
    ensureInstrumentReady('bass'),
    ensureInstrumentReady(songPracticeState.instrument || 'clean'),
  ]);
}

let songSampleLoadingUIRegistered = false;
function songSetupSampleLoadingUI() {
  if (songSampleLoadingUIRegistered) return;
  songSampleLoadingUIRegistered = true;
  onSampleLoadingChange((isLoading, label) => {
    const el = document.getElementById('song-sample-loading');
    if (!el) return;
    el.textContent = isLoading ? `🎸 Loading ${label} samples…` : '';
    el.style.display = isLoading ? '' : 'none';
  });
}

function songSetInstrument(key) {
  songPracticeState.instrument = key;
  songEnsureInstrumentsLoaded();
}

function songSetRoom(amount) {
  setSampleRoomAmount(amount / 100);
}

function applySongTempo() {
  const song = songPracticeState.song;
  if (!song) return;
  const bpm = songPracticeState.customBpm || Math.round(song.bpm * songPracticeState.speed);
  const t = getSongTransport();
  t.bpm.rampTo(bpm, 0.15);
  const slider = document.getElementById('bpm-slider');
  if (slider) { slider.value = Math.min(200, Math.max(40, bpm)); const v = document.getElementById('bpm-val'); if (v) v.textContent = slider.value; }
  const readout = document.getElementById('song-bpm-readout');
  if (readout) readout.textContent = `${bpm} BPM`;
}

function songSetSpeed(mult, btn) {
  songPracticeState.speed = mult;
  songPracticeState.customBpm = null;
  document.querySelectorAll('.song-speed-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applySongTempo();
}

function songTapTempo() {
  const now = Date.now();
  songPracticeState.tapTimes.push(now);
  if (songPracticeState.tapTimes.length > 5) songPracticeState.tapTimes.shift();
  clearTimeout(songTapResetTimer);
  songTapResetTimer = setTimeout(() => { songPracticeState.tapTimes = []; }, 2000);
  if (songPracticeState.tapTimes.length < 2) return;
  const intervals = [];
  for (let i = 1; i < songPracticeState.tapTimes.length; i++) intervals.push(songPracticeState.tapTimes[i] - songPracticeState.tapTimes[i - 1]);
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60000 / avgMs);
  if (bpm >= 30 && bpm <= 300) {
    songPracticeState.customBpm = bpm;
    document.querySelectorAll('.song-speed-btn').forEach(b => b.classList.remove('active'));
    applySongTempo();
  }
}

async function songTogglePlay() {
  const btn = document.getElementById('song-play-btn');
  const t = getSongTransport();
  if (songPracticeState.running) {
    t.pause();
    songPracticeState.running = false;
    songPracticeState.accumulatedSeconds += (Date.now() - songPracticeState.sessionStartTime) / 1000;
    if (songRAF) cancelAnimationFrame(songRAF);
    btn.textContent = '▶ PLAY'; btn.classList.remove('running');
  } else {
    btn.disabled = true;
    btn.textContent = '… loading';
    await songEnsureInstrumentsLoaded();
    btn.disabled = false;
    if (!songPart) songBuildPart();
    applySongTempo();
    t.start();
    songPracticeState.running = true;
    songPracticeState.sessionStartTime = Date.now();
    btn.textContent = '❚❚ PAUSE'; btn.classList.add('running');
    songUpdatePlayhead();
  }
}

function songHandleEnd() {
  const t = getSongTransport();
  t.pause();
  songPracticeState.running = false;
  songPracticeState.accumulatedSeconds += (Date.now() - songPracticeState.sessionStartTime) / 1000;
  const btn = document.getElementById('song-play-btn');
  if (btn) { btn.textContent = '▶ PLAY'; btn.classList.remove('running'); }
  t.position = '0:0:0';
  songPracticeState.lastBarNum = 0;
  songUpdatePlayheadOnce();
  songFinishAndReview();
}

function songSeekToBar(barNum) {
  const t = getSongTransport();
  const wasRunning = songPracticeState.running;
  if (!songPart) songBuildPart();
  t.position = `${barNum - 1}:0:0`;
  songPracticeState.lastBarNum = 0; // force overlay/playhead refresh next tick
  if (!wasRunning) songUpdatePlayheadOnce();
}

// ── Playhead sync (rAF, tick-based so bpm changes never desync pixel math) ──
function songUpdatePlayheadOnce() {
  const t = getSongTransport();
  const ticksPerBar = t.PPQ * songPracticeState.song.timeSig;
  const fractionalBar = t.ticks / ticksPerBar;
  songApplyPlayhead(fractionalBar);
}
function songUpdatePlayhead() {
  if (!songPracticeState.running) return;
  songUpdatePlayheadOnce();
  songRAF = requestAnimationFrame(songUpdatePlayhead);
}
function songApplyPlayhead(fractionalBar) {
  const px = fractionalBar * BAR_WIDTH;
  const playhead = document.getElementById('song-playhead');
  if (playhead) playhead.style.left = px + 'px';
  const wrap = document.getElementById('song-scroller-wrap');
  if (wrap) wrap.scrollLeft = Math.max(0, px - wrap.clientWidth * 0.25);

  const barNum = Math.floor(fractionalBar) + 1;
  if (barNum !== songPracticeState.lastBarNum) {
    songPracticeState.lastBarNum = barNum;
    Object.entries(songBarElements).forEach(([b, el]) => el.classList.toggle('current-bar', +b === barNum));
    songUpdateOverlay(barNum);
    const barReadout = document.getElementById('song-bar-readout');
    if (barReadout) barReadout.textContent = `Bar ${barNum} / ${songPracticeState.song.bars.length}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE OVERLAY — chord diagrams (GAME_CHORDS) + scale/fretboard (scales.js)
// ═══════════════════════════════════════════════════════════════════════════
function songUpdateOverlay(barNum) {
  const song = songPracticeState.song;
  const bar = song.bars.find(b => b.bar === barNum) || song.bars[0];
  const nextBar = song.bars.find(b => b.bar === barNum + 1) || song.bars[0];
  if (!bar) return;

  const curCanvas = document.getElementById('song-overlay-cur-canvas');
  const nextCanvas = document.getElementById('song-overlay-next-canvas');
  if (curCanvas && GAME_CHORDS[bar.chord]) drawGameChord(curCanvas, bar.chord, 90);
  if (nextCanvas && GAME_CHORDS[nextBar.chord]) drawGameChord(nextCanvas, nextBar.chord, 80);
  const curName = document.getElementById('song-overlay-cur-name'); if (curName) curName.textContent = bar.chord;
  const nextName = document.getElementById('song-overlay-next-name'); if (nextName) nextName.textContent = nextBar.chord;

  const section = song.sections.find(s => barNum >= s.startBar && barNum <= s.endBar) || song.sections[0];
  const scaleLabelEl = document.getElementById('song-overlay-scale-label');
  const fbContainer = document.getElementById('song-overlay-fretboard');
  if (!fbContainer) return;

  if (section && section.solo) {
    const scale = ALL_SCALES.find(s => s.id === song.soloScaleId);
    if (scaleLabelEl) {
      scaleLabelEl.classList.remove('chord-mode');
      scaleLabelEl.textContent = `${section.label} — solo over ${scale.name} (${song.soloScaleKey})`;
    }
    const boxNotes = getBoxNotes(song.soloScaleKey, scale.intervals, 0);
    const boxMap = {}; boxNotes.forEach(n => boxMap[`${n.string}-${n.fret}`] = n);
    const allNotes = allScaleFrets(song.soloScaleKey, scale.intervals);
    const allMap = {}; allNotes.forEach(n => allMap[`${n.string}-${n.fret}`] = n);
    buildFretGrid(fbContainer, (cell, dot, si, f) => {
      const k = `${si}-${f}`, bn = boxMap[k], an = allMap[k];
      if (bn) { dot.classList.add(`order-${bn.order}`); dot.textContent = bn.note; }
      else if (an) { dot.classList.add('scale-note'); dot.textContent = an.note; }
      else dot.classList.add('empty');
    }, 15);
  } else {
    if (scaleLabelEl) {
      scaleLabelEl.classList.add('chord-mode');
      scaleLabelEl.textContent = `${section ? section.label : ''} — chord tones for ${bar.chord}`;
    }
    const chord = GAME_CHORDS[bar.chord];
    const chordFretMap = {};
    if (chord) chord.f.forEach((f, si) => { if (f >= 0) chordFretMap[`${si}-${f}`] = true; });
    buildFretGrid(fbContainer, (cell, dot, si, f) => {
      if (chordFretMap[`${si}-${f}`]) { dot.classList.add('chord-dot', 'chord-root'); dot.textContent = noteAt(STRINGS[si], f); }
      else dot.classList.add('empty');
    }, 15);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SELF-GRADE + SAVE (recordSongSession — same tracker as game.js/listenrepeat.js)
// ═══════════════════════════════════════════════════════════════════════════
function songFinishAndReview() {
  if (songTransportRef && songPracticeState.running) {
    songTransportRef.pause();
    songPracticeState.running = false;
    songPracticeState.accumulatedSeconds += (Date.now() - songPracticeState.sessionStartTime) / 1000;
    if (songRAF) cancelAnimationFrame(songRAF);
    const btn = document.getElementById('song-play-btn');
    if (btn) { btn.textContent = '▶ PLAY'; btn.classList.remove('running'); }
  }
  document.getElementById('song-selfgrade-panel').style.display = '';
  document.getElementById('song-selfgrade-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSongSelfGradeRows() {
  const song = songPracticeState.song;
  const rows = document.getElementById('song-selfgrade-rows');
  rows.innerHTML = song.sections.map(sec => `
    <div class="song-selfgrade-row">
      <span class="song-selfgrade-label">${sec.label} (bars ${sec.startBar}–${sec.endBar})</span>
      <button class="game-btn game-btn-got song-selfgrade-btn" data-sec="${sec.id}" data-grade="clean" onclick="songGradeSection('${sec.id}','clean',this)">✓ Clean</button>
      <button class="game-btn game-btn-missed song-selfgrade-btn" data-sec="${sec.id}" data-grade="needsWork" onclick="songGradeSection('${sec.id}','needsWork',this)">△ Needs Work</button>
    </div>
  `).join('');
}

function songGradeSection(sectionId, grade, btn) {
  songSelfGradeChoices[sectionId] = grade;
  document.querySelectorAll(`.song-selfgrade-btn[data-sec="${sectionId}"]`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function songSaveSelfGrade() {
  const song = songPracticeState.song;
  const results = {};
  song.sections.forEach(s => { if (songSelfGradeChoices[s.id]) results[s.id] = { grade: songSelfGradeChoices[s.id], label: s.label }; });
  const note = document.getElementById('song-selfgrade-notes').value;
  const elapsed = songPracticeState.accumulatedSeconds;
  recordSongSession(song.id, song.title, results, note, elapsed);
  songPracticeState.accumulatedSeconds = 0;
  document.getElementById('song-selfgrade-notes').value = '';
  const msg = document.getElementById('song-selfgrade-saved-msg');
  if (msg) { msg.textContent = 'Saved ✓'; setTimeout(() => { msg.textContent = ''; }, 2500); }
  renderSongPracticeHistory();
}

function renderSongPracticeHistory() {
  const song = songPracticeState.song;
  const block = document.getElementById('song-history-block');
  if (!block) return;
  const data = loadProgress().songs[song.id];
  if (!data) { block.innerHTML = 'No practice history yet for this song.'; return; }
  const lastPlayed = data.lastPlayed ? new Date(data.lastPlayed).toLocaleDateString() : '—';
  const sectionRows = Object.entries(data.sections || {}).map(([id, s]) =>
    `<div class="song-history-row"><span>${s.label || id}</span><span>${s.clean} clean · ${s.needsWork} needs work</span></div>`
  ).join('');
  block.innerHTML = `
    <div class="song-history-row"><span>Sessions saved</span><span>${data.plays}</span></div>
    <div class="song-history-row"><span>Last practiced</span><span>${lastPlayed}</span></div>
    ${sectionRows}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// RELATED RIFFS — pulled live from RIFF_LIBRARY by player tag, no duplication
// ═══════════════════════════════════════════════════════════════════════════
function relatedRiffsForSong(song, limit) {
  limit = limit || 3;
  const matches = [];
  RIFF_LIBRARY.forEach((group, gi) => {
    group.riffs.forEach((riff, ri) => {
      if ((riff.player || []).includes(song.playerTag)) {
        matches.push({ gi, ri, riff, scaleName: group.scaleName, sameKey: norm(riff.key) === norm(song.soloScaleKey || song.key) });
      }
    });
  });
  matches.sort((a, b) => (b.sameKey ? 1 : 0) - (a.sameKey ? 1 : 0));
  return matches.slice(0, limit);
}

let activeSongRiffPlayers = {};

function buildRelatedRiffCards(song) {
  const container = document.getElementById('song-related-riffs');
  if (!container) return;
  Object.keys(activeSongRiffPlayers).forEach(id => stopSongRiffPlay(id));
  container.innerHTML = '';
  const related = relatedRiffsForSong(song);
  if (!related.length) {
    container.innerHTML = '<div class="riff-description">No related practice riffs tagged for this style yet.</div>';
    return;
  }
  related.forEach(({ gi, ri, riff, scaleName }) => {
    const riffKey = `${song.id}-${gi}-${ri}`;
    const card = document.createElement('div');
    card.className = 'riff-card';
    const techList = riff.techniques.map(t => `<span class="technique">${t}</span>`).join(' · ');
    card.innerHTML = `
      <div class="riff-card-header">
        <div>
          <div class="riff-card-title">${riff.title}</div>
          <div class="riff-card-meta">Key of ${riff.key} · ${scaleName}</div>
        </div>
        <button class="riff-play-btn" id="song-riff-btn-${riffKey}" onclick="toggleSongRiffPlay('${riffKey}', ${gi}, ${ri})">▶ Play</button>
      </div>
      <div class="riff-tab-display">${riff.tab}</div>
      <div class="riff-description"><div style="margin-bottom:4px">${techList}</div>${riff.description}</div>
    `;
    container.appendChild(card);
  });
}

function toggleSongRiffPlay(riffKey, gi, ri) {
  if (activeSongRiffPlayers[riffKey]) { stopSongRiffPlay(riffKey); return; }
  Object.keys(activeSongRiffPlayers).forEach(id => stopSongRiffPlay(id));
  startSongRiffPlay(riffKey, gi, ri);
}

async function startSongRiffPlay(riffKey, gi, ri) {
  const riff = RIFF_LIBRARY[gi].riffs[ri];
  const btn = document.getElementById(`song-riff-btn-${riffKey}`);
  const vol = parseInt(document.getElementById('vol-slider').value) / 100;
  const instrument = songPracticeState.instrument || 'clean'; // same lead voice as the song itself

  getAudioCtx();
  activeSongRiffPlayers[riffKey] = true;
  btn.textContent = '… loading'; btn.classList.add('playing');
  await ensureInstrumentReady(instrument);
  if (!activeSongRiffPlayers[riffKey]) return; // stopped while samples were loading
  btn.textContent = '■ Stop';

  let noteIdx = 0, loopCount = 0;

  function playNext() {
    if (!activeSongRiffPlayers[riffKey]) return;
    if (noteIdx >= riff.notes.length) {
      noteIdx = 0; loopCount++;
      if (loopCount >= 3) { stopSongRiffPlay(riffKey); return; }
    }
    const note = riff.notes[noteIdx];
    const dur = note.dur;
    const ctx = getAudioCtx();
    const freq = fretToHz(note.si, note.f);
    const technique = note.t; // 'bend' | 'vibrato' | undefined (plain pick)
    const noteVol = technique === 'bend' ? vol * 0.9 : technique === 'vibrato' ? vol * 0.85 : vol * 0.75;

    playSampledNote(instrument, ctx.currentTime, freq, dur / 1000, noteVol, {
      technique, bendTo: note.bendTo, stringIdx: note.si,
    });

    noteIdx++;
    activeSongRiffPlayers[riffKey] = setTimeout(playNext, dur);
  }

  playNext();
}

function stopSongRiffPlay(riffKey) {
  if (activeSongRiffPlayers[riffKey]) {
    clearTimeout(activeSongRiffPlayers[riffKey]);
    delete activeSongRiffPlayers[riffKey];
  }
  const btn = document.getElementById(`song-riff-btn-${riffKey}`);
  if (btn) { btn.textContent = '▶ Play'; btn.classList.remove('playing'); }
}

// ── Init ──────────────────────────────────────────────────────────────────
buildSongLibraryFilters();
buildSongLibraryGrid();
