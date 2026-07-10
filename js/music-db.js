// ===================================================================
// music-db.js
// Fetches the community "sekai-master-db-diff" music/difficulty tables
// and provides fuzzy title matching + level lookup used by OCR analysis.
// (Logic ported as-is from the original single-file version.)
// ===================================================================

async function fetchMusicDb() {
  try {
    const [musicsResp, diffsResp] = await Promise.all([
      fetch('https://sekai-world.github.io/sekai-master-db-diff/musics.json'),
      fetch('https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json'),
    ]);
    dbMusics = await musicsResp.json();
    dbDiffs = await diffsResp.json();
  } catch (e) {
    console.error('楽曲DB取得エラー', e);
  }
}

function normalizeString(str) {
  if (!str) return "";
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\s\-_]/g, '');
}

function levenshtein(s1, s2) {
  if (s1.length > s2.length) [s1, s2] = [s2, s1];
  let dist = Array.from({ length: s1.length + 1 }, (_, i) => i);
  for (let i2 = 0; i2 < s2.length; i2++) {
    let newDist = [i2 + 1];
    for (let i1 = 0; i1 < s1.length; i1++) {
      if (s1[i1] === s2[i2]) newDist.push(dist[i1]);
      else newDist.push(1 + Math.min(dist[i1], dist[i1 + 1], newDist[newDist.length - 1]));
    }
    dist = newDist;
  }
  return dist[dist.length - 1];
}

function findBestMatchMusic(ocrText) {
  if (!dbMusics || dbMusics.length === 0) return null;
  const target = normalizeString(ocrText);
  if (target.length === 0) return null;
  let bestMatch = null, minScore = Infinity;
  for (const music of dbMusics) {
    const dbTitleNorm = normalizeString(music.title);
    const dist = levenshtein(target, dbTitleNorm);
    const score = dist / Math.max(target.length, dbTitleNorm.length);
    if (score < minScore) { minScore = score; bestMatch = music; }
  }
  return bestMatch;
}

function getLevelFromDb(musicId, diffKey) {
  if (!musicId || !diffKey || !dbDiffs) return null;
  const entry = dbDiffs.find(d => d.musicId === musicId && d.musicDifficulty === diffKey);
  return entry ? entry.playLevel : null;
}
