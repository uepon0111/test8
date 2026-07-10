// ===================================================================
// batch-modal.js
// The unified upload / edit modal: file queue, per-item form, OCR
// orchestration (delegates to ocr-analysis.js) and the final Drive
// write (delegates to drive-api.js for cached/concurrent execution).
//
// New in this version:
//   - Each queued item carries its own `profileId` (device profile),
//     auto-detected from the image's own pixel size/aspect ratio, with
//     a manual override dropdown next to the re-analyze button.
//   - PERFECT / GREAT / COMBO are read, editable, and saved (as Drive
//     file `properties`, alongside the existing GOOD/BAD/MISS numbers).
//   - Uploads/edits run with bounded concurrency instead of one at a
//     time, and detect + surface "new personal best" results.
// ===================================================================

function openBatchModal(mode) {
  currentMode = mode;
  const modal = document.getElementById('batchModal');
  modal.style.display = 'flex';

  editorQueue = [];
  activeItemId = null;
  document.getElementById('batch-sidebar-list').innerHTML = "";
  document.getElementById('batch-editor-container').style.display = 'none';
  document.getElementById('batch-empty-msg').style.display = 'block';
  document.getElementById('batch-status-msg').innerText = "待機中...";
  document.getElementById('btn-exec-batch').disabled = true;

  if (mode === 'upload') {
    document.getElementById('batch-modal-title').innerHTML = '<span class="material-symbols-outlined">cloud_upload</span> 画像アップロード';
    document.getElementById('upload-initial').style.display = 'flex';
    document.getElementById('batch-workspace').style.display = 'none';
    document.getElementById('up-file').value = "";
    document.getElementById('btn-exec-batch').innerText = "全てアップロード";
  } else {
    document.getElementById('batch-modal-title').innerHTML = '<span class="material-symbols-outlined">edit_square</span> 編集・解析モード';
    document.getElementById('upload-initial').style.display = 'none';
    document.getElementById('batch-workspace').style.display = 'flex';
    document.getElementById('btn-exec-batch').innerText = "保存して反映";
  }
}

function closeBatchModal() {
  document.getElementById('batchModal').style.display = 'none';
}

// --- Drop Zone & File Handling (Upload Mode) ---
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); });
document.getElementById('up-file').addEventListener('change', (e) => handleFiles(e.target.files));

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getImageDimensions(src) {
  const img = await loadImageElement(src);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

// Auto-detects & assigns a device profile for a queued item, based on
// its own image's pixel size (see device-profiles.js#matchProfileForImage).
async function autoAssignProfile(item) {
  try {
    const dims = await getImageDimensions(item.imgUrl);
    item.naturalWidth = dims.width;
    item.naturalHeight = dims.height;
    const match = matchProfileForImage(dims.width, dims.height);
    if (match.profile) {
      item.profileId = match.profile.id;
      item.profileConfident = match.confident;
      setLastUsedProfileId(match.profile.id);
    }
  } catch (e) {
    console.error('画像サイズの取得に失敗しました', e);
  }
}

async function handleFiles(files) {
  if (files.length === 0) return;
  document.getElementById('upload-initial').style.display = 'none';
  document.getElementById('batch-workspace').style.display = 'flex';
  document.getElementById('batch-status-msg').innerText = "画像を処理中...";

  const newItems = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const qId = generateId('new');
    const item = {
      id: qId,
      file: file,
      imgUrl: URL.createObjectURL(file),
      status: 'pending',
      data: { title: '', level: '', diff: 'M', good: 0, bad: 0, missDetail: 0, perfect: 0, great: 0, combo: null, totalMiss: 0, musicId: null },
      originalId: null,
      profileId: getLastUsedProfileId(),
      profileConfident: true,
    };
    editorQueue.push(item);
    renderSidebarItem(qId);
    newItems.push(item);
  }

  await Promise.all(newItems.map(autoAssignProfile));
  await runBatchAnalysis(editorQueue.filter(i => i.status === 'pending'));

  if (!activeItemId && editorQueue.length > 0) selectItem(editorQueue[0].id);
  checkBatchButton();
}

