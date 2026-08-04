// ═══════════════════════════════════════════════════════════════════════════
// SONGS MODE — song library, filters, and a Songsterr-style synced practice
// player: scrolling chord/tab track, tempo-scaled sample playback (pitch-correct
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
// ── Three real, full-length parts per song ──────────────────────────────────
// Every song has three independently selectable, full-song-length parts —
// Rhythm Guitar, Lead/Solo Guitar, Bass — not a single lead line over an
// auto-generated backing wash. We have no access to the actual studio
// recordings, so none of this claims to be a note-for-note audio transcription
// (same spirit as the existing riff library) — but every part is real,
// continuous, idiomatic content for that instrument, not a repeated chord-name
// placeholder:
//   - Lead/Solo is hand-written note-by-note for the whole song (intro hooks,
//     verse fills, the full solo, outro figures) — this is the expressive/
//     melodic content that can't be derived from a chord chart.
//   - Rhythm and Bass are generated at render/playback time from the song's
//     real per-bar chord chart (`chords`) plus a named strum/bass-line feel
//     (`rhythmFeel`/`bassFeel`) — the same way a working musician reads
//     "steady downstrokes" or "walking bass" off a chart rather than needing
//     every single strum hand-transcribed. Chord voicings come straight from
//     GAME_CHORDS (game.js), so every rhythm/bass note is a real, correctly
//     fretted tone for that chord — see RHYTHM_FEELS/BASS_FEELS below.
//
// ── Data shape (kept deliberately GP-parser-ready) ─────────────────────────
// Every renderer/playback function below consumes exactly this shape:
//   { id, title, artist, playerTag, key, bpm, timeSig, difficulty (1-5),
//     defaultInstrument, soloScaleId, soloScaleKey, altScaleId, altScaleKey, tip,
//     sections: [{ id, label, startBar, endBar, solo? }],
//     chords: ['Dm', 'C', ...],              // one chord name per bar
//     rhythmFeel: 'fingerstyle'|'sparse'|'medium'|'driving',
//     bassFeel: 'roots'|'rootfifth'|'walking'|'pulse8',
//     leadBars: { 1: [{ string, fret, beat, dur, technique?, bendTo? }], ... } }
// A future Guitar Pro file parser only needs to produce this same object and
// hand it to registerExternalSong() — nothing else in this file changes.
// ═══════════════════════════════════════════════════════════════════════════

// ── Rhythm/Bass generation (see file header) ────────────────────────────────
function chordTones(chordName) {
  const shape = GAME_CHORDS[chordName];
  if (!shape) return [];
  return shape.f.map((f, si) => ({ string: si, fret: f })).filter(t => t.fret >= 0);
}

const RHYTHM_FEELS = {
  // Thumb on the root (beats 0 & 2), fingers pick the upper chord tones on top —
  // Knopfler-style fingerstyle comping.
  fingerstyle: (chordName) => {
    const tones = chordTones(chordName);
    if (!tones.length) return [];
    const [bass, ...upper] = tones;
    const notes = [{ ...bass, beat: 0, dur: 1.6 }, { ...bass, beat: 2, dur: 1.6 }];
    upper.forEach((t, i) => { notes.push({ ...t, beat: 1 + i * 0.12, dur: 0.7 }); notes.push({ ...t, beat: 3 + i * 0.12, dur: 0.7 }); });
    return notes;
  },
  // One long sustained chord for the whole bar — slow, spacious songs.
  sparse: (chordName) => chordTones(chordName).map((t, i) => ({ ...t, beat: i * 0.015, dur: 3.8 })),
  // Two chord hits, beats 0 and 2 — generic mid-density strum.
  medium: (chordName) => {
    const tones = chordTones(chordName);
    const notes = [];
    tones.forEach((t, i) => notes.push({ ...t, beat: i * 0.012, dur: 1.7 }));
    tones.forEach((t, i) => notes.push({ ...t, beat: 2 + i * 0.012, dur: 1.7 }));
    return notes;
  },
  // Steady palm-muted 8th-note strums, muted "chuck" on the off-beats.
  driving: (chordName) => {
    const tones = chordTones(chordName);
    const notes = [];
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((b, i) => {
      tones.forEach((t, j) => notes.push({ ...t, beat: b + j * 0.008, dur: i % 2 === 0 ? 0.42 : 0.28, technique: i % 2 === 1 ? 'mute' : undefined }));
    });
    return notes;
  },
};

