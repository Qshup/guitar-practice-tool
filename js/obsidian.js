// ═══════════════════════════════════════════════════════════════════════════
// OBSIDIAN VAULT EXPORT — after a practice session, write a markdown summary
// straight into a folder Obsidian is already watching. No Obsidian plugin
// needed: the File System Access API (Chromium — Brave/Chrome/Edge) lets a
// page write files directly into a folder the user picks once, with
// permission persisted across reloads via a stored directory handle.
//
// Hooked into Songs mode's existing "Finish & Review" self-grade flow
// (songSaveSelfGrade() in songs.js) since that's the one place in the app
// that already collects every field the summary needs — duration, what was
// practiced, section scores, and a free-text focus-next-time note. Wiring
// the same offer into Scale Run / Chord Game / Listen & Repeat's own
// session-end points is natural follow-up work, not done this pass — see
// CLAUDE.md.
// ═══════════════════════════════════════════════════════════════════════════

const OBSIDIAN_DB_NAME = 'gpt_obsidian';
const OBSIDIAN_STORE = 'handles';
const OBSIDIAN_HANDLE_KEY = 'vaultDir';

function obsidianSupported() { return typeof window.showDirectoryPicker === 'function'; }

function openObsidianDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OBSIDIAN_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OBSIDIAN_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(key) {
  return openObsidianDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(OBSIDIAN_STORE, 'readonly').objectStore(OBSIDIAN_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function idbSet(key, val) {
  return openObsidianDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(OBSIDIAN_STORE, 'readwrite');
    tx.objectStore(OBSIDIAN_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

async function chooseObsidianVault() {
  if (!obsidianSupported()) {
    alert("Your browser doesn't support picking a folder directly (needs a Chromium browser — Brave, Chrome, Edge). You can still copy a session's exported text into Obsidian by hand.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbSet(OBSIDIAN_HANDLE_KEY, handle);
    updateObsidianStatusUI();
  } catch (e) { /* user cancelled the picker */ }
}

async function getObsidianVaultHandle() {
  if (!obsidianSupported()) return null;
  let handle;
  try { handle = await idbGet(OBSIDIAN_HANDLE_KEY); } catch (e) { return null; }
  if (!handle) return null;
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return handle;
  // Browsers require re-confirming write permission each session (a stored
  // handle alone doesn't carry it forward) — this call must run from a user
  // gesture (e.g. a click), which every call site here already is.
  const req = await handle.requestPermission({ mode: 'readwrite' });
  return req === 'granted' ? handle : null;
}

async function updateObsidianStatusUI() {
  const el = document.getElementById('obsidian-vault-status');
  if (!el) return;
  if (!obsidianSupported()) { el.textContent = 'Not supported in this browser'; return; }
  let handle = null;
  try { handle = await idbGet(OBSIDIAN_HANDLE_KEY); } catch (e) {}
  el.textContent = handle ? `Vault: ${handle.name}` : 'No vault folder chosen yet';
}

// ── Markdown summary ─────────────────────────────────────────────────────
// session: { date, durationLabel, practiced: string[], scoreLines: string[], focusNotes }
function buildSessionMarkdown(session) {
  return [
    `# Practice Session — ${session.date}`,
    '',
    `**Duration:** ${session.durationLabel}`,
    `**Practiced:** ${session.practiced.join(', ') || '—'}`,
    '',
    '## Scores & Streaks',
    ...(session.scoreLines.length ? session.scoreLines.map(l => `- ${l}`) : ['- —']),
    '',
    '## Focus Next Time',
    session.focusNotes && session.focusNotes.trim() ? session.focusNotes.trim() : '_(none noted)_',
    '',
  ].join('\n');
}

async function exportSessionToObsidian(session) {
  const handle = await getObsidianVaultHandle();
  if (!handle) {
    alert("No Obsidian vault folder is set up (or permission wasn't granted) — pick one from the Practice Progress panel first.");
    return false;
  }
  try {
    const filename = `Guitar Practice ${session.date} ${Date.now().toString(36)}.md`;
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(buildSessionMarkdown(session));
    await writable.close();
    return true;
  } catch (e) {
    alert('Could not write to the vault folder: ' + e.message);
    return false;
  }
}

// ── "Offer to export" — a dismissible button next to wherever a session was
// just saved, rather than an interrupting confirm() every time. ──
let pendingObsidianSession = null;
function offerObsidianExport(session, buttonId) {
  pendingObsidianSession = session;
  const btn = document.getElementById(buttonId);
  if (btn) btn.style.display = obsidianSupported() ? '' : 'none';
}
async function handleObsidianExportClick(buttonId) {
  if (!pendingObsidianSession) return;
  const ok = await exportSessionToObsidian(pendingObsidianSession);
  const btn = document.getElementById(buttonId);
  if (ok && btn) { btn.textContent = '✓ Exported'; setTimeout(() => { btn.style.display = 'none'; btn.textContent = '📤 Export to Obsidian'; }, 2000); }
}

updateObsidianStatusUI();
