// ═══════════════════════════════════════════════════════════════════════════
// PERSONAL SONG UPLOAD — Songs mode add-on. Lets you upload your own tabs in
// four formats and saves them to a personal library in localStorage. Personal
// songs are merged into SONG_LIBRARY via registerExternalSong() (songs.js)
// so they get full playback/speed/loop/practice-overlay/scoring for free —
// this file only handles parsing + the upload/library-management UI.
//
// Formats:
//   - JSON matching the existing songs.js schema — direct passthrough.
//   - Chord chart (bar number + chord name) — fills `chords[]`; no melody.
//   - Plain-text ASCII tab — fills `leadBars` (one part) via parseAsciiTab().
//   - Guitar Pro (.gp/.gp3/.gp4/.gp5/.gpx) via AlphaTab — richest source, but
//     loaded from CDN (not vendored locally like everything else in this
//     project) because its bundle splits into dynamically-imported chunks
//     that can't be reliably hand-vendored without live-testing against a
//     real browser, which wasn't available this session. The other three
//     formats work fully offline regardless.
// ═══════════════════════════════════════════════════════════════════════════

const PERSONAL_SONGS_KEY = 'guitarPracticePersonalSongs_v1';

function loadPersonalSongs() {
  try { return JSON.parse(localStorage.getItem(PERSONAL_SONGS_KEY)) || []; } catch (e) { return []; }
}
function savePersonalSongs(list) { localStorage.setItem(PERSONAL_SONGS_KEY, JSON.stringify(list)); }