const BASS_FEELS = {
  roots: (chordName) => { const t = chordTones(chordName)[0]; return t ? [{ ...t, beat: 0, dur: 3.8 }] : []; },
  rootfifth: (chordName) => {
    const root = chordTones(chordName)[0];
    if (!root) return [];
    return [{ ...root, beat: 0, dur: 1.8 }, { string: root.string, fret: root.fret + 7, beat: 2, dur: 1.8 }];
  },
  pulse8: (chordName) => {
    const root = chordTones(chordName)[0];
    return root ? [0, 1, 2, 3].map(b => ({ ...root, beat: b, dur: 0.8 })) : [];
  },
  // Root, major-3rd-ish passing tone, 5th, b7 passing tone leading into the next chord.
  walking: (chordName) => {
    const root = chordTones(chordName)[0];
    if (!root) return [];
    return [
      { string: root.string, fret: root.fret, beat: 0, dur: 0.85 },
      { string: root.string, fret: root.fret + 4, beat: 1, dur: 0.85 },
      { string: root.string, fret: root.fret + 7, beat: 2, dur: 0.85 },
      { string: root.string, fret: root.fret + 10, beat: 3, dur: 0.85 },
    ];
  },
};

const SONG_PARTS = { rhythm: 'Rhythm Guitar', lead: 'Lead / Solo', bass: 'Bass' };