// Initialize Batch Edit from Selection
async function batchEdit() {
  if (selectedIds.size === 0) return;
  openBatchModal('edit');

  const targets = allRecords.filter(r => selectedIds.has(r.id));
  document.getElementById('batch-status-msg').innerText = "編集データを準備中...";

  for (const rec of targets) {
    const qId = "edit_" + rec.id;
    const highResUrl = rec.thumbnail ? rec.thumbnail.replace('=s220', '=w1600') : '';

    const item = {
      id: qId,
      file: null,
      imgUrl: highResUrl,
      status: 'existing',
      data: {
        title: rec.title, level: rec.level, diff: rec.difficultyRaw,
        good: rec.goodDetail ?? 0,
        bad: rec.badDetail ?? 0,
        missDetail: rec.missDetail ?? Math.max(0, rec.missCount - (rec.goodDetail ?? 0) - (rec.badDetail ?? 0)),
        perfect: rec.perfect ?? 0,
        great: rec.great ?? 0,
        combo: (rec.combo ?? null),
        totalMiss: rec.missCount,
        musicId: null,
      },
      originalId: rec.id,
      originalParent: rec.parentId,
      profileId: getLastUsedProfileId(),
      profileConfident: true,
    };
    editorQueue.push(item);
    renderSidebarItem(qId);
  }

  await Promise.all(editorQueue.filter(i => i.status === 'existing').map(autoAssignProfile));

  if (editorQueue.length > 0) selectItem(editorQueue[0].id);
  checkBatchButton();
  document.getElementById('batch-status-msg').innerText = "編集準備完了";
}

function renderSidebarItem(id) {
  const item = editorQueue.find(q => q.id === id);
  const div = document.createElement('div');
  div.className = 'sidebar-item';
  div.id = `sb-${id}`;
  div.onclick = () => selectItem(id);

  div.innerHTML = `
      <img src="${item.imgUrl}" class="sidebar-thumb" crossorigin="anonymous">
      <div class="sidebar-info">
          <div class="sidebar-title" id="sb-title-${id}">${escapeHtml(item.data.title) || "名称未設定"}</div>
          <div class="sidebar-status">
              <span id="sb-status-${id}" class="upload-status ${item.status === 'existing' ? 'done' : item.status}">${item.status === 'existing' ? 'EXIST' : item.status}</span>
              <button class="btn-remove-side" onclick="removeBatchItem(event, '${id}')">
                  <span class="material-symbols-outlined" style="font-size:1rem;">delete</span>
              </button>
          </div>
      </div>
  `;
  document.getElementById('batch-sidebar-list').appendChild(div);
}

function renderItemProfileSelector(item) {
  const sel = document.getElementById('up-profile');
  if (!sel) return;
  sel.innerHTML = getProfiles().map(p =>
    `<option value="${p.id}" ${p.id === item.profileId ? 'selected' : ''}>${escapeHtml(p.name)} (${p.refWidth}×${p.refHeight})</option>`
  ).join('');
  const confEl = document.getElementById('up-profile-confidence');
  if (confEl) {
    confEl.textContent = (item.profileConfident === false) ? '自動検出の精度が低いため確認してください' : '';
  }
}

function selectItem(id) {
  activeItemId = id;
  const item = editorQueue.find(q => q.id === id);
  if (!item) return;

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  const sbEl = document.getElementById(`sb-${id}`);
  if (sbEl) sbEl.classList.add('active');

  document.getElementById('batch-editor-container').style.display = 'flex';
  document.getElementById('batch-empty-msg').style.display = 'none';

  const imgEl = document.getElementById('batch-preview-img');
  imgEl.src = item.imgUrl;

  document.getElementById('up-title').value = item.data.title;
  document.getElementById('up-level').value = item.data.level;
  document.getElementById('up-diff').value = item.data.diff;

  document.getElementById('up-perfect').value = item.data.perfect ?? 0;
  document.getElementById('up-great').value = item.data.great ?? 0;
  document.getElementById('up-good').value = item.data.good;
  document.getElementById('up-bad').value = item.data.bad;
  document.getElementById('up-miss-detail').value = item.data.missDetail;
  document.getElementById('up-total-miss').innerText = item.data.totalMiss;
  document.getElementById('up-combo').value = (item.data.combo === null || item.data.combo === undefined) ? '' : item.data.combo;

  renderItemProfileSelector(item);
}

