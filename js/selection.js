// ===================================================================
// selection.js
// Selection-mode state + individual/batch delete actions.
// ===================================================================

function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  const btn = document.getElementById('btn-select-mode');
  if (isSelectMode) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
    selectedIds.clear();
    updateSelectionUI();
  }
  renderGrid(filteredRecords);
}

function toggleSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  const card = document.getElementById(`card-${id}`);
  if (card) {
    if (selectedIds.has(id)) card.classList.add('selected');
    else card.classList.remove('selected');
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const bar = document.getElementById('batch-actions');
  const countSpan = document.getElementById('selected-count');
  countSpan.innerText = selectedIds.size;
  bar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
}

function clearSelection() {
  selectedIds.clear();
  updateSelectionUI();
  renderGrid(filteredRecords);
}

// Individual Actions (Non-Select Mode)
function individualEdit(id) {
  selectedIds.clear();
  selectedIds.add(id);
  batchEdit();
}

async function individualDelete(id) {
  if (!confirm("このリザルトを削除しますか？")) return;
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('grid').innerHTML = '';
  try {
    await gapi.client.drive.files.delete({ fileId: id });
    alert("削除しました");
    await fetchDataFromDrive();
  } catch (e) {
    alert("エラー: " + e.message);
    fetchDataFromDrive();
  }
}

async function batchDelete() {
  if (!confirm(`選択した ${selectedIds.size} 件を削除しますか？`)) return;
  const loader = document.getElementById('loader');
  loader.style.display = 'flex';
  document.getElementById('grid').innerHTML = '';

  try {
    // Bounded-concurrency delete instead of one-request-at-a-time.
    const ids = Array.from(selectedIds);
    const results = await runWithConcurrency(ids, 4, id => gapi.client.drive.files.delete({ fileId: id }));
    const failed = results.filter(r => !r.ok);
    if (failed.length > 0) {
      console.error('一部の削除に失敗しました', failed.map(r => r.error));
      alert(`${ids.length - failed.length}件削除しました。${failed.length}件は失敗しました。`);
    } else {
      alert("削除しました");
    }
    selectedIds.clear();
    updateSelectionUI();
    await fetchDataFromDrive();
  } catch (e) {
    alert("削除エラー: " + e.message);
    fetchDataFromDrive();
  }
}
