// urls.js
// Central place for every asset URL pattern + difficulty ordering/labels, so the
// rest of the app never hard-codes a storage.sekai.best path directly.

const ASSET_HOST = "https://storage.sekai.best/sekai-jp-assets";
const MASTER_HOST = "https://sekai-world.github.io/sekai-master-db-diff";

export const MASTER_URLS = {
  musics: `${MASTER_HOST}/musics.json`,
  musicDifficulties: `${MASTER_HOST}/musicDifficulties.json`,
  musicVocals: `${MASTER_HOST}/musicVocals.json`,
  gameCharacters: `${MASTER_HOST}/gameCharacters.json`,
  outsideCharacters: `${MASTER_HOST}/outsideCharacters.json`,
  musicTags: `${MASTER_HOST}/musicTags.json`,
  musicOriginals: `${MASTER_HOST}/musicOriginals.json`,
};

/** Song jacket / thumbnail image. */
export function jacketUrl(musicId) {
  return `${ASSET_HOST}/music/jacket/jacket_s_${musicId}/jacket_s_${musicId}.png`;
}

/** Vocal audio track. `assetbundleName` comes from a musicVocals entry. */
export function audioUrl(assetbundleName) {
  return `${ASSET_HOST}/music/long/${assetbundleName}/${assetbundleName}.mp3`;
}

/** In-game character portrait. Outside characters have no game art. */
export function characterIconUrl(characterId) {
  return `${ASSET_HOST}/character/character_sd_l/chr_sp_${characterId}.png`;
}

/** Difficulty display order, low -> high. "append" is a bonus 6th chart some songs have. */
export const DIFFICULTY_ORDER = ["easy", "normal", "hard", "expert", "master", "append"];

export const DIFFICULTY_LABELS = {
  easy: "EASY",
  normal: "NORMAL",
  hard: "HARD",
  expert: "EXPERT",
  master: "MASTER",
  append: "APPEND",
};

/** A generous ceiling used only to scale the difficulty spectrum bars. */
export const DIFFICULTY_LEVEL_CEILING = 38;
