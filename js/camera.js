// ═══════════════════════════════════════════════════════════════════════════
// CAMERA — webcam hand tracking via MediaPipe Hands (Tasks Vision), served
// entirely from local files (js/vendor/mediapipe/, models/hand_landmarker.task)
// so no requests go to Google when this feature is used. ES module (needed
// for the MediaPipe import) — functions other classic-script files need to
// call are attached to `window` explicitly at the bottom of this file, and
// this file registers ITS OWN listeners into chords.js/scales.js/
// listenrepeat.js's handler functions at its own bottom too, since a
// deferred module always finishes loading after every classic <script> has
// already run — see the mirrored comment in js/mic.js for the analogous
// (inverted) ordering constraint there.
//
// ACCURACY NOTE: only a HAND calibration is implemented (hold hand flat for
// 3s — teaches the tool your hand's size/distance from the camera), not a
// guitar-neck-position calibration. Without knowing where the fretboard is
// in the frame, this cannot read an absolute fret/string number — chord and
// scale feedback below compares RELATIVE finger geometry (which fingers are
// curled/fretting vs extended, and their rough left-to-right order) against
// the target shape's known finger assignment. Treat it as a first-pass
// heuristic to tune against real playing, not a precise fret reader.
// ═══════════════════════════════════════════════════════════════════════════

import { HandLandmarker, FilesetResolver } from './vendor/mediapipe/vision_bundle.mjs';

// Built as fully-qualified absolute URLs (via import.meta.url, i.e. relative
// to this file's own location, not the page's) rather than bare relative
// strings — MediaPipe's internal fetches for these assets weren't
// verifiable without a live browser, and a bare string is ambiguous between
// "relative to the document" and "relative to this module," which resolve
// to different (wrong) paths for at least one of the two. An absolute URL
// removes that ambiguity entirely regardless of which one MediaPipe uses.
const MEDIAPIPE_WASM_PATH = new URL('vendor/mediapipe/wasm', import.meta.url).href;
const MEDIAPIPE_MODEL_PATH = new URL('../models/hand_landmarker.task', import.meta.url).href;

// 21-point connections for skeleton drawing (MediaPipe Hands standard topology).
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];
const FINGERTIP_INDICES = [4, 8, 12, 16, 20];
const FINGER_JOINTS = {
  index:  { tip: 8,  base: 5 },
  middle: { tip: 12, base: 9 },
  ring:   { tip: 16, base: 13 },
  pinky:  { tip: 20, base: 17 },
};

let cameraStream = null;
let videoEl = null;
let canvasEl = null;
let handLandmarker = null;
let cameraEnabled = false;
let cameraRAF = null;
let modelLoading = false;
let calibration = null;    // { handSpanPx } once calibrated
let calibrating = false;
let calibrationSamples = [];
let calibrationTimer = null;

// ── Subscriber system — mirrors mic.js's onMicOnset/onMicLevel pattern ─────
let handUpdateListeners = [];
function onHandUpdate(fn) { handUpdateListeners.push(fn); }
function offHandUpdate(fn) { handUpdateListeners = handUpdateListeners.filter(f => f !== fn); }

// ── Model loading (lazy — only on first Camera On, never on page load) ─────
async function ensureHandLandmarker() {
  if (handLandmarker) return handLandmarker;
  modelLoading = true;
  setCameraLoadingUI(true);
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  } catch (e) {
    // GPU delegate isn't available on every machine/browser — fall back to CPU.
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_PATH, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  }
  modelLoading = false;
  setCameraLoadingUI(false);
  return handLandmarker;
}

function setCameraLoadingUI(loading) {
  const el = document.getElementById('camera-loading');
  if (el) el.style.display = loading ? '' : 'none';
}

// ── On/off ───────────────────────────────────────────────────────────────
// The nav button has a fixed icon span plus this text label — setting the
// button's own textContent (rather than just the label span's) would wipe
// out the icon span entirely, so every status update goes through here.
function setCameraBtnLabel(text) {
  const label = document.getElementById('camera-btn-label');
  if (label) label.textContent = text;
}

