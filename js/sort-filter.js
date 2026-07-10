// ===================================================================
// sort-filter.js
// Filtering + the multi-tier sort-priority system:
//
//   名前順:     name  -> difficulty -> miss -> date
//   レベル順:   level -> difficulty -> name -> miss -> date
//   ミス数順:   miss  -> level -> difficulty -> name -> date
//   追加日順:   date only
//
// Each mode's *primary* key can be toggled ascending/descending; the
// tie-breakers behind it use fixed, sensible directions (difficulty and
// level break ties harder/higher-first, name breaks ties alphabetically,
// miss breaks ties fewer-first, date breaks ties newest-first) so the
// overall ordering stays stable and predictable as you switch modes.
//
// For larger libraries this also drives the visual progress bar
// (see notifications.js) so sorting/filtering never looks "stuck".
// ===================================================================

const VIEW_PROGRESS_CHUNK_SIZE = 150; // below this, everything is instant enough that a progress bar would just flash

// --- Field comparators (ascending) ---
function compareByName(a, b) { return a.title.localeCompare(b.title, 'ja'); }
function compareByLevel(a, b) { return a.level - b.level; }
function compareByDifficulty(a, b) { return diffRank[a.difficultyRaw] - diffRank[b.difficultyRaw]; }
function compareByMiss(a, b) { return a.missCount - b.missCount; }
function compareByDate(a, b) {
  const at = a.addedDate ? new Date(a.addedDate).getTime() : 0;
  const bt = b.addedDate ? new Date(b.addedDate).getTime() : 0;
  return at - bt;
}

function reversed(cmp) { return (a, b) => -cmp(a, b); }
function chainComparators(...cmps) {
  return (a, b) => {
    for (const cmp of cmps) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

function buildComparator(field, direction) {
  const dir = direction === 'desc' ? -1 : 1;
  const primary = (base) => (a, b) => dir * base(a, b);
  const diffTie = reversed(compareByDifficulty); // harder first
  const levelTie = reversed(compareByLevel);     // higher level first
  const nameTie = compareByName;                 // alphabetical
  const missTie = compareByMiss;                 // fewer misses first
  const dateTie = reversed(compareByDate);        // newest first

  switch (field) {
    case 'name':
      return chainComparators(primary(compareByName), diffTie, missTie, dateTie);
    case 'miss':
      return chainComparators(primary(compareByMiss), levelTie, diffTie, nameTie, dateTie);
    case 'date':
      return primary(compareByDate);
    case 'level':
    default:
      return chainComparators(primary(compareByLevel), diffTie, nameTie, missTie, dateTie);
  }
}

function passesFilters(r, f) {
  if (f.fcF === 'fc' && !r.isFC) return false;
  if (f.fcF === 'unfc' && r.isFC) return false;
  if (!r.isFC) {
    const mVal = r.missCount;
    if (f.msMin !== "" && mVal < parseInt(f.msMin)) return false;
    if (f.msMax !== "" && mVal > parseInt(f.msMax)) return false;
  } else {
    if (f.msMin !== "" && 0 < parseInt(f.msMin)) return false;
  }
  if (f.dfF !== 'all' && r.difficultyRaw !== f.dfF) return false;
  if (f.lvF && r.level != f.lvF) return false;
  if (f.tiF && !r.title.toLowerCase().includes(f.tiF)) return false;
  return true;
}

let viewUpdateToken = 0;

async function updateView() {
  if (!allRecords) return;
  const myToken = ++viewUpdateToken;

  const filters = {
    fcF: document.getElementById('filter-fc').value,
    msMin: document.getElementById('filter-miss-min').value,
    msMax: document.getElementById('filter-miss-max').value,
    dfF: document.getElementById('filter-diff').value,
    lvF: document.getElementById('filter-level').value,
    tiF: document.getElementById('filter-title').value.trim().toLowerCase(),
  };
  const bestOnly = document.getElementById('filter-best-only').checked;
  const sortField = document.getElementById('sort-field').value;
  const sortDir = document.getElementById('sort-direction').dataset.dir || 'asc';

  const source = bestOnly ? Array.from(computeBestRecordMap(allRecords).values()) : allRecords;
  const total = source.length;
  const showProgress = total > VIEW_PROGRESS_CHUNK_SIZE;

  if (showProgress) { showViewProgress(2, 'フィルター中...'); await nextFrame(); }

  const filtered = [];
  for (let i = 0; i < total; i += VIEW_PROGRESS_CHUNK_SIZE) {
    if (myToken !== viewUpdateToken) return; // superseded by a newer update
    const chunk = source.slice(i, i + VIEW_PROGRESS_CHUNK_SIZE);
    for (const r of chunk) if (passesFilters(r, filters)) filtered.push(r);
    if (showProgress) {
      showViewProgress(5 + Math.round((Math.min(i + VIEW_PROGRESS_CHUNK_SIZE, total) / total) * 70), 'フィルター中...');
      await nextFrame();
    }
  }
  if (myToken !== viewUpdateToken) return;

  if (showProgress) { showViewProgress(80, '並び替え中...'); await nextFrame(); }
  if (myToken !== viewUpdateToken) return;

  filtered.sort(buildComparator(sortField, sortDir));

  if (myToken !== viewUpdateToken) return;
  if (showProgress) showViewProgress(96, '表示を更新中...');

  filteredRecords = filtered;
  renderGrid(filtered);
  hideViewProgress();
}

const debouncedUpdateView = debounce(() => updateView(), 180);

function toggleSortDirection() {
  const btn = document.getElementById('sort-direction');
  btn.dataset.dir = (btn.dataset.dir === 'asc') ? 'desc' : 'asc';
  renderSortDirectionButton();
  updateView();
}

function renderSortDirectionButton() {
  const btn = document.getElementById('sort-direction');
  if (!btn) return;
  const dir = btn.dataset.dir || 'asc';
  btn.innerHTML = dir === 'asc'
    ? '<span class="material-symbols-outlined">arrow_upward</span> 昇順'
    : '<span class="material-symbols-outlined">arrow_downward</span> 降順';
}

// --- "自己ベストのみ表示" toggle persistence ---
function restoreBestOnlyToggleState() {
  try {
    const checkbox = document.getElementById('filter-best-only');
    if (checkbox) checkbox.checked = localStorage.getItem(LS_SHOW_BEST_ONLY_KEY) === '1';
  } catch (e) { /* ignore */ }
}

function onBestOnlyToggleChanged(checked) {
  try { localStorage.setItem(LS_SHOW_BEST_ONLY_KEY, checked ? '1' : '0'); } catch (e) { /* ignore */ }
  updateView();
}
