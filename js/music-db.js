// music-db.js
// ------------------------------------------------------------------
// sekai-world/sekai-master-db-diff から楽曲一覧・難易度別レベル一覧を取得し、
// OCRで読み取ったタイトル文字列から最も近い楽曲をあいまい検索するモジュール。
// ------------------------------------------------------------------

import { state } from './state.js';
import { MUSIC_DB_URL, MUSIC_DIFF_DB_URL } from './config.js';
import { normalizeString, levenshtein } from './utils.js';

export async function loadMusicDb() {
  try {
    const [musicsResp, diffsResp] = await Promise.all([
      fetch(MUSIC_DB_URL),
      fetch(MUSIC_DIFF_DB_URL)
    ]);
    state.dbMusics = await musicsResp.json();
    state.dbDiffs = await diffsResp.json();
    state.dbLoaded = true;
  } catch (e) {
    console.error("Music DB Error", e);
    state.dbLoaded = false;
  }
}

export function findBestMatchMusic(ocrText) {
  if (!state.dbMusics || state.dbMusics.length === 0) return null;
  const target = normalizeString(ocrText);
  if (target.length === 0) return null;
  let bestMatch = null, minScore = Infinity;
  for (const music of state.dbMusics) {
    const dbTitleNorm = normalizeString(music.title);
    const dist = levenshtein(target, dbTitleNorm);
    const score = dist / Math.max(target.length, dbTitleNorm.length, 1);
    if (score < minScore) { minScore = score; bestMatch = music; }
  }
  return bestMatch;
}

// musicId + 難易度キー(easy/normal/hard/expert/master/append) からプレイレベルを取得
export function getLevelFromDb(musicId, diffKey) {
  if (!musicId || !diffKey || !state.dbDiffs) return null;
  const entry = state.dbDiffs.find(d => d.musicId === musicId && d.musicDifficulty === diffKey);
  return entry ? entry.playLevel : null;
}

// タイトル文字列(曲名がDBに一致しなかった場合のフォールバック含む)から musicId を逆引き
export function findMusicIdByExactTitle(title) {
  if (!state.dbMusics) return null;
  const found = state.dbMusics.find(m => m.title === title);
  return found ? found.id : null;
}
