// detail/render.js
// Builds the whole #detailContent subtree for one song, in the exact order
// specified: title -> jacket -> vocal picker -> player -> id -> title/kana ->
// unit tag -> lyricist -> composer -> arranger -> date -> original video ->
// per-difficulty level/notes.

import { svgIcon } from "../icons.js";
import { jacketUrl, DIFFICULTY_LABELS, DIFFICULTY_LEVEL_CEILING } from "../urls.js";
import { escapeHtml, formatDate, formatCount, clamp, qsa } from "../utils.js";
import { UNIT_TAGS, UNIT_COLORS, resolveVocalCharacters } from "../data/characters.js";

function unitLabelFor(song) {
  const tagKey = song.tags[0];
  const meta = UNIT_TAGS.find((t) => t.key === tagKey);
  return { key: tagKey, label: meta ? meta.label : "その他", color: UNIT_COLORS[tagKey] || "#B9BAC2" };
}

function vocalOptionHtml(vocal, index, charIndex) {
  const chars = resolveVocalCharacters(vocal, charIndex);
  const avatars =
    chars
      .slice(0, 4)
      .map((c) =>
        c.type === "game"
          ? `<span class="vocal-avatar"><img src="${c.icon}" alt="" loading="lazy"></span>`
          : `<span class="vocal-avatar is-outside">${svgIcon("mic", { size: 18 })}</span>`
      )
      .join("") || `<span class="vocal-avatar is-outside">${svgIcon("musicNote", { size: 18 })}</span>`;
  const outsideNames = chars.filter((c) => c.type === "outside").map((c) => c.name).join("・");

  return `
    <button type="button" class="vocal-option" data-vocal-index="${index}" aria-pressed="false">
      <span class="vocal-avatars">${avatars}</span>
      <span class="vocal-caption no-break">${escapeHtml(vocal.caption || "ver.")}</span>
      ${outsideNames ? `<span class="vocal-names truncate">${escapeHtml(outsideNames)}</span>` : ""}
    </button>`;
}

function transportHtml() {
  return `
    <div class="transport" id="transport">
      <div class="seek-row">
        <div class="seek-track-wrap" id="seekTrackWrap">
          <div class="seek-track">
            <div class="seek-fill" id="seekFill"></div>
          </div>
          <div class="seek-thumb" id="seekThumb"></div>
        </div>
      </div>
      <div class="time-row">
        <span id="currentTime" class="mono">0:00</span>
        <span id="duration" class="mono">0:00</span>
      </div>
      <div class="transport-controls">
        <button type="button" class="skip-btn" id="back5Btn" disabled aria-label="5秒戻る">
          ${svgIcon("replay5", { size: 23 })}<span class="skip-num">5</span>
        </button>
        <button type="button" class="play-btn" id="playBtn" disabled aria-label="再生">
          ${svgIcon("play", { size: 26 })}
        </button>
        <button type="button" class="skip-btn" id="fwd5Btn" disabled aria-label="5秒進む">
          ${svgIcon("forward5", { size: 23 })}<span class="skip-num">5</span>
        </button>
      </div>
    </div>
    <div class="player-hint" id="playerHint">${svgIcon("mic", { size: 15 })}ボーカルを選択すると再生できます</div>
    <div class="no-video-hint" id="errorHint" style="display:none;text-align:center;color:var(--diff-expert);margin-top:var(--sp-2)">
      音声を再生できませんでした
    </div>`;
}

function infoListHtml(song) {
  const unit = unitLabelFor(song);
  const originalHtml = song.original
    ? `<button type="button" class="video-btn" id="videoBtn">${svgIcon("video", { size: 17 })}オリジナルビデオを見る</button>`
    : `<span class="no-video-hint">オリジナルビデオはありません</span>`;

  const rows = [
    ["ID", `<span class="mono">#${song.id}</span>`],
    ["タイトル", `${escapeHtml(song.title)}<span class="kana">${escapeHtml(song.pronunciation)}</span>`],
    ["ユニット", `<span class="unit-value"><span class="unit-swatch" style="background:${unit.color}"></span>${escapeHtml(unit.label)}</span>`],
    ["作詞", escapeHtml(song.lyricist)],
    ["作曲", escapeHtml(song.composer)],
    ["編曲", escapeHtml(song.arranger)],
    ["公開日時", escapeHtml(formatDate(song.publishedAt, true))],
    ["動画", originalHtml],
  ];

  return `
    <div class="info-card">
      ${rows
        .map(
          ([label, value]) => `
        <div class="info-row">
          <span class="info-label">${label}</span>
          <span class="info-value">${value}</span>
        </div>`
        )
        .join("")}
    </div>`;
}

