// ═══════════════════════════════════════════════════════════════════════════
// SONGS MODE — song library with chord-progression practice + related riffs
// Reuses: game.js (GAME_CHORDS/drawGameChord/fretToHz), audio.js (playPluck/
// playBendNote/playVibratoNote/getAudioCtx), riffs.js (RIFF_LIBRARY — related
// riffs are pulled from here by player tag, never duplicated).
// Chord progressions below are generic practice progressions in each song's
// key/style, not claimed to be exact transcriptions of the recordings.
// ═══════════════════════════════════════════════════════════════════════════

const SONG_LIBRARY = [
  {
    title: 'Sultans of Swing', artist: 'Dire Straits', key: 'D', difficulty: 'Intermediate', bpm: 100,
    playerTag: 'Knopfler', progressionLabel: 'Main Groove', progression: ['D', 'C', 'G', 'D'],
    tip: 'Fingerstyle, no pick — thumb covers the low string while your fingers pick the melody on top. Keep the D drone ringing under the changes.',
  },
  {
    title: 'Romeo and Juliet', artist: 'Dire Straits', key: 'D', difficulty: 'Intermediate', bpm: 90,
    playerTag: 'Knopfler', progressionLabel: 'Intro Feel', progression: ['D', 'A', 'Bm', 'G'],
    tip: 'Let each chord ring into the next rather than strumming hard — the feel is more arpeggiated than percussive. Focus on space and dynamics.',
  },
  {
    title: 'Suffragette City', artist: 'David Bowie', key: 'A', difficulty: 'Beginner', bpm: 130,
    playerTag: 'Ronson', progressionLabel: 'Verse Feel', progression: ['A', 'D', 'A', 'G'],
    tip: 'Driving, palm-muted eighth-note strumming. This rhythm part is all about attack and energy, not subtlety.',
  },
  {
    title: 'Moonage Daydream', artist: 'David Bowie', key: 'D', difficulty: 'Intermediate', bpm: 90,
    playerTag: 'Ronson', progressionLabel: 'Verse Feel', progression: ['D', 'G', 'A', 'D'],
    tip: 'Moves between chunky rhythm chords and a soaring lead tone. Practice the dynamic jump from a quiet verse into a bigger chorus.',
  },
  {
    title: 'Can You Get to That', artist: 'Funkadelic', key: 'E', difficulty: 'Intermediate', bpm: 100,
    playerTag: 'Hazel', progressionLabel: 'Groove Feel', progression: ['E', 'A', 'B7', 'E'],
    tip: 'Funky, syncopated strumming with emphasis on the off-beats. This is rhythmic, vocal-like playing rather than a lead showcase.',
  },
  {
    title: 'Transdermal Celebration', artist: 'Ween', key: 'A', difficulty: 'Advanced', bpm: 140,
    playerTag: 'Dean Ween', progressionLabel: 'Main Feel', progression: ['A', 'D', 'E', 'A'],
    tip: 'Loose, unpredictable phrasing — treat the rhythm part almost like a lead line. Playing it a little rough is part of the character.',
  },
];

