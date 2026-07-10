// utils.js
// ------------------------------------------------------------------
// どのモジュールからも使われる可能性がある、小さな汎用ヘルパー関数群。
// ------------------------------------------------------------------

export function escapeHtml(t) {
  return t ? t.toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : '';
}

// 全角英数字→半角、小文字化、空白/ハイフン/アンダースコア除去 (曲名の曖昧一致用)
export function normalizeString(str) {
  if (!str) return "";
  return str
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\s\-_・]/g, '');
}

export function levenshtein(s1, s2) {
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

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ratio(0..1) x/y/w/h が画像範囲をはみ出さないように丸める
export function clampRegion(region) {
  let { x, y, w, h } = region;
  x = clamp(x, 0, 1);
  y = clamp(y, 0, 1);
  w = clamp(w, 0.005, 1 - x);
  h = clamp(h, 0.005, 1 - y);
  return { x, y, w, h };
}

let uidCounter = 0;
export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}_${Date.now()}_${uidCounter}_${Math.floor(Math.random() * 1e6)}`;
}

export function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// 次の描画フレームまで処理を逃がす (UIをブロックしないための小休止)
export function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 数値を安全にパースする (空文字/NaNは0扱い)
export function toIntSafe(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function formatDateShort(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  } catch (e) {
    return '';
  }
}
