// batch-modal.js
// ------------------------------------------------------------------
// アップロード/編集モーダル。
// - ファイルのドラッグ&ドロップ/選択でキューに追加
// - 画像ごとに画素数/比率から機種プロファイルを自動判定 (手動変更も可能)
// - Tesseract解析 (単体/一括)。難易度・タイトル・PERFECT/GREAT/GOOD/BAD/MISS・コンボを取得
// - 実行(アップロード保存 or 編集保存)後、自己ベスト更新を検出して通知する
// ------------------------------------------------------------------

import { state } from './state.js';
import { DIFFICULTIES } from './config.js';
import { uid, toIntSafe, escapeHtml } from './utils.js';
import { getAllProfiles, getProfileById, getDefaultProfile, detectProfileForImage } from './device-profiles.js';
import { createOcrWorker, terminateOcrWorker, analyzeLoadedImage } from './ocr-engine.js';
import { downloadFileMedia } from './drive-api.js';
import {
  executeUploads, executeEdits, fetchDataFromDrive, computeBestMap, detectImprovements,
} from './drive-service.js';
import { clearSelection, updateSelectionUI } from './selection.js';
import { getLevelFromDb } from './music-db.js';
import { showToast, showPersonalBestBanner } from './notifications.js';

// --------------------------------------------------------------
// モーダルの開閉
// --------------------------------------------------------------
export function openBatchModal(mode) {
  state.currentMode = mode;
  document.getElementById('batch-modal').style.display = 'flex';
  document.getElementById('batch-modal-title').innerText = mode === 'edit' ? 'リザルトの編集' : 'リザルトのアップロード';
  document.getElementById('batch-dropzone').style.display = mode === 'edit' ? 'none' : 'flex';
  document.getElementById('btn-execute-batch').innerText = mode === 'edit' ? '保存する' : 'アップロード実行';
  populateProfileSelect();
  renderSidebar();
  checkBatchButton();
}

export function closeBatchModal() {
  document.getElementById('batch-modal').style.display = 'none';
  // オブジェクトURLの後始末
  state.editorQueue.forEach(item => { if (item.file && item.imgUrl) URL.revokeObjectURL(item.imgUrl); });
  state.editorQueue = [];
  state.activeItemId = null;
}

export function openUploadModal() { openBatchModal('upload'); }

export async function batchEdit() {
  if (state.selectedIds.size === 0) return;
  state.editorQueue = [];
  state.activeItemId = null;
  openBatchModal('edit');

  for (const id of state.selectedIds) {
    const rec = state.allRecords.find(r => r.id === id);
    if (!rec) continue;
    const item = {
      id: uid('item'),
      file: null,
      imgUrl: rec.thumbnail || '',
      naturalW: null, naturalH: null,
      status: 'pending',
      legacy: !!rec.legacy,
      originalId: rec.id,
      originalParent: rec.parentId,
      profileId: getDefaultProfile().id,
      data: {
        title: rec.title, level: rec.level, diff: rec.difficultyRaw, musicId: rec.musicId,
        perfect: rec.perfect ?? 0, great: rec.great ?? 0, good: rec.good ?? 0, bad: rec.bad ?? 0, miss: rec.miss ?? 0,
        combo: rec.combo ?? 0, totalMiss: rec.missCount,
      },
    };
    state.editorQueue.push(item);
    loadFullImageForEditItem(item);
  }
  renderSidebar();
  if (state.editorQueue.length > 0) selectItem(state.editorQueue[0].id);
  checkBatchButton();
}

export function individualEdit(id) {
  state.selectedIds = new Set([id]);
  batchEdit();
}

async function loadFullImageForEditItem(item) {
  try {
    const blob = await downloadFileMedia(item.originalId);
    const objectUrl = URL.createObjectURL(blob);
    item.imgUrl = objectUrl;
    item.isFullQuality = true;
    const imgEl = new Image();
    imgEl.onload = () => {
      item.naturalW = imgEl.naturalWidth;
      item.naturalH = imgEl.naturalHeight;
      const detected = detectProfileForImage(imgEl.naturalWidth, imgEl.naturalHeight);
      item.profileId = detected.id;
      renderSidebar();
      if (state.activeItemId === item.id) { renderFormForItem(item); }
    };
    imgEl.src = objectUrl;
  } catch (e) {
    console.error('元画像の取得に失敗しました', e);
  }
}

