// notifications.js
// ------------------------------------------------------------------
// ページ内通知 (トースト) システム。
// alert() のような画面をブロックするダイアログではなく、
// 画面上部に非侵襲的に表示され、自動または手動で閉じられる。
// ------------------------------------------------------------------

import { escapeHtml } from './utils.js';

function ensureContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

export function showToast(message, type = 'info', duration = 5000) {
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close" aria-label="閉じる">&times;</button>`;
  el.querySelector('.toast-close').onclick = () => dismissToast(el);
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (duration > 0) setTimeout(() => dismissToast(el), duration);
  return el;
}

function dismissToast(el) {
  el.classList.remove('show');
  setTimeout(() => el.remove(), 300);
}

// improvements: drive-service.js の detectImprovements() が返す [{record, previous}, ...]
export function showPersonalBestBanner(improvements) {
  if (!improvements || improvements.length === 0) return;
  const c = ensureContainer();
  const el = document.createElement('div');
  el.className = 'toast toast-pb';

  const itemsHtml = improvements.map(imp => {
    const r = imp.record, p = imp.previous;
    const missChange = r.missCount < p.missCount
      ? `ミス数 ${p.missCount} → <strong>${r.missCount}</strong>`
      : `コンボ ${p.combo ?? '-'} → <strong>${r.combo ?? '-'}</strong>`;
    return `<div class="pb-item">
      <span class="pb-song">${escapeHtml(r.title)}</span>
      <span class="tag diff-${r.difficultyRaw} small">${r.difficulty}</span>
      <span class="pb-change">${missChange}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="pb-header">
      <span class="material-symbols-outlined">emoji_events</span>
      自己ベスト更新！ (${improvements.length}件)
      <button class="toast-close" aria-label="閉じる">&times;</button>
    </div>
    <div class="pb-body">${itemsHtml}</div>
  `;
  el.querySelector('.toast-close').onclick = () => dismissToast(el);
  c.prepend(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => dismissToast(el), 12000);
}
