// The only module that knows where the data lives. Today that is IndexedDB in this
// browser. A later sync or Lernplattform backend replaces this file and nothing else:
// keep the exported functions and their shapes.

const DB_NAME = 'zeitstrahl';
const SCHEMA = 1;

let dbPromise;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('events', { keyPath: 'id' });
      req.result.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req instanceof IDBRequest ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

// Ask the browser not to evict the data (Safari otherwise may after a few weeks).
let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

export async function getSettings() {
  return (await tx('settings', 'readonly', s => s.get('main'))) ?? null;
}

export async function setSettings(settings) {
  askPersist();
  await tx('settings', 'readwrite', s => s.put({ ...settings, version: SCHEMA }, 'main'));
}

export async function loadEvents() {
  return (await tx('events', 'readonly', s => s.getAll())) ?? [];
}

export async function saveEvent(ev) {
  askPersist();
  const now = new Date().toISOString();
  const full = { ...ev, id: ev.id ?? crypto.randomUUID(), createdAt: ev.createdAt ?? now, updatedAt: now };
  await tx('events', 'readwrite', s => s.put(full));
  return full;
}

export async function deleteEvent(id) {
  await tx('events', 'readwrite', s => s.delete(id));
}

export async function clearAll() {
  await tx('events', 'readwrite', s => s.clear());
  await tx('settings', 'readwrite', s => s.clear());
}

export async function exportJSON() {
  return JSON.stringify({
    app: 'zeitstrahl',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    events: await loadEvents(),
  }, null, 2);
}

// Replaces everything with the file's contents. Throws on a file that is not ours.
export async function importJSON(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'zeitstrahl' || !data.settings?.birthDate || !Array.isArray(data.events)) {
    throw new Error('not-a-zeitstrahl-file');
  }
  await clearAll();
  await setSettings(data.settings);
  for (const ev of data.events) await tx('events', 'readwrite', s => s.put(ev));
}
