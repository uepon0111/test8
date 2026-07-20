// list/render.js
// Pure-ish DOM rendering for the song collection. Takes already filtered +
// sorted songs and paints them as either title-main rows (1 col) or
// thumbnail-main cards (3/5 col).

import { svgIcon } from "../icons.js";
import { jacketUrl } from "../urls.js";
import { escapeHtml, formatDate } from "../utils.js";
import { UNIT_COLORS } from "../data/characters.js";

function diffDotsHtml(song) {
  if (!song.difficulties.length) return "";
  return `<div class="diff-dots">${song.difficulties
    .map((d) => `<span class="diff-dot" data-diff="${d.musicDifficulty}"></span>`)
    .join("")}</div>`;
}

function unitSwatchHtml(song) {
  const tag = song.tags[0];
  if (!tag) return "";
  const color = UNIT_COLORS[tag] || "#B9BAC2";
  return `<span class="unit-swatch" style="background:${color}"></span>`;
}

function newlyBadgeHtml(song) {
  return song.isNewlyWritten ? `<span class="newly-badge">書き下ろし</span>` : "";
}

function rowTemplate(song) {
  return `
    <button type="button" class="song-row" data-song-id="${song.id}">
      <span class="row-thumb"><img src="${jacketUrl(song.id)}" alt="" loading="lazy" width="54" height="54"></span>
      <span class="row-main">
        <span class="row-title truncate">${escapeHtml(song.title)}</span>
        <span class="row-kana truncate">${escapeHtml(song.pronunciation)}</span>
        <span class="row-meta">
          ${unitSwatchHtml(song)}
          <span class="mono">#${song.id}</span>
          <span class="meta-dot"></span>
          ${diffDotsHtml(song)}
          <span class="meta-dot"></span>
          <span class="truncate">${formatDate(song.publishedAt)}</span>
        </span>
      </span>
      <span class="row-badges">${newlyBadgeHtml(song)}</span>
    </button>`;
}

function cardTemplate(song) {
  return `
    <button type="button" class="song-card" data-song-id="${song.id}">
      <span class="card-thumb">
        <img src="${jacketUrl(song.id)}" alt="" loading="lazy">
        ${newlyBadgeHtml(song)}
      </span>
      <span class="card-body">
        <span class="card-title clamp-2">${escapeHtml(song.title)}</span>
        <span class="card-meta">
          ${unitSwatchHtml(song)}
          <span class="mono">#${song.id}</span>
          ${diffDotsHtml(song)}
        </span>
      </span>
    </button>`;
}

function emptyStateHtml() {
  return `
    <div class="empty-state">
      ${svgIcon("search", { size: 40 })}
      <h3>楽曲が見つかりませんでした</h3>
      <p>検索キーワードやフィルターの条件を変更してもう一度お試しください。</p>
    </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {any[]} songs
 * @param {'list'|'grid3'|'grid5'} viewMode
 */
export function renderCollection(container, songs, viewMode) {
  container.dataset.view = viewMode;
  if (!songs.length) {
    container.innerHTML = emptyStateHtml();
    return;
  }
  const template = viewMode === "list" ? rowTemplate : cardTemplate;
  container.innerHTML = songs.map(template).join("");
}

export function renderCollectionSkeleton(container, count = 12) {
  container.dataset.view = "grid3";
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="song-card" aria-hidden="true">
        <div class="card-thumb skel"></div>
        <div class="card-body">
          <div class="skel" style="height:13px;border-radius:4px;width:90%"></div>
          <div class="skel" style="height:10px;border-radius:4px;width:50%;margin-top:4px"></div>
        </div>
      </div>`
    )
    .join("");
}
