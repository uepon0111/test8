// drive-service.js
// ------------------------------------------------------------------
// Google Drive 上でのデータの持ち方(保存方式)と、それに対する
// アップロード / 編集 / 削除 / 取得のドメインロジックを担当するモジュール。
//
// ■ 効率化した保存方式について
//   旧バージョン: 「プロセカリザルト」→「FC」→「{レベル}{難易度} {曲名}」フォルダ→
//                 「FC」または「FC-{ミス数}」ファイル、という3階層のフォルダ構造で、
//                 曲ごとに毎回フォルダの検索/作成が必要だった上、一覧取得時も
//                 フォルダ一覧・ファイル名によるグローバル検索など複数回のAPI呼び出しが必要だった。
//   新バージョン: 「プロセカリザルト」フォルダ直下にファイルをフラットに配置し、
//                 曲名・レベル・難易度・PERFECT/GREAT/GOOD/BAD/MISS/コンボ等の情報は
//                 ファイルの properties (Driveのカスタムメタデータ) に構造化して保存する。
//                 これにより一覧取得は「ルートフォルダ検索 + 直下ファイル一覧」の
//                 わずか2回のAPI呼び出しで完結し、アップロード時も曲ごとのフォルダ作成が不要になる。
//
// ■ 後方互換性
//   旧バージョンで保存された既存データ(3階層フォルダ構造)は読み取り専用の互換パスで
//   引き続き表示される(legacy: true としてマークされる)。PERFECT/GREAT/コンボ等の
//   詳細情報は旧データには存在しないため null (不明) として扱う。
//   これらのレコードを編集すると、新方式(フラット構造 + properties)へ自動的に移行される。
// ------------------------------------------------------------------

import { state } from './state.js';
import {
  DRIVE_ROOT_FOLDER_NAME, LEGACY_FC_FOLDER_NAME,
  DRIVE_PROP_KEYS, DRIVE_SCHEMA_VERSION, DIFF_BY_CODE,
} from './config.js';
import { toIntSafe, normalizeString } from './utils.js';
import {
  fetchAllDriveItems, getFolderByName, findOrCreateFolder,
  uploadFileMultipart, updateFileMetadata, deleteFile,
} from './drive-api.js';

// ================================================================
// レコード ⇔ Drive properties 変換
// ================================================================
function dataToProperties(data) {
  const props = {
    [DRIVE_PROP_KEYS.SCHEMA]: DRIVE_SCHEMA_VERSION,
    [DRIVE_PROP_KEYS.TITLE]: String(data.title || ''),
    [DRIVE_PROP_KEYS.LEVEL]: String(data.level ?? ''),
    [DRIVE_PROP_KEYS.DIFF]: String(data.diff || ''),
    [DRIVE_PROP_KEYS.PERFECT]: String(toIntSafe(data.perfect, 0)),
    [DRIVE_PROP_KEYS.GREAT]: String(toIntSafe(data.great, 0)),
    [DRIVE_PROP_KEYS.GOOD]: String(toIntSafe(data.good, 0)),
    [DRIVE_PROP_KEYS.BAD]: String(toIntSafe(data.bad, 0)),
    [DRIVE_PROP_KEYS.MISS]: String(toIntSafe(data.missDetail ?? data.miss, 0)),
    [DRIVE_PROP_KEYS.COMBO]: String(toIntSafe(data.combo, 0)),
  };
  if (data.musicId) props[DRIVE_PROP_KEYS.MUSIC_ID] = String(data.musicId);
  return props;
}

function propertiesToRecord(file) {
  const p = file.properties || {};
  const diffCode = p[DRIVE_PROP_KEYS.DIFF] || 'E';
  const diffDef = DIFF_BY_CODE[diffCode] || DIFF_BY_CODE['E'];
  const good = toIntSafe(p[DRIVE_PROP_KEYS.GOOD], 0);
  const bad = toIntSafe(p[DRIVE_PROP_KEYS.BAD], 0);
  const miss = toIntSafe(p[DRIVE_PROP_KEYS.MISS], 0);
  const missCount = good + bad + miss;
  return {
    id: file.id,
    parentId: (file.parents && file.parents[0]) || null,
    title: p[DRIVE_PROP_KEYS.TITLE] || file.name || '',
    level: p[DRIVE_PROP_KEYS.LEVEL] || '',
    difficultyRaw: diffCode,
    difficulty: diffDef.label,
    musicId: p[DRIVE_PROP_KEYS.MUSIC_ID] ? parseInt(p[DRIVE_PROP_KEYS.MUSIC_ID], 10) : null,
    perfect: toIntSafe(p[DRIVE_PROP_KEYS.PERFECT], 0),
    great: toIntSafe(p[DRIVE_PROP_KEYS.GREAT], 0),
    good, bad, miss,
    missCount,
    isFC: missCount === 0,
    combo: toIntSafe(p[DRIVE_PROP_KEYS.COMBO], 0),
    thumbnail: file.thumbnailLink || null,
    addedDate: file.createdTime || null,
    legacy: false,
  };
}

