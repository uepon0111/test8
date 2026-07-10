// ===================================================================
// config.js
// Central configuration: API credentials, Drive folder names,
// difficulty metadata (codes / display names / colors / sort rank),
// and the default OCR reading-region definitions used to seed the
// first device profile.
// ===================================================================

// ↓↓↓ GCP Settings ↓↓↓
const CLIENT_ID = '966636096862-8hrrm5heb4g5r469veoels7u6ifjguuk.apps.googleusercontent.com';
const API_KEY = 'AIzaSyC-m1rkHuJTmNK2k-s89bJFshvXCS5MZZ0';
// ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive';

// Drive folder / file layout (kept identical to the original tool so existing
// libraries keep working without any migration step).
const ROOT_FOLDER_NAME = "プロセカリザルト";
const FC_FOLDER_NAME = "FC";
// Settings (device profiles) are synced to Drive so they follow the user
// across browsers/devices. Stored as a single small JSON file.
const SETTINGS_FOLDER_NAME = "設定";
const SETTINGS_FILE_NAME = "prsk-result-viewer-settings.json";

// -------------------------------------------------------------------
// Difficulty metadata
//
// Folder-name codes are kept backwards compatible with the previous
// single-letter scheme (A/M/E/H). EASY collides with EXPERT's initial,
// so it uses the two-letter "EZ" code; NORMAL is free as a single "N".
// The parser (see utils.js parseFolderTitle) accepts 1-2 uppercase
// letters so both legacy and new folders parse correctly.
// -------------------------------------------------------------------
const DIFF_META = {
  EZ: { key: 'easy',   name: 'EASY',   color: '#66DA7E', rank: 1 },
  N:  { key: 'normal', name: 'NORMAL', color: '#66C9F9', rank: 2 },
  H:  { key: 'hard',   name: 'HARD',   color: '#F5CC44', rank: 3 },
  E:  { key: 'expert', name: 'EXPERT', color: '#EA5577', rank: 4 },
  M:  { key: 'master', name: 'MASTER', color: '#BB40F5', rank: 5 },
  A:  { key: 'append', name: 'APPEND', color: '#EE82E2', rank: 6 },
};

// Display / selector order. Keeps the original APPEND→HARD ordering for the
// four pre-existing difficulties, then appends the two new ones.
const DIFF_ORDER = ['A', 'M', 'E', 'H', 'N', 'EZ'];

// Convenience: code -> rank, used heavily by the sorter.
const diffRank = Object.fromEntries(DIFF_ORDER.map(c => [c, DIFF_META[c].rank]));

// -------------------------------------------------------------------
// OCR reading regions
//
// Each region is a ratio-based rectangle {x,y,w,h} in the 0..1 range,
// relative to the analyzed image's own width/height. Ratio-based
// coordinates are resolution independent as long as the aspect ratio
// matches, which is why regions are grouped into "device profiles"
// keyed by reference resolution / aspect ratio (see device-profiles.js).
//
// The values below were measured directly against the example result
// screenshot supplied with this project (2388x1668) and seed the
// first ("デフォルト") device profile. The combo region in particular
// is intentionally generous since combo digit-count/position can vary
// slightly - it is meant as a good starting point, adjustable any time
// from Settings.
// -------------------------------------------------------------------
const REGION_TYPES = [
  { id: 'title',      label: '曲名',        color: '#007bff' },
  { id: 'difficulty', label: '難易度',      color: '#ff9800' },
  { id: 'breakdown',  label: '判定内訳 (PERFECT/GREAT/GOOD/BAD/MISS)', color: '#28a745' },
  { id: 'combo',      label: 'コンボ数',    color: '#e91e63' },
];

const DEFAULT_REGIONS = {
  title:      { x: 0.19, y: 0.01,  w: 0.32, h: 0.06  },
  difficulty: { x: 0.20, y: 0.07,  w: 0.10, h: 0.04  },
  breakdown:  { x: 0.10, y: 0.53,  w: 0.22, h: 0.26  },
  combo:      { x: 0.32, y: 0.52,  w: 0.21, h: 0.07  },
};

const DEFAULT_PROFILE_ID = 'default';

function buildDefaultProfile() {
  return {
    id: DEFAULT_PROFILE_ID,
    name: 'デフォルト',
    refWidth: 2388,
    refHeight: 1668,
    regions: JSON.parse(JSON.stringify(DEFAULT_REGIONS)),
    previewImage: 'assets/sample-default.jpg',
    updatedAt: Date.now(),
  };
}

// -------------------------------------------------------------------
// Misc storage keys
// -------------------------------------------------------------------
const LS_DEVICE_PROFILES_KEY = 'prsk_device_profiles_v1';
const LS_LAST_PROFILE_KEY = 'prsk_last_profile_id_v1';
const LS_SHOW_BEST_ONLY_KEY = 'prsk_show_best_only_v1';
