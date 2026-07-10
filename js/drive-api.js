// ===================================================================
// drive-api.js
// Low-level Google Drive helpers.
//
// Efficiency improvements over the original (see requirement: "google
// driveのフォルダ、ファイルの保存方法効率化"):
//   1. `driveFolderCache` memoizes folder lookups/creations for the whole
//      session (not just one batch), keyed by parent+name, and stores
//      in-flight PROMISES so concurrent requests for a not-yet-created
//      folder await the same creation instead of racing to create
//      duplicates.
//   2. The cache is *seeded* from data we already fetched during the
//      initial listing (see data-loader.js), so opening the upload/edit
//      workflow for an already-known song skips a Drive lookup entirely.
//   3. `runWithConcurrency` lets batch-modal.js process several upload/
//      edit items in parallel (bounded) instead of one full network
//      round-trip at a time.
// ===================================================================

function escapeDriveQueryValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function fetchAllDriveItems(query, fields) {
  let items = [];
  let pageToken = null;
  do {
    const response = await gapi.client.drive.files.list({
      q: query, fields: `nextPageToken, files(${fields})`, pageSize: 1000, pageToken: pageToken,
    });
    if (response.result.files) items = items.concat(response.result.files);
    pageToken = response.result.nextPageToken;
  } while (pageToken);
  return items;
}

async function getFolderByName(name, parentId = null) {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapeDriveQueryValue(name)}' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const response = await gapi.client.drive.files.list({ q: query, fields: 'files(id, name)', pageSize: 1 });
  return (response.result.files && response.result.files.length > 0) ? response.result.files[0] : null;
}

async function findFileByName(fileName, parentId = null) {
  let query = `name = '${escapeDriveQueryValue(fileName)}' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const response = await gapi.client.drive.files.list({ q: query, fields: 'files(id, name)', pageSize: 1 });
  return (response.result.files && response.result.files.length > 0) ? response.result.files[0] : null;
}

// --- Folder cache -----------------------------------------------------
const driveFolderCache = new Map(); // "parentId::name" -> Promise<{id,name}>

function folderCacheKey(name, parentId) {
  return `${parentId || 'root'}::${name}`;
}

function resetDriveFolderCache() {
  driveFolderCache.clear();
}

// Registers a folder we already know about (e.g. from the main listing)
// so a later findOrCreateFolderCached() call is free.
function seedFolderCacheEntry(name, parentId, folderId) {
  driveFolderCache.set(folderCacheKey(name, parentId), Promise.resolve({ id: folderId, name }));
}

async function findOrCreateFolderCached(name, parentId = null) {
  const key = folderCacheKey(name, parentId);
  if (driveFolderCache.has(key)) return driveFolderCache.get(key);
  const creationPromise = (async () => {
    const existing = await getFolderByName(name, parentId);
    if (existing) return existing;
    const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) metadata.parents = [parentId];
    const response = await gapi.client.drive.files.create({ resource: metadata, fields: 'id, name' });
    return response.result;
  })();
  driveFolderCache.set(key, creationPromise);
  try {
    return await creationPromise;
  } catch (e) {
    driveFolderCache.delete(key); // don't cache a failure
    throw e;
  }
}

// --- Small JSON file helpers (used for settings sync) -----------------
async function uploadJsonFile(fileName, parentId, obj) {
  const content = JSON.stringify(obj);
  const existing = await findFileByName(fileName, parentId);
  const accessToken = gapi.client.getToken().access_token;
  if (existing) {
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
      method: 'PATCH',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }),
      body: content,
    });
    if (!res.ok) throw new Error('設定ファイルの更新に失敗: ' + res.statusText);
    return existing.id;
  }
  const metadata = { name: fileName, mimeType: 'application/json', parents: [parentId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }), body: form,
  });
  if (!res.ok) throw new Error('設定ファイルのアップロードに失敗: ' + res.statusText);
  const j = await res.json();
  return j.id;
}

async function downloadJsonFile(fileName, parentId) {
  const file = await findFileByName(fileName, parentId);
  if (!file) return null;
  try {
    const res = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
    const raw = (typeof res.body === 'string' && res.body.length) ? res.body : JSON.stringify(res.result || null);
    return JSON.parse(raw);
  } catch (e) {
    console.error('設定ファイルの取得に失敗', e);
    return null;
  }
}

// --- Bounded concurrency helper ---------------------------------------
// Runs `worker` over `items` with at most `limit` in flight at once.
// Each result is { ok, value } or { ok:false, error }, in item order.
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function lane() {
    while (idx < items.length) {
      const cur = idx++;
      try {
        results[cur] = { ok: true, value: await worker(items[cur], cur) };
      } catch (e) {
        results[cur] = { ok: false, error: e };
      }
    }
  }
  const laneCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: laneCount }, lane));
  return results;
}
