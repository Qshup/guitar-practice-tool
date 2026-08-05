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

// Keeps the parsed score around so the track picker can re-map without
// re-parsing the file.
let gpLoadedScore = null;

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
    gpLoadedScore = score;
    // Real Guitar Pro files are multi-track — rhythm guitar, lead, bass, drums,
    // vocals. Importing tracks[0] blindly is why this needs a picker: track 0
    // is very often not the part you want to practise.
    return scoreToSongData(score, gpPreferredTrackIndex(score));
  } finally {
    container.remove();
  }
}

// Describes each track so the UI can offer a real choice.
function gpTrackSummaries(score) {
  if (!score || !score.tracks) return [];
  return score.tracks.map((t, i) => {
    const staff = t.staves && t.staves[0];
    const strings = staff && staff.tuning ? staff.tuning.length : 0;
    let noteCount = 0;
    if (staff && staff.bars) {
      staff.bars.forEach(b => (b.voices || []).forEach(v => (v.beats || []).forEach(bt => { noteCount += (bt.notes || []).length; })));
    }
    return { index: i, name: t.name || `Track ${i + 1}`, strings, bars: staff && staff.bars ? staff.bars.length : 0, notes: noteCount, percussion: !!(staff && staff.isPercussion) };
  });
}

// Best default: a 6-string track with the most notes. Drums and empty tracks
// are useless here, and a 4-string bass is a poor default for a guitar tool.
function gpPreferredTrackIndex(score) {
  const summaries = gpTrackSummaries(score);
  const playable = summaries.filter(t => !t.percussion && t.notes > 0);
  if (!playable.length) return 0;
  const sixes = playable.filter(t => t.strings === 6);
  const pool = sixes.length ? sixes : playable;
  return pool.reduce((best, t) => (t.notes > best.notes ? t : best), pool[0]).index;
}

// AlphaTab's Duration is an ENUM (Whole=1, Half=2, Quarter=4, Eighth=8), not a
// beat count — using it directly made a quarter note last 4 beats and a half
// note 2, i.e. inverted. playbackDuration is in ticks at 960 per quarter.
const GP_TICKS_PER_BEAT = 960;

