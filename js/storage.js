const DB_NAME = 'MusicAppDB';
const DB_VERSION = 1;
let db;

export const initDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = e => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('playlists')) d.createObjectStore('playlists', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('tags')) d.createObjectStore('tags', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('artists')) d.createObjectStore('artists', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('logs')) {
      const logsStore = d.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      logsStore.createIndex('trackId', 'trackId', { unique: false });
    }
  };
  req.onsuccess = e => { db = e.target.result; resolve(); };
  req.onerror = e => reject(e);
});

const getStore = (storeName, mode) => db.transaction(storeName, mode).objectStore(storeName);

export const getAll = storeName => new Promise(res => {
  const req = getStore(storeName, 'readonly').getAll();
  req.onsuccess = () => res(req.result);
});
export const save = (storeName, data) => new Promise(res => {
  const req = getStore(storeName, 'readwrite').put(data);
  req.onsuccess = () => res();
});
export const remove = (storeName, id) => new Promise(res => {
  const req = getStore(storeName, 'readwrite').delete(id);
  req.onsuccess = () => res();
});
export const clearAll = async () => {
  await Promise.all(['tracks', 'playlists', 'tags', 'artists', 'logs'].map(s => new Promise(r => {
    const req = getStore(s, 'readwrite').clear();
    req.onsuccess = r;
  })));
};

