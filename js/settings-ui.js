// ===================================================================
// settings-ui.js
// "設定" modal: manages device profiles and lets the user visually
// (drag/resize) and numerically (X/Y/W/H % fields) calibrate the four
// OCR reading regions against an uploaded sample screenshot. Dragging
// updates the number fields live and vice versa (both directions are
// wired through the same `draftRegions` state + a single render call).
// ===================================================================

const SettingsUI = {
  editingProfileId: null,
  draftRegions: null,
  draftRefWidth: 1080,
  draftRefHeight: 1920,
  draftPreviewImage: null,
  drag: null,
};

let regionEditorDomBuilt = false;
let settingsResizeObserver = null;

function openSettingsModal() {
  document.getElementById('settingsModal').style.display = 'flex';
  buildRegionEditorDom();
  ensureSettingsResizeObserver();
  renderProfileList();
  const initialId = (SettingsUI.editingProfileId && getProfile(SettingsUI.editingProfileId))
    ? SettingsUI.editingProfileId
    : (getLastUsedProfileId() || (getProfiles()[0] && getProfiles()[0].id));
  loadProfileIntoEditor(initialId);
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

function ensureSettingsResizeObserver() {
  if (settingsResizeObserver) return;
  const wrap = document.getElementById('settings-sample-wrap');
  settingsResizeObserver = new ResizeObserver(() => positionRegionRects());
  settingsResizeObserver.observe(wrap);
}

// Builds the (static-structure) region rectangles + numeric input rows once.
// Only their positions/values change afterwards as the user edits.
function buildRegionEditorDom() {
  if (regionEditorDomBuilt) return;

  const overlay = document.getElementById('settings-regions-overlay');
  overlay.innerHTML = REGION_TYPES.map(rt => `
    <div class="region-rect" id="region-rect-${rt.id}" style="border-color:${rt.color}; background-color:${rt.color}2A;">
      <span class="region-label" style="background:${rt.color};">${escapeHtml(rt.label)}</span>
      <div class="resize-handle" id="region-resize-${rt.id}" style="background:${rt.color};"></div>
    </div>
  `).join('');

  const inputsWrap = document.getElementById('settings-region-inputs');
  inputsWrap.innerHTML = REGION_TYPES.map(rt => `
    <div class="region-input-group">
      <div class="region-input-title"><span class="region-swatch" style="background:${rt.color};"></span>${escapeHtml(rt.label)}</div>
      <div class="region-input-row">
        <label>X% <input type="number" step="0.1" min="0" max="100" id="region-input-${rt.id}-x" oninput="onRegionNumericInput('${rt.id}','x',this.value)"></label>
        <label>Y% <input type="number" step="0.1" min="0" max="100" id="region-input-${rt.id}-y" oninput="onRegionNumericInput('${rt.id}','y',this.value)"></label>
        <label>W% <input type="number" step="0.1" min="0" max="100" id="region-input-${rt.id}-w" oninput="onRegionNumericInput('${rt.id}','w',this.value)"></label>
        <label>H% <input type="number" step="0.1" min="0" max="100" id="region-input-${rt.id}-h" oninput="onRegionNumericInput('${rt.id}','h',this.value)"></label>
      </div>
    </div>
  `).join('');

  document.getElementById('settings-sample-img').addEventListener('load', () => positionRegionRects());
  attachRegionDragHandlers();
  regionEditorDomBuilt = true;
}

// --- Profile list (left panel) ---
function renderProfileList() {
  const listEl = document.getElementById('settings-profile-list');
  listEl.innerHTML = getProfiles().map(p => `
    <div class="profile-row ${p.id === SettingsUI.editingProfileId ? 'active' : ''}" onclick="loadProfileIntoEditor('${p.id}')">
      <div class="profile-row-thumb">${p.previewImage ? `<img src="${p.previewImage}" alt="">` : '<span class="material-symbols-outlined">smartphone</span>'}</div>
      <div class="profile-row-info">
        <div class="profile-row-name">${escapeHtml(p.name)}</div>
        <div class="profile-row-res">${p.refWidth}×${p.refHeight}</div>
      </div>
      <button type="button" class="profile-row-del" onclick="event.stopPropagation(); confirmDeleteProfile('${p.id}')" title="削除">
        <span class="material-symbols-outlined">delete</span>
      </button>
    </div>
  `).join('');
}

async function confirmDeleteProfile(id) {
  if (getProfiles().length <= 1) { alert('最後の1件のプロファイルは削除できません。'); return; }
  if (!confirm('このプロファイルを削除しますか？（この操作は取り消せません）')) return;
  await deleteProfile(id);
  if (SettingsUI.editingProfileId === id) loadProfileIntoEditor(getProfiles()[0].id);
  else renderProfileList();
}

function startNewProfileDraft() {
  SettingsUI.editingProfileId = null;
  SettingsUI.draftRegions = JSON.parse(JSON.stringify(DEFAULT_REGIONS));
  SettingsUI.draftRefWidth = 1080;
  SettingsUI.draftRefHeight = 1920;
  SettingsUI.draftPreviewImage = null;
  document.getElementById('settings-profile-name').value = '';
  document.getElementById('settings-sample-info').textContent =
    `参照解像度: ${SettingsUI.draftRefWidth} × ${SettingsUI.draftRefHeight}（サンプル画像をアップロードすると自動設定されます）`;
  renderProfileList();
  renderSamplePreview();
  renderAllRegionInputs();
}

function loadProfileIntoEditor(profileId) {
  const profile = getProfile(profileId);
  if (!profile) return;
  SettingsUI.editingProfileId = profile.id;
  SettingsUI.draftRegions = JSON.parse(JSON.stringify(profile.regions));
  SettingsUI.draftRefWidth = profile.refWidth;
  SettingsUI.draftRefHeight = profile.refHeight;
  SettingsUI.draftPreviewImage = profile.previewImage || null;
  document.getElementById('settings-profile-name').value = profile.name;
  document.getElementById('settings-sample-info').textContent = `参照解像度: ${profile.refWidth} × ${profile.refHeight}`;
  renderProfileList();
  renderSamplePreview();
  renderAllRegionInputs();
}

async function saveSettingsProfile() {
  const name = document.getElementById('settings-profile-name').value.trim();
  if (!name) { alert('機種名を入力してください'); return; }
  const saved = await upsertProfile({
    id: SettingsUI.editingProfileId || undefined,
    name,
    refWidth: SettingsUI.draftRefWidth,
    refHeight: SettingsUI.draftRefHeight,
    regions: SettingsUI.draftRegions,
    previewImage: SettingsUI.draftPreviewImage,
  });
  SettingsUI.editingProfileId = saved.id;
  renderProfileList();
  alert('プロファイルを保存しました');
}

// Called by device-profiles.js if a newer settings payload is pulled from
// Drive (e.g. edited on another device) while this UI happens to be open.
function onDeviceProfilesChangedExternally() {
  const modal = document.getElementById('settingsModal');
  if (!modal || modal.style.display === 'none') return;
  renderProfileList();
  if (SettingsUI.editingProfileId && !getProfile(SettingsUI.editingProfileId)) {
    loadProfileIntoEditor(getProfiles()[0].id);
  }
}

// --- Sample image handling ---
async function makeDownscaledPreview(imgElement, maxDim = 480, quality = 0.72) {
  const scale = Math.min(1, maxDim / Math.max(imgElement.naturalWidth, imgElement.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imgElement.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(imgElement.naturalHeight * scale));
  canvas.getContext('2d').drawImage(imgElement, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

async function handleSettingsSampleUpload(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    SettingsUI.draftRefWidth = img.naturalWidth;
    SettingsUI.draftRefHeight = img.naturalHeight;
    SettingsUI.draftPreviewImage = await makeDownscaledPreview(img);
    document.getElementById('settings-sample-info').textContent = `参照解像度: ${img.naturalWidth} × ${img.naturalHeight}`;
    renderSamplePreview();
    positionRegionRects();
  } catch (e) {
    alert('画像の読み込みに失敗しました');
    console.error(e);
  } finally {
    URL.revokeObjectURL(url);
    fileInput.value = '';
  }
}

function renderSamplePreview() {
  const imgEl = document.getElementById('settings-sample-img');
  const placeholder = document.getElementById('settings-sample-placeholder');
  const wrap = document.getElementById('settings-sample-wrap');
  if (SettingsUI.draftPreviewImage) {
    imgEl.src = SettingsUI.draftPreviewImage;
    imgEl.style.display = 'block';
    placeholder.style.display = 'none';
    wrap.style.aspectRatio = '';
  } else {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    placeholder.style.display = 'flex';
    wrap.style.aspectRatio = `${SettingsUI.draftRefWidth} / ${SettingsUI.draftRefHeight}`;
    requestAnimationFrame(() => positionRegionRects());
  }
}

// --- Region <-> numeric field two-way sync ---
function renderAllRegionInputs() {
  REGION_TYPES.forEach(rt => updateRegionNumericInputs(rt.id));
  positionRegionRects();
}

function updateRegionNumericInputs(regionId) {
  const r = SettingsUI.draftRegions[regionId];
  const set = (suffix, val) => { const el = document.getElementById(`region-input-${regionId}-${suffix}`); if (el) el.value = (val * 100).toFixed(1); };
  set('x', r.x); set('y', r.y); set('w', r.w); set('h', r.h);
}

function onRegionNumericInput(regionId, field, value) {
  const num = clamp(parseFloat(value), 0, 100) / 100 || 0;
  const r = SettingsUI.draftRegions[regionId];
  if (field === 'x') r.x = clamp(num, 0, 1 - r.w);
  if (field === 'y') r.y = clamp(num, 0, 1 - r.h);
  if (field === 'w') r.w = clamp(num, 0.02, 1 - r.x);
  if (field === 'h') r.h = clamp(num, 0.02, 1 - r.y);
  positionRegionRects();
  // Re-sync in case a value got clamped (e.g. W pushed past the right edge).
  updateRegionNumericInputs(regionId);
}

function positionRegionRects() {
  const wrap = document.getElementById('settings-sample-wrap');
  if (!wrap || !SettingsUI.draftRegions) return;
  const ww = wrap.clientWidth, wh = wrap.clientHeight;
  if (!ww || !wh) return;
  REGION_TYPES.forEach(rt => {
    const r = SettingsUI.draftRegions[rt.id];
    const el = document.getElementById(`region-rect-${rt.id}`);
    if (!el) return;
    el.style.left = (r.x * ww) + 'px';
    el.style.top = (r.y * wh) + 'px';
    el.style.width = (r.w * ww) + 'px';
    el.style.height = (r.h * wh) + 'px';
  });
}

// --- Drag / resize handling (mouse + touch) ---
function getPointerPos(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function attachRegionDragHandlers() {
  REGION_TYPES.forEach(rt => {
    const rectEl = document.getElementById(`region-rect-${rt.id}`);
    const handleEl = document.getElementById(`region-resize-${rt.id}`);
    const startMove = (e) => startRegionDrag(e, rt.id, 'move');
    const startResize = (e) => { e.stopPropagation(); startRegionDrag(e, rt.id, 'resize'); };
    rectEl.addEventListener('mousedown', startMove);
    rectEl.addEventListener('touchstart', startMove, { passive: false });
    handleEl.addEventListener('mousedown', startResize);
    handleEl.addEventListener('touchstart', startResize, { passive: false });
  });
}

function startRegionDrag(e, regionId, mode) {
  e.preventDefault();
  const wrap = document.getElementById('settings-sample-wrap');
  const box = wrap.getBoundingClientRect();
  const start = getPointerPos(e);
  SettingsUI.drag = {
    regionId, mode, startX: start.x, startY: start.y,
    startRegion: { ...SettingsUI.draftRegions[regionId] },
    wrapW: box.width, wrapH: box.height,
  };
  window.addEventListener('mousemove', onRegionDragMove);
  window.addEventListener('mouseup', onRegionDragEnd);
  window.addEventListener('touchmove', onRegionDragMove, { passive: false });
  window.addEventListener('touchend', onRegionDragEnd);
}

function onRegionDragMove(e) {
  if (!SettingsUI.drag) return;
  e.preventDefault();
  const { regionId, mode, startX, startY, startRegion, wrapW, wrapH } = SettingsUI.drag;
  const pos = getPointerPos(e);
  const dxRatio = (pos.x - startX) / wrapW;
  const dyRatio = (pos.y - startY) / wrapH;

  const next = { ...startRegion };
  if (mode === 'move') {
    next.x = clamp(startRegion.x + dxRatio, 0, 1 - startRegion.w);
    next.y = clamp(startRegion.y + dyRatio, 0, 1 - startRegion.h);
  } else {
    next.w = clamp(startRegion.w + dxRatio, 0.02, 1 - startRegion.x);
    next.h = clamp(startRegion.h + dyRatio, 0.02, 1 - startRegion.y);
  }
  SettingsUI.draftRegions[regionId] = next;
  positionRegionRects();
  updateRegionNumericInputs(regionId);
}

function onRegionDragEnd() {
  SettingsUI.drag = null;
  window.removeEventListener('mousemove', onRegionDragMove);
  window.removeEventListener('mouseup', onRegionDragEnd);
  window.removeEventListener('touchmove', onRegionDragMove);
  window.removeEventListener('touchend', onRegionDragEnd);
}