function getPartBarNotes(song, part, barIdx0) {
  const chordName = song.chords[barIdx0];
  if (part === 'rhythm') return (RHYTHM_FEELS[song.rhythmFeel] || RHYTHM_FEELS.medium)(chordName);
  if (part === 'bass') return (BASS_FEELS[song.bassFeel] || BASS_FEELS.roots)(chordName);
  if (part === 'lead') return (song.leadBars && song.leadBars[barIdx0 + 1]) || [];
  return [];
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
  // DELIBERATELY EMPTY.
  //
  // Ten hand-written songs used to live here (Sultans of Swing, Maggot Brain,
  // Black Napkins, …). They were stylistically-composed approximations, not
  // transcriptions — the chord charts and lead lines were written to sound
  // plausible for the artist rather than to match the record. That is worse
  // than having no songs at all: an inaccurate chart teaches the wrong notes
  // and you practise the mistake until it is muscle memory.
  //
  // Songs now come from Guitar Pro files you import (see js/upload.js and the
  // empty state in buildSongLibraryGrid). Those are note-for-note
  // transcriptions made by guitarists listening to the actual recording, and
  // are the only source accurate enough to practise from.
  //
  // If you want the old data back for reference it is in git history at
  // 5b5ef50 and earlier.
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

function playerSlug(tag) {
  return (tag || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildSongLibraryGrid() {
  const grid = document.getElementById('songs-grid');
  if (!grid) return;
  grid.innerHTML = '';
  // A genuinely empty library is a different state from "filters matched
  // nothing" (#songs-filtered-empty) and needs its own honest explanation of
  // why there is nothing here and what to do about it.
  renderSongLibraryEmptyState(SONG_LIBRARY.length === 0);
  SONG_LIBRARY.forEach(song => {
    const scale = ALL_SCALES.find(s => s.id === song.soloScaleId);
    const card = document.createElement('div');
    card.className = `song-card player-${playerSlug(song.playerTag)}`;
    card.dataset.artist = song.artist;
    card.dataset.key = song.key;
    card.dataset.difficulty = song.difficulty;
    card.dataset.scale = song.soloScaleId;
    card.dataset.player = song.playerTag;
    card.innerHTML = `
      <div class="song-card-play-hover">▶</div>
      <div class="song-card-title">${song.title}${song.personal ? '<span class="song-card-personal-tag">PERSONAL</span>' : ''}</div>
      <div class="song-card-artist">${song.artist}</div>
      <div class="song-card-meta">
        <span class="song-card-key">Key of ${song.key}</span>
        <span class="song-card-key">${song.bpm} BPM</span>
        ${scale ? `<span class="song-card-scale">${scale.name} · ${song.soloScaleKey}</span>` : ''}
      </div>
      <div class="song-card-diffdots">${diffDotsHTML(song.difficulty)}</div>
      <div class="song-card-coming">Click to open practice view</div>
      ${song.personal ? `
        <div class="song-card-personal-actions">
          <button onclick="event.stopPropagation(); editPersonalSongMeta('${song.id}')">✎ Edit</button>
          <button onclick="event.stopPropagation(); deletePersonalSong('${song.id}')">🗑 Delete</button>
        </div>` : ''}
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
  song: null, view: 'both', speed: 1.0, customBpm: null, part: 'lead', silentPart: false,
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
  songPracticeState = { song, view: 'both', speed: 1.0, customBpm: null, part: 'lead', silentPart: false, running: false, loopStart: null, loopEnd: null, dragStartBar: null, dragging: false, lastBarNum: 0, tapTimes: [], sessionStartTime: null, accumulatedSeconds: 0 };
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
  view.className = `song-practice-view player-${playerSlug(song.playerTag)}`;

  view.innerHTML = `
    <button class="song-back-btn" onclick="closeSongPractice()">← Back to Songs</button>
    <div class="song-practice-header">
      <div class="song-practice-nowplaying">Now Practicing</div>
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

    <div class="song-transport-bar song-transport-bar-main">
      <button class="game-btn game-btn-start" id="song-play-btn" onclick="songTogglePlay()">▶ PLAY</button>

      <div class="song-speed-row">
        <span class="song-transport-label">Speed</span>
        <button class="quiz-mode-btn song-speed-btn" data-speed="0.25" onclick="songSetSpeed(0.25,this)">0.25x</button>
        <button class="quiz-mode-btn song-speed-btn" data-speed="0.5" onclick="songSetSpeed(0.5,this)">0.5x</button>
        <button class="quiz-mode-btn song-speed-btn" data-speed="0.75" onclick="songSetSpeed(0.75,this)">0.75x</button>
        <button class="quiz-mode-btn song-speed-btn active" data-speed="1" onclick="songSetSpeed(1,this)">1.0x</button>
        <button class="game-btn game-btn-skip" onclick="songTapTempo()">Tap Tempo</button>
        <span class="song-bpm-readout" id="song-bpm-readout">${song.bpm} BPM</span>
        <span class="song-bpm-readout" id="song-bar-readout">Bar 1 / ${song.chords.length}</span>
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
        <span class="song-transport-label">Part</span>
        <select id="song-part-select" onchange="songSetPart(this.value)"
          style="background:#1a1a1a;color:#ccc;border:1px solid #333;padding:4px 8px;font-size:9px;font-family:'Courier New',monospace">
          <option value="lead" selected>Lead / Solo</option>
          <option value="rhythm">Rhythm Guitar</option>
          <option value="bass">Bass</option>
        </select>
      </div>
      <div style="display:flex;gap:5px;align-items:center">
        <button class="quiz-mode-btn" id="song-silent-toggle" onclick="songToggleSilent(this)" title="Mute just the selected part so you can play it live while the rest of the band keeps going">🔇 Go Silent (Play Along)</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="song-transport-label">Room</span>
        <input type="range" id="song-room-slider" min="0" max="100" value="25" style="width:90px" oninput="songSetRoom(this.value)">
      </div>
      <span style="font-family:'Inter',Arial,sans-serif;font-size:9px;color:#ccb84a;display:none" id="song-sample-loading"></span>
    </div>

    <div style="font-family:'Inter',Arial,sans-serif;font-size:9px;color:#888;letter-spacing:.08em;text-transform:uppercase;margin:2px 0 4px">
      Tab shown below: <span style="color:#5c8fff" id="song-scroller-part-label">Lead / Solo</span>
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
        <button class="game-btn game-btn-skip" id="song-obsidian-export-btn" style="display:none" onclick="handleObsidianExportClick('song-obsidian-export-btn')">📤 Export to Obsidian</button>
      </div>
      <div class="song-history-block" id="song-history-block"></div>
    </div>

    <div class="song-section" style="background:#111;border:1px solid #222;padding:16px">
      <h3 style="font-family:'Inter',Arial,sans-serif;font-size:10px;color:#fff;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid #222;padding-bottom:6px;margin-bottom:12px">Practice Riffs In This Style</h3>
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
  const part = songPracticeState.part;
  const totalBars = song.chords.length;
  const markersRow = document.getElementById('song-markers-row');
  const barsRow = document.getElementById('song-bars-row');
  const totalWidth = totalBars * BAR_WIDTH;
  markersRow.style.width = totalWidth + 'px';
  barsRow.style.width = totalWidth + 'px';
  markersRow.innerHTML = '';
  barsRow.innerHTML = '';
  songBarElements = {};

  const partLabel = document.getElementById('song-scroller-part-label');
  if (partLabel) partLabel.textContent = SONG_PARTS[part] || '';

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

  for (let barIdx0 = 0; barIdx0 < totalBars; barIdx0++) {
    const barNum = barIdx0 + 1;
    const notes = getPartBarNotes(song, part, barIdx0);
    const col = document.createElement('div');
    col.className = 'song-bar-col';
    col.style.width = BAR_WIDTH + 'px';
    col.dataset.bar = barNum;
    col.innerHTML = `
      <div class="song-bar-num">${barNum}</div>
      <div class="song-bar-chord">${song.chords[barIdx0]}</div>
      <div class="song-bar-tab">
        ${[0, 1, 2, 3, 4, 5].map(row => `<div class="song-tab-string-line" style="top:${row * 16 + 6}px"></div>`).join('')}
        ${notes.map(n => {
          const left = (n.beat / song.timeSig) * 100;
          const top = (5 - n.string) * 16 + 6;
          const cls = n.technique === 'bend' ? ' technique-bend' : n.technique === 'vibrato' ? ' technique-vibrato' : '';
          return `<div class="song-tab-note${cls}" style="left:${left}%;top:${top}px" title="${STRING_LABELS[n.string]} string, fret ${n.fret}">${n.fret}</div>`;
        }).join('')}
      </div>
    `;
    col.addEventListener('mousedown', () => songLoopDragStart(barNum));
    col.addEventListener('mouseenter', () => songLoopDragOver(barNum));
    barsRow.appendChild(col);
    songBarElements[barNum] = col;
  }

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

// Each event carries its own `part` — songPracticeState.part/silentPart are read
// fresh at trigger time, so toggling silence or switching parts mid-playback
// takes effect on the next note without needing to rebuild the Tone.Part.
function songPartCallback(time, ev) {
  if (songPracticeState.silentPart && ev.part === songPracticeState.part) return;
  const vol = parseInt(document.getElementById('vol-slider')?.value || '60') / 100;
  const song = songPracticeState.song;
  const durSec = songBeatsToSeconds(ev.dur);

  if (ev.part === 'bass') {
    playSampledNote('bass', time, fretToHz(ev.string, ev.fret) / 2, durSec, mixVol('song', 1.1), { stringIdx: 'bass' });
  } else {
    const instrument = song.defaultInstrument || 'clean';
    const partVol = ev.part === 'lead' ? mixVol('song') : mixVol('song', 0.62);
    // Rhythm and lead are separate instruments in reality — choke key is
    // namespaced per part+string so a rhythm strum never chokes a ringing lead note.
    playSampledNote(instrument, time, fretToHz(ev.string, ev.fret), durSec, partVol, {
      technique: ev.technique, bendTo: ev.bendTo, fromFreq: ev.fromFreq, stringIdx: `${ev.part}-${ev.string}`,
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
  const totalBars = song.chords.length;
  for (let barIdx0 = 0; barIdx0 < totalBars; barIdx0++) {
    ['rhythm', 'bass', 'lead'].forEach(part => {
      const notes = getPartBarNotes(song, part, barIdx0);
      notes.forEach((n, ni) => {
        const ev = { time: songBarPosition(barIdx0, n.beat), part, string: n.string, fret: n.fret, dur: n.dur, technique: n.technique, bendTo: n.bendTo };
        if (n.technique === 'slide' && ni > 0) {
          const prev = notes[ni - 1];
          ev.fromFreq = fretToHz(prev.string, prev.fret);
        }
        events.push(ev);
      });
    });
  }

  songPart = new Tone.Part((time, ev) => songPartCallback(time, ev), events);
  songPart.start(0);

  songEndEventId = t.scheduleOnce(() => songHandleEnd(), `${totalBars}:0:0`);
}

// ── Sample loading orchestration (bass + the song's rhythm/lead tone — every
// part gets scheduled regardless of which one is being viewed/practiced) ──
function songEnsureInstrumentsLoaded() {
  return Promise.all([
    ensureInstrumentReady('bass'),
    ensureInstrumentReady(songPracticeState.song.defaultInstrument || 'clean'),
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

// Switches which part's tab is displayed/highlighted and — when the silent
// toggle is on — which part goes quiet so you can play it live.
function songSetPart(part) {
  songPracticeState.part = part;
  renderSongScroller();
  songUpdateOverlay(songPracticeState.lastBarNum || 1);
}

function songToggleSilent(btn) {
  songPracticeState.silentPart = !songPracticeState.silentPart;
  if (btn) {
    btn.textContent = songPracticeState.silentPart ? '🔊 Unmute My Part' : '🔇 Go Silent (Play Along)';
    btn.classList.toggle('active', songPracticeState.silentPart);
  }
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
    if (barReadout) barReadout.textContent = `Bar ${barNum} / ${songPracticeState.song.chords.length}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRACTICE OVERLAY — chord diagrams (GAME_CHORDS) + scale/fretboard (scales.js)
// ═══════════════════════════════════════════════════════════════════════════
function songUpdateOverlay(barNum) {
  const song = songPracticeState.song;
  const chord = song.chords[barNum - 1] || song.chords[0];
  const nextChord = song.chords[barNum] || song.chords[0];
  if (!chord) return;

  const curCanvas = document.getElementById('song-overlay-cur-canvas');
  const nextCanvas = document.getElementById('song-overlay-next-canvas');
  if (curCanvas && GAME_CHORDS[chord]) drawGameChord(curCanvas, chord, 90);
  if (nextCanvas && GAME_CHORDS[nextChord]) drawGameChord(nextCanvas, nextChord, 80);
  const curName = document.getElementById('song-overlay-cur-name'); if (curName) curName.textContent = chord;
  const nextName = document.getElementById('song-overlay-next-name'); if (nextName) nextName.textContent = nextChord;

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
      scaleLabelEl.textContent = `${section ? section.label : ''} — chord tones for ${chord}`;
    }
    const chordShape = GAME_CHORDS[chord];
    const chordFretMap = {};
    if (chordShape) chordShape.f.forEach((f, si) => { if (f >= 0) chordFretMap[`${si}-${f}`] = true; });
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

  if (typeof offerObsidianExport === 'function') {
    const mins = Math.round(elapsed / 60);
    offerObsidianExport({
      date: new Date().toISOString().slice(0, 10),
      durationLabel: elapsed < 60 ? `${Math.round(elapsed)}s` : `${mins} min`,
      practiced: [`Song: ${song.title} (${song.artist})`],
      scoreLines: Object.values(results).map(r => `${r.label}: ${r.grade === 'clean' ? '✓ Clean' : '△ Needs work'}`),
      focusNotes: note,
    }, 'song-obsidian-export-btn');
  }
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
  const instrument = songPracticeState.song.defaultInstrument || 'clean'; // same lead voice as the song itself

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


// ── Empty library state ────────────────────────────────────────────────────
function renderSongLibraryEmptyState(show) {
  const el = document.getElementById('songs-empty-library');
  const filters = document.getElementById('songs-filter-bar');
  if (!el) return;
  el.style.display = show ? '' : 'none';
  // Filtering an empty library is meaningless, so hide the controls entirely.
  if (filters) filters.style.display = show ? 'none' : '';
}