function updateCurrentItem(field, value) {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (!item) return;

  if (field === 'combo') {
    item.data.combo = (value === '' || value === null || value === undefined) ? null : (parseInt(value) || 0);
  } else if (['good', 'bad', 'missDetail', 'level', 'perfect', 'great'].includes(field)) {
    item.data[field] = parseInt(value) || 0;
  } else {
    item.data[field] = value;
  }

  if (field === 'diff' && item.data.musicId) {
    const map = { 'A': 'append', 'M': 'master', 'E': 'expert', 'H': 'hard', 'N': 'normal', 'EZ': 'easy' };
    const newLvl = getLevelFromDb(item.data.musicId, map[value]);
    if (newLvl) { item.data.level = newLvl; document.getElementById('up-level').value = newLvl; }
  }

  if (['good', 'bad', 'missDetail'].includes(field)) {
    item.data.totalMiss = item.data.good + item.data.bad + item.data.missDetail;
    document.getElementById('up-total-miss').innerText = item.data.totalMiss;
  }

  if (field === 'title') {
    document.getElementById(`sb-title-${activeItemId}`).innerText = value || "名称未設定";
  }
  item.status = 'done';
  updateSidebarStatus(activeItemId);
}

// Called when the user manually overrides the profile for the active item.
async function changeItemProfile(newProfileId) {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (!item) return;
  item.profileId = newProfileId;
  item.profileConfident = true; // a manual choice is inherently "confirmed"
  renderItemProfileSelector(item);
  await reanalyzeCurrentItem();
}

function updateSidebarStatus(id) {
  const item = editorQueue.find(q => q.id === id);
  if (!item) return;
  const statusEl = document.getElementById(`sb-status-${id}`);
  statusEl.innerText = "OK";
  statusEl.className = "upload-status done";
}

function removeBatchItem(e, id) {
  e.stopPropagation();
  editorQueue = editorQueue.filter(q => q.id !== id);
  document.getElementById(`sb-${id}`).remove();
  if (activeItemId === id) {
    document.getElementById('batch-editor-container').style.display = 'none';
    document.getElementById('batch-empty-msg').style.display = 'block';
    activeItemId = null;
  }
  checkBatchButton();
}

function checkBatchButton() {
  const btn = document.getElementById('btn-exec-batch');
  btn.disabled = editorQueue.length === 0;
  const label = currentMode === 'upload' ? '全てアップロード' : '保存して反映';
  btn.innerText = editorQueue.length > 0 ? `${label} (${editorQueue.length}件)` : label;
}

// --- Analysis orchestration (delegates the actual reading to ocr-analysis.js) ---

