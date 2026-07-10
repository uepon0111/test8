// ===================================================================
// data-loader.js
// Builds `allRecords` from Google Drive.
//
// Efficiency changes vs. the original (see drive-api.js header for the
// caching rationale):
//   - The song-folder listing and the result-file listing are
//     independent reads, so they now run concurrently via Promise.all
//     instead of one-after-another.
//   - Every folder discovered here is seeded into the shared folder
//     cache, so opening the upload/edit workflow afterwards for an
//     existing song does not re-query Drive for its folder.
//   - The file listing now also asks for `createdTime` (used as the
//     "追加日" / added-date sort key) and `properties` (perfect/great/
//     combo/breakdown counts) in the same request - no extra round trip.
// ===================================================================

async function fetchDataFromDrive() {
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('result-count').innerText = 'データ取得中...';
  document.getElementById('loader-text').innerText = 'リザルト情報を取得中...';

  try {
    const rootFolder = await getFolderByName(ROOT_FOLDER_NAME);
    if (!rootFolder) { allRecords = []; onDataLoaded(); return; }
    seedFolderCacheEntry(ROOT_FOLDER_NAME, null, rootFolder.id);

    const fcFolder = await getFolderByName(FC_FOLDER_NAME, rootFolder.id);
    if (!fcFolder) { allRecords = []; onDataLoaded(); return; }
    seedFolderCacheEntry(FC_FOLDER_NAME, rootFolder.id, fcFolder.id);

    const folderQuery = `'${fcFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const fileQuery = `name contains 'FC' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;

    // These two listings don't depend on each other - fetch in parallel.
    const [songFolders, candidateFiles] = await Promise.all([
      fetchAllDriveItems(folderQuery, "id, name"),
      fetchAllDriveItems(fileQuery, "id, name, parents, thumbnailLink, createdTime, properties"),
    ]);

    const folderMap = new Map();
    songFolders.forEach(folder => {
      const metadata = parseFolderTitle(folder.name);
      if (metadata) {
        folderMap.set(folder.id, { ...metadata, folderId: folder.id });
        seedFolderCacheEntry(folder.name, fcFolder.id, folder.id);
      }
    });

    if (songFolders.length === 0) { allRecords = []; onDataLoaded(); return; }

    const records = [];
    candidateFiles.forEach(file => {
      if (!file.parents || file.parents.length === 0) return;
      const parentId = file.parents.find(p => folderMap.has(p));
      if (parentId) {
        const songInfo = folderMap.get(parentId);
        const missCount = parseScore(file.name);
        const props = file.properties || {};
        records.push({
          id: file.id,
          parentId: parentId,
          title: songInfo.title,
          level: songInfo.level,
          difficulty: songInfo.difficulty,
          difficultyRaw: songInfo.rawDiff,
          missCount: missCount,
          isFC: (missCount === 0),
          thumbnail: file.thumbnailLink || null,
          addedDate: file.createdTime || null,
          perfect: readIntProperty(props, 'perfect'),
          great: readIntProperty(props, 'great'),
          combo: readIntProperty(props, 'combo'),
          goodDetail: readIntProperty(props, 'good'),
          badDetail: readIntProperty(props, 'bad'),
          missDetail: readIntProperty(props, 'missDetail'),
        });
      }
    });

    annotateBestFlags(records);
    allRecords = records;
    onDataLoaded();
  } catch (e) {
    console.error(e);
    loader.style.display = 'none';
  }
}

function onDataLoaded() {
  document.getElementById('loader').style.display = 'none';
  updateView();
}

// -------------------------------------------------------------------
// "自己ベスト" (personal best) - among results sharing the same song +
// difficulty (i.e. the same Drive folder / parentId), the best one is
// whichever has the fewest misses; ties are broken by higher combo,
// then by higher PERFECT count.
// -------------------------------------------------------------------
function isBetterResult(a, b) {
  if (!b) return true;
  if (a.missCount !== b.missCount) return a.missCount < b.missCount;
  const aCombo = a.combo ?? -1, bCombo = b.combo ?? -1;
  if (aCombo !== bCombo) return aCombo > bCombo;
  const aPerfect = a.perfect ?? -1, bPerfect = b.perfect ?? -1;
  if (aPerfect !== bPerfect) return aPerfect > bPerfect;
  return false;
}

function computeBestRecordMap(records) {
  const map = new Map(); // parentId -> best record in `records`
  for (const r of records) {
    const cur = map.get(r.parentId);
    if (!cur || isBetterResult(r, cur)) map.set(r.parentId, r);
  }
  return map;
}

function annotateBestFlags(records) {
  const bestMap = computeBestRecordMap(records);
  const bestIds = new Set(Array.from(bestMap.values()).map(r => r.id));
  records.forEach(r => { r.isBest = bestIds.has(r.id); });
}