function buildFileName(data) {
  const missSummary = toIntSafe(data.totalMiss, 0) === 0 ? 'FC' : `FC-${toIntSafe(data.totalMiss, 0)}`;
  return `${data.level}${data.diff} ${data.title} - ${missSummary}`;
}

// ================================================================
// 旧形式 (フォルダ階層) の読み取り専用パース処理 — 元アプリのロジックを踏襲
// ================================================================
function parseFolderTitleLegacy(folderName) {
  const regex = /^(\d+)([AMEH])\s+(.+)$/;
  const match = folderName.match(regex);
  if (!match) return null;
  const diffMap = { 'A': 'APPEND', 'M': 'MASTER', 'E': 'EXPERT', 'H': 'HARD' };
  return { level: parseInt(match[1], 10), rawDiff: match[2], difficulty: diffMap[match[2]] || match[2], title: match[3] };
}
function parseScoreLegacy(fileName) {
  const match = fileName.match(/^FC(?:-(\d+))?/);
  return match ? (match[1] === undefined ? 0 : parseInt(match[1], 10)) : null;
}

async function fetchLegacyStyleRecords(rootFolderId) {
  const fcFolder = await getFolderByName(LEGACY_FC_FOLDER_NAME, rootFolderId);
  if (!fcFolder) return [];

  const folderQuery = `'${fcFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const songFolders = await fetchAllDriveItems(folderQuery, "id, name");

  const folderMap = new Map();
  songFolders.forEach(folder => {
    const metadata = parseFolderTitleLegacy(folder.name);
    if (metadata) folderMap.set(folder.id, { ...metadata, folderId: folder.id });
  });
  if (folderMap.size === 0) return [];

  const fileQuery = `name contains 'FC' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  const candidateFiles = await fetchAllDriveItems(fileQuery, "id, name, parents, thumbnailLink, createdTime");

  const records = [];
  candidateFiles.forEach(file => {
    if (!file.parents || file.parents.length === 0) return;
    const parentId = file.parents.find(p => folderMap.has(p));
    if (!parentId) return;
    const songInfo = folderMap.get(parentId);
    const missCount = parseScoreLegacy(file.name);
    if (missCount === null) return;
    records.push({
      id: file.id,
      parentId: parentId,
      title: songInfo.title,
      level: songInfo.level,
      difficulty: songInfo.difficulty,
      difficultyRaw: songInfo.rawDiff,
      musicId: null,
      perfect: null, great: null, good: null, bad: null, miss: null,
      missCount: missCount,
      isFC: (missCount === 0),
      combo: null,
      thumbnail: file.thumbnailLink || null,
      addedDate: file.createdTime || null,
      legacy: true,
    });
  });
  return records;
}

