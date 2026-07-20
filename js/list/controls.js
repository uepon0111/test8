// list/controls.js
// All interactive wiring for index.html's toolbar + song collection. Keeps a
// small local `state` object (query/viewMode/sort/filters), persists it to
// localStorage, and re-renders the collection whenever it changes.

import { svgIcon } from "../icons.js";
import { jacketUrl, DIFFICULTY_ORDER, DIFFICULTY_LABELS } from "../urls.js";
import {
  qs,
  qsa,
  debounce,
  escapeHtml,
  highlightMatch,
  fuzzyIncludes,
  getPersisted,
  setPersisted,
} from "../utils.js";
import { UNIT_TAGS, collectFilterableCharacters } from "../data/characters.js";
import {
  SORT_FIELDS,
  NEWLY_OPTIONS,
  createDefaultFilterState,
  createDefaultSortState,
  filterSongs,
  sortSongs,
  activeFilterCount,
  findMatchedCreditField,
} from "./filter-sort.js";
import { renderCollection } from "./render.js";

const VIEW_KEY = "sekaiLib:viewMode";
const SORT_KEY = "sekaiLib:sort";
const FILTER_KEY = "sekaiLib:filters";
const GRID5_MIN_WIDTH = 700;
const MAX_SUGGESTIONS = 8;

function normalizeFilters(f) {
  const base = createDefaultFilterState();
  if (!f || typeof f !== "object") return base;
  return {
    unitTag: typeof f.unitTag === "string" ? f.unitTag : base.unitTag,
    newly: typeof f.newly === "string" ? f.newly : base.newly,
    characters: Array.isArray(f.characters) ? f.characters : base.characters,
  };
}

function normalizeSort(s) {
  const base = createDefaultSortState();
  if (!s || typeof s !== "object") return base;
  return {
    field: SORT_FIELDS.some((f) => f.key === s.field) ? s.field : base.field,
    dir: s.dir === "asc" ? "asc" : "desc",
    diffBasis: DIFFICULTY_ORDER.includes(s.diffBasis) ? s.diffBasis : base.diffBasis,
  };
}

