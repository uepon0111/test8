// selection.js
// ------------------------------------------------------------------
// 「選択モード」(複数カードを選んで一括操作する) と、
// 個別カードに対する削除アクションを担当するモジュール。
// ------------------------------------------------------------------

import { state } from './state.js';
import { renderGrid } from './grid-view.js';
import { deleteRecordById, deleteRecordsByIds, fetchDataFromDrive } from './drive-service.js';

export function toggleSelectMode() {
  state.isSelectMode = !state.isSelectMode;
  if (!state.isSelectMode) state.selectedIds.clear();
  updateSelectionUI();
  renderGrid(state.filteredRecords);
}

export function toggleSelection(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  updateSelectionUI();
  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.toggle('selected', state.selectedIds.has(id));
}

export function clearSelection() {
  state.selectedIds.clear();
  updateSelectionUI();
}

export function updateSelectionUI() {
  const bar = document.getElementById('select-mode-bar');
  const toggleBtn = document.getElementById('select-mode-toggle');
  if (bar) bar.style.display = state.isSelectMode ? 'flex' : 'none';
  if (toggleBtn) toggleBtn.classList.toggle('active', state.isSelectMode);

  const count = state.selectedIds.size;
  const countEl = document.getElementById('selected-count');
  if (countEl) countEl.innerText = `${count} 件選択中`;

  const batchEditBtn = document.getElementById('batch-edit-btn');
  const batchDeleteBtn = document.getElementById('batch-delete-btn');
  if (batchEditBtn) batchEditBtn.disabled = count === 0;
  if (batchDeleteBtn) batchDeleteBtn.disabled = count === 0;
}

export async function batchDelete() {
  const count = state.selectedIds.size;
  if (count === 0) return;
  if (!confirm(`選択した ${count} 件を削除します。よろしいですか？`)) return;

  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('loader-text').innerText = '削除中...';
  try {
    await deleteRecordsByIds(Array.from(state.selectedIds));
    state.selectedIds.clear();
    state.isSelectMode = false;
    updateSelectionUI();
    await fetchDataFromDrive();
  } catch (e) {
    console.error(e);
    alert('削除中にエラーが発生しました');
    loader.style.display = 'none';
  }
}

export async function individualDelete(id) {
  if (!confirm('このリザルトを削除します。よろしいですか？')) return;
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('loader-text').innerText = '削除中...';
  try {
    await deleteRecordById(id);
    await fetchDataFromDrive();
  } catch (e) {
    console.error(e);
    alert('削除中にエラーが発生しました');
    loader.style.display = 'none';
  }
}

window.toggleSelectMode = toggleSelectMode;
window.toggleSelection = toggleSelection;
window.batchDelete = batchDelete;
window.individualDelete = individualDelete;