async function toggleCamera() {
  if (cameraEnabled) { disableCamera(); return; }
  await enableCamera();
}

async function enableCamera() {
  const btn = document.getElementById('camera-toggle-btn');
  const statusEl = document.getElementById('camera-status');
  if (btn) btn.disabled = true;
  setCameraBtnLabel('… connecting');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Camera access was denied — allow it in your browser to use hand tracking.';
    if (btn) btn.disabled = false;
    setCameraBtnLabel('Camera Off');
    return;
  }
  videoEl = document.getElementById('camera-video');
  canvasEl = document.getElementById('camera-overlay-canvas');
  if (canvasEl && !canvasEl.dataset.fvBound) {
    canvasEl.addEventListener('click', e => { if (typeof fvHandleCanvasClick === 'function') fvHandleCanvasClick(e); });
    canvasEl.dataset.fvBound = '1';
  }
  videoEl.srcObject = cameraStream;

  // Everything past this point (video playback, MediaPipe model load) was
  // previously unguarded — any failure here left the button stuck on
  // "… connecting" forever with no visible error at all, which is
  // indistinguishable from "the camera feature doesn't work."
  try {
    await videoEl.play();
    canvasEl.width = videoEl.videoWidth || 640;
    canvasEl.height = videoEl.videoHeight || 480;
    await ensureHandLandmarker();
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Camera failed to start: ' + (e && e.message ? e.message : e);
    if (btn) { btn.disabled = false; btn.classList.remove('active'); }
    setCameraBtnLabel('Camera Off');
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
    setCameraLoadingUI(false);
    return;
  }

  cameraEnabled = true;
  if (btn) { btn.disabled = false; btn.classList.add('active'); }
  setCameraBtnLabel('Camera On');
  const panel = document.getElementById('camera-panel');
  if (panel) panel.classList.add('active');
  if (statusEl) statusEl.textContent = '';
  startCameraLoop();
  startCalibration();
}

function disableCamera() {
  cameraEnabled = false;
  if (cameraRAF) cancelAnimationFrame(cameraRAF);
  cameraRAF = null;
  clearInterval(calibrationTimer);
  calibrating = false;
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  if (videoEl) videoEl.srcObject = null;
  const btn = document.getElementById('camera-toggle-btn');
  if (btn) btn.classList.remove('active');
  setCameraBtnLabel('Camera Off');
  const panel = document.getElementById('camera-panel');
  if (panel) panel.classList.remove('active');
  // Free the WASM model too — "zero resources used when off" means more than
  // just pausing the RAF loop.
  if (handLandmarker) { handLandmarker.close(); handLandmarker = null; }
}

// ── Per-frame detection loop ────────────────────────────────────────────────
// Throttled to ~30fps rather than raw RAF (~60fps): MediaPipe inference is
// the single most expensive per-frame operation in the app, and hand
// tracking for chord/finger feedback doesn't need 60fps precision — this
// halves its CPU cost so it shares the frame budget with audio playback and
// the mic's own RAF loops without contention. See CLAUDE.md performance notes.
const CAMERA_TARGET_INTERVAL_MS = 1000 / 30;
let cameraLastFrameTime = 0;

function startCameraLoop() {
  const tick = (now) => {
    if (!cameraEnabled || !videoEl || !handLandmarker) { cameraRAF = null; return; }
    if (now - cameraLastFrameTime < CAMERA_TARGET_INTERVAL_MS) { cameraRAF = requestAnimationFrame(tick); return; }
    cameraLastFrameTime = now;
    const result = handLandmarker.detectForVideo(videoEl, performance.now());
    const hand = processHandResult(result);
    drawHandOverlay(hand);
    drawNeckOverlayIfAny();
    updateConfidenceDisplay(hand);
    if (typeof fvHandleHandUpdate === 'function') fvHandleHandUpdate(hand);
    if (calibrating) collectCalibrationSample(hand);
    handUpdateListeners.forEach(fn => fn(hand, calibration));
    cameraRAF = requestAnimationFrame(tick);
  };
  cameraRAF = requestAnimationFrame(tick);
}