async function fetchNewStyleRecords(rootFolderId) {
  const fileQuery = `'${rootFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  const files = await fetchAllDriveItems(fileQuery, 'id, name, parents, thumbnailLink, createdTime, properties');
  return files
    .filter(f => f.properties && f.properties[DRIVE_PROP_KEYS.SCHEMA])
    .map(propertiesToRecord);
}

// ================================================================
// データ取得
// ================================================================
export async function fetchDataFromDrive() {
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('result-count').innerText = 'データ取得中...';
  document.getElementById('loader-text').innerText = 'データを読み込み中...';

  try {
    const rootFolder = await getFolderByName(DRIVE_ROOT_FOLDER_NAME);
    if (!rootFolder) { state.allRecords = []; onDataLoaded(); return; }

    document.getElementById('loader-text').innerText = 'リザルトを取得中...';
    const [newRecords, legacyRecords] = await Promise.all([
      fetchNewStyleRecords(rootFolder.id),
      fetchLegacyStyleRecords(rootFolder.id),
    ]);

    state.allRecords = [...newRecords, ...legacyRecords];
    onDataLoaded();
  } catch (e) {
    console.error(e);
    loader.style.display = 'none';
  }
}

function onDataLoaded() {
  document.getElementById('loader').style.display = 'none';
  document.dispatchEvent(new Event('prsk:data-loaded'));
}

// ================================================================
// 自己ベスト判定
// ================================================================
// 曲+難易度の組をキー化する (musicId が分かればそれを優先し、無ければ曲名を正規化して使う)
function groupKeyFor(rec) {
  if (rec.musicId) return `m:${rec.musicId}:${rec.difficultyRaw}`;
  return `t:${normalizeString(rec.title)}:${rec.level}:${rec.difficultyRaw}`;
}

function isStrictlyBetter(a, b) {
  if (a.missCount !== b.missCount) return a.missCount < b.missCount;
  if (a.id === b.id) return false;
  const aCombo = a.combo ?? -1, bCombo = b.combo ?? -1;
  if (aCombo !== bCombo) return aCombo > bCombo;
  const aPerf = a.perfect ?? -1, bPerf = b.perfect ?? -1;
  if (aPerf !== bPerf) return aPerf > bPerf;
  return false;
}

// records配列から「曲+難易度ごとの自己ベスト」を Map<key, record> として算出する
export function computeBestMap(records) {
  const map = new Map();
  for (const r of records) {
    const key = groupKeyFor(r);
    const cur = map.get(key);
    if (!cur || isStrictlyBetter(r, cur)) map.set(key, r);
  }
  return map;
}

// 指定したレコードが、そのMap上で「そのグループの自己ベスト」と同一のものかどうかを判定する
export function isPersonalBest(record, bestMap) {
  const key = groupKeyFor(record);
  const best = bestMap.get(key);
  return !!best && best.id === record.id;
}

// 実行前後の自己ベストMapを比較し、「更新された」項目の一覧を返す
export function detectImprovements(beforeMap, afterMap) {
  const improvements = [];
  for (const [key, afterRec] of afterMap) {
    const beforeRec = beforeMap.get(key);
    if (!beforeRec) continue; // 新規曲(比較対象なし)は「更新」の対象外
    if (isStrictlyBetter(afterRec, beforeRec)) {
      improvements.push({ record: afterRec, previous: beforeRec });
    }
  }
  return improvements;
}

// ================================================================
// アップロード / 編集 / 削除
// ================================================================

// statusCallback(itemId, state: 'processing'|'success'|'error', label) — UI更新はbatch-modal.js側で行う
export async function executeUploads(statusCallback) {
  let successCount = 0;
  const rootFolder = await findOrCreateFolder(DRIVE_ROOT_FOLDER_NAME);

  for (const item of [...state.editorQueue]) {
    statusCallback(item.id, 'processing', '送信中');
    try {
      if (!item.data.title || !item.data.level) throw new Error("必須項目不足");

      const fileName = buildFileName(item.data);
      const properties = dataToProperties(item.data);
      const meta = { name: fileName, parents: [rootFolder.id], properties };
      await uploadFileMultipart(item.file, meta);

      state.editorQueue = state.editorQueue.filter(q => q.id !== item.id);
      statusCallback(item.id, 'success');
      successCount++;
    } catch (e) {
      console.error(e);
      statusCallback(item.id, 'error', '失敗');
    }
  }
  return successCount;
}

export async function executeEdits(statusCallback) {
  let successCount = 0;
  const rootFolder = await findOrCreateFolder(DRIVE_ROOT_FOLDER_NAME);

  for (const item of [...state.editorQueue]) {
    statusCallback(item.id, 'processing', '保存中');
    try {
      if (!item.data.title || !item.data.level) throw new Error("必須項目不足");

      const newFileName = buildFileName(item.data);
      const properties = dataToProperties(item.data);
      const params = { resource: { name: newFileName, properties } };

      if (item.legacy) {
        // 旧形式(ネストしたフォルダ内)のファイルをルート直下へ移動しつつ新形式化する
        params.addParents = rootFolder.id;
        params.removeParents = item.originalParent;
      }
      // 新形式は既にルート直下にあるため親の付け替えは不要

      await updateFileMetadata(item.originalId, params);

      state.editorQueue = state.editorQueue.filter(q => q.id !== item.id);
      statusCallback(item.id, 'success');
      successCount++;
    } catch (e) {
      console.error(e);
      statusCallback(item.id, 'error', '失敗');
    }
  }
  return successCount;
}

export async function deleteRecordById(id) {
  await deleteFile(id);
}

export async function deleteRecordsByIds(ids) {
  for (const id of ids) {
    await deleteFile(id);
  }
}
