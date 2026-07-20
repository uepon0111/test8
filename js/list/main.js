// list/main.js
// Entry point loaded by index.html.

import { loadMasterData } from "../data/api.js";
import { buildCharacterIndex, buildSongs } from "../data/characters.js";
import { createSheetManager } from "../utils.js";
import { initSettingsPanel } from "../settings.js";
import { initListControls } from "./controls.js";
import { renderCollectionSkeleton } from "./render.js";

async function boot() {
  const collectionEl = document.getElementById("songCollection");
  const countEl = document.getElementById("resultCount");
  const overlay = document.getElementById("overlay");
  const sheets = createSheetManager(overlay);

  document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
    btn.addEventListener("click", () => sheets.close());
  });

  initSettingsPanel({ sheets });

  renderCollectionSkeleton(collectionEl);
  countEl.textContent = "";

  try {
    const raw = await loadMasterData();
    const charIndex = buildCharacterIndex(raw.gameCharacters, raw.outsideCharacters);
    const songs = buildSongs(raw);
    initListControls({ songs, charIndex, sheets });
  } catch (err) {
    console.error("[sekai-music-library] failed to load master data", err);
    collectionEl.removeAttribute("data-view");
    collectionEl.innerHTML = `
      <div class="empty-state">
        <h3>データの取得に失敗しました</h3>
        <p>通信環境をご確認のうえ、ページを再読み込みしてください。</p>
      </div>`;
  }
}

boot();
