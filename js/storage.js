// ═══════════════════════════════════════════════════════════════════════════
// DURABLE STORAGE — IndexedDB-backed, with localStorage as a synchronous mirror
// ═══════════════════════════════════════════════════════════════════════════
//
// Why both, rather than IndexedDB alone:
//
// loadProgress()/saveProgress() are SYNCHRONOUS and called from several hundred
// sites across every file in the app — inside render loops, inside click
// handlers, at script-load time in scales.js before progress.js has even run.
// IndexedDB has no synchronous API, so "just move to IndexedDB" would mean
// making every one of those call sites async and awaiting them, which is a
// rewrite of the whole app's control flow for a storage change.
//
// So the split is:
//   • localStorage — the working mirror. Synchronous, so every existing caller
//     keeps working untouched. This is what reads actually hit.
//   • IndexedDB   — the durable store. Written through on every save. Not
//     cleared under storage pressure the way localStorage is, no ~5MB cap.
//
// On boot, recoverFromDurableStore() compares the two and repopulates
// localStorage from IndexedDB for any key localStorage has lost. That is the
// case this exists for: the browser evicted localStorage, or the user is in a
// fresh private window, and months of practice history would otherwise be gone.
//
// Net effect: the durability goal is met (data survives localStorage eviction)
// with zero changes to the synchronous API every other file depends on.

const IDB_NAME = 'gpt_store';
const IDB_STORE = 'kv';
const IDB_TAKES = 'takes';
const IDB_LICKS = 'licks';
const IDB_VERSION = 3;   // v2 added 'takes'; v3 adds 'licks' (captured lick audio + analysis)

// Every store this app needs. Creation is guarded by contains() rather than
// keyed off the old version number, so arriving from v1, v2 or a fresh install
// all take the same path.
const IDB_REQUIRED_STORES = [IDB_STORE, IDB_TAKES, IDB_LICKS];

function idbCreateMissingStores(db) {
  if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
  // Audio blobs live in their own stores: they are large, binary, and must
  // never be swept by the gpt_-prefixed key logic that mirrors to
  // localStorage — a few MB of audio would blow its ~5MB budget instantly.
  if (!db.objectStoreNames.contains(IDB_TAKES)) {
    db.createObjectStore(IDB_TAKES, { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains(IDB_LICKS)) {
    db.createObjectStore(IDB_LICKS, { keyPath: 'id', autoIncrement: true });
  }
}

function idbRawOpen(version) {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
    const req = version ? indexedDB.open(IDB_NAME, version) : indexedDB.open(IDB_NAME);
    req.onupgradeneeded = () => idbCreateMissingStores(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _idbPromise = null;
// SELF-HEALING SCHEMA, and it is not defensive programming for its own sake —
// this was hit for real. An IndexedDB version is a one-way door per browser
// profile: once the database reaches version N, onupgradeneeded never fires
// for version N again. So if a page load ever happens while IDB_VERSION has
// been bumped but the matching createObjectStore has not shipped yet — a
// partial deploy, a half-saved file with live-reload watching, a cached JS
// file paired with fresh HTML — the database lands on the new version
// permanently MISSING a store, and no amount of reloading fixes it.
//
// It failed silently too: every accessor here ends in .catch(() => []), so a
// missing store read as an empty library rather than an error.
//
// So after opening, verify the stores actually exist and reopen one version
// higher if any are absent. That turns an unrecoverable state into a
// self-correcting one on the next load.
// A repair leaves the database ABOVE IDB_VERSION, so opening at the hardcoded
// constant afterwards throws VersionError ("requested version 3 is less than
// the existing version 4") and every subsequent load fails outright — a worse
// bug than the one being repaired. So the open is always version-less first,
// which lands on whatever version actually exists (and creates every store via
// onupgradeneeded for a brand-new database), and the constant is treated as a
// FLOOR to upgrade to rather than an exact version to demand.
function idbOpen() {
  if (_idbPromise) return _idbPromise;
  _idbPromise = (async () => {
    let db = await idbRawOpen();                       // whatever version is there now
    if (db.version < IDB_VERSION) {                    // normal upgrade path (v1/v2 -> v3)
      db.close();
      db = await idbRawOpen(IDB_VERSION);
    }
    const missing = IDB_REQUIRED_STORES.filter(s => !db.objectStoreNames.contains(s));
    if (missing.length) {                              // repair path, see the note above
      console.warn('IndexedDB is missing stores', missing, '— upgrading to repair');
      const next = db.version + 1;
      db.close();
      db = await idbRawOpen(next);
    }
    return db;
  })();
  return _idbPromise;
}

function idbSet(key, value) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  })).catch(() => {}); // storage failures must never break practice
}

function idbGet(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  })).catch(() => undefined);
}

function idbDelete(key) {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  })).catch(() => {});
}

function idbKeys() {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const r = tx.objectStore(IDB_STORE).getAllKeys();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => resolve([]);
  })).catch(() => []);
}

