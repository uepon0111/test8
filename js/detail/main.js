// detail/main.js
// Entry point loaded by song.html.

import { loadMasterData } from "../data/api.js";
import { buildCharacterIndex, buildSongs, resolveVocalCharacters } from "../data/characters.js";
import { createSheetManager, getQueryParam } from "../utils.js";
import { initSettingsPanel } from "../settings.js";
import { renderDetail, renderNotFound, wireVocalSelection, wireOriginalVideo } from "./render.js";
import { createPlayer } from "../player/engine.js";
import { bindPlayerUI } from "../player/ui.js";
import { jacketUrl } from "../urls.js";

async function boot() {
  const contentEl = document.getElementById("detailContent");
  const overlay = document.getElementById("overlay");
  const sheets = createSheetManager(overlay);

  document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
    btn.addEventListener("click", () => sheets.close());
  });

  initSettingsPanel({ sheets });

  const idParam = getQueryParam("id");
  const musicId = idParam ? Number(idParam) : NaN;
  if (!idParam || Number.isNaN(musicId)) {
    renderNotFound(contentEl);
    return;
  }

  try {
    const raw = await loadMasterData();
    const charIndex = buildCharacterIndex(raw.gameCharacters, raw.outsideCharacters);
    const songs = buildSongs(raw);
    const song = songs.find((s) => s.id === musicId);

    if (!song) {
      renderNotFound(contentEl);
      return;
    }

    renderDetail(song, charIndex, contentEl);
    setupPlayer(song, charIndex, contentEl);
    wireOriginalVideo(contentEl, song, sheets);
  } catch (err) {
    console.error("[sekai-music-library] failed to load song detail", err);
    contentEl.innerHTML = `
      <div class="empty-state" style="padding-top:var(--sp-8)">
        <h3>データの取得に失敗しました</h3>
        <p>通信環境をご確認のうえ、ページを再読み込みしてください。</p>
      </div>`;
  }
}

function setupPlayer(song, charIndex, contentEl) {
  const player = createPlayer();

  const els = {
    playBtn: document.getElementById("playBtn"),
    back5Btn: document.getElementById("back5Btn"),
    fwd5Btn: document.getElementById("fwd5Btn"),
    seekTrackWrap: document.getElementById("seekTrackWrap"),
    seekFill: document.getElementById("seekFill"),
    seekThumb: document.getElementById("seekThumb"),
    currentTimeEl: document.getElementById("currentTime"),
    durationEl: document.getElementById("duration"),
    errorHint: document.getElementById("errorHint"),
    playerHint: document.getElementById("playerHint"),
    miniPlayer: document.getElementById("miniPlayer"),
    miniPlayBtn: document.getElementById("miniPlayBtn"),
    miniSeekFill: document.getElementById("miniSeekFill"),
    miniThumb: document.getElementById("miniThumb"),
  };
  bindPlayerUI(player, els);

  const miniThumbImg = els.miniThumb?.querySelector("img");
  const miniTitleEl = document.getElementById("miniTitle");
  const miniSubEl = document.getElementById("miniSub");
  if (miniThumbImg) {
    miniThumbImg.src = jacketUrl(song.id);
    miniThumbImg.alt = "";
  }
  if (miniTitleEl) miniTitleEl.textContent = song.title;

  wireVocalSelection(contentEl, song, (vocal) => {
    const chars = resolveVocalCharacters(vocal, charIndex);
    const artistLabel = chars.map((c) => c.name).join("・") || vocal.caption || "";
    if (miniSubEl) miniSubEl.textContent = artistLabel;
    player.load({
      assetbundleName: vocal.assetbundleName,
      title: song.title,
      artistLabel,
      artworkUrl: jacketUrl(song.id),
    });
  });
}

boot();
