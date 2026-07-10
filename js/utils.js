// ===================================================================
// utils.js
// Small, dependency-free helper functions shared across modules.
// ===================================================================

function escapeHtml(t) {
  return t ? t.toString().replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : '';
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Parses a song-result folder name such as "33A ドーナツホール 2024" or the
// new "5EZ 曲名" (Easy) / "12N 曲名" (Normal) style names.
// Accepts 1-2 uppercase letters for the difficulty code so both legacy
// (A/M/E/H) and new (N / EZ) folders parse correctly.
function parseFolderTitle(folderName) {
  const regex = /^(\d+)([A-Z]{1,2})\s+(.+)$/;
  const match = folderName.match(regex);
  if (!match) return null;
  const rawDiff = match[2];
  const meta = DIFF_META[rawDiff];
  return {
    level: parseInt(match[1], 10),
    rawDiff: rawDiff,
    difficulty: meta ? meta.name : rawDiff,
    title: match[3],
  };
}

// Parses "FC" / "FC-<n>" style filenames into a miss count (0 for plain "FC").
function parseScore(fileName) {
  const match = fileName.match(/^FC(?:-(\d+))?/);
  return match ? (match[1] === undefined ? 0 : parseInt(match[1], 10)) : null;
}

// Reads an arbitrary Drive `properties` bag (always strings) into numbers,
// tolerating missing/older files that were saved before a given key existed.
function readIntProperty(properties, key) {
  if (!properties || properties[key] === undefined || properties[key] === null || properties[key] === '') return null;
  const n = parseInt(properties[key], 10);
  return Number.isNaN(n) ? null : n;
}

function formatDateTime(tsOrIso) {
  if (!tsOrIso) return '';
  const d = new Date(tsOrIso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Simple debounce, used for the settings-panel numeric inputs so dragging
// and typing don't both fire a flood of re-renders.
function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Yields control back to the browser so a just-updated DOM (e.g. a loading
// spinner) actually gets painted before a synchronous, CPU-heavy block runs.
function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