// ── The API the rest of the app uses ──────────────────────────────────────
// durableGet is synchronous (reads the mirror); durableSet writes both.
function durableGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function durableSet(key, value) {
  try { localStorage.setItem(key, value); }
  catch (e) { /* quota/private mode — IndexedDB below is the real store */ }
  idbSet(key, value);
}
function durableRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
  idbDelete(key);
}

// ── Boot recovery ─────────────────────────────────────────────────────────
// Runs once after load. If IndexedDB holds keys that localStorage has lost,
// restore them. Returns the number of keys recovered.
async function recoverFromDurableStore() {
  let recovered = 0;
  try {
    const keys = await idbKeys();
    for (const k of keys) {
      if (typeof k !== 'string' || !k.startsWith('gpt_')) continue;
      let local = null;
      try { local = localStorage.getItem(k); } catch (e) {}
      if (local === null) {
        const val = await idbGet(k);
        if (typeof val === 'string') {
          try { localStorage.setItem(k, val); recovered++; } catch (e) {}
        }
      }
    }
  } catch (e) { /* nothing recoverable */ }
  return recovered;
}

// One-time upward migration: anything already in localStorage from before this
// file existed gets copied into IndexedDB so it is durable from now on.
// Runs on EVERY load, and writes every gpt_ key rather than only ones missing
// from IndexedDB. It has to be convergent rather than one-shot: a key can enter
// localStorage through a path that never called durableSet, or land there
// during the async gap while this file's boot sequence is still resolving.
// (That is exactly how gpt_profiles was missed the first time — the profiles
// meta is only written when it is first created, so an existing profile never
// triggered a write-through and the one-shot migration raced past it. Losing
// that one key is worse than losing a progress key: recovery would restore
// history under a profile id the app no longer knows about, so the data would
// come back invisible.) localStorage is authoritative while the app runs, so
// mirroring it forward unconditionally is always correct.
async function migrateLocalStorageToDurable() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('gpt_')) keys.push(k);
    }
    for (const k of keys) await idbSet(k, localStorage.getItem(k));
    return keys.length;
  } catch (e) { return 0; }
}

// Kick both off without blocking script execution. If recovery actually
// restored something, the page reloads so every module re-reads the restored
// data — the same approach profile switching already uses, and far simpler
// than asking every file for a "re-read your state" hook.
(function initDurableStorage() {
  recoverFromDurableStore().then(async n => {
    // Mirror forward first, unconditionally — so a load that recovers nothing
    // still guarantees IndexedDB matches localStorage before anything else.
    await migrateLocalStorageToDurable();
    if (n > 0) {
      console.log(`[storage] recovered ${n} key(s) from IndexedDB after localStorage loss — reloading`);
      location.reload();
    }
  });
})();

// ── Recorded takes ─────────────────────────────────────────────────────────
// Blobs only ever live in IndexedDB — never mirrored to localStorage.
function saveTake(record) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_TAKES, 'readwrite');
    const req = tx.objectStore(IDB_TAKES).add(record);
    req.onsuccess = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  }));
}
function listTakes() {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_TAKES, 'readonly');
    const r = tx.objectStore(IDB_TAKES).getAll();
    r.onsuccess = () => resolve((r.result || []).sort((a, b) => b.createdAt - a.createdAt));
    r.onerror = () => resolve([]);
  })).catch(() => []);
}
function deleteTake(id) {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_TAKES, 'readwrite');
    tx.objectStore(IDB_TAKES).delete(id);
    tx.oncomplete = resolve; tx.onerror = resolve;
  })).catch(() => {});
}
function updateTake(id, patch) {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_TAKES, 'readwrite');
    const store = tx.objectStore(IDB_TAKES);
    const g = store.get(id);
    g.onsuccess = () => { const rec = g.result; if (rec) { Object.assign(rec, patch); store.put(rec); } };
    tx.oncomplete = resolve; tx.onerror = resolve;
  })).catch(() => {});
}

// ── Captured licks ─────────────────────────────────────────────────────────
// Same store shape as takes: blob + metadata in IndexedDB only, never
// mirrored to localStorage.
function saveLick(record) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_LICKS, 'readwrite');
    const req = tx.objectStore(IDB_LICKS).add(record);
    req.onsuccess = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  }));
}
function listLicks() {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_LICKS, 'readonly');
    const r = tx.objectStore(IDB_LICKS).getAll();
    r.onsuccess = () => resolve((r.result || []).sort((a, b) => b.createdAt - a.createdAt));
    r.onerror = () => resolve([]);
  })).catch(() => []);
}
function deleteLick(id) {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_LICKS, 'readwrite');
    tx.objectStore(IDB_LICKS).delete(id);
    tx.oncomplete = resolve; tx.onerror = resolve;
  })).catch(() => {});
}
function updateLick(id, patch) {
  return idbOpen().then(db => new Promise(resolve => {
    const tx = db.transaction(IDB_LICKS, 'readwrite');
    const store = tx.objectStore(IDB_LICKS);
    const g = store.get(id);
    g.onsuccess = () => { const rec = g.result; if (rec) { Object.assign(rec, patch); store.put(rec); } };
    tx.oncomplete = resolve; tx.onerror = resolve;
  })).catch(() => {});
}