function processHandResult(result) {
  if (!result || !result.landmarks || !result.landmarks.length) return { present: false, confidence: 0 };
  const landmarks = result.landmarks[0]; // first detected hand — the fretting hand, in practice
  const handedness = result.handednesses && result.handednesses[0] && result.handednesses[0][0];
  return {
    present: true,
    landmarks,
    handedness: handedness ? handedness.categoryName : null,
    confidence: handedness ? handedness.score : 0.5,
  };
}

// ── Skeleton overlay ─────────────────────────────────────────────────────────
function drawHandOverlay(hand) {
  if (!canvasEl || !videoEl) return;
  const ctx = canvasEl.getContext('2d');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
  if (!hand.present) return;
  const pts = hand.landmarks.map(p => ({ x: p.x * canvasEl.width, y: p.y * canvasEl.height }));
  ctx.strokeStyle = '#4caf50';
  ctx.lineWidth = 2;
  HAND_CONNECTIONS.forEach(([a, b]) => {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
  });
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, FINGERTIP_INDICES.includes(i) ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = FINGERTIP_INDICES.includes(i) ? '#ccb84a' : '#5c8fff';
    ctx.fill();
  });
}

// Neck outline + true fret positions, drawn over the video every frame so you
// can see whether the calibration actually lines up with your guitar.
function drawNeckOverlayIfAny() {
  if (!canvasEl || typeof fvDrawNeckOverlay !== 'function') return;
  fvDrawNeckOverlay(canvasEl.getContext('2d'), canvasEl.width, canvasEl.height);
}

function updateConfidenceDisplay(hand) {
  const el = document.getElementById('camera-confidence');
  if (!el) return;
  if (!hand.present) { el.textContent = 'No hand detected'; el.className = 'camera-confidence low'; return; }
  const pct = Math.round(hand.confidence * 100);
  el.textContent = `Tracking confidence: ${pct}%${pct < 50 ? ' — try better lighting or a more direct angle' : ''}`;
  el.className = 'camera-confidence ' + (pct >= 80 ? 'high' : pct >= 50 ? 'medium' : 'low');
}

// ── Calibration — hold hand flat for 3 seconds ──────────────────────────────
function startCalibration() {
  calibrating = true;
  calibrationSamples = [];
  const el = document.getElementById('camera-calibration-status');
  if (el) { el.style.display = ''; el.textContent = 'Hold your hand flat, fingers spread, facing the camera — calibrating in 3…'; }
  let secondsLeft = 3;
  clearInterval(calibrationTimer);
  calibrationTimer = setInterval(() => {
    secondsLeft--;
    if (el && secondsLeft > 0) el.textContent = `Hold steady… ${secondsLeft}`;
    if (secondsLeft <= 0) { clearInterval(calibrationTimer); finishCalibration(); }
  }, 1000);
}
function recalibrateCamera() { if (cameraEnabled) startCalibration(); }

function handSpanPx(landmarks) {
  // Wrist (0) to middle-fingertip (12) distance — a simple, stable proxy for
  // "how big/close the hand reads at this distance," not a true measurement.
  const a = landmarks[0], b = landmarks[12];
  return Math.hypot((a.x - b.x) * canvasEl.width, (a.y - b.y) * canvasEl.height);
}
function collectCalibrationSample(hand) {
  if (!hand.present) return;
  calibrationSamples.push(handSpanPx(hand.landmarks));
}
function finishCalibration() {
  calibrating = false;
  const el = document.getElementById('camera-calibration-status');
  if (calibrationSamples.length < 10) {
    calibration = null;
    if (el) el.textContent = 'Calibration needs a clearer view of your hand — press Recalibrate and try again.';
    return;
  }
  calibrationSamples.sort((a, b) => a - b);
  calibration = { handSpanPx: calibrationSamples[Math.floor(calibrationSamples.length / 2)] };
  if (el) {
    el.textContent = `Calibrated ✓`;
    setTimeout(() => { if (el) el.style.display = 'none'; }, 2000);
  }
}

