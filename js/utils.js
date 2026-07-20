// utils.js
// Small, dependency-free helpers shared by the list and detail pages.

/** Convert full-width katakana to hiragana (1:1 length-preserving mapping). */
export function katakanaToHiragana(str) {
  if (!str) return "";
  return str.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** Normalize a string for loose, script-insensitive search matching. */
export function normalizeForSearch(str) {
  if (!str) return "";
  return katakanaToHiragana(String(str))
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "");
}

/** True if `haystack` contains `query` once both are kana/case normalized. */
export function fuzzyIncludes(haystack, query) {
  if (!query) return true;
  return normalizeForSearch(haystack).includes(normalizeForSearch(query));
}

/**
 * Wrap the first match of `query` inside `text` with <mark>, using
 * normalized indices so hiragana/katakana queries still highlight correctly
 * against the original (unnormalized) display text.
 */
export function highlightMatch(text, query) {
  const safe = escapeHtml(text ?? "");
  if (!query) return safe;
  const normText = normalizeForSearch(text);
  const normQuery = normalizeForSearch(query);
  const idx = normText.indexOf(normQuery);
  if (idx === -1 || !normQuery) return safe;
  const raw = String(text ?? "");
  const before = escapeHtml(raw.slice(0, idx));
  const match = escapeHtml(raw.slice(idx, idx + normQuery.length));
  const after = escapeHtml(raw.slice(idx + normQuery.length));
  return `${before}<mark>${match}</mark>${after}`;
}

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

/** epochMs -> "2023年10月5日" (optionally with time) */
export function formatDate(epochMs, withTime = false) {
  if (!epochMs) return "-";
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return "-";
  const base = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  if (!withTime) return base;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${base} ${hh}:${mm}`;
}

/** seconds (float) -> "1:23"; guards against NaN/Infinity during metadata load. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatCount(num) {
  if (typeof num !== "number") return "-";
  return num.toLocaleString("en-US");
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

/** Group an array of objects by a key, returning a plain object of arrays. */
export function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    const k = item[key];
    (out[k] ||= []).push(item);
  }
  return out;
}

export function keyBy(arr, key) {
  const out = {};
  for (const item of arr) out[item[key]] = item;
  return out;
}

/** Generic localStorage-backed persistence (view mode, sort, filters, settings). */
export function getPersisted(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}
export function setPersisted(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    /* storage unavailable (e.g. private mode) - state just won't persist */
  }
}

/** Read ?id= (or any param) from the current URL. */
export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Manages a single shared overlay behind whichever `.sheet` is currently open
 * (settings / filters / sort / vocal confirm all reuse the same overlay).
 */
export function createSheetManager(overlayEl) {
  let current = null;
  let onCloseCb = null;

  function close() {
    if (current) current.classList.remove("is-open");
    overlayEl.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    current = null;
    onCloseCb?.();
    onCloseCb = null;
  }

  function open(sheetEl, { onClose } = {}) {
    if (current && current !== sheetEl) current.classList.remove("is-open");
    current = sheetEl;
    onCloseCb = onClose || null;
    overlayEl.classList.add("is-open");
    // Next frame so the transform transition actually runs.
    requestAnimationFrame(() => sheetEl.classList.add("is-open"));
    document.body.classList.add("no-scroll");
  }

  overlayEl.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) close();
  });

  return { open, close, isOpen: () => !!current };
}