function syncPersonalSongsIntoLibrary() {
  loadPersonalSongs().forEach(song => registerExternalSong(song));
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Plain-text ASCII tab ────────────────────────────────────────────────────
// b=bend (7b9 = fret 7 bent up to the pitch of fret 9), h=hammer-on,
// p=pull-off, /=slide up, \=slide down, ~=vibrato, x=muted note, <n>=harmonic.
// Bar boundaries come from '|' characters, matching standard tab notation —
// the same convention already used by this app's own riff tabs (riffs.js).
function parseAsciiTab(text) {
  const STRING_LETTERS = ['e', 'B', 'G', 'D', 'A', 'E']; // top-to-bottom = our string 5..0
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const blocks = [];
  for (let i = 0; i + 5 < lines.length; i++) {
    const six = lines.slice(i, i + 6);
    const looksLikeBlock = six.every((l, j) => {
      const t = l.trim();
      return t.length && t[0].toUpperCase() === STRING_LETTERS[j].toUpperCase() && t.indexOf('|') > -1;
    });
    if (looksLikeBlock) { blocks.push(six); i += 5; }
  }
  if (!blocks.length) throw new Error('No 6-line tab block found — each block needs 6 lines starting with e/B/G/D/A/E and containing "|".');

  const leadBars = {};
  let barNum = 0;
  const NOTE_RE = /<(\d+)>|(\d+)b(\d+)|(\d+)([hp\/\\~])?|x/g;

  blocks.forEach(block => {
    const stringSegments = block.map(line => line.replace(/^[a-zA-Z]\s*\|?/, '').split('|'));
    const barsInBlock = Math.max(...stringSegments.map(s => s.length));
    for (let b = 0; b < barsInBlock; b++) {
      barNum++;
      const notes = [];
      for (let lineIdx = 0; lineIdx < 6; lineIdx++) {
        const ourString = 5 - lineIdx;
        const seg = stringSegments[lineIdx][b] || '';
        if (!seg.trim()) continue;
        const beatsPerChar = 4 / Math.max(1, seg.length);
        NOTE_RE.lastIndex = 0;
        let m;
        while ((m = NOTE_RE.exec(seg))) {
          const beat = m.index * beatsPerChar;
          if (m[1] !== undefined) {
            notes.push({ string: ourString, fret: parseInt(m[1], 10), beat, dur: beatsPerChar * 1.5, technique: 'harmonic' });
          } else if (m[2] !== undefined) {
            const fromFret = parseInt(m[2], 10), toFret = parseInt(m[3], 10);
            notes.push({ string: ourString, fret: fromFret, beat, dur: beatsPerChar * 2, technique: 'bend', bendTo: toFret - fromFret });
          } else if (m[4] !== undefined) {
            const fret = parseInt(m[4], 10);
            const mark = m[5];
            const technique = mark === 'h' ? 'hammer' : mark === 'p' ? 'pulloff' : (mark === '/' || mark === '\\') ? 'slide' : mark === '~' ? 'vibrato' : undefined;
            notes.push({ string: ourString, fret, beat, dur: beatsPerChar, technique });
          } else {
            notes.push({ string: ourString, fret: 0, beat, dur: beatsPerChar, technique: 'mute' });
          }
        }
      }
      if (notes.length) leadBars[barNum] = notes.sort((a, b2) => a.beat - b2.beat);
    }
  });

  if (!barNum) throw new Error('Found tab-shaped lines but no bar markers ("|") — check the file has bar lines.');
  return { totalBars: barNum, leadBars };
}

// ── Chord chart (bar number + chord name) ───────────────────────────────────
// Accepts "1: Dm" / "1, Dm" / "1 Dm" per line, OR a bare space/newline
// separated chord sequence (bars 1..N in order) if no line has a leading number.
function parseChordChart(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const LINE_RE = /^(\d+)\s*[:,]?\s*([A-G](?:#|b)?(?:maj7?|min7?|m7?|sus2|sus4|dim|aug|add9|7)?)$/i;
  const chords = [];
  if (lines.length && lines.every(l => LINE_RE.test(l))) {
    lines.forEach(l => { const m = l.match(LINE_RE); chords[parseInt(m[1], 10) - 1] = m[2]; });
  } else {
    text.split(/\s+/).map(t => t.trim()).filter(Boolean).forEach((t, i) => { chords[i] = t; });
  }
  if (!chords.length) throw new Error('No chord names found.');
  for (let i = 0; i < chords.length; i++) if (!chords[i]) chords[i] = chords[i - 1] || chords.find(Boolean) || 'E';
  return chords;
}

// ── JSON matching the existing songs.js schema ──────────────────────────────
function parseJsonSong(text) {
  const obj = JSON.parse(text);
  if (!obj || !Array.isArray(obj.chords)) throw new Error('JSON must include a "chords" array (one chord name per bar) — see any song in songs.js for the full shape.');
  return obj;
}

// ── Guitar Pro (.gp/.gp3/.gp4/.gp5/.gpx) via AlphaTab (CDN, best-effort) ────
// UNVERIFIED: this maps AlphaTab's Score object (tracks -> staves -> bars ->
// voices -> beats -> notes) to our schema based on AlphaTab's documented API
// shape, but wasn't testable against real files or a real browser this
// session. If it throws, the error is shown as-is rather than silently
// producing broken note data — try Plain Text Tab or JSON instead if it
// doesn't work, and this is the first thing to debug with real GP files.
let alphaTabModulePromise = null;
function loadAlphaTab() {
  if (!alphaTabModulePromise) alphaTabModulePromise = import('https://cdn.jsdelivr.net/npm/@coderline/alphatab@1.6.0/dist/alphaTab.min.mjs');
  return alphaTabModulePromise;
}

async function parseGuitarProFile(arrayBuffer) {
  const alphaTab = await loadAlphaTab();
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:10px;height:10px;overflow:hidden;';
  document.body.appendChild(container);
  try {
    const api = new alphaTab.AlphaTabApi(container, { core: { enableLazyLoading: false } });
    const score = await new Promise((resolve, reject) => {
      api.scoreLoaded.on(s => resolve(s));
      api.error.on(e => reject(new Error('AlphaTab could not parse this file: ' + (e && e.message ? e.message : e))));
      const accepted = api.load(new Uint8Array(arrayBuffer));
      if (accepted === false) reject(new Error('Unsupported or corrupt Guitar Pro file.'));
    });
    return scoreToSongData(score);
  } finally {
    container.remove();
  }
}

function scoreToSongData(score) {
  const track = score.tracks && score.tracks[0];
  if (!track) throw new Error('No tracks found in this file.');
  const staff = track.staves[0];
  const leadBars = {};
  const chords = [];
  let barNum = 0;
  staff.bars.forEach(bar => {
    barNum++;
    const voice = bar.voices && bar.voices[0];
    const notes = [];
    (voice ? voice.beats : []).forEach(beat => {
      const beatPos = (beat.playbackStart || 0) / 960; // AlphaTab ticks-per-quarter-note default
      (beat.notes || []).forEach(note => {
        const ourString = 6 - note.string; // AlphaTab: string 1 = high e .. 6 = low E; we use 0 (low E) .. 5 (high e)
        let technique;
        if (note.isBend) technique = 'bend';
        else if (note.isHammerPullOrigin) technique = 'hammer';
        else if (note.isHammerPullDestination) technique = 'pulloff';
        else if (note.slideOutType) technique = 'slide';
        else if (note.vibrato) technique = 'vibrato';
        else if (note.isPalmMute) technique = 'mute';
        else if (note.isHarmonic) technique = 'harmonic';
        notes.push({ string: ourString, fret: note.fret, beat: beatPos, dur: beat.duration || 1, technique });
      });
    });
    if (notes.length) leadBars[barNum] = notes;
    chords.push(''); // AlphaTab doesn't reliably expose chord-name text per bar — filled below
  });
  for (let i = 0; i < chords.length; i++) if (!chords[i]) chords[i] = i > 0 ? chords[i - 1] : 'E';
  return {
    totalBars: barNum, leadBars, chords,
    title: score.title || '', artist: score.artist || '', bpm: Math.round(score.tempo) || 120,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD UI
// ═══════════════════════════════════════════════════════════════════════════
let uploadParsedResult = null; // set once a file has been parsed, cleared on close/save

function openUploadPanel() {
  document.getElementById('upload-panel').style.display = '';
  document.getElementById('songs-grid').style.display = 'none';
  document.getElementById('songs-filter-bar').style.display = 'none';
  resetUploadForm();
  populateUploadMetaSelects();
}
function closeUploadPanel() {
  document.getElementById('upload-panel').style.display = 'none';
  document.getElementById('songs-grid').style.display = '';
  document.getElementById('songs-filter-bar').style.display = '';
  applySongFilters();
}
function resetUploadForm() {
  uploadParsedResult = null;
  const preview = document.getElementById('upload-preview');
  if (preview) { preview.style.display = 'none'; preview.textContent = ''; }
  const fileInput = document.getElementById('upload-file-input');
  if (fileInput) fileInput.value = '';
  const textArea = document.getElementById('upload-text-input');
  if (textArea) textArea.value = '';
  document.getElementById('upload-error').textContent = '';
}
function populateUploadMetaSelects() {
  const scaleSel = document.getElementById('upload-scale');
  if (scaleSel && !scaleSel.dataset.populated) {
    ALL_SCALES.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; scaleSel.appendChild(o); });
    scaleSel.dataset.populated = '1';
  }
}

function uploadFormatChanged() {
  const format = document.getElementById('upload-format').value;
  document.getElementById('upload-file-row').style.display = format === 'gp' ? '' : 'none';
  document.getElementById('upload-text-row').style.display = format === 'gp' ? 'none' : '';
  const hint = document.getElementById('upload-format-hint');
  const hints = {
    json: 'Paste JSON matching songs.js\'s schema: { chords: ["Dm","C",...], rhythmFeel, bassFeel, leadBars: {...} }',
    tab: 'Paste a standard 6-line ASCII tab (e/B/G/D/A/E, bar lines with "|"). Supports b (bend), h (hammer-on), p (pull-off), / \\ (slide), ~ (vibrato), x (mute), <n> (harmonic).',
    chords: 'One chord per line as "1: Dm" (bar: chord), or just a plain space-separated list of chords for bars 1..N.',
    gp: 'Choose a .gp, .gp3, .gp4, .gp5, or .gpx file. Parsed via AlphaTab (loaded from a CDN) — this path is the least tested; if it fails, Plain Text Tab or JSON will work offline.',
  };
  if (hint) hint.textContent = hints[format] || '';
}

async function uploadParseAndPreview() {
  const format = document.getElementById('upload-format').value;
  const errorEl = document.getElementById('upload-error');
  const previewEl = document.getElementById('upload-preview');
  errorEl.textContent = '';
  uploadParsedResult = null;

  try {
    let result;
    if (format === 'gp') {
      const fileInput = document.getElementById('upload-file-input');
      const file = fileInput.files && fileInput.files[0];
      if (!file) throw new Error('Choose a file first.');
      const buf = await file.arrayBuffer();
      result = await parseGuitarProFile(buf);
    } else {
      const text = document.getElementById('upload-text-input').value;
      if (!text.trim()) throw new Error('Paste some content first.');
      if (format === 'json') {
        result = parseJsonSong(text);
      } else if (format === 'tab') {
        const parsed = parseAsciiTab(text);
        result = { totalBars: parsed.totalBars, leadBars: parsed.leadBars, chords: null };
      } else if (format === 'chords') {
        const chords = parseChordChart(text);
        result = { totalBars: chords.length, chords, leadBars: {} };
      }
    }
    uploadParsedResult = result;
    const barCount = result.chords ? result.chords.length : result.totalBars;
    const noteCount = result.leadBars ? Object.values(result.leadBars).reduce((n, arr) => n + arr.length, 0) : 0;
    previewEl.style.display = '';
    previewEl.innerHTML = `
      <div><strong>Parsed OK</strong> — ${barCount} bar${barCount === 1 ? '' : 's'}, ${noteCount} lead note${noteCount === 1 ? '' : 's'}.</div>
      ${!result.chords ? '<div style="color:#ccb84a">No chord chart in this format — rhythm/bass backing will use a neutral placeholder (your song key, repeated) until you add one.</div>' : ''}
      ${result.title ? `<div>Detected title: ${result.title}${result.artist ? ' — ' + result.artist : ''}</div>` : ''}
    `;
  } catch (e) {
    errorEl.textContent = e.message || String(e);
  }
}

function slugify(s) {
  return (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

function saveUploadedSong() {
  const errorEl = document.getElementById('upload-error');
  if (!uploadParsedResult) { errorEl.textContent = 'Parse the file first (press "Parse & Preview").'; return; }

  const title = document.getElementById('upload-title').value.trim();
  const artist = document.getElementById('upload-artist').value.trim() || 'Unknown';
  const key = document.getElementById('upload-key').value.trim() || 'E';
  const bpm = parseInt(document.getElementById('upload-bpm').value, 10) || 100;
  const difficulty = parseInt(document.getElementById('upload-difficulty').value, 10) || 3;
  const scaleId = document.getElementById('upload-scale').value;
  const playerTag = document.getElementById('upload-player').value;
  if (!title) { errorEl.textContent = 'Give it a title.'; return; }

  const totalBars = uploadParsedResult.chords ? uploadParsedResult.chords.length : uploadParsedResult.totalBars;
  const song = {
    id: 'personal-' + slugify(title) + '-' + Date.now().toString(36),
    title, artist, playerTag, key, bpm, timeSig: 4, difficulty, defaultInstrument: 'clean',
    soloScaleId: scaleId, soloScaleKey: key.replace(/m$/, ''), altScaleId: scaleId, altScaleKey: key.replace(/m$/, ''),
    tip: 'Personal upload — edit metadata anytime from its card.',
    sections: [{ id: 'main', label: 'Full Song', startBar: 1, endBar: totalBars }],
    chords: uploadParsedResult.chords || Array(totalBars).fill(key.replace(/m$/, '')),
    rhythmFeel: uploadParsedResult.rhythmFeel || 'sparse',
    bassFeel: uploadParsedResult.bassFeel || 'roots',
    leadBars: uploadParsedResult.leadBars || {},
    personal: true,
  };

  const list = loadPersonalSongs();
  list.push(song);
  savePersonalSongs(list);
  registerExternalSong(song);
  closeUploadPanel();
}

// ── Edit / delete personal songs ────────────────────────────────────────────
function deletePersonalSong(songId) {
  if (!confirm('Delete this personal song? This cannot be undone.')) return;
  const list = loadPersonalSongs().filter(s => s.id !== songId);
  savePersonalSongs(list);
  const idx = SONG_LIBRARY.findIndex(s => s.id === songId);
  if (idx >= 0) SONG_LIBRARY.splice(idx, 1);
  buildSongLibraryFilters();
  buildSongLibraryGrid();
}

function editPersonalSongMeta(songId) {
  const list = loadPersonalSongs();
  const song = list.find(s => s.id === songId);
  if (!song) return;
  const title = prompt('Title', song.title); if (title == null) return;
  const artist = prompt('Artist', song.artist); if (artist == null) return;
  const bpm = prompt('BPM', song.bpm); if (bpm == null) return;
  const difficulty = prompt('Difficulty (1-5)', song.difficulty); if (difficulty == null) return;
  song.title = title.trim() || song.title;
  song.artist = artist.trim() || song.artist;
  song.bpm = parseInt(bpm, 10) || song.bpm;
  song.difficulty = Math.min(5, Math.max(1, parseInt(difficulty, 10) || song.difficulty));
  savePersonalSongs(list);
  registerExternalSong(song);
}

// ── Drag-and-drop wiring ─────────────────────────────────────────────────────
function uploadHandleDrop(ev) {
  ev.preventDefault();
  const dropZone = document.getElementById('upload-drop-zone');
  if (dropZone) dropZone.classList.remove('drag-over');
  const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (!file) return;
  const format = document.getElementById('upload-format').value;
  if (format === 'gp') {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('upload-file-input').files = dt.files;
  } else {
    file.text().then(t => { document.getElementById('upload-text-input').value = t; });
  }
}
function uploadHandleDragOver(ev) { ev.preventDefault(); document.getElementById('upload-drop-zone').classList.add('drag-over'); }
function uploadHandleDragLeave() { document.getElementById('upload-drop-zone').classList.remove('drag-over'); }

// ── Init: merge any previously-saved personal songs into the library ───────
syncPersonalSongsIntoLibrary();