export function initListControls({ songs, charIndex, sheets }) {
  const state = {
    query: "",
    viewMode: getPersisted(VIEW_KEY, "grid3"),
    sort: normalizeSort(getPersisted(SORT_KEY, null)),
    filters: normalizeFilters(getPersisted(FILTER_KEY, null)),
  };
  if (state.viewMode === "grid5" && window.innerWidth < GRID5_MIN_WIDTH) {
    state.viewMode = "grid3";
  }

  // ---- element refs ----
  const collectionEl = document.getElementById("songCollection");
  const countEl = document.getElementById("resultCount");
  const searchInput = document.getElementById("searchInput");
  const searchField = searchInput.closest(".search-field");
  const searchClearBtn = document.getElementById("searchClear");
  const suggestPanel = document.getElementById("suggestPanel");
  const activeFiltersEl = document.getElementById("activeFilters");

  const viewButtons = qsa("[data-view]", document.getElementById("viewSwitch"));

  const sortTriggerLabel = document.getElementById("sortTriggerLabel");
  const sortSheetBody = document.getElementById("sortSheetBody");

  const filterTrigger = document.getElementById("filterTrigger");
  const filterCountBadge = document.getElementById("filterCountBadge");
  const filterUnitRow = document.getElementById("filterUnitRow");
  const filterNewlyRow = document.getElementById("filterNewlyRow");
  const charSearchInput = document.getElementById("charSearchInput");
  const charGrid = document.getElementById("charGrid");
  const filterResetBtn = document.getElementById("filterResetBtn");

  const filterableCharacters = collectFilterableCharacters(songs, charIndex);

  let activeSuggestIndex = -1;

  // ---------------------------------------------------------------------
  // Core render
  // ---------------------------------------------------------------------
  function applyAndRender() {
    const filtered = filterSongs(songs, state.filters, state.query);
    const sorted = sortSongs(filtered, state.sort);
    renderCollection(collectionEl, sorted, state.viewMode);
    countEl.innerHTML = `<span class="mono">${sorted.length}</span>曲`;
    renderActiveFilters();
  }

  collectionEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-song-id]");
    if (btn) navigateToSong(btn.dataset.songId);
  });

  function navigateToSong(id) {
    window.location.href = `song.html?id=${encodeURIComponent(id)}`;
  }

  // ---------------------------------------------------------------------
  // Search + suggestions
  // ---------------------------------------------------------------------
  function closeSuggestions() {
    suggestPanel.classList.remove("is-open");
    activeSuggestIndex = -1;
  }

  function renderSuggestions(query) {
    if (!query) return closeSuggestions();
    const matches = songs.filter((s) => fuzzyIncludes(s.title, query) || fuzzyIncludes(s.pronunciation, query) || fuzzyIncludes(s.lyricist, query) || fuzzyIncludes(s.composer, query) || fuzzyIncludes(s.arranger, query)).slice(0, MAX_SUGGESTIONS);
    activeSuggestIndex = -1;
    if (!matches.length) {
      suggestPanel.innerHTML = `<div class="suggest-empty">一致する楽曲が見つかりません</div>`;
    } else {
      suggestPanel.innerHTML = matches
        .map((s) => {
          const credit = findMatchedCreditField(s, query);
          const metaHtml = credit
            ? `${escapeHtml(credit.label)}: ${highlightMatch(credit.value, query)}`
            : escapeHtml(s.pronunciation || "");
          return `
            <button type="button" class="suggest-item" data-song-id="${s.id}">
              <span class="suggest-thumb"><img src="${jacketUrl(s.id)}" alt="" loading="lazy"></span>
              <span class="suggest-text">
                <span class="suggest-title truncate">${highlightMatch(s.title, query)}</span>
                <span class="suggest-meta truncate">${metaHtml}</span>
              </span>
            </button>`;
        })
        .join("");
    }
    suggestPanel.classList.add("is-open");
  }

  const debouncedSearch = debounce((val) => {
    state.query = val.trim();
    applyAndRender();
    renderSuggestions(state.query);
  }, 120);

  searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    searchField.classList.toggle("has-value", !!val);
    debouncedSearch(val);
  });
  searchInput.addEventListener("focus", () => {
    if (state.query) renderSuggestions(state.query);
  });
  searchInput.addEventListener("keydown", (e) => {
    const items = qsa(".suggest-item", suggestPanel);
    if (!suggestPanel.classList.contains("is-open") || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeSuggestIndex = Math.min(items.length - 1, activeSuggestIndex + 1);
      items.forEach((it, i) => it.classList.toggle("is-active", i === activeSuggestIndex));
      items[activeSuggestIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeSuggestIndex = Math.max(0, activeSuggestIndex - 1);
      items.forEach((it, i) => it.classList.toggle("is-active", i === activeSuggestIndex));
      items[activeSuggestIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && activeSuggestIndex >= 0) {
      e.preventDefault();
      navigateToSong(items[activeSuggestIndex].dataset.songId);
    } else if (e.key === "Escape") {
      closeSuggestions();
      searchInput.blur();
    }
  });
  document.addEventListener("click", (e) => {
    if (!suggestPanel.contains(e.target) && e.target !== searchInput) closeSuggestions();
  });
  suggestPanel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-song-id]");
    if (btn) navigateToSong(btn.dataset.songId);
  });
  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchField.classList.remove("has-value");
    state.query = "";
    applyAndRender();
    closeSuggestions();
    searchInput.focus();
  });

  // ---------------------------------------------------------------------
  // View switch
  // ---------------------------------------------------------------------
  function syncViewButtons() {
    viewButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.view === state.viewMode));
  }
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.viewMode = btn.dataset.view;
      setPersisted(VIEW_KEY, state.viewMode);
      syncViewButtons();
      applyAndRender();
    });
  });
  window.addEventListener(
    "resize",
    debounce(() => {
      if (state.viewMode === "grid5" && window.innerWidth < GRID5_MIN_WIDTH) {
        state.viewMode = "grid3";
        setPersisted(VIEW_KEY, state.viewMode);
        syncViewButtons();
        applyAndRender();
      }
    }, 200)
  );

  // ---------------------------------------------------------------------
  // Sort sheet
  // ---------------------------------------------------------------------
  function renderSortSheet() {
    const fieldsHtml = SORT_FIELDS.map(
      (f) => `
      <button type="button" class="option-row ${state.sort.field === f.key ? "is-selected" : ""}" data-sort-field="${f.key}">
        <span class="option-label">${escapeHtml(f.label)}</span>
        <span class="check">${svgIcon("check", { size: 18 })}</span>
      </button>`
    ).join("");

    const dirHtml = `
      <div class="sort-direction-row">
        <button type="button" class="dir-btn ${state.sort.dir === "asc" ? "is-selected" : ""}" data-sort-dir="asc">${svgIcon("arrowUp", { size: 15 })}昇順</button>
        <button type="button" class="dir-btn ${state.sort.dir === "desc" ? "is-selected" : ""}" data-sort-dir="desc">${svgIcon("arrowDown", { size: 15 })}降順</button>
      </div>`;

    const basisHtml =
      state.sort.field === "level"
        ? `
      <div class="section-label">基準にする難易度</div>
      <div class="diff-basis-row">
        ${DIFFICULTY_ORDER.map(
          (d) => `
          <button type="button" class="chip ${state.sort.diffBasis === d ? "is-selected" : ""}" data-sort-basis="${d}">
            <span class="diff-dot" data-diff="${d}"></span>${DIFFICULTY_LABELS[d]}
          </button>`
        ).join("")}
      </div>`
        : "";

    sortSheetBody.innerHTML = `
      <div class="section-label">並び替え</div>
      ${fieldsHtml}
      ${dirHtml}
      ${basisHtml}
    `;
  }

  function syncSortTrigger() {
    const field = SORT_FIELDS.find((f) => f.key === state.sort.field);
    sortTriggerLabel.textContent = field ? field.label : "並び替え";
  }

  function commitSort() {
    setPersisted(SORT_KEY, state.sort);
    renderSortSheet();
    syncSortTrigger();
    applyAndRender();
  }

  sortSheetBody.addEventListener("click", (e) => {
    const fieldBtn = e.target.closest("[data-sort-field]");
    if (fieldBtn) {
      state.sort.field = fieldBtn.dataset.sortField;
      commitSort();
      return;
    }
    const dirBtn = e.target.closest("[data-sort-dir]");
    if (dirBtn) {
      state.sort.dir = dirBtn.dataset.sortDir;
      commitSort();
      return;
    }
    const basisBtn = e.target.closest("[data-sort-basis]");
    if (basisBtn) {
      state.sort.diffBasis = basisBtn.dataset.sortBasis;
      commitSort();
    }
  });

  // ---------------------------------------------------------------------
  // Filter sheet
  // ---------------------------------------------------------------------
  function renderCharacterGrid(charQuery = "") {
    const list = charQuery
      ? filterableCharacters.filter((c) => fuzzyIncludes(c.name, charQuery))
      : filterableCharacters;
    if (!list.length) {
      charGrid.innerHTML = `<div class="suggest-empty" style="grid-column:1/-1">キャラクターが見つかりません</div>`;
      return;
    }
    charGrid.innerHTML = list
      .map((c) => {
        const selected = state.filters.characters.includes(c.key);
        const avatar =
          c.type === "game"
            ? `<span class="char-avatar"><img src="${c.icon}" alt="" loading="lazy"></span>`
            : `<span class="char-avatar">${svgIcon("mic", { size: 19 })}</span>`;
        return `
          <button type="button" class="char-tile ${c.type === "outside" ? "is-outside" : ""} ${selected ? "is-selected" : ""}" data-char-key="${c.key}">
            ${avatar}
            <span class="char-name no-break">${escapeHtml(c.name)}</span>
          </button>`;
      })
      .join("");
  }

  function renderFilterSheet() {
    filterUnitRow.innerHTML = UNIT_TAGS.map(
      (t) => `<button type="button" class="chip ${state.filters.unitTag === t.key ? "is-selected" : ""}" data-unit="${t.key}">${escapeHtml(t.label)}</button>`
    ).join("");
    filterNewlyRow.innerHTML = NEWLY_OPTIONS.map(
      (o) => `<button type="button" class="chip ${state.filters.newly === o.key ? "is-selected" : ""}" data-newly="${o.key}">${escapeHtml(o.label)}</button>`
    ).join("");
    renderCharacterGrid(charSearchInput.value);
  }

  function syncFilterTrigger() {
    const count = activeFilterCount(state.filters);
    filterTrigger.classList.toggle("has-active", count > 0);
    if (count > 0) {
      filterCountBadge.textContent = String(count);
      filterCountBadge.style.display = "flex";
    } else {
      filterCountBadge.style.display = "none";
    }
  }

  function commitFilters() {
    setPersisted(FILTER_KEY, state.filters);
    renderFilterSheet();
    syncFilterTrigger();
    applyAndRender();
  }

  filterUnitRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-unit]");
    if (!btn) return;
    state.filters.unitTag = btn.dataset.unit;
    commitFilters();
  });
  filterNewlyRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-newly]");
    if (!btn) return;
    state.filters.newly = btn.dataset.newly;
    commitFilters();
  });
  charGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-char-key]");
    if (!btn) return;
    const key = btn.dataset.charKey;
    const idx = state.filters.characters.indexOf(key);
    if (idx === -1) state.filters.characters.push(key);
    else state.filters.characters.splice(idx, 1);
    commitFilters();
  });
  charSearchInput.addEventListener(
    "input",
    debounce((e) => renderCharacterGrid(e.target.value), 100)
  );
  filterResetBtn.addEventListener("click", () => {
    state.filters = createDefaultFilterState();
    charSearchInput.value = "";
    commitFilters();
  });

  // ---------------------------------------------------------------------
  // Active filter chip row (above the collection)
  // ---------------------------------------------------------------------
  function renderActiveFilters() {
    const chips = [];
    if (state.filters.unitTag !== "all") {
      const t = UNIT_TAGS.find((u) => u.key === state.filters.unitTag);
      if (t) chips.push({ label: t.label, remove: () => { state.filters.unitTag = "all"; commitFilters(); } });
    }
    if (state.filters.newly !== "all") {
      const o = NEWLY_OPTIONS.find((n) => n.key === state.filters.newly);
      if (o) chips.push({ label: o.label, remove: () => { state.filters.newly = "all"; commitFilters(); } });
    }
    for (const key of state.filters.characters) {
      const c = charIndex.get(key);
      if (!c) continue;
      chips.push({
        label: c.name,
        remove: () => {
          state.filters.characters = state.filters.characters.filter((k) => k !== key);
          commitFilters();
        },
      });
    }
    activeFiltersEl.innerHTML = chips
      .map((c, i) => `<span class="active-chip" data-idx="${i}">${escapeHtml(c.label)}<button type="button" aria-label="フィルターを削除">${svgIcon("x", { size: 12 })}</button></span>`)
      .join("");
    qsa("[data-idx]", activeFiltersEl).forEach((el, i) => {
      el.querySelector("button").addEventListener("click", () => chips[i].remove());
    });
  }

  // ---------------------------------------------------------------------
  // Sheet open triggers (generic data-open-sheet handled in main.js too,
  // but wire these two explicitly since they also need to render fresh content)
  // ---------------------------------------------------------------------
  const sortSheet = document.getElementById("sortSheet");
  const filterSheet = document.getElementById("filterSheet");
  document.getElementById("sortTrigger").addEventListener("click", () => {
    renderSortSheet();
    sheets.open(sortSheet);
  });
  filterTrigger.addEventListener("click", () => {
    renderFilterSheet();
    sheets.open(filterSheet);
  });

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  syncViewButtons();
  syncSortTrigger();
  syncFilterTrigger();
  renderSortSheet();
  renderFilterSheet();
  applyAndRender();
}
