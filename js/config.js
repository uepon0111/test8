// config.js
// ------------------------------------------------------------------
// アプリ全体で使う定数を1箇所に集約するファイル。
// 値を変更したい場合は基本的にこのファイルだけを見ればよい。
// ------------------------------------------------------------------

// ↓↓↓ GCP Settings ↓↓↓ (元の index.html から変更なし)
export const CLIENT_ID = '966636096862-8hrrm5heb4g5r469veoels7u6ifjguuk.apps.googleusercontent.com';
export const API_KEY = 'AIzaSyC-m1rkHuJTmNK2k-s89bJFshvXCS5MZZ0';
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

export const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
export const SCOPES = 'https://www.googleapis.com/auth/drive';

// Google Drive 上のフォルダ名
export const DRIVE_ROOT_FOLDER_NAME = "プロセカリザルト";
// 旧バージョンが使用していたサブフォルダ名 (後方互換の読み取り専用パスで使用)
export const LEGACY_FC_FOLDER_NAME = "FC";

// 楽曲マスターDB (sekai-world/sekai-master-db-diff)
export const MUSIC_DB_URL = 'https://sekai-world.github.io/sekai-master-db-diff/musics.json';
export const MUSIC_DIFF_DB_URL = 'https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json';

// ------------------------------------------------------------------
// 難易度定義
// EASY, NORMAL, HARD, EXPERT, MASTER, APPEND の6種類。
// code: フォルダ名や保存データ内で使う短いコード (既存の A/M/E/H はそのまま維持し、
//       追加された EASY/NORMAL には未使用のコードを新規に割り当てることで、
//       過去バージョンで保存されたデータとの後方互換性を保っている)
// dbKey: sekai-master-db-diff の musicDifficulty フィールドと対応する値
// rank: 難易度の並び順 (低い→高い)。ソート時のタイブレークに使用
// color: 指定されたカラーコード
// ------------------------------------------------------------------
export const DIFFICULTIES = [
  { code: 'EZ', dbKey: 'easy',   label: 'EASY',   rank: 1, color: '#66DA7E' },
  { code: 'NM', dbKey: 'normal', label: 'NORMAL', rank: 2, color: '#66C9F9' },
  { code: 'H',  dbKey: 'hard',   label: 'HARD',   rank: 3, color: '#F5CC44' },
  { code: 'E',  dbKey: 'expert', label: 'EXPERT', rank: 4, color: '#EA5577' },
  { code: 'M',  dbKey: 'master', label: 'MASTER', rank: 5, color: '#BB40F5' },
  { code: 'A',  dbKey: 'append', label: 'APPEND', rank: 6, color: '#EE82E2' },
];

export const DIFF_BY_CODE = Object.fromEntries(DIFFICULTIES.map(d => [d.code, d]));
export const DIFF_BY_DBKEY = Object.fromEntries(DIFFICULTIES.map(d => [d.dbKey, d]));
// 難易度コードごとのランク (ソート用)
export const DIFF_RANK = Object.fromEntries(DIFFICULTIES.map(d => [d.code, d.rank]));

// 有効な難易度コードの一覧 (フォルダ名パース用の正規表現に使用)
// 2文字コード(EZ, NM)を先に判定できるよう長い順に並べる
export const DIFF_CODES_BY_LENGTH_DESC = [...DIFFICULTIES.map(d => d.code)].sort((a, b) => b.length - a.length);

// ------------------------------------------------------------------
// OCR 読み取り範囲のデフォルトプロファイル (機種プリセット)
// 各領域は画像サイズに対する比率 (0〜1) で x, y, w, h を保持する。
// これは cropImage() にそのまま渡される。
//
// 「Default」: 元のアプリが使用していた座標をベースに、
//   good/bad/miss の3行だけを読んでいた範囲を perfect/great を含む5行分に拡張。
//   (元の x, y, w, h の値は一切変更せず、必要な分だけ上方向に拡張した)
//   コンボの読み取り範囲は要件の通り「一旦仮」の値。
//
// 「iPad (2388×1668)」: 添付されたサンプル画像 (リザルト画面) から実測した座標。
//   このアプリでは画像の横幅・縦幅・比率を基準にプロファイルを自動判別するため、
//   同じ機種のスクリーンショットであれば次回から自動的にこのプロファイルが選ばれる。
// ------------------------------------------------------------------
export const BUILTIN_PROFILE_IDS = {
  DEFAULT: 'preset-default',
  IPAD: 'preset-ipad-2388x1668',
};