async function runBatchAnalysis(itemsToAnalyze) {
  if (itemsToAnalyze.length === 0) return;
  const statusMsg = document.getElementById('batch-status-msg');
  statusMsg.innerText = "解析中... (しばらくお待ちください)";

  const worker = await createOcrWorker();

  for (const item of itemsToAnalyze) {
    const el = document.getElementById(`sb-status-${item.id}`);
    if (el) { el.innerText = "解析中"; el.className = "upload-status processing"; }

    try {
      const img = await loadImageElement(item.imgUrl);
      const profile = getProfile(item.profileId) || getProfile(DEFAULT_PROFILE_ID);
      const res = await analyzeLoadedImage(img, worker, profile);
      if (res) {
        item.data = {
          title: res.title, level: res.level, diff: res.diff,
          good: res.breakdown.good, bad: res.breakdown.bad, missDetail: res.breakdown.miss,
          perfect: res.breakdown.perfect, great: res.breakdown.great,
          combo: res.combo,
          totalMiss: res.miss, musicId: res.musicId,
        };
        item.status = 'done';
      } else {
        item.status = 'error';
      }
    } catch (e) {
      console.error("Analysis Failed for " + item.id, e);
      item.status = 'error';
    }

    updateSidebarStatus(item.id);
    if (item.status === 'done') {
      document.getElementById(`sb-title-${item.id}`).innerText = item.data.title;
      if (activeItemId === item.id) selectItem(item.id);
    } else {
      const statEl = document.getElementById(`sb-status-${item.id}`);
      if (statEl) { statEl.innerText = "ERR"; statEl.className = "upload-status error"; }
    }
  }
  await worker.terminate();
  statusMsg.innerText = "処理完了";
}

async function reanalyzeCurrentItem() {
  if (!activeItemId) return;
  const item = editorQueue.find(q => q.id === activeItemId);
  if (item) await runBatchAnalysis([item]);
}

async function analyzeAllInBatch() {
  if (editorQueue.length === 0) return;
  await runBatchAnalysis(editorQueue);
}

// --- Execution Logic (Save/Upload) ---

function buildResultProperties(data) {
  const props = {};
  const put = (k, v) => { if (v !== null && v !== undefined && !Number.isNaN(v)) props[k] = String(v); };
  put('perfect', data.perfect);
  put('great', data.great);
  put('combo', data.combo);
  put('good', data.good);
  put('bad', data.bad);
  put('missDetail', data.missDetail);
  return props;
}

async function handleBatchExecution() {
  const btn = document.getElementById('btn-exec-batch');
  btn.disabled = true;
  btn.innerText = "処理中...";

  if (currentMode === 'upload') {
    await executeUploads();
  } else {
    await executeEdits();
  }
}

function buildNewRecordEntry(itemData, previousBest) {
  return {
    title: itemData.title,
    difficulty: (DIFF_META[itemData.diff] || {}).name || itemData.diff,
    difficultyRaw: itemData.diff,
    level: itemData.level,
    missCount: itemData.totalMiss,
    combo: itemData.combo,
    perfect: itemData.perfect,
    previousBest,
  };
}

async function executeUploads() {
  const accessToken = gapi.client.getToken().access_token;
  const rootFolder = await findOrCreateFolderCached(ROOT_FOLDER_NAME);
  const fcFolder = await findOrCreateFolderCached(FC_FOLDER_NAME, rootFolder.id);

  // Snapshot of current bests per song+difficulty BEFORE this batch, so we
  // can tell whether each just-uploaded result becomes the new best.
  const previousBestByFolder = computeBestRecordMap(allRecords);
  const itemsSnapshot = [...editorQueue];
  const newRecords = [];
  const succeededIds = new Set();

  const results = await runWithConcurrency(itemsSnapshot, 3, async (item) => {
    const sbStatus = document.getElementById(`sb-status-${item.id}`);
    if (sbStatus) { sbStatus.innerText = "送信中"; sbStatus.className = "upload-status processing"; }

    if (!item.data.title || !item.data.level) throw new Error("必須項目不足");

    const folderName = `${item.data.level}${item.data.diff} ${item.data.title}`;
    const songFolder = await findOrCreateFolderCached(folderName, fcFolder.id);
    const fileName = (item.data.totalMiss === 0) ? "FC" : `FC-${item.data.totalMiss}`;

    const meta = { name: fileName, parents: [songFolder.id], properties: buildResultProperties(item.data) };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', item.file);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }), body: form,
    });
    if (!res.ok) throw new Error(res.statusText);

    const candidate = { missCount: item.data.totalMiss, combo: item.data.combo, perfect: item.data.perfect };
    const prevBest = previousBestByFolder.get(songFolder.id) || null;
    if (isBetterResult(candidate, prevBest)) newRecords.push(buildNewRecordEntry(item.data, prevBest));

    succeededIds.add(item.id);
    const sbEl = document.getElementById(`sb-${item.id}`);
    if (sbEl) sbEl.remove();
  });

  editorQueue = editorQueue.filter(q => !succeededIds.has(q.id));

  let failCount = 0;
  results.forEach((r, idx) => {
    if (!r.ok) {
      failCount++;
      console.error(r.error);
      const item = itemsSnapshot[idx];
      const sbStatus = document.getElementById(`sb-status-${item.id}`);
      if (sbStatus) { sbStatus.innerText = "失敗"; sbStatus.className = "upload-status error"; }
    }
  });

  finishExecution(itemsSnapshot.length - failCount, "アップロード", newRecords);
}

