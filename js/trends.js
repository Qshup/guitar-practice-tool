// ═══════════════════════════════════════════════════════════════════════════
// TREND CHARTS — direction, not just totals
// ═══════════════════════════════════════════════════════════════════════════
//
// The progress panel could say how much you had done but never which way it
// was going. "Is my C->F switch faster than last month?" was unanswerable.
//
// An honest note on what could and could not be recovered:
//
//   • Practice time per day and scale coverage ARE derivable from history
//     already recorded (days[].scaleSeconds, days[].scalesPracticed), so
//     those two charts are populated from day one.
//   • Chord-switch BPM and per-session accuracy were NOT being stored. The
//     chordPairs record is { attempts, correct, bestStreak, curStreak } — no
//     tempo, no dates. Nothing can reconstruct a history that was never
//     written, so those series start accumulating from this build onward and
//     say so in the UI rather than showing an empty chart with no explanation.
//
// Charts are hand-drawn SVG. A charting library would be several times the
// size of this entire file for four small charts.

const TREND_MAX_POINTS = 400;   // ~a year of daily sessions

function trendStore() {
  const d = loadProgress();
  if (!d.trends) d.trends = { chordBpm: {}, quizAccuracy: [], lrAccuracy: [] };
  if (!d.trends.chordBpm) d.trends.chordBpm = {};
  if (!d.trends.quizAccuracy) d.trends.quizAccuracy = [];
  if (!d.trends.lrAccuracy) d.trends.lrAccuracy = [];
  return d;
}

// One point per series per day: practising the same thing twice in a day
// should refine that day's value, not create two competing points.
function recordTrendPoint(series, value, pairKey) {
  if (!(value >= 0) || typeof loadProgress !== 'function') return;
  const d = trendStore();
  const list = pairKey
    ? (d.trends.chordBpm[pairKey] || (d.trends.chordBpm[pairKey] = []))
    : d.trends[series];
  if (!Array.isArray(list)) return;
  const today = todayKey();
  const last = list[list.length - 1];
  if (last && last.d === today) {
    // Keep the best of the day for BPM, the latest for accuracy.
    last.v = series === 'chordBpm' ? Math.max(last.v, value) : value;
  } else {
    list.push({ d: today, v: value });
    if (list.length > TREND_MAX_POINTS) list.shift();
  }
  saveProgress(d);
}

// ── SVG helpers ────────────────────────────────────────────────────────────
function trendCssVar(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
  catch (e) { return fallback; }
}

function trendLineChart(points, opts) {
  const o = Object.assign({ w: 260, h: 78, pad: 8, colour: trendCssVar('--amber', '#c8a84b'), unit: '' }, opts || {});
  if (!points.length) return '';
  const vals = points.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max = min + 1; }               // flat series still needs a band
  const innerW = o.w - o.pad * 2, innerH = o.h - o.pad * 2;
  const x = i => o.pad + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = v => o.pad + innerH - ((v - min) / (max - min)) * innerH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${o.h - o.pad}L${x(0).toFixed(1)},${o.h - o.pad}Z`;
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2" fill="${o.colour}"/>`).join('');
  // Direction is the point of the chart, so state it in words too.
  const first = points[0].v, last = points[points.length - 1].v;
  const delta = last - first;
  const dir = points.length < 2 ? 'first point'
    : delta > 0 ? `up ${Math.round(delta)}${o.unit}`
    : delta < 0 ? `down ${Math.round(-delta)}${o.unit}` : 'flat';
  const dirClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return `<div class="trend-chart">
    <svg viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none" role="img" aria-label="${dir}">
      <path d="${area}" fill="${o.colour}" opacity=".12"/>
      <path d="${line}" fill="none" stroke="${o.colour}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>
    <div class="trend-meta">
      <span class="trend-range">${Math.round(min)}${o.unit} – ${Math.round(max)}${o.unit}</span>
      <span class="trend-dir ${dirClass}">${dir}</span>
    </div>
  </div>`;
}

function trendBarChart(bars, opts) {
  const o = Object.assign({ w: 300, h: 70, colour: trendCssVar('--amber', '#c8a84b') }, opts || {});
  const max = Math.max(1, ...bars.map(b => b.v));
  const bw = o.w / bars.length;
  const rects = bars.map((b, i) => {
    const h = (b.v / max) * (o.h - 10);
    const x = i * bw;
    return `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${(o.h - h).toFixed(1)}" ` +
           `width="${(bw * 0.7).toFixed(1)}" height="${Math.max(b.v > 0 ? 1.5 : 0, h).toFixed(1)}" ` +
           `fill="${o.colour}" opacity="${b.v > 0 ? 0.85 : 0.15}"><title>${b.label}: ${b.title}</title></rect>`;
  }).join('');
  return `<div class="trend-chart">
    <svg viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none" role="img" aria-label="Practice time per day">${rects}</svg>
  </div>`;
}

