// ===================================================================
// render.js
// Renders the result grid/cards and the full-size image modal.
// ===================================================================

function renderGrid(records) {
  const grid = document.getElementById('grid');
  document.getElementById('result-count').innerText = `表示: ${records.length} 件`;
  grid.innerHTML = '';
  if (records.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#666;">データなし</div>';
    return;
  }

  // Only worth flagging "this is the best" when you're looking at the
  // full history - if "best only" is already active every card is best.
  const bestOnlyActive = document.getElementById('filter-best-only').checked;

  records.forEach(rec => {
    const thumb = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w600') : '';
    const large = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';
    const missDisplay = rec.isFC ? `<span class="miss-val zero">FC-0</span>` : `FC -<span class="miss-val">${rec.missCount}</span>`;
    const fcBadge = rec.isFC ? `<div class="fc-badge"><span class="material-symbols-outlined" style="font-size:1rem;">crown</span> FULL COMBO</div>` : '';
    const bestBadge = (rec.isBest && !bestOnlyActive)
      ? `<div class="best-badge" title="この譜面の自己ベスト"><span class="material-symbols-outlined" style="font-size:0.9rem;">military_tech</span> BEST</div>`
      : '';
    const isSel = selectedIds.has(rec.id) ? 'selected' : '';
    const diffMeta = DIFF_META[rec.difficultyRaw];
    const diffColor = diffMeta ? diffMeta.color : '#555';
    const comboText = (rec.combo !== null && rec.combo !== undefined) ? rec.combo : '—';

    let clickAction = "";
    let overlayActions = "";
    if (isSelectMode) {
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

    grid.innerHTML += `
      <div class="card ${rec.isFC ? 'is-fc' : ''} ${isSel} ${isSelectMode ? 'select-mode-active' : ''}" id="card-${rec.id}" onclick="${clickAction}">
        <div class="card-img-container">
          ${fcBadge}
          ${bestBadge}
          ${overlayActions}
          <div class="img-loader-spinner"></div>
          ${thumb ? `<img src="${thumb}" class="card-img" loading="lazy" onload="this.style.opacity=1; this.previousElementSibling.style.display='none';">` : '<span style="color:#aaa;">NO IMAGE</span>'}
        </div>
        <div class="card-body">
          <div class="song-meta"><span class="tag lvl">Lv.${rec.level}</span><span class="tag" style="background-color:${diffColor};">${escapeHtml(rec.difficulty)}</span></div>
          <div class="song-title">${escapeHtml(rec.title)}</div>
          <div class="score-info"><span class="combo-info" title="コンボ数"><span class="material-symbols-outlined" style="font-size:1rem;">bolt</span> ${comboText}</span>${missDisplay}</div>
        </div>
      </div>`;
  });
}

function openImageModal(src) {
  if (src) { document.getElementById('imageModal').style.display = "flex"; document.getElementById('modalImg').src = src; }
}
function closeImageModal() { document.getElementById('imageModal').style.display = "none"; }
