// settings-modal.js
// ------------------------------------------------------------------
// 「設定」モーダル: 機種プロファイル(読み取り範囲のセット)の一覧管理と、
// サンプル画像を使った視覚的な範囲編集 (region-editor.js) を提供する。
// ------------------------------------------------------------------

import { state } from './state.js';
import { BUILTIN_PROFILE_IDS } from './config.js';
import { escapeHtml } from './utils.js';
import {
  getAllProfiles, getProfileById, createProfile, duplicateProfile,
  updateProfile, deleteProfile, resetPresetToDefault, setProfileReferenceSize,
} from './device-profiles.js';
import { mountRegionEditor } from './region-editor.js';

let editingProfileId = null;
let sampleImageUrl = null; // 現在エディタに表示しているサンプル画像 (アップロードされるまではプレースホルダ)
let regionEditorHandle = null;

function generatePlaceholderImage(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2b3d';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.strokeRect(0, 0, width, height);
  ctx.fillStyle = '#aaa';
  ctx.font = `${Math.round(width * 0.035)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('サンプル画像をアップロードしてください', width / 2, height / 2);
  return canvas.toDataURL('image/png');
}

export function openSettingsModal() {
  document.getElementById('settings-modal').style.display = 'flex';
  const profiles = getAllProfiles();
  if (!editingProfileId || !getProfileById(editingProfileId)) {
    editingProfileId = (profiles.find(p => p.id === BUILTIN_PROFILE_IDS.DEFAULT) || profiles[0]).id;
  }
  sampleImageUrl = null;
  renderSettingsModal();
}

export function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

function renderSettingsModal() {
  const body = document.getElementById('settings-modal-body');
  const profiles = getAllProfiles();
  const active = getProfileById(editingProfileId);

  body.innerHTML = `
    <div class="settings-layout">
      <div class="profile-list-panel">
        <div class="profile-list-header">
          <span>機種プロファイル</span>
          <button type="button" class="btn-small" id="btn-new-profile">+ 新規</button>
        </div>
        <ul class="profile-list">
          ${profiles.map(p => `
            <li class="profile-item ${p.id === editingProfileId ? 'active' : ''}" data-id="${p.id}">
              <span class="profile-name">${escapeHtml(p.name)}</span>
              ${p.isPreset ? '<span class="profile-badge">プリセット</span>' : ''}
              <span class="profile-res">${p.refWidth ? `${p.refWidth}×${p.refHeight}` : '解像度未設定'}</span>
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="profile-editor-panel">
        <div class="profile-editor-toolbar">
          <label class="pe-name-label">名前
            <input type="text" id="pe-name-input" value="${escapeHtml(active.name)}">
          </label>
          <label class="btn-small file-upload-btn">
            <span class="material-symbols-outlined" style="font-size:1rem;vertical-align:middle;">upload</span>
            サンプル画像をアップロード
            <input type="file" id="pe-sample-upload" accept="image/*" style="display:none;">
          </label>
          <button type="button" class="btn-small" id="btn-duplicate-profile">複製</button>
          ${active.isPreset
            ? `<button type="button" class="btn-small" id="btn-reset-profile">初期値に戻す</button>`
            : `<button type="button" class="btn-small btn-danger" id="btn-delete-profile">削除</button>`}
        </div>
        <div id="region-editor-mount"></div>
      </div>
    </div>
  `;

  // --- プロファイル一覧クリック ---
  body.querySelectorAll('.profile-item').forEach(li => {
    li.addEventListener('click', () => {
      editingProfileId = li.dataset.id;
      sampleImageUrl = null;
      renderSettingsModal();
    });
  });

  body.querySelector('#btn-new-profile').addEventListener('click', () => {
    const name = prompt('新しい機種プロファイルの名前を入力してください', '新しい機種');
    if (name === null) return;
    const created = createProfile(name);
    editingProfileId = created.id;
    sampleImageUrl = null;
    renderSettingsModal();
  });

  body.querySelector('#pe-name-input').addEventListener('change', (e) => {
    updateProfile(editingProfileId, { name: e.target.value || active.name });
    renderSettingsModal();
  });

  body.querySelector('#btn-duplicate-profile').addEventListener('click', () => {
    const copy = duplicateProfile(editingProfileId);
    if (copy) { editingProfileId = copy.id; sampleImageUrl = null; renderSettingsModal(); }
  });

  const resetBtn = body.querySelector('#btn-reset-profile');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (confirm('このプリセットを初期値に戻します。よろしいですか？')) {
      resetPresetToDefault(editingProfileId);
      renderSettingsModal();
    }
  });

  const deleteBtn = body.querySelector('#btn-delete-profile');
  if (deleteBtn) deleteBtn.addEventListener('click', () => {
    if (confirm(`「${active.name}」を削除します。よろしいですか？`)) {
      deleteProfile(editingProfileId);
      editingProfileId = null;
      sampleImageUrl = null;
      renderSettingsModal();
    }
  });

  body.querySelector('#pe-sample-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      sampleImageUrl = ev.target.result;
      mountEditorForActiveProfile();
    };
    reader.readAsDataURL(file);
  });

  mountEditorForActiveProfile();
}

function mountEditorForActiveProfile() {
  const active = getProfileById(editingProfileId);
  if (!active) return;
  const mount = document.getElementById('region-editor-mount');
  if (!mount) return;

  const displayUrl = sampleImageUrl || generatePlaceholderImage(active.refWidth || 1170, active.refHeight || 2532);

  regionEditorHandle = mountRegionEditor(mount, {
    imageUrl: displayUrl,
    regions: active.regions,
    activeKey: 'title',
    onChange: (key, region) => {
      active.regions[key] = region;
      updateProfile(active.id, { regions: active.regions });
    },
    onImageLoaded: (w, h) => {
      // 実際にサンプル画像をアップロードした場合のみ、基準解像度として記録する
      if (sampleImageUrl) {
        setProfileReferenceSize(active.id, w, h);
        const resEl = document.querySelector(`.profile-item[data-id="${active.id}"] .profile-res`);
        if (resEl) resEl.innerText = `${w}×${h}`;
      }
    },
  });
}

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
