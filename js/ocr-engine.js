// ocr-engine.js
// ------------------------------------------------------------------
// 画像の切り抜き・前処理・Tesseract OCR・結果パースを担当するモジュール。
//
// 難易度の判定について:
//   バッジの背景色は6難易度それぞれ固有の色 (config.js の DIFFICULTIES) を
//   持っているため、まず「色のサンプリング」で判定し(高精度・OCRより頑健)、
//   十分な確信度が得られない場合のみ文字のOCR認識にフォールバックする。
//
// 判定内訳(PERFECT/GREAT/GOOD/BAD/MISS)とコンボは、
// 機種プロファイル(device-profiles.js)で設定された読み取り範囲を使用する。
// ------------------------------------------------------------------

import { DIFFICULTIES } from './config.js';
import { findBestMatchMusic, getLevelFromDb } from './music-db.js';

// --------------------------------------------------------------
// 画像切り抜き
// --------------------------------------------------------------
export async function cropImage(imageElement, region, type = 'filter-standard') {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth;
  const h = imageElement.naturalHeight;
  const ctx = canvas.getContext('2d');
  const { x: xRatio, y: yRatio, w: wRatio, h: hRatio } = region;

  if (type === 'threshold-diff') {
    const scale = 1.5;
    canvas.width = w * wRatio * scale;
    canvas.height = h * hRatio * scale;
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = (gray > 180) ? 0 : 255;
    }
    ctx.putImageData(imageData, 0, 0);
  } else if (type === 'raw') {
    canvas.width = Math.max(1, w * wRatio);
    canvas.height = Math.max(1, h * hRatio);
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
  } else {
    canvas.width = w * wRatio;
    canvas.height = h * hRatio;
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// --------------------------------------------------------------
// 難易度の色判定
// --------------------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

// 領域内から「白/黒/グレーではない、最も面積の大きい色」を抽出する。
// (バッジは背景色が単色、文字は白系のことが多いため、白系を除外することで
//  背景色 = 難易度色 を安定して取り出せる)
function sampleDominantColor(imageElement, region) {
  const w = imageElement.naturalWidth, h = imageElement.naturalHeight;
  const rx = Math.round(w * region.x), ry = Math.round(h * region.y);
  const rw = Math.max(1, Math.round(w * region.w)), rh = Math.max(1, Math.round(h * region.h));
  const canvas = document.createElement('canvas');
  canvas.width = rw; canvas.height = rh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageElement, rx, ry, rw, rh, 0, 0, rw, rh);

  let data;
  try {
    data = ctx.getImageData(0, 0, rw, rh).data;
  } catch (e) {
    // CORS などでキャンバスが汚染された場合は諦めて null を返す
    console.warn("色サンプリング失敗 (CORS制約の可能性)", e);
    return null;
  }

  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness - 255));
    if (lightness > 235 || lightness < 30) continue; // ほぼ白 or ほぼ黒 (文字・縁取り)
    if (sat < 0.15) continue; // 彩度が低いグレー系
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  if (buckets.size === 0) return null;
  let bestKey = null, bestCount = -1;
  for (const [k, c] of buckets) { if (c > bestCount) { bestCount = c; bestKey = k; } }
  const [rq, gq, bq] = bestKey.split(',').map(Number);
  return { r: (rq << 4) + 8, g: (gq << 4) + 8, b: (bq << 4) + 8 };
}

const CONFIDENT_COLOR_DISTANCE = 90; // RGBユークリッド距離のしきい値 (経験的な値)

