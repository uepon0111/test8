// sort-filter.js
// ------------------------------------------------------------------
// 絞り込み・並び替えのロジック。
//
// ■ 並び替えの優先度 (要件どおりに実装)
//   名前順  : 名前 → 楽曲難易度 → ミス数 → 追加日
//   レベル順: レベル → 楽曲難易度 → 名前 → ミス数 → 追加日
//   ミス数順: ミス数 → レベル → 楽曲難易度 → 名前 → 追加日
//   追加日順: 追加日
//
//   このうち「一番左(プライマリ)のキー」だけがユーザーの昇順/降順トグルに従い、
//   2番目以降のタイブレークキーは固定の既定方向 (config.js の TIEBREAK_DIRECTION)
//   を使う。例:「ミス数順」を選んでいる時、ミス数が同じ曲同士は
//   常に「レベルの高い順」→「難易度の高い順」→「名前のあいうえお順」→
//   「追加日の新しい順」の順で並ぶ (ミス数の昇順/降順に関わらず一定)。
// ------------------------------------------------------------------

import { state } from './state.js';
import { DIFF_RANK, TIEBREAK_DIRECTION, STORAGE_KEYS } from './config.js';
import { toIntSafe, nextFrame } from './utils.js';
import { computeBestMap } from './drive-service.js';
import { renderGrid, setGridLoading } from './grid-view.js';

// --------------------------------------------------------------
// 各軸(次元)ごとの昇順比較関数
// --------------------------------------------------------------
const DIMENSION_COMPARATORS = {
  name: (a, b) => a.title.localeCompare(b.title, 'ja'),
  level: (a, b) => (parseFloat(a.level) || 0) - (parseFloat(b.level) || 0),
  diff: (a, b) => (DIFF_RANK[a.difficultyRaw] || 0) - (DIFF_RANK[b.difficultyRaw] || 0),
  miss: (a, b) => a.missCount - b.missCount,
  date: (a, b) => new Date(a.addedDate || 0).getTime() - new Date(b.addedDate || 0).getTime(),
};

// 各プライマリモードのタイブレーク・カスケード (自分自身を含む、左から優先順位が高い順)
const CASCADES = {
  name: ['name', 'diff', 'miss', 'date'],
  level: ['level', 'diff', 'name', 'miss', 'date'],
  miss: ['miss', 'level', 'diff', 'name', 'date'],
  date: ['date'],
};

function buildComparator(mode, primaryDirection) {
  const cascade = CASCADES[mode] || CASCADES.level;
  return (a, b) => {
    for (let i = 0; i < cascade.length; i++) {
      const dim = cascade[i];
      const isPrimary = i === 0;
      const dir = isPrimary ? primaryDirection : TIEBREAK_DIRECTION[dim];
      const mult = dir === 'desc' ? -1 : 1;
      const cmp = DIMENSION_COMPARATORS[dim](a, b) * mult;
      if (cmp !== 0) return cmp;
    }
    return 0;
  };
}

// --------------------------------------------------------------
// 並び替え設定の保存/読み込み (localStorage)
// --------------------------------------------------------------
export function loadSortPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SORT_PREFS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.sortMode) state.sortMode = parsed.sortMode;
      if (parsed.sortDirections) Object.assign(state.sortDirections, parsed.sortDirections);
    }
  } catch (e) { /* ignore */ }
  try {
    const bestOnly = localStorage.getItem(STORAGE_KEYS.SHOW_BEST_ONLY);
    if (bestOnly !== null) state.showBestOnly = bestOnly === '1';
  } catch (e) { /* ignore */ }
}

function persistSortPrefs() {
  try {
    localStorage.setItem(STORAGE_KEYS.SORT_PREFS, JSON.stringify({
      sortMode: state.sortMode, sortDirections: state.sortDirections
    }));
  } catch (e) { /* ignore */ }
}

function persistShowBestOnly() {
  try {
    localStorage.setItem(STORAGE_KEYS.SHOW_BEST_ONLY, state.showBestOnly ? '1' : '0');
  } catch (e) { /* ignore */ }
}

// --------------------------------------------------------------
// UI ハンドラ
// --------------------------------------------------------------
export function setSortMode(mode) {
  state.sortMode = mode;
  persistSortPrefs();
  syncSortUI();
  updateView();
}

export function toggleSortDirection() {
  const cur = state.sortDirections[state.sortMode] || 'asc';
  state.sortDirections[state.sortMode] = (cur === 'asc') ? 'desc' : 'asc';
  persistSortPrefs();
  syncSortUI();
  updateView();
}

export function toggleShowBestOnly(checked) {
  state.showBestOnly = !!checked;
  persistShowBestOnly();
  updateView();
}

export function syncSortUI() {
  const modeSel = document.getElementById('sort-mode');
  if (modeSel) modeSel.value = state.sortMode;
  const dir = state.sortDirections[state.sortMode] || 'asc';
  const btn = document.getElementById('sort-direction-toggle');
  if (btn) {
    const icon = btn.querySelector('.material-symbols-outlined');
    const label = btn.querySelector('.sort-dir-label');
    if (dir === 'asc') {
      if (icon) icon.innerText = 'arrow_upward';
      if (label) label.innerText = '昇順';
    } else {
      if (icon) icon.innerText = 'arrow_downward';
      if (label) label.innerText = '降順';
    }
  }
  const bestOnlyToggle = document.getElementById('filter-best-only');
  if (bestOnlyToggle) bestOnlyToggle.checked = state.showBestOnly;
}

// --------------------------------------------------------------
// メイン: 絞り込み + 並び替え + 描画
// --------------------------------------------------------------
export async function updateView() {
  if (!state.allRecords) return;

  setGridLoading(true, '絞り込み中...');
  await nextFrame(); // ローディング表示を確実に一度描画させてから重い処理に入る

  // 自己ベストのMapは「全件表示でもどれがベストかを示すバッジ」のために常に計算しておく
  const bestMap = computeBestMap(state.allRecords);
  state._bestMapCache = bestMap;
  const baseList = state.showBestOnly ? Array.from(bestMap.values()) : state.allRecords;

  const fcF = document.getElementById('filter-fc').value;
  const msMin = document.getElementById('filter-miss-min').value;
  const msMax = document.getElementById('filter-miss-max').value;
  const dfF = document.getElementById('filter-diff').value;
  const lvF = document.getElementById('filter-level').value;
  const tiF = document.getElementById('filter-title').value.trim().toLowerCase();

  let list = baseList.filter(r => {
    if (fcF === 'fc' && !r.isFC) return false;
    if (fcF === 'unfc' && r.isFC) return false;
    if (!r.isFC) {
      const mVal = r.missCount;
      if (msMin !== "" && mVal < toIntSafe(msMin)) return false;
      if (msMax !== "" && mVal > toIntSafe(msMax)) return false;
    } else {
      if (msMin !== "" && 0 < toIntSafe(msMin)) return false;
    }
    if (dfF !== 'all' && r.difficultyRaw !== dfF) return false;
    if (lvF && String(r.level) != String(lvF)) return false;
    if (tiF && !r.title.toLowerCase().includes(tiF)) return false;
    return true;
  });

  const comparator = buildComparator(state.sortMode, state.sortDirections[state.sortMode] || 'asc');
  list = [...list].sort(comparator);

  state.filteredRecords = list;
  await renderGrid(list);
}

document.addEventListener('prsk:data-loaded', () => { updateView(); });

window.setSortMode = setSortMode;
window.toggleSortDirection = toggleSortDirection;
window.toggleShowBestOnly = toggleShowBestOnly;
window.updateView = updateView;
