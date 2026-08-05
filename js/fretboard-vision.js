// ═══════════════════════════════════════════════════════════════════════════
// FRETBOARD VISION — map camera fingertips onto YOUR guitar's actual neck
// ═══════════════════════════════════════════════════════════════════════════
//
// Until now the camera could only say which fingers were curled. It could not
// report a fret or a string, because nothing told it where the fretboard was
// in the frame — CLAUDE.md flagged that as the direct cause of the accuracy
// limitation, and it is exactly what this file fixes.
//
// You calibrate once by marking four corners of your own neck in the camera
// view. From there:
//
//   1. A homography maps any camera point into neck space (u along the neck,
//      v across the strings). A plain bilinear stretch would be wrong — the
//      neck is a plane viewed at an angle, so the mapping is projective.
//   2. u is converted to a fret number using real guitar geometry, not a
//      linear split. Fret n sits at 1 - 2^(-n/12) of the scale length, so the
//      12th fret is at the halfway point and the spacing narrows as you go
//      up. Treating the marked span as linear would put fret 5 roughly a
//      whole fret out.
//   3. v maps across the six strings.
//   4. Fingertips inside the neck quad become (string, fret) -> note names,
//      and the set of notes is matched against the chord library. Containment
//      is the contact test; finger curl only weights confidence.
//
// Because the corners are YOUR neck at YOUR camera angle, the mapping is
// specific to your guitar and your setup rather than an assumed geometry.

const FV_STORAGE_KEY = 'fretboardVision';
const FV_STRINGS = 6;
// Corners are marked in this order and the prompts below match it.
const FV_CORNER_PROMPTS = [
  'Click the NUT end of your LOW E string (thickest string, nearest the headstock)',
  'Click the NUT end of your HIGH e string (thinnest string, same end)',
  'Click the 12th FRET on your HIGH e string (the double-dot marker)',
  'Click the 12th FRET on your LOW E string',
];

let fvCorners = null;        // [{x,y} x4] in normalised 0-1 camera space
let fvHomography = null;     // camera -> neck-space matrix
let fvCalibrating = false;
let fvClickPoints = [];
let fvLastReading = null;
let fvSmoothing = [];        // recent readings, for stability