// ── Finger-curl analysis (shared by Chords/Scales/Listen & Repeat below) ───
// ~0 = extended, ~1 = curled (fingertip much closer to the wrist than the
// finger's base knuckle is) — the basis for "is this finger fretting."
function fingerCurl(landmarks, tipIdx, baseIdx) {
  const wrist = landmarks[0], tip = landmarks[tipIdx], base = landmarks[baseIdx];
  const tipDist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
  const baseDist = Math.hypot(base.x - wrist.x, base.y - wrist.y);
  return 1 - Math.min(1, tipDist / Math.max(0.001, baseDist));
}
const CURL_THRESHOLD = 0.35;

function analyzeHandCurl(hand) {
  if (!hand.present) return null;
  const curls = {};
  Object.entries(FINGER_JOINTS).forEach(([name, j]) => { curls[name] = fingerCurl(hand.landmarks, j.tip, j.base); });
  return curls;
}

// ── Chord mode: hand shape vs target chord ──────────────────────────────────
// GAME_CHORDS[name].fingers is a 6-entry per-string array (1-4, 0 = open) —
// see game.js. We compare which of index/middle/ring/pinky SHOULD be curled
// for this shape against which ones the camera reads as curled.
function compareHandToChord(hand, chordName) {
  const curls = analyzeHandCurl(hand);
  const shape = typeof GAME_CHORDS !== 'undefined' ? GAME_CHORDS[chordName] : null;
  if (!curls || !shape || !shape.fingers) return null;
  const fingerNames = ['index', 'middle', 'ring', 'pinky'];
  const expectedUsed = {};
  shape.fingers.forEach(f => { if (f >= 1 && f <= 4) expectedUsed[f] = true; });

  const tips = [];
  fingerNames.forEach((name, i) => {
    const fingerNum = i + 1;
    const shouldFret = !!expectedUsed[fingerNum];
    const isCurled = curls[name] > CURL_THRESHOLD;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    if (shouldFret && !isCurled) tips.push(`${label} finger looks extended — this shape needs it fretting a string.`);
    else if (!shouldFret && isCurled) tips.push(`${label} finger is curled but this shape doesn't use it — check it isn't muting a string.`);
  });
  if (!tips.length) tips.push('Good position — fingers match the expected shape. Check your thumb is behind the neck, not over the top.');
  return tips;
}

// ── Init ─────────────────────────────────────────────────────────────────
// Registered here (not in chords.js/scales.js/listenrepeat.js) because this
// is a deferred ES module — it always finishes loading after every classic
// <script> already has, so referencing their handler functions here is safe
// in a way the reverse (calling into this file from a classic script's own
// top level) would not be. See the file header comment.
if (typeof chordsHandleHandUpdate === 'function') onHandUpdate(chordsHandleHandUpdate);
if (typeof scalesHandleHandUpdate === 'function') onHandUpdate(scalesHandleHandUpdate);
if (typeof lrHandleHandUpdate === 'function') onHandUpdate(lrHandleHandUpdate);

// Expose what index.html's inline onclick handlers and other classic scripts need.
window.toggleCamera = toggleCamera;
window.recalibrateCamera = recalibrateCamera;
window.onHandUpdate = onHandUpdate;
window.offHandUpdate = offHandUpdate;
window.analyzeHandCurl = analyzeHandCurl;
window.compareHandToChord = compareHandToChord;
window.CURL_THRESHOLD = CURL_THRESHOLD;
window.FINGER_JOINTS = FINGER_JOINTS;