// ── Sections ───────────────────────────────────────────────────────────────
function renderChordSpeedTrend(d) {
  const series = Object.entries(d.trends.chordBpm || {})
    .filter(([, pts]) => pts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4);
  if (!series.length) {
    return `<div class="trend-block"><div class="trend-title">Chord switching speed</div>
      <div class="trend-empty">No tempo history yet. Chord-switch BPM was never recorded before this build — play the Chord Game with self-grading on and a line will appear here after two sessions.</div></div>`;
  }
  return series.map(([pair, pts]) => `<div class="trend-block">
    <div class="trend-title">${pair.replace('>', ' → ')}<span class="trend-sub">best BPM per session</span></div>
    ${trendLineChart(pts, { unit: '', colour: trendCssVar('--amber', '#c8a84b') })}
  </div>`).join('');
}

function renderAccuracyTrend(d) {
  const blocks = [];
  const add = (label, pts, colour) => {
    if (pts.length >= 2) {
      blocks.push(`<div class="trend-block"><div class="trend-title">${label}<span class="trend-sub">accuracy per session</span></div>
        ${trendLineChart(pts, { unit: '%', colour })}</div>`);
    }
  };
  add('Fretboard quiz', d.trends.quizAccuracy || [], trendCssVar('--blue', '#4a9eff'));
  add('Listen &amp; Repeat', d.trends.lrAccuracy || [], trendCssVar('--success', '#4a9e6a'));
  if (!blocks.length) {
    return `<div class="trend-block"><div class="trend-title">Accuracy</div>
      <div class="trend-empty">No per-session accuracy history yet — only running totals were stored before this build. Finish two quiz or Listen &amp; Repeat sessions and the trend appears.</div></div>`;
  }
  return blocks.join('');
}

function renderPracticeTimeTrend(d) {
  const bars = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = dateKey(dt);
    const day = (d.days || {})[key];
    const mins = day ? Math.round(((day.scaleSeconds || 0) + (day.songSessions || 0) * 60) / 60) : 0;
    bars.push({ v: mins, label: key, title: mins ? mins + ' min' : 'no practice' });
  }
  const total = bars.reduce((a, b) => a + b.v, 0);
  const active = bars.filter(b => b.v > 0).length;
  return `<div class="trend-block">
    <div class="trend-title">Practice time<span class="trend-sub">last 30 days</span></div>
    ${trendBarChart(bars)}
    <div class="trend-meta"><span class="trend-range">${active} of 30 days</span><span class="trend-dir flat">${total} min total</span></div>
  </div>`;
}

function renderScaleCoverage(d) {
  const since = new Date(); since.setDate(since.getDate() - 6);
  const practised = new Set();
  Object.entries(d.days || {}).forEach(([key, day]) => {
    if (new Date(key + 'T00:00:00') >= new Date(dateKey(since) + 'T00:00:00')) {
      (day.scalesPracticed || []).forEach(n => practised.add(n));
    }
  });
  const all = (typeof ALL_SCALES !== 'undefined') ? ALL_SCALES : [];
  const chips = all.map(s =>
    `<span class="coverage-chip ${practised.has(s.name) ? 'done' : 'untouched'}">${s.name}</span>`
  ).join('');
  return `<div class="trend-block">
    <div class="trend-title">Scale coverage<span class="trend-sub">this week</span></div>
    <div class="coverage-grid">${chips}</div>
    <div class="trend-meta"><span class="trend-range">${practised.size} of ${all.length} touched</span>
      <span class="trend-dir ${practised.size ? 'up' : 'flat'}">${all.length - practised.size} untouched</span></div>
  </div>`;
}

function renderTrends() {
  const el = document.getElementById('trends-body');
  if (!el) return;
  const d = trendStore();
  el.innerHTML =
    renderPracticeTimeTrend(d) + renderScaleCoverage(d) +
    renderChordSpeedTrend(d) + renderAccuracyTrend(d);
}

function toggleTrends() {
  const body = document.getElementById('trends-body');
  const chev = document.getElementById('trends-chevron');
  if (!body) return;
  const open = body.classList.contains('collapsed');
  body.classList.toggle('collapsed', !open);
  if (chev) chev.textContent = open ? '▾' : '▸';
  if (open) renderTrends();
  if (typeof loadProgress === 'function') {
    const d = loadProgress(); d.ui.trendsOpen = open; saveProgress(d);
  }
}
