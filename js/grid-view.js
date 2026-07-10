// grid-view.js
// ------------------------------------------------------------------
// カードグリッドの描画を担当するモジュール。
// 件数が多い場合でも描画中であることが視覚的に分かるよう、
// 一定件数ごとに分割して描画しながらプログレスバーを更新する (チャンク描画)。
// ------------------------------------------------------------------

import { state } from './state.js';
import { escapeHtml, nextFrame } from './utils.js';
import { isPersonalBest } from './drive-service.js';

const CHUNK_SIZE = 24;

export function setGridLoading(isLoading, label = '読み込み中...', progress = null) {
  const bar = document.getElementById('grid-progress-bar');
  if (!bar) return;
  const fill = document.getElementById('grid-progress-fill');
  const text = document.getElementById('grid-progress-label');
  if (isLoading) {
    bar.style.display = 'flex';
    if (text) text.innerText = label;
    if (fill) {
      if (progress === null) {
        fill.style.width = '35%';
        fill.classList.add('indeterminate');
      } else {
        fill.classList.remove('indeterminate');
        fill.style.width = `${progress}%`;
      }
    }
  } else {
    bar.style.display = 'none';
  }
}

function cardTemplate(rec) {
  let thumb = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w600') : '';
  let large = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
  const missDisplay = rec.isFC ? `<span class="miss-val zero">FC-0</span>` : `FC -<span class="miss-val">${rec.missCount}</span>`;
  const badge = rec.isFC ? `<div class="fc-badge"><span class="material-symbols-outlined" style="font-size:1rem;">crown</span> FULL COMBO</div>` : '';
  const isSel = state.selectedIds.has(rec.id) ? 'selected' : '';

  const bestMap = state._bestMapCache;
  const showBestBadge = bestMap && !state.showBestOnly && isPersonalBest(rec, bestMap);
  const bestBadge = showBestBadge ? `<div class="best-badge" title="この曲・難易度の自己ベスト"><span class="material-symbols-outlined" style="font-size:0.9rem;">star</span> ベスト</div>` : '';

  // PERFECT/GREAT/コンボは新形式で解析済みのデータにのみ存在する (旧データは null = 不明)
  const hasDetail = !rec.legacy && rec.perfect !== null && rec.perfect !== undefined;
  const extraStats = hasDetail
    ? `<div class="score-extra">
         <span class="stat-chip"><span class="material-symbols-outlined">bolt</span>COMBO ${rec.combo ?? 0}</span>
         <span class="stat-chip perfect">PERFECT ${rec.perfect ?? 0}</span>
       </div>`
    : '';

  let clickAction = "";
  let overlayActions = "";
  if (state.isSelectMode) {
    clickAction = `toggleSelection('${rec.id}')`;
  } else {
    clickAction = `openImageModal('${large}')`;
    overlayActions = `
      <div class="card-overlay-actions">
          <div class="btn-overlay" onclick="event.stopPropagation(); individualEdit('${rec.id}')" title="編集"><span class="material-symbols-outlined">edit</span></div>
          <div class="btn-overlay del" onclick="event.stopPropagation(); individualDelete('${rec.id}')" title="削除"><span class="material-symbols-outlined">delete</span></div>
      </div>
    `;
  }

  return `
    <div class="card ${rec.isFC ? 'is-fc' : ''} ${isSel} ${state.isSelectMode ? 'select-mode-active' : ''}" id="card-${rec.id}" onclick="${clickAction}">
      <div class="card-img-container">
        ${badge}
        ${bestBadge}
        ${overlayActions}
        <div class="img-loader-spinner"></div>
        ${thumb ? `<img src="${thumb}" class="card-img" loading="lazy" onload="this.style.opacity=1; this.previousElementSibling.style.display='none';">` : '<span style="color:#aaa;">NO IMAGE</span>'}
      </div>
      <div class="card-body">
        <div class="song-meta"><span class="tag lvl">Lv.${rec.level}</span><span class="tag diff-${rec.difficultyRaw}">${rec.difficulty}</span>${rec.legacy ? '<span class="tag legacy-tag" title="旧バージョンで保存されたデータです">旧データ</span>' : ''}</div>
        <div class="song-title">${escapeHtml(rec.title)}</div>
        <div class="score-info"><span style="display:flex;align-items:center;gap:2px;"><span class="material-symbols-outlined" style="font-size:1rem;">bar_chart</span> Result</span>${missDisplay}</div>
        ${extraStats}
      </div>
    </div>`;
}

export async function renderGrid(records) {
  const grid = document.getElementById('grid');
  document.getElementById('result-count').innerText = `表示: ${records.length} 件`;

  if (records.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#666;">データなし</div>';
    setGridLoading(false);
    return;
  }

  grid.innerHTML = '';
  setGridLoading(true, 'カードを描画中...', 0);

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const html = chunk.map(cardTemplate).join('');
    grid.insertAdjacentHTML('beforeend', html);
    const progress = Math.min(100, Math.round(((i + chunk.length) / records.length) * 100));
    setGridLoading(true, `カードを描画中... (${Math.min(i + chunk.length, records.length)}/${records.length})`, progress);
    if (i + CHUNK_SIZE < records.length) await nextFrame();
  }

  setGridLoading(false);
}