// --------------------------------------------------------------
// ファイル取り込み (ドラッグ&ドロップ / ファイル選択)
// --------------------------------------------------------------
export function initDropZone() {
  const dropZone = document.getElementById('batch-dropzone');
  const fileInput = document.getElementById('batch-file-input');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover');
  }));
  dropZone.addEventListener('drop', (e) => { if (e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
}

function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  files.forEach(file => {
    const objectUrl = URL.createObjectURL(file);
    const item = {
      id: uid('item'),
      file, imgUrl: objectUrl,
      naturalW: null, naturalH: null,
      status: 'pending',
      legacy: false,
      originalId: null, originalParent: null,
      profileId: getDefaultProfile().id,
      data: { title: '', level: '', diff: 'M', musicId: null, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, combo: 0, totalMiss: 0 },
    };
    state.editorQueue.push(item);

    const imgEl = new Image();
    imgEl.onload = () => {
      item.naturalW = imgEl.naturalWidth;
      item.naturalH = imgEl.naturalHeight;
      const detected = detectProfileForImage(imgEl.naturalWidth, imgEl.naturalHeight);
      item.profileId = detected.id;
      renderSidebar();
      if (state.activeItemId === item.id) renderFormForItem(item);
    };
    imgEl.src = objectUrl;
  });
  renderSidebar();
  if (!state.activeItemId && state.editorQueue.length > 0) selectItem(state.editorQueue[0].id);
  checkBatchButton();
}

// --------------------------------------------------------------
// サイドバー
// --------------------------------------------------------------
function statusIcon(status) {
  if (status === 'analyzing') return '<span class="material-symbols-outlined spin">progress_activity</span>';
  if (status === 'done') return '<span class="material-symbols-outlined" style="color:#2ecc71;">check_circle</span>';
  if (status === 'error') return '<span class="material-symbols-outlined" style="color:#e74c3c;">error</span>';
  if (status === 'processing') return '<span class="material-symbols-outlined spin">progress_activity</span>';
  if (status === 'success') return '<span class="material-symbols-outlined" style="color:#2ecc71;">check_circle</span>';
  return '<span class="material-symbols-outlined" style="color:#999;">radio_button_unchecked</span>';
}

function renderSidebar() {
  const list = document.getElementById('batch-sidebar-list');
  if (!list) return;
  list.innerHTML = state.editorQueue.map(item => `
    <div class="sidebar-item ${item.id === state.activeItemId ? 'active' : ''}" data-id="${item.id}">
      <img src="${item.imgUrl}" class="sidebar-thumb">
      <div class="sidebar-item-info">
        <div class="sidebar-item-title">${item.data.title ? escapeHtml(item.data.title) : '(未解析)'}</div>
        <div class="sidebar-item-sub">${getProfileById(item.profileId)?.name || ''}</div>
      </div>
      <div class="sidebar-item-status" id="sb-status-${item.id}">${statusIcon(item.status)}</div>
    </div>
  `).join('');
  list.querySelectorAll('.sidebar-item').forEach(el => {
    el.addEventListener('click', () => selectItem(el.dataset.id));
  });
}

function setItemStatus(itemId, status) {
  const item = state.editorQueue.find(i => i.id === itemId);
  if (item) item.status = status;
  const el = document.getElementById(`sb-status-${itemId}`);
  if (el) el.innerHTML = statusIcon(status);
}

export function selectItem(id) {
  state.activeItemId = id;
  renderSidebar();
  const item = state.editorQueue.find(i => i.id === id);
  if (item) renderFormForItem(item);
}

export function removeCurrentItem() {
  const id = state.activeItemId;
  if (!id) return;
  const item = state.editorQueue.find(i => i.id === id);
  if (item && item.file) URL.revokeObjectURL(item.imgUrl);
  state.editorQueue = state.editorQueue.filter(i => i.id !== id);
  state.activeItemId = state.editorQueue.length > 0 ? state.editorQueue[0].id : null;
  renderSidebar();
  if (state.activeItemId) renderFormForItem(state.editorQueue.find(i => i.id === state.activeItemId));
  else showEmptyState();
  checkBatchButton();
}

function showEmptyState() {
  document.getElementById('batch-empty-state').style.display = 'flex';
  document.getElementById('batch-item-form').style.display = 'none';
}

// --------------------------------------------------------------
// フォーム描画・双方向バインド
// --------------------------------------------------------------
function populateProfileSelect() {
  const sel = document.getElementById('form-profile-select');
  if (!sel) return;
  const profiles = getAllProfiles();
  sel.innerHTML = profiles.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function renderFormForItem(item) {
  document.getElementById('batch-empty-state').style.display = 'none';
  document.getElementById('batch-item-form').style.display = 'flex';

  document.getElementById('form-preview-img').src = item.imgUrl;
  populateProfileSelect();
  document.getElementById('form-profile-select').value = item.profileId;

  document.getElementById('form-title').value = item.data.title || '';
  document.getElementById('form-diff').value = item.data.diff || 'M';
  document.getElementById('form-level').value = item.data.level || '';
  document.getElementById('form-perfect').value = item.data.perfect ?? 0;
  document.getElementById('form-great').value = item.data.great ?? 0;
  document.getElementById('form-good').value = item.data.good ?? 0;
  document.getElementById('form-bad').value = item.data.bad ?? 0;
  document.getElementById('form-miss').value = item.data.miss ?? 0;
  document.getElementById('form-combo').value = item.data.combo ?? 0;
  updateTotalMissDisplay(item);
}

function updateTotalMissDisplay(item) {
  const total = toIntSafe(item.data.good) + toIntSafe(item.data.bad) + toIntSafe(item.data.miss);
  item.data.totalMiss = total;
  const el = document.getElementById('form-total-miss');
  if (el) el.innerText = total;
}

// フォームの現在値を、アクティブなキューアイテムの data に書き戻す
export function updateCurrentItem() {
  const item = state.editorQueue.find(i => i.id === state.activeItemId);
  if (!item) return;
  item.data.title = document.getElementById('form-title').value;
  item.data.diff = document.getElementById('form-diff').value;
  item.data.level = document.getElementById('form-level').value;
  item.data.perfect = toIntSafe(document.getElementById('form-perfect').value);
  item.data.great = toIntSafe(document.getElementById('form-great').value);
  item.data.good = toIntSafe(document.getElementById('form-good').value);
  item.data.bad = toIntSafe(document.getElementById('form-bad').value);
  item.data.miss = toIntSafe(document.getElementById('form-miss').value);
  item.data.combo = toIntSafe(document.getElementById('form-combo').value);
  updateTotalMissDisplay(item);
  renderSidebar();
}

export function handleDiffChange() {
  const item = state.editorQueue.find(i => i.id === state.activeItemId);
  if (!item) { updateCurrentItem(); return; }
  updateCurrentItem();
  if (item.data.musicId) {
    const diffDef = DIFFICULTIES.find(d => d.code === item.data.diff);
    const lvl = diffDef ? getLevelFromDb(item.data.musicId, diffDef.dbKey) : null;
    if (lvl) {
      item.data.level = lvl;
      document.getElementById('form-level').value = lvl;
      renderSidebar();
    }
  }
}

export function handleProfileChange() {
  const item = state.editorQueue.find(i => i.id === state.activeItemId);
  if (!item) return;
  const sel = document.getElementById('form-profile-select');
  item.profileId = sel.value;
  renderSidebar();
  reanalyzeCurrentItem();
}

function checkBatchButton() {
  const btn = document.getElementById('btn-execute-batch');
  if (btn) btn.disabled = state.editorQueue.length === 0;
}

// --------------------------------------------------------------
// 解析 (単体 / 一括)
// --------------------------------------------------------------
async function runAnalysisForItem(item, worker) {
  setItemStatus(item.id, 'analyzing');
  try {
    const imgEl = await loadImageElement(item.imgUrl);
    const profile = getProfileById(item.profileId) || getDefaultProfile();
    const result = await analyzeLoadedImage(imgEl, worker, profile);
    if (result) {
      item.data.title = result.title;
      item.data.level = result.level;
      item.data.diff = result.diff;
      item.data.musicId = result.musicId;
      item.data.perfect = result.perfect;
      item.data.great = result.great;
      item.data.good = result.good;
      item.data.bad = result.bad;
      item.data.miss = result.miss;
      item.data.combo = result.combo;
      item.data.totalMiss = result.totalMiss;
      setItemStatus(item.id, 'done');
    } else {
      setItemStatus(item.id, 'error');
    }
  } catch (e) {
    console.error(e);
    setItemStatus(item.id, 'error');
  }
  renderSidebar();
  if (state.activeItemId === item.id) renderFormForItem(item);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function reanalyzeCurrentItem() {
  const item = state.editorQueue.find(i => i.id === state.activeItemId);
  if (!item) return;
  const worker = await createOcrWorker();
  try {
    await runAnalysisForItem(item, worker);
  } finally {
    await terminateOcrWorker(worker);
  }
}

export async function analyzeAllInBatch() {
  if (state.editorQueue.length === 0) return;
  const btn = document.getElementById('btn-analyze-all');
  if (btn) btn.disabled = true;
  const worker = await createOcrWorker();
  try {
    for (const item of [...state.editorQueue]) {
      await runAnalysisForItem(item, worker);
    }
  } finally {
    await terminateOcrWorker(worker);
    if (btn) btn.disabled = false;
  }
}

// --------------------------------------------------------------
// 実行 (アップロード保存 / 編集保存) + 自己ベスト検出
// --------------------------------------------------------------
export async function executeBatch() {
  if (state.editorQueue.length === 0) return;
  updateCurrentItem();

  const btn = document.getElementById('btn-execute-batch');
  btn.disabled = true;
  const statusText = document.getElementById('batch-status-text');
  statusText.innerText = '実行中...';

  const beforeMap = computeBestMap(state.allRecords);

  const statusCallback = (itemId, st) => setItemStatus(itemId, st);
  let successCount = 0;
  try {
    if (state.currentMode === 'edit') successCount = await executeEdits(statusCallback);
    else successCount = await executeUploads(statusCallback);
  } catch (e) {
    console.error(e);
  }

  statusText.innerText = `${successCount} 件完了`;

  if (state.editorQueue.length === 0) {
    // 全件成功したのでモーダルを閉じてグリッドを更新する
    closeBatchModal();
    clearSelection();
    updateSelectionUI();
    await fetchDataFromDrive();
    const afterMap = computeBestMap(state.allRecords);
    const improvements = detectImprovements(beforeMap, afterMap);
    if (improvements.length > 0) showPersonalBestBanner(improvements);
    showToast(`${successCount} 件保存しました`, 'success');
  } else {
    // 一部失敗が残っている場合はモーダルを開いたまま失敗分を確認できるようにする
    renderSidebar();
    btn.disabled = false;
    showToast(`${successCount} 件保存、${state.editorQueue.length} 件失敗しました`, 'error');
  }
}

window.openUploadModal = openUploadModal;
window.closeBatchModal = closeBatchModal;
window.batchEdit = batchEdit;
window.individualEdit = individualEdit;
window.updateCurrentItem = updateCurrentItem;
window.handleDiffChange = handleDiffChange;
window.handleProfileChange = handleProfileChange;
window.reanalyzeCurrentItem = reanalyzeCurrentItem;
window.analyzeAllInBatch = analyzeAllInBatch;
window.executeBatch = executeBatch;
window.removeCurrentItem = removeCurrentItem;
