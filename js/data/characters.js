// data/characters.js
// Turns the raw JSON arrays into: (1) a character lookup index keyed by
// "game:<id>" / "outside:<id>", and (2) one unified song object per music entry
// with its difficulties, unit tags, vocal versions and cast pre-grouped.

import { groupBy, keyBy } from "../utils.js";
import { characterIconUrl, DIFFICULTY_ORDER } from "../urls.js";

/** Filter chip metadata, using the exact short labels from the brief. */
export const UNIT_TAGS = [
  { key: "all", label: "全て" },
  { key: "vocaloid", label: "バチャシン" },
  { key: "light_music_club", label: "レオニ" },
  { key: "idol", label: "モモジャン" },
  { key: "street", label: "ビビバス" },
  { key: "theme_park", label: "ワンダショ" },
  { key: "school_refusal", label: "ニーゴ" },
  { key: "other", label: "その他" },
];

/** A small color swatch per unit, used as a dot in the 1-column list rows. */
export const UNIT_COLORS = {
  vocaloid: "#2FBFB0",
  light_music_club: "#F0A23C",
  idol: "#FF5FA8",
  street: "#3F8CF5",
  theme_park: "#7CC93D",
  school_refusal: "#8B5CF6",
  other: "#9AA0AC",
};

export function characterKey(characterType, characterId) {
  const kind = characterType === "game_character" ? "game" : "outside";
  return `${kind}:${characterId}`;
}

/** @returns {Map<string, {type:'game'|'outside', id:number, name:string, icon:string|null}>} */
export function buildCharacterIndex(gameCharacters, outsideCharacters) {
  const index = new Map();
  for (const c of gameCharacters) {
    const name = `${c.firstName || ""}${c.givenName || ""}`;
    index.set(characterKey("game_character", c.id), {
      type: "game",
      id: c.id,
      name,
      icon: characterIconUrl(c.id),
    });
  }
  for (const c of outsideCharacters) {
    index.set(characterKey("outside_character", c.id), {
      type: "outside",
      id: c.id,
      name: c.name,
      icon: null,
    });
  }
  return index;
}

function difficultySortIndex(musicDifficulty) {
  const i = DIFFICULTY_ORDER.indexOf(musicDifficulty);
  return i === -1 ? DIFFICULTY_ORDER.length : i;
}

/**
 * @param {{musics:any[], musicDifficulties:any[], musicTags:any[], musicVocals:any[], musicOriginals:any[]}} raw
 */
export function buildSongs(raw) {
  const { musics, musicDifficulties, musicTags, musicVocals, musicOriginals } = raw;
  const diffByMusic = groupBy(musicDifficulties, "musicId");
  const tagByMusic = groupBy(musicTags, "musicId");
  const vocalByMusic = groupBy(musicVocals, "musicId");
  const originalByMusic = keyBy(musicOriginals, "musicId");

  return musics.map((m) => {
    const difficulties = (diffByMusic[m.id] || [])
      .slice()
      .sort((a, b) => difficultySortIndex(a.musicDifficulty) - difficultySortIndex(b.musicDifficulty));

    // "all" is a catch-all tag present on almost every song; the real signal
    // for the unit filter is the remaining specific tag(s).
    const tags = (tagByMusic[m.id] || [])
      .map((t) => t.musicTag)
      .filter((t) => t !== "all");

    const vocals = (vocalByMusic[m.id] || []).slice().sort((a, b) => a.seq - b.seq);

    const characterKeys = new Set();
    for (const v of vocals) {
      for (const c of v.characters || []) {
        characterKeys.add(characterKey(c.characterType, c.characterId));
      }
    }

    return {
      id: m.id,
      title: m.title,
      pronunciation: m.pronunciation || "",
      lyricist: m.lyricist || "-",
      composer: m.composer || "-",
      arranger: m.arranger || "-",
      isNewlyWritten: !!m.isNewlyWrittenMusic,
      publishedAt: m.publishedAt || 0,
      difficulties,
      tags,
      vocals,
      original: originalByMusic[m.id] || null,
      characterKeys,
    };
  });
}

export function levelForDifficulty(song, diffKey) {
  const d = song.difficulties.find((x) => x.musicDifficulty === diffKey);
  return d ? d.playLevel : -1;
}

export function highestLevel(song) {
  return song.difficulties.reduce((max, d) => Math.max(max, d.playLevel), 0);
}

/** Resolve a vocal's character list (in display order) to index entries. */
export function resolveVocalCharacters(vocal, charIndex) {
  return (vocal.characters || [])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((c) => charIndex.get(characterKey(c.characterType, c.characterId)))
    .filter(Boolean);
}

/** Every character that sings at least one song, sorted game-characters-first. */
export function collectFilterableCharacters(songs, charIndex) {
  const seen = new Set();
  for (const s of songs) for (const k of s.characterKeys) seen.add(k);
  return Array.from(seen)
    .map((k) => ({ key: k, ...charIndex.get(k) }))
    .filter((c) => c.id !== undefined)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "game" ? -1 : 1;
      return a.id - b.id;
    });
}