function buildSongLibrary() {
  const grid = document.getElementById('songs-grid');
  grid.innerHTML = '';
  SONG_LIBRARY.forEach((song, i) => {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <div class="song-card-title">${song.title}</div>
      <div class="song-card-artist">${song.artist}</div>
      <div class="song-card-meta">
        <span class="song-card-key">Key of ${song.key}</span>
        <span class="song-card-difficulty song-diff-${song.difficulty.toLowerCase()}">${song.difficulty}</span>
      </div>
      <div class="song-card-coming">Click to open practice view</div>
    `;
    card.onclick = () => showSongDetail(i);
    grid.appendChild(card);
  });
}

// ── Related riffs — pulled live from RIFF_LIBRARY by player tag, no duplication ──
function relatedRiffsForSong(song, limit) {
  limit = limit || 3;
  const matches = [];
  RIFF_LIBRARY.forEach((group, gi) => {
    group.riffs.forEach((riff, ri) => {
      if ((riff.player || []).includes(song.playerTag)) {
        matches.push({ gi, ri, riff, scaleName: group.scaleName, sameKey: norm(riff.key) === norm(song.key) });
      }
    });
  });
  matches.sort((a, b) => (b.sameKey ? 1 : 0) - (a.sameKey ? 1 : 0));
  return matches.slice(0, limit);
}

// ── Song detail view ─────────────────────────────────────────────────────────
let currentSongIdx = null;

function showSongDetail(idx) {
  currentSongIdx = idx;
  const song = SONG_LIBRARY[idx];
  document.getElementById('songs-grid').style.display = 'none';
  document.getElementById('song-detail-panel').style.display = '';

  document.getElementById('song-detail-title').textContent = song.title;
  document.getElementById('song-detail-artist').textContent = song.artist;
  document.getElementById('song-detail-key').textContent = `Key of ${song.key}`;
  const diffEl = document.getElementById('song-detail-difficulty');
  diffEl.textContent = song.difficulty;
  diffEl.className = `song-card-difficulty song-diff-${song.difficulty.toLowerCase()}`;
  document.getElementById('song-detail-bpm').textContent = `${song.bpm} BPM`;
  document.getElementById('song-progression-label').textContent = `Chord Progression — ${song.progressionLabel}`;
  document.getElementById('song-tip').textContent = song.tip;

  stopSongProgression();
  const row = document.getElementById('song-chord-row');
  row.innerHTML = '';
  song.progression.forEach(chordName => {
    const block = document.createElement('div');
    block.className = 'song-chord-block';
    const canvas = document.createElement('canvas');
    canvas.width = 90; canvas.height = 115;
    block.appendChild(canvas);
    const label = document.createElement('div');
    label.className = 'song-chord-label';
    label.textContent = chordName;
    block.appendChild(label);
    row.appendChild(block);
    if (GAME_CHORDS[chordName]) drawGameChord(canvas, chordName, 90);
  });

  buildRelatedRiffCards(song, idx);
}

function closeSongDetail() {
  stopSongProgression();
  if (currentSongIdx !== null) {
    Object.keys(activeSongRiffPlayers).forEach(id => stopSongRiffPlay(id));
  }
  document.getElementById('song-detail-panel').style.display = 'none';
  document.getElementById('songs-grid').style.display = '';
}

// ── Chord progression playback (block strum via playPluck, mirrors game.js's playChordSound) ──
let songProgressionRunning = false;
let songProgressionTimer = null;

function songToggleProgression() {
  if (songProgressionRunning) { stopSongProgression(); return; }
  const song = SONG_LIBRARY[currentSongIdx];
  if (!song) return;
  songProgressionRunning = true;
  const btn = document.getElementById('song-play-progression-btn');
  btn.textContent = '■ Stop'; btn.classList.add('running');
  getAudioCtx();
  const beatMs = (60000 / song.bpm) * 4; // 4 beats per chord
  let i = 0;
  function step() {
    if (!songProgressionRunning) return;
    const blocks = document.querySelectorAll('#song-chord-row .song-chord-block');
    blocks.forEach((b, bi) => b.classList.toggle('active-chord', bi === i % song.progression.length));
    const chordName = song.progression[i % song.progression.length];
    const chord = GAME_CHORDS[chordName];
    if (chord) {
      const vol = parseInt(document.getElementById('vol-slider').value) / 100;
      const now = getAudioCtx().currentTime;
      chord.f.forEach((f, si) => { if (f >= 0) playPluck(now + si * 0.03, fretToHz(si, f), vol * 0.6); });
    }
    i++;
    songProgressionTimer = setTimeout(step, beatMs);
  }
  step();
}

function stopSongProgression() {
  songProgressionRunning = false;
  clearTimeout(songProgressionTimer);
  const btn = document.getElementById('song-play-progression-btn');
  if (btn) { btn.textContent = '▶ Play Progression'; btn.classList.remove('running'); }
  document.querySelectorAll('#song-chord-row .song-chord-block').forEach(b => b.classList.remove('active-chord'));
}

// ── Related-riff playback — self-contained per-card scheduler (own ids/state,
// mirrors riffs.js's startRiffPlay/stopRiffPlay so the two never collide) ──
let activeSongRiffPlayers = {};

function buildRelatedRiffCards(song, songIdx) {
  const container = document.getElementById('song-related-riffs');
  Object.keys(activeSongRiffPlayers).forEach(id => stopSongRiffPlay(id));
  container.innerHTML = '';
  const related = relatedRiffsForSong(song);
  if (!related.length) {
    container.innerHTML = '<div class="riff-description">No related practice riffs tagged for this style yet.</div>';
    return;
  }
  related.forEach(({ gi, ri, riff, scaleName }) => {
    const riffKey = `${songIdx}-${gi}-${ri}`;
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

function startSongRiffPlay(riffKey, gi, ri) {
  const riff = RIFF_LIBRARY[gi].riffs[ri];
  const btn = document.getElementById(`song-riff-btn-${riffKey}`);
  const vol = parseInt(document.getElementById('vol-slider').value) / 100;
  btn.textContent = '■ Stop'; btn.classList.add('playing');
  getAudioCtx();
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
    const technique = note.t || 'pick';
    const noteVol = technique === 'bend' ? vol * 0.9 : technique === 'vibrato' ? vol * 0.85 : vol * 0.75;

    if (technique === 'bend') playBendNote(ctx.currentTime, freq, dur / 1000, noteVol, note.bendTo);
    else if (technique === 'vibrato') playVibratoNote(ctx.currentTime, freq, dur / 1000, noteVol);
    else playPluck(ctx.currentTime, freq, noteVol);

    noteIdx++;
    activeSongRiffPlayers[riffKey] = setTimeout(playNext, dur);
  }

  activeSongRiffPlayers[riffKey] = true;
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

buildSongLibrary();
