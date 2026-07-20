// list/filter-sort.js
// Pure data functions: filtering, sorting and search matching. No DOM here so
// it stays easy to reason about and reuse (e.g. the search suggestion dropdown
// reuses matchesQuery/findMatchedField).

import { fuzzyIncludes } from "../utils.js";
import { levelForDifficulty } from "../data/characters.js";

export const SORT_FIELDS = [
  { key: "title", label: "タイトル名順" },
  { key: "id", label: "ID順" },
  { key: "level", label: "楽曲レベル順" },
  { key: "publishedAt", label: "公開日時順" },
];

export const NEWLY_OPTIONS = [
  { key: "all", label: "全て" },
  { key: "newly", label: "書き下ろし" },
  { key: "cover", label: "カバー" },
];

export function createDefaultFilterState() {
  return { unitTag: "all", newly: "all", characters: [] };
}

export function createDefaultSortState() {
  return { field: "publishedAt", dir: "desc", diffBasis: "master" };
}

export function hasActiveFilters(filters) {
  return filters.unitTag !== "all" || filters.newly !== "all" || filters.characters.length > 0;
}

export function activeFilterCount(filters) {
  let n = 0;
  if (filters.unitTag !== "all") n += 1;
  if (filters.newly !== "all") n += 1;
  n += filters.characters.length;
  return n;
}

export function matchesQuery(song, query) {
  if (!query) return true;
  return (
    fuzzyIncludes(song.title, query) ||
    fuzzyIncludes(song.pronunciation, query) ||
    fuzzyIncludes(song.lyricist, query) ||
    fuzzyIncludes(song.composer, query) ||
    fuzzyIncludes(song.arranger, query)
  );
}

/** Which credit field satisfied the query, for the "matched via ..." hint in suggestions. */
export function findMatchedCreditField(song, query) {
  if (!query) return null;
  if (fuzzyIncludes(song.title, query) || fuzzyIncludes(song.pronunciation, query)) return null;
  if (fuzzyIncludes(song.lyricist, query)) return { label: "作詞", value: song.lyricist };
  if (fuzzyIncludes(song.composer, query)) return { label: "作曲", value: song.composer };
  if (fuzzyIncludes(song.arranger, query)) return { label: "編曲", value: song.arranger };
  return null;
}

export function filterSongs(songs, filters, query) {
  return songs.filter((s) => {
    if (filters.unitTag !== "all" && !s.tags.includes(filters.unitTag)) return false;
    if (filters.newly === "newly" && !s.isNewlyWritten) return false;
    if (filters.newly === "cover" && s.isNewlyWritten) return false;
    if (filters.characters.length && !filters.characters.every((k) => s.characterKeys.has(k))) return false;
    if (!matchesQuery(s, query)) return false;
    return true;
  });
}

export function sortSongs(songs, sort) {
  const dirMul = sort.dir === "asc" ? 1 : -1;
  const withIndex = songs.map((s, i) => [s, i]);
  withIndex.sort(([a, ai], [b, bi]) => {
    let diff = 0;
    switch (sort.field) {
      case "title":
        diff = (a.pronunciation || a.title).localeCompare(b.pronunciation || b.title, "ja");
        break;
      case "id":
        diff = a.id - b.id;
        break;
      case "level":
        diff = levelForDifficulty(a, sort.diffBasis) - levelForDifficulty(b, sort.diffBasis);
        break;
      case "publishedAt":
      default:
        diff = a.publishedAt - b.publishedAt;
        break;
    }
    if (diff === 0) diff = a.id - b.id; // stable, deterministic tiebreak
    return dirMul * diff || ai - bi;
  });
  return withIndex.map(([s]) => s);
}
