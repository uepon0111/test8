// ===================================================================
// notifications.js
// In-page feedback widgets:
//   - Toast notifications (used for "自己ベスト更新" / new personal best)
//   - The thin progress bar shown while sorting/filtering large lists
// ===================================================================

const Notifications = { containerEl: null };

function ensureNotificationContainer() {
  if (!Notifications.containerEl) Notifications.containerEl = document.getElementById('toast-container');
  return Notifications.containerEl;
}

function showToast({ title, message, kind = 'info', duration = 7000 }) {
  const container = ensureNotificationContainer();
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  const icon = kind === 'record' ? 'emoji_events' : (kind === 'error' ? 'error' : 'info');
  el.innerHTML = `
    <div class="toast-icon"><span class="material-symbols-outlined">${icon}</span></div>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
    </div>
    <button type="button" class="toast-close" aria-label="閉じる">&times;</button>
  `;
  const remove = () => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.toast-close').addEventListener('click', remove);
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-in'));
  if (duration > 0) setTimeout(remove, duration);
}

// One toast per song/difficulty that just beat its previous best.
function showNewRecordToast(record, previousBest) {
  const diffName = (DIFF_META[record.difficultyRaw] || {}).name || record.difficulty;
  const message = previousBest
    ? `MISS ${previousBest.missCount} → ${record.missCount}${record.combo != null ? ` ／ COMBO ${record.combo}` : ''}`
    : `MISS ${record.missCount}${record.combo != null ? ` ／ COMBO ${record.combo}` : ''} (初記録)`;
  showToast({
    title: `🎉 自己ベスト更新: ${record.title} [${diffName} Lv.${record.level}]`,
    message,
    kind: 'record',
    duration: 9000,
  });
}

function showErrorToast(title, message) {
  showToast({ title, message, kind: 'error', duration: 8000 });
}

// --- Sort / filter progress bar ---------------------------------------
function showViewProgress(percent, label) {
  const wrap = document.getElementById('view-progress');
  const bar = document.getElementById('view-progress-bar');
  if (!wrap || !bar) return;
  wrap.style.display = 'flex';
  bar.style.width = `${clamp(percent, 2, 100)}%`;
  if (label) {
    const lbl = document.getElementById('view-progress-label');
    if (lbl) lbl.innerText = label;
  }
}

function hideViewProgress() {
  const wrap = document.getElementById('view-progress');
  if (wrap) wrap.style.display = 'none';
}