// ── Linear algebra ─────────────────────────────────────────────────────────
// Solve the 8x8 system for a projective transform from four point pairs.
function fvSolve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;   // degenerate — corners collinear
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Maps the four marked corners onto the unit square, where u runs ALONG the
// neck (nut -> 12th fret) and v runs ACROSS the strings (low E -> high e):
//   corner 0 nut/lowE -> (0,0)      corner 1 nut/highE  -> (0,1)
//   corner 2 12th/highE -> (1,1)    corner 3 12th/lowE  -> (1,0)
function fvComputeHomography(corners) {
  const dst = [[0, 0], [0, 1], [1, 1], [1, 0]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = corners[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = fvSolve(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function fvApplyHomography(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  if (Math.abs(d) < 1e-9) return null;
  return { u: (H[0] * x + H[1] * y + H[2]) / d, v: (H[3] * x + H[4] * y + H[5]) / d };
}

// ── Guitar geometry ────────────────────────────────────────────────────────
// The marked span runs nut (fret 0) to the 12th fret, which is exactly half
// the scale length. So u in 0..1 covers 0..0.5 of the scale, and inverting
// d = 1 - 2^(-n/12) gives the fret number at that distance.
function fvDistanceToFret(u) {
  const d = u * 0.5;
  if (d >= 0.999) return 99;
  return -12 * Math.log2(1 - d);
}
function fvFretToDistance(n) { return (1 - Math.pow(2, -n / 12)) / 0.5; }

// A finger sitting between fret k-1 and fret k sounds fret k, so round up —
// with a small tolerance so a fingertip right on the wire still reads as the
// lower fret rather than jumping.
function fvFretAt(u) {
  const raw = fvDistanceToFret(u);
  const fret = Math.ceil(raw - 0.12);
  return Math.max(0, Math.min(24, fret));
}

// v runs low-E (0) to high-e (1) across six strings.
function fvStringAt(v) {
  const idx = Math.round(v * (FV_STRINGS - 1));
  return Math.max(0, Math.min(FV_STRINGS - 1, idx));
}

// STRINGS in scales.js is ['E','A','D','G','B','E'] low->high, and
// STRING_LABELS marks the high one 'e'. Our v=0 is the low E, so the index
// lines up directly.
function fvNoteAt(stringIdx, fret) {
  if (typeof noteAt !== 'function' || typeof STRINGS === 'undefined') return null;
  return noteAt(STRINGS[stringIdx], fret);
}

// ── Reading the hand ───────────────────────────────────────────────────────
function fvPointToNeck(x, y) {
  if (!fvHomography) return null;
  const p = fvApplyHomography(fvHomography, x, y);
  if (!p) return null;
  return p;
}

// A fingertip counts as fretting when it falls inside the neck quad, with a
// small margin since fingers sit slightly proud of the board.
function fvReadFrettedNotes(hand) {
  if (!hand || !hand.present || !fvHomography) return null;
  const curls = (typeof analyzeHandCurl === 'function') ? analyzeHandCurl(hand) : null;
  const fingerOrder = [
    { name: 'index', tip: 8 }, { name: 'middle', tip: 12 },
    { name: 'ring', tip: 16 }, { name: 'pinky', tip: 20 },
  ];
  const found = [];
  fingerOrder.forEach(f => {
    const lm = hand.landmarks[f.tip];
    if (!lm) return;
    const p = fvPointToNeck(lm.x, lm.y);
    if (!p) return;
    // Margin lets a fingertip just off the marked quad still register.
    if (p.u < -0.05 || p.u > 1.25 || p.v < -0.12 || p.v > 1.12) return;
    const fret = fvFretAt(p.u);
    if (fret < 1) return;                              // behind the nut
    const stringIdx = fvStringAt(p.v);
    // Containment in the neck quad is the PRIMARY signal — that is what neck
    // calibration buys, and it is far stronger than inferring contact from
    // curl. fingerCurl measures tip-vs-base distance from the WRIST; it was
    // built to answer "which fingers are engaged in this chord shape", not
    // "is this fingertip touching the board", and using it as a hard gate
    // rejected fingers that were demonstrably on the right fret. It now only
    // lowers confidence, which the readout surfaces rather than hiding.
    const curl = curls ? (curls[f.name] || 0) : 0;
    const centreness = 1 - Math.min(1, Math.abs(p.v - stringIdx / (FV_STRINGS - 1)) * (FV_STRINGS - 1) * 2);
    const confidence = Math.max(0, Math.min(1, 0.55 + curl * 0.3 + centreness * 0.15));
    found.push({ finger: f.name, string: stringIdx, fret, note: fvNoteAt(stringIdx, fret), u: p.u, v: p.v, curl, confidence });
  });
  // One finger per string — keep the most confident read.
  const byString = {};
  found.forEach(n => { const cur = byString[n.string];
    if (!cur || n.confidence > cur.confidence || (n.confidence === cur.confidence && n.fret > cur.fret)) byString[n.string] = n; });
  return Object.values(byString).sort((a, b) => a.string - b.string);
}

// Retained as a confidence input only — see the note in fvReadFrettedNotes
// about why this must not be a hard gate.
const FV_MIN_CURL = 0.18;

// ── Chord identification ───────────────────────────────────────────────────
// Compares the fretted set against GAME_CHORDS' per-string fret arrays. Scores
// by how many fretted positions match; open strings in the shape are ignored
// because the camera cannot tell whether an open string was actually struck.
function fvIdentifyChord(notes) {
  if (typeof GAME_CHORDS === 'undefined' || !notes || notes.length < 2) return null;
  let best = null;
  Object.entries(GAME_CHORDS).forEach(([name, shape]) => {
    if (!shape.f) return;
    let matched = 0, expected = 0, wrong = 0;
    shape.f.forEach((fret, si) => {
      if (fret > 0) {
        expected++;
        const hit = notes.find(n => n.string === si && n.fret === fret);
        if (hit) matched++;
      }
    });
    notes.forEach(n => {
      const want = shape.f[n.string];
      if (want === undefined || want !== n.fret) wrong++;
    });
    if (!expected) return;
    const score = matched / expected - wrong * 0.18;
    if (matched >= 2 && (!best || score > best.score)) best = { name, score, matched, expected };
  });
  return best && best.score > 0.45 ? best : null;
}

// Smoothing: MediaPipe jitters frame to frame, so hold a reading only if it
// repeats. Without this the readout flickers between adjacent frets.
function fvStabilise(reading) {
  const sig = reading ? reading.notes.map(n => `${n.string}:${n.fret}`).join(',') : '';
  fvSmoothing.push(sig);
  if (fvSmoothing.length > 5) fvSmoothing.shift();
  const counts = {};
  fvSmoothing.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return dominant && dominant[1] >= 3 ? dominant[0] : null;
}

// ── Live readout ───────────────────────────────────────────────────────────
function fvHandleHandUpdate(hand) {
  const el = document.getElementById('camera-note-readout');
  if (!el) return;
  if (!fvHomography) {
    el.className = 'camera-note-readout uncalibrated';
    el.innerHTML = '<span class="fv-hint">Calibrate the neck to read notes from your fretboard</span>';
    return;
  }
  const notes = fvReadFrettedNotes(hand);
  const reading = notes && notes.length ? { notes } : null;
  const stableSig = fvStabilise(reading);
  if (!reading || !stableSig) {
    el.className = 'camera-note-readout idle';
    el.innerHTML = '<span class="fv-hint">No fingers on the board</span>';
    fvLastReading = null;
    return;
  }
  const chord = fvIdentifyChord(notes);
  fvLastReading = { notes, chord };
  fvRecordReading(notes);
  const noteChips = notes.map(n =>
    `<span class="fv-note${n.confidence < 0.68 ? ' low-conf' : ''}"${n.confidence < 0.68 ? ' title="Low confidence — fingertip is near the edge of a string"' : ''}>` +
    `<em>${n.note}</em><span class="fv-pos">${STRING_LABELS[n.string]}${n.fret}</span></span>`
  ).join('');
  el.className = 'camera-note-readout live';
  el.innerHTML =
    (chord ? `<span class="fv-chord">${chord.name}</span>` : '') +
    `<span class="fv-notes">${noteChips}</span>`;
}

// ── Neck calibration ───────────────────────────────────────────────────────
function fvStartNeckCalibration() {
  // Uses camera.js's exported accessor. The old guard read a bare
  // `cameraEnabled`, which is module-scoped inside camera.js and therefore
  // always `undefined` here — the check could never fire, so calibration
  // started happily with no video and four clicks into a black canvas.
  const camOn = typeof isCameraEnabled === 'function' ? isCameraEnabled() : false;
  if (!camOn) {
    // Inline, not alert(): a modal dialog blocks the page and there is nothing
    // to decide here.
    fvSetStatus('blocked', 'Camera is off',
      'Turn the camera on with the Camera button in the nav bar, point it at your fretboard, then press Calibrate neck.');
    return;
  }
  fvCalibrating = true;
  fvClickPoints = [];
  fvRenderCalibrationUI();
  const canvas = document.getElementById('camera-overlay-canvas');
  if (canvas) canvas.classList.add('fv-calibrating');
}

// One place that writes the calibration status block.
function fvSetStatus(cls, title, sub) {
  const el = document.getElementById('fv-calibration-status');
  if (el) { el.className = 'fv-cal-status ' + cls; el.innerHTML = `<strong>${title}</strong><span>${sub}</span>`; }
}

// Bound here at load, not only from camera.js's enableCamera(). The canvas is
// static markup that exists from first paint, and binding it inside the
// enable path meant the listener was simply absent on any route that did not
// go through it. camera.js keeps its own dataset.fvBound guard, so whichever
// runs first wins and there is never a double binding.
function fvBindCanvas() {
  const canvas = document.getElementById('camera-overlay-canvas');
  if (!canvas || canvas.dataset.fvBound) return;
  canvas.addEventListener('click', fvHandleCanvasClick);
  canvas.dataset.fvBound = '1';
}

function fvHandleCanvasClick(e) {
  if (!fvCalibrating) return;
  const canvas = e.currentTarget;
  const r = canvas.getBoundingClientRect();
  // The preview is mirrored with CSS scaleX(-1), so a click at screen-x maps
  // to (1 - x) in the un-mirrored coordinate space the landmarks use.
  const x = 1 - (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  fvClickPoints.push({ x, y });
  if (fvClickPoints.length === 4) fvFinishNeckCalibration();
  else fvRenderCalibrationUI();
}

function fvFinishNeckCalibration() {
  const H = fvComputeHomography(fvClickPoints);
  if (!H) {
    alert('Those four points are too close to a straight line to define a neck. Try again, marking the corners more widely apart.');
    fvClickPoints = [];
    fvRenderCalibrationUI();
    return;
  }
  fvCorners = fvClickPoints.slice();
  fvHomography = H;
  fvCalibrating = false;
  const canvas = document.getElementById('camera-overlay-canvas');
  if (canvas) canvas.classList.remove('fv-calibrating');
  fvSaveCalibration();
  fvRenderCalibrationUI();
}

function fvClearNeckCalibration() {
  fvCorners = null; fvHomography = null; fvClickPoints = []; fvCalibrating = false;
  fvSaveCalibration();
  fvRenderCalibrationUI();
}

function fvSaveCalibration() {
  if (typeof loadProgress !== 'function') return;
  const d = loadProgress();
  d[FV_STORAGE_KEY] = fvCorners ? { corners: fvCorners, savedAt: Date.now() } : null;
  saveProgress(d);
}

function fvLoadCalibration() {
  if (typeof loadProgress !== 'function') return;
  const c = loadProgress()[FV_STORAGE_KEY];
  if (c && c.corners && c.corners.length === 4) {
    fvCorners = c.corners;
    fvHomography = fvComputeHomography(fvCorners);
  }
  fvRenderCalibrationUI();
}

function fvRenderCalibrationUI() {
  const el = document.getElementById('fv-calibration-status');
  if (!el) return;
  if (fvCalibrating) {
    el.className = 'fv-cal-status calibrating';
    el.innerHTML = `<strong>Neck calibration ${fvClickPoints.length + 1}/4</strong>` +
                   `<span>${FV_CORNER_PROMPTS[fvClickPoints.length]}</span>`;
  } else if (fvHomography) {
    el.className = 'fv-cal-status done';
    el.innerHTML = `<strong>Neck calibrated</strong><span>Reading notes from your fretboard. Recalibrate if you move the camera or the guitar.</span>`;
  } else {
    el.className = 'fv-cal-status';
    el.innerHTML = `<strong>Neck not calibrated</strong><span>Mark four corners of your neck so the camera can name the notes you fret.</span>`;
  }
}

// ── Overlay drawing ────────────────────────────────────────────────────────
// Draws the calibrated neck outline plus the derived fret lines, so you can
// see immediately whether the mapping actually lines up with your guitar —
// this is the honest way to check the calibration rather than trusting it.
function fvDrawNeckOverlay(ctx, w, h) {
  if (fvCalibrating && fvClickPoints.length) {
    ctx.fillStyle = '#4a9eff';
    fvClickPoints.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
      ctx.fillText(String(i + 1), p.x * w + 8, p.y * h - 6);
      ctx.fillStyle = '#4a9eff';
    });
    return;
  }
  if (!fvCorners || !fvHomography) return;
  const inv = fvInverseCorners();
  if (!inv) return;
  ctx.strokeStyle = 'rgba(200,168,75,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  fvCorners.forEach((p, i) => { const X = p.x * w, Y = p.y * h; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.closePath(); ctx.stroke();
  // Fret lines at their true (non-linear) positions.
  ctx.strokeStyle = 'rgba(200,168,75,.35)';
  ctx.lineWidth = 1;
  for (let n = 1; n <= 12; n++) {
    const u = fvFretToDistance(n);
    if (u > 1) break;
    const a = inv(u, 0), b = inv(u, 1);
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
}

// Inverse mapping (neck space -> camera) by inverting the homography, used
// only for drawing the fret lines back onto the preview.
function fvInverseCorners() {
  const H = fvHomography;
  if (!H) return null;
  const a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], i = H[7], j = H[8];
  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    (e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det,
    (f * g - d * j) / det, (a * j - c * g) / det, (c * d - a * f) / det,
    (d * i - e * g) / det, (b * g - a * i) / det, (a * e - b * d) / det,
  ];
  return (u, v) => {
    const den = inv[6] * u + inv[7] * v + inv[8];
    return { x: (inv[0] * u + inv[1] * v + inv[2]) / den, y: (inv[3] * u + inv[4] * v + inv[5]) / den };
  };
}

window.fvStartNeckCalibration = fvStartNeckCalibration;
window.fvClearNeckCalibration = fvClearNeckCalibration;
window.fvHandleCanvasClick = fvHandleCanvasClick;
window.fvHandleHandUpdate = fvHandleHandUpdate;
window.fvLoadCalibration = fvLoadCalibration;
window.fvDrawNeckOverlay = fvDrawNeckOverlay;
window.fvReadFrettedNotes = fvReadFrettedNotes;
window.fvIdentifyChord = fvIdentifyChord;
window.fvFretAt = fvFretAt;
window.fvStringAt = fvStringAt;
window.fvComputeHomography = fvComputeHomography;
window.fvApplyHomography = fvApplyHomography;
window.fvDistanceToFret = fvDistanceToFret;

// ── Reading history — what your hand was actually doing, and when ──────────
//
// This is the half of note capture the microphone cannot supply. A pitch
// detector hears WHAT and WHEN; it cannot hear WHERE, because a pitch does not
// identify a string — E4 exists on four of them. Everything downstream was
// therefore guessing the fingering from the pitch alone (a minimum-travel
// solve), which is a reasonable guess and routinely the wrong string.
//
// Timestamps are taken on the AudioContext clock, the same clock mic.js uses
// for onsets, so a camera reading and a mic onset can be lined up directly.
const FV_HISTORY_SEC = 40;
let fvReadingHistory = [];

function fvNowTime() {
  try { return getAudioCtx().currentTime; } catch (e) { return performance.now() / 1000; }
}

function fvRecordReading(notes) {
  if (!notes || !notes.length) return;
  const time = fvNowTime();
  fvReadingHistory.push({
    time,
    notes: notes.map(n => ({
      string: n.string, fret: n.fret, note: n.note,
      midi: STRING_MIDI[n.string] + n.fret, confidence: n.confidence,
    })),
  });
  const cutoff = time - FV_HISTORY_SEC;
  while (fvReadingHistory.length && fvReadingHistory[0].time < cutoff) fvReadingHistory.shift();
}
function fvRecentReadings(seconds) {
  const now = fvNowTime();
  return fvReadingHistory.filter(r => r.time >= now - seconds);
}
function fvClearReadingHistory() { fvReadingHistory = []; }

// Resolve a heard pitch to the position it was ACTUALLY played at.
//
// Window is deliberately asymmetric and generous: the camera runs at ~30fps
// and holds a reading over 5 frames to beat MediaPipe's jitter, so the frame
// confirming a note commonly lands slightly AFTER the pick attack that the mic
// timestamps.
//
// Returns null when the camera cannot corroborate the pitch, and the caller
// falls back to the pitch-only estimate. Silence is the right answer here —
// asserting a string the camera did not see would be worse than admitting a
// guess.
function fvPositionForPitch(midi, time, opts) {
  if (!fvHomography || !fvReadingHistory.length) return null;
  const before = (opts && opts.before) || 0.18;
  const after  = (opts && opts.after)  || 0.35;
  const inWindow = fvReadingHistory.filter(r => r.time >= time - before && r.time <= time + after);
  if (!inWindow.length) return null;

  let best = null;
  for (const r of inWindow) {
    const dt = Math.abs(r.time - time);
    for (const n of r.notes) {
      let kind = null;
      if (n.midi === midi) kind = 'exact';
      // Monophonic pitch detectors octave-slip regularly, especially on the
      // wound strings. If the camera shows a finger on a note exactly an
      // octave from what was heard, the camera's octave is the better
      // evidence — it is measuring geometry, not interpreting a waveform.
      else if (Math.abs(n.midi - midi) === 12) kind = 'octave';
      if (!kind) continue;
      const score = n.confidence - dt * 0.6 - (kind === 'octave' ? 0.25 : 0);
      if (!best || score > best.score) {
        best = { string: n.string, fret: n.fret, midi: n.midi, confidence: n.confidence, match: kind, dt, score };
      }
    }
  }
  return best;
}

fvBindCanvas();

window.fvBindCanvas = fvBindCanvas;
window.fvSetStatus = fvSetStatus;
window.fvRecordReading = fvRecordReading;
window.fvRecentReadings = fvRecentReadings;
window.fvClearReadingHistory = fvClearReadingHistory;
window.fvPositionForPitch = fvPositionForPitch;