function spectrumHtml(song) {
  if (!song.difficulties.length) return "";
  const rows = song.difficulties
    .map((d) => {
      const pct = clamp((d.playLevel / DIFFICULTY_LEVEL_CEILING) * 100, 6, 100);
      return `
        <div class="spectrum-row">
          <span class="diff-label" data-diff="${d.musicDifficulty}">${DIFFICULTY_LABELS[d.musicDifficulty] || d.musicDifficulty}</span>
          <span class="spectrum-track">
            <span class="spectrum-fill" data-diff="${d.musicDifficulty}" data-target-width="${pct}" style="width:0%"></span>
          </span>
          <span class="spectrum-num">
            <span class="lv">Lv.${d.playLevel}</span>
            <span class="notes">${formatCount(d.totalNoteCount)} notes</span>
          </span>
        </div>`;
    })
    .join("");
  return `
    <div class="spectrum-card">
      <div class="spectrum-title">難易度別 レベル・ノーツ数</div>
      <div class="spectrum-rows">${rows}</div>
    </div>`;
}

function animateSpectrum(container) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      qsa(".spectrum-fill", container).forEach((el) => {
        el.style.width = `${el.dataset.targetWidth}%`;
      });
    });
  });
}

/** Renders the full detail subtree for `song` into `container`. */
export function renderDetail(song, charIndex, container) {
  document.title = `${song.title} – Project SEKAI Music Library`;

  container.innerHTML = `
    <div class="detail-grid">
      <div class="detail-hero">
        <h1 class="detail-title">${escapeHtml(song.title)}</h1>
        <div class="detail-jacket-wrap">
          <img src="${jacketUrl(song.id)}" alt="${escapeHtml(song.title)}" loading="lazy">
          ${song.isNewlyWritten ? `<span class="newly-badge">書き下ろし</span>` : ""}
        </div>
        <div class="vocal-section">
          <div class="section-label">ボーカル${song.vocals.length ? `<span class="mono" style="color:var(--ink-faint);font-weight:600"> ${song.vocals.length}</span>` : ""}</div>
          ${
            song.vocals.length
              ? `<div class="vocal-row" id="vocalRow">${song.vocals.map((v, i) => vocalOptionHtml(v, i, charIndex)).join("")}</div>`
              : `<p class="no-video-hint">この楽曲のボーカルデータが見つかりませんでした。</p>`
          }
        </div>
        <div class="player-block">${transportHtml()}</div>
      </div>
      <div class="detail-info">
        ${infoListHtml(song)}
        ${spectrumHtml(song)}
      </div>
    </div>`;

  animateSpectrum(container);
}

export function renderNotFound(container) {
  document.title = "楽曲が見つかりません – Project SEKAI Music Library";
  container.innerHTML = `
    <div class="empty-state" style="padding-top:var(--sp-8)">
      ${svgIcon("search", { size: 40 })}
      <h3>楽曲が見つかりませんでした</h3>
      <p>URL の楽曲 ID をご確認いただくか、一覧ページからやり直してください。</p>
      <a class="btn btn-primary" href="index.html" style="margin-top:var(--sp-3)">一覧に戻る</a>
    </div>`;
}

/** Wires clicking a vocal option -> onSelect(vocal, index). Highlights the chosen chip. */
export function wireVocalSelection(container, song, onSelect) {
  const vocalRow = container.querySelector("#vocalRow");
  if (!vocalRow) return;
  vocalRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-vocal-index]");
    if (!btn) return;
    const index = Number(btn.dataset.vocalIndex);
    const vocal = song.vocals[index];
    if (!vocal) return;
    qsa(".vocal-option", vocalRow).forEach((el) => {
      const isSelected = el === btn;
      el.classList.toggle("is-selected", isSelected);
      el.setAttribute("aria-pressed", String(isSelected));
    });
    onSelect(vocal, index);
  });
}

/** Wires the "original video" button -> opens the shared confirm sheet. */
export function wireOriginalVideo(container, song, sheets) {
  const btn = container.querySelector("#videoBtn");
  if (!btn || !song.original) return;
  const confirmSheet = document.getElementById("confirmSheet");
  const proceedBtn = document.getElementById("confirmProceedBtn");
  if (!confirmSheet || !proceedBtn) return;

  btn.addEventListener("click", () => sheets.open(confirmSheet));
  proceedBtn.addEventListener("click", () => {
    window.open(song.original.videoLink, "_blank", "noopener");
    sheets.close();
  });
}