export const DEFAULT_REGION_PROFILES = [
  {
    id: BUILTIN_PROFILE_IDS.DEFAULT,
    name: 'デフォルト',
    isPreset: true,
    refWidth: null,   // 特定の解像度に紐付かない汎用プロファイル (自動判別の最終フォールバックとして使用)
    refHeight: null,
    regions: {
      title:      { x: 0.19, y: 0.01, w: 0.32, h: 0.05 },
      difficulty: { x: 0.20, y: 0.07, w: 0.10, h: 0.04 },
      judge:      { x: 0.10, y: 0.363, w: 0.20, h: 0.467 },
      combo:      { x: 0.31, y: 0.363, w: 0.12, h: 0.15 },
    },
  },
  {
    id: BUILTIN_PROFILE_IDS.IPAD,
    name: 'iPad (2388×1668)',
    isPreset: true,
    refWidth: 2388,
    refHeight: 1668,
    regions: {
      title:      { x: 0.185, y: 0.025, w: 0.19,  h: 0.06 },
      difficulty: { x: 0.19,  y: 0.085, w: 0.09,  h: 0.065 },
      judge:      { x: 0.10,  y: 0.53,  w: 0.22,  h: 0.35 },
      combo:      { x: 0.32,  y: 0.53,  w: 0.10,  h: 0.135 },
    },
  },
];

// 判定領域内の4つのサブ領域のラベル (設定画面の凡例などに使用)
export const REGION_DEFS = [
  { key: 'title',      label: 'タイトル',   color: '#4285f4' },
  { key: 'difficulty',  label: '難易度',     color: '#e67e22' },
  { key: 'judge',       label: '判定内訳(PERFECT〜MISS)', color: '#16a085' },
  { key: 'combo',       label: 'コンボ数',   color: '#e91e8c' },
];

// ------------------------------------------------------------------
// localStorage キー
// ------------------------------------------------------------------
export const STORAGE_KEYS = {
  DEVICE_PROFILES: 'prsk_device_profiles_v1',
  SORT_PREFS: 'prsk_sort_prefs_v1',
  SHOW_BEST_ONLY: 'prsk_show_best_only_v1',
};

// ------------------------------------------------------------------
// Google Drive file.properties に保存するキー (短縮キー: 124byte/件の制限があるため)
// ------------------------------------------------------------------
export const DRIVE_PROP_KEYS = {
  SCHEMA: 'v',        // スキーマバージョン (現行 "2")
  TITLE: 't',
  LEVEL: 'lv',
  DIFF: 'd',          // 難易度コード (EZ/NM/H/E/M/A)
  MUSIC_ID: 'mid',
  PERFECT: 'pf',
  GREAT: 'gr',
  GOOD: 'gd',
  BAD: 'bd',
  MISS: 'ms',
  COMBO: 'cb',
};
export const DRIVE_SCHEMA_VERSION = '2';

// 並び替えの各キーが「タイブレーク(2番目以降)」として使われる際の既定方向。
// 一番上位(プライマリ)のキーだけがユーザーの昇順/降順トグルに従う。
export const TIEBREAK_DIRECTION = {
  name: 'asc',    // 名前: あいうえお順
  level: 'desc',  // レベル: 高い順
  diff: 'desc',   // 難易度: 高い(APPENDに近い)順
  miss: 'asc',    // ミス数: 少ない順
  date: 'desc',   // 追加日: 新しい順
};
