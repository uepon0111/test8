// modals.js
// ------------------------------------------------------------------
// カード画像を大きく表示するプレビューモーダル。
// ------------------------------------------------------------------

export function openImageModal(url) {
  if (!url) return;
  document.getElementById('modal-img').src = url;
  document.getElementById('image-modal').style.display = 'flex';
}

export function closeImageModal() {
  document.getElementById('image-modal').style.display = 'none';
  document.getElementById('modal-img').src = '';
}

window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
