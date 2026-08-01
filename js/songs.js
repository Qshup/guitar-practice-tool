// ═══════════════════════════════════════════════════════════════════════════
// SONGS MODE — placeholder song library (real practice flow: future update)
// ═══════════════════════════════════════════════════════════════════════════

const SONG_LIBRARY = [
  { title: 'Sultans of Swing', artist: 'Dire Straits', key: 'D', difficulty: 'Intermediate' },
  { title: 'Romeo and Juliet', artist: 'Dire Straits', key: 'D', difficulty: 'Intermediate' },
  { title: 'Suffragette City', artist: 'David Bowie', key: 'A', difficulty: 'Beginner' },
  { title: 'Moonage Daydream', artist: 'David Bowie', key: 'D', difficulty: 'Intermediate' },
  { title: 'Can You Get to That', artist: 'Funkadelic', key: 'E', difficulty: 'Intermediate' },
  { title: 'Transdermal Celebration', artist: 'Ween', key: 'A', difficulty: 'Advanced' },
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
      <div class="song-card-coming">Coming soon</div>
    `;
    card.onclick = () => showSongComingSoon(song, i);
    grid.appendChild(card);
  });
}

let songsStatusTimeout = null;
function showSongComingSoon(song) {
  const el = document.getElementById('songs-status');
  clearTimeout(songsStatusTimeout);
  el.textContent = `"${song.title}" practice mode is coming in a future update.`;
  el.classList.add('visible');
  songsStatusTimeout = setTimeout(() => el.classList.remove('visible'), 2500);
}

buildSongLibrary();