function scoreToSongData(score, trackIndex) {
  const track = score.tracks && score.tracks[trackIndex != null ? trackIndex : 0];
  if (!track) throw new Error('No tracks found in this file.');
  const staff = track.staves[0];
  const stringCount = staff.tuning ? staff.tuning.length : 6;
  const leadBars = {};
  let barNum = 0;
  let skippedNotes = 0;

  staff.bars.forEach(bar => {
    barNum++;
    const notes = [];
    (bar.voices || []).forEach(voice => {
      (voice.beats || []).forEach(beat => {
        // playbackStart is relative to the BAR (verified against a generated
        // score: bar 1 gives 0/960/1920/2880 and bar 2 restarts at 0).
        const beatPos = (beat.playbackStart || 0) / GP_TICKS_PER_BEAT;
        const durBeats = (beat.playbackDuration || GP_TICKS_PER_BEAT) / GP_TICKS_PER_BEAT;
        (beat.notes || []).forEach(note => {
          // AlphaTab numbers strings 1 = LOWEST pitch. Verified by pitch:
          // string 1 reads E3 (midi 52) and string 6 reads E5 (midi 76) in
          // standard tuning. Our own index is also low-to-high, so this is a
          // straight -1. The previous `6 - note.string` mirrored every
          // imported tab — a low-E riff came out on the high e string.
          const ourString = note.string - 1;
          if (ourString < 0 || ourString > 5) { skippedNotes++; return; }  // e.g. 7-string tracks
          let technique;
          if (note.isBend) technique = 'bend';
          else if (note.isHammerPullOrigin) technique = 'hammer';
          else if (note.isHammerPullDestination) technique = 'pulloff';
          else if (note.slideOutType) technique = 'slide';
          else if (note.vibrato) technique = 'vibrato';
          else if (note.isPalmMute) technique = 'mute';
          else if (note.isHarmonic) technique = 'harmonic';
          notes.push({ string: ourString, fret: note.fret, beat: beatPos, dur: durBeats, technique });
        });
      });
    });
    if (notes.length) leadBars[barNum] = notes;
  });

  // Chords are deliberately NOT fabricated. The old version pushed '' for every
  // bar and then filled the gaps with 'E', producing a chord chart that was
  // pure invention sitting next to an accurate transcription — exactly the
  // problem that got the hardcoded songs deleted. If the file carries no chord
  // names, the song has none and the UI says so.
  const chords = [];
  staff.bars.forEach(bar => {
    let name = '';
    (bar.voices || []).forEach(v => (v.beats || []).forEach(bt => {
      if (!name && bt.chord && bt.chord.name) name = bt.chord.name;
    }));
    chords.push(name);
  });
  const hasChords = chords.some(Boolean);

  return {
    totalBars: barNum, leadBars,
    chords: hasChords ? chords : [],
    hasChords,
    skippedNotes,
    stringCount,
    trackName: track.name || '',
    trackIndex: trackIndex != null ? trackIndex : 0,
    title: score.title || '', artist: score.artist || '',
    bpm: Math.round(score.tempo) || 120,
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
    renderUploadPreview(result, format);
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


// ── Preview + track picker ─────────────────────────────────────────────────
function renderUploadPreview(result, format) {
  const previewEl = document.getElementById('upload-preview');
  if (!previewEl) return;
  const barCount = (result.chords && result.chords.length) ? result.chords.length : result.totalBars;
  const noteCount = result.leadBars ? Object.values(result.leadBars).reduce((n, arr) => n + arr.length, 0) : 0;

  let trackPicker = '';
  if (format === 'gp' && gpLoadedScore) {
    const tracks = gpTrackSummaries(gpLoadedScore);
    if (tracks.length > 1) {
      // Real Guitar Pro files carry rhythm, lead, bass, drums and vocals. Which
      // one you want is a judgement only you can make, so offer the choice
      // rather than silently importing whichever happened to be first.
      trackPicker = `<div class="upload-track-picker">
        <div class="upload-track-label">This file has ${tracks.length} tracks — pick the part you want to practise:</div>
        <select id="upload-track-select" onchange="uploadSwitchTrack(this.value)">
          ${tracks.map(t => `<option value="${t.index}" ${t.index === result.trackIndex ? 'selected' : ''}>
            ${t.name} — ${t.strings}-string, ${t.notes} note${t.notes === 1 ? '' : 's'}${t.percussion ? ' (percussion)' : ''}
          </option>`).join('')}
        </select>
      </div>`;
    }
  }

  const warnings = [];
  if (format === 'gp' && result.stringCount && result.stringCount !== 6) {
    warnings.push(`This track has ${result.stringCount} strings. Only notes on the standard 6 are imported${result.skippedNotes ? ` — ${result.skippedNotes} note(s) were outside that range and skipped` : ''}.`);
  } else if (result.skippedNotes) {
    warnings.push(`${result.skippedNotes} note(s) fell outside the standard 6 strings and were skipped.`);
  }
  if (!noteCount) warnings.push('No notes were found on this track. Try a different one.');
  if (format === 'gp' && result.hasChords === false) {
    warnings.push('This file carries no chord names, so the song has no chord chart. Nothing is invented to fill the gap — the tab is what you practise from.');
  } else if (format !== 'gp' && !result.chords) {
    warnings.push('No chord chart in this format — rhythm and bass backing will use a neutral placeholder until you add one.');
  }

  previewEl.style.display = '';
  previewEl.innerHTML =
    `<div class="upload-preview-head"><strong>Parsed OK</strong> — ${barCount} bar${barCount === 1 ? '' : 's'}, ${noteCount} note${noteCount === 1 ? '' : 's'}` +
    `${result.trackName ? ` from “${result.trackName}”` : ''}.</div>` +
    (result.title ? `<div>${result.title}${result.artist ? ' — ' + result.artist : ''}${result.bpm ? ` · ${result.bpm} BPM` : ''}</div>` : '') +
    trackPicker +
    warnings.map(w => `<div class="upload-warning">${w}</div>`).join('');
}

// Re-map an already-parsed score to a different track — no need to re-read the
// file, and it makes trying each track cheap.
function uploadSwitchTrack(index) {
  if (!gpLoadedScore) return;
  try {
    uploadParsedResult = scoreToSongData(gpLoadedScore, parseInt(index, 10));
    renderUploadPreview(uploadParsedResult, 'gp');
  } catch (e) {
    const errorEl = document.getElementById('upload-error');
    if (errorEl) errorEl.textContent = e.message || String(e);
  }
}