function detectDifficultyByColor(imageElement, region) {
  const rgb = sampleDominantColor(imageElement, region);
  if (!rgb) return { difficulty: null, confident: false };
  let best = null, bestDist = Infinity;
  for (const d of DIFFICULTIES) {
    const dist = colorDistance(rgb, hexToRgb(d.color));
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return { difficulty: best, confident: bestDist <= CONFIDENT_COLOR_DISTANCE, distance: bestDist };
}

// OCRテキストから難易度を推定する (色判定が信頼できない場合のフォールバック)
function detectDifficultyByText(diffText) {
  const t = diffText.toUpperCase();
  if (t.includes('APPEND')) return DIFFICULTIES.find(d => d.code === 'A');
  if (t.includes('MASTER')) return DIFFICULTIES.find(d => d.code === 'M');
  if (t.includes('EXPERT')) return DIFFICULTIES.find(d => d.code === 'E');
  if (t.includes('HARD')) return DIFFICULTIES.find(d => d.code === 'H');
  if (t.includes('NORMAL')) return DIFFICULTIES.find(d => d.code === 'NM');
  if (t.includes('EASY')) return DIFFICULTIES.find(d => d.code === 'EZ');
  return null;
}

// --------------------------------------------------------------
// 判定内訳 / コンボ のテキストパース
// --------------------------------------------------------------
function parseLine(line, regex) {
  if (regex.test(line)) {
    const nums = line.match(/\d+/g);
    if (nums) return parseInt(nums[nums.length - 1], 10);
  }
  return 0;
}

export function parseJudgeBlock(text) {
  const lines = text.split('\n');
  let cPerfect = 0, cGreat = 0, cGood = 0, cBad = 0, cMiss = 0;
  lines.forEach(line => {
    if (/PERFE?CT/i.test(line)) cPerfect = parseLine(line, /PERFE?CT/i);
    if (/GRE[A4]T/i.test(line)) cGreat = parseLine(line, /GRE[A4]T/i);
    if (/G[O0QD]{2}D/i.test(line)) cGood = parseLine(line, /G[O0QD]{2}D/i);
    if (/BAD/i.test(line)) cBad = parseLine(line, /BAD/i);
    if (/MISS/i.test(line)) cMiss = parseLine(line, /MISS/i);
  });
  return { perfect: cPerfect, great: cGreat, good: cGood, bad: cBad, miss: cMiss };
}

export function parseComboBlock(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const nums = line.match(/\d+/g);
    if (nums && nums.length > 0) return parseInt(nums[nums.length - 1], 10);
  }
  return 0;
}

// --------------------------------------------------------------
// メイン解析処理
// profile: device-profiles.js のプロファイルオブジェクト ({ regions: {title,difficulty,judge,combo} })
// --------------------------------------------------------------
export async function analyzeLoadedImage(imgElement, worker, profile) {
  try {
    const regions = profile.regions;

    // --- 難易度 (色判定を優先、ダメならOCR) ---
    let diffResult = detectDifficultyByColor(imgElement, regions.difficulty);
    let diffMethod = 'color';
    if (!diffResult.confident) {
      const diffBlob = await cropImage(imgElement, regions.difficulty, 'threshold-diff');
      const diffRet = await worker.recognize(diffBlob, { lang: 'eng' });
      const byText = detectDifficultyByText(diffRet.data.text);
      if (byText) { diffResult = { difficulty: byText, confident: true }; diffMethod = 'ocr'; }
    }
    const diffDef = diffResult.difficulty || DIFFICULTIES.find(d => d.code === 'E');

    // --- タイトル ---
    const titleBlob = await cropImage(imgElement, regions.title, 'filter-standard');
    const titleRet = await worker.recognize(titleBlob, { lang: 'jpn' });
    const matchedMusic = findBestMatchMusic(titleRet.data.text);
    const finalTitle = matchedMusic ? matchedMusic.title : titleRet.data.text.replace(/\r?\n/g, '').trim();
    const musicId = matchedMusic ? matchedMusic.id : null;

    // --- レベル ---
    let level = "";
    if (musicId) level = getLevelFromDb(musicId, diffDef.dbKey) || "";

    // --- 判定内訳 (PERFECT/GREAT/GOOD/BAD/MISS) ---
    const judgeBlob = await cropImage(imgElement, regions.judge, 'filter-standard');
    const judgeRet = await worker.recognize(judgeBlob, { lang: 'jpn' });
    const judge = parseJudgeBlock(judgeRet.data.text);

    // --- コンボ ---
    const comboBlob = await cropImage(imgElement, regions.combo, 'filter-standard');
    const comboRet = await worker.recognize(comboBlob, { lang: 'jpn' });
    const combo = parseComboBlock(comboRet.data.text);

    return {
      title: finalTitle,
      level: level,
      diff: diffDef.code,
      diffMethod: diffMethod,
      musicId: musicId,
      perfect: judge.perfect,
      great: judge.great,
      good: judge.good,
      bad: judge.bad,
      miss: judge.miss,
      totalMiss: judge.good + judge.bad + judge.miss,
      combo: combo,
    };
  } catch (e) {
    console.error("解析エラー", e);
    return null;
  }
}

export async function createOcrWorker() {
  return await Tesseract.createWorker(['jpn', 'eng']);
}
export async function terminateOcrWorker(worker) {
  if (worker) await worker.terminate();
}