async function executeEdits() {
  const rootFolder = await findOrCreateFolderCached(ROOT_FOLDER_NAME);
  const fcFolder = await findOrCreateFolderCached(FC_FOLDER_NAME, rootFolder.id);

  const itemsSnapshot = [...editorQueue];
  // Exclude the records being edited from the "previous best" pool -
  // otherwise an edited result could never be judged better than itself.
  const editingIds = new Set(itemsSnapshot.map(i => i.originalId));
  const previousBestByFolder = computeBestRecordMap(allRecords.filter(r => !editingIds.has(r.id)));
  const newRecords = [];
  const succeededIds = new Set();

  const results = await runWithConcurrency(itemsSnapshot, 3, async (item) => {
    const sbStatus = document.getElementById(`sb-status-${item.id}`);
    if (sbStatus) { sbStatus.innerText = "保存中"; sbStatus.className = "upload-status processing"; }

    if (!item.data.title || !item.data.level) throw new Error("必須項目不足");

    const newFolderName = `${item.data.level}${item.data.diff} ${item.data.title}`;
    const newFileName = (item.data.totalMiss === 0) ? "FC" : `FC-${item.data.totalMiss}`;
    const targetFolder = await findOrCreateFolderCached(newFolderName, fcFolder.id);

    const params = { fileId: item.originalId, resource: { name: newFileName, properties: buildResultProperties(item.data) } };
    if (targetFolder.id !== item.originalParent) {
      params.addParents = targetFolder.id;
      params.removeParents = item.originalParent;
    }
    await gapi.client.drive.files.update(params);

    const candidate = { missCount: item.data.totalMiss, combo: item.data.combo, perfect: item.data.perfect };
    const prevBest = previousBestByFolder.get(targetFolder.id) || null;
    if (isBetterResult(candidate, prevBest)) newRecords.push(buildNewRecordEntry(item.data, prevBest));

    succeededIds.add(item.id);
    const sbEl = document.getElementById(`sb-${item.id}`);
    if (sbEl) sbEl.remove();
  });

  editorQueue = editorQueue.filter(q => !succeededIds.has(q.id));

  let failCount = 0;
  results.forEach((r, idx) => {
    if (!r.ok) {
      failCount++;
      console.error(r.error);
      const item = itemsSnapshot[idx];
      const sbStatus = document.getElementById(`sb-status-${item.id}`);
      if (sbStatus) { sbStatus.innerText = "失敗"; sbStatus.className = "upload-status error"; }
    }
  });

  finishExecution(itemsSnapshot.length - failCount, "更新", newRecords);
}

function finishExecution(count, actionName, newRecords = []) {
  if (editorQueue.length === 0) {
    alert(`${actionName}完了 (${count}件)`);
    closeBatchModal();
    selectedIds.clear();
    updateSelectionUI();
    fetchDataFromDrive().then(() => {
      newRecords.forEach(nr => showNewRecordToast(nr, nr.previousBest));
    });
  } else {
    alert(`${count}件 ${actionName}成功。エラー分を確認してください。`);
    checkBatchButton();
  }
}
