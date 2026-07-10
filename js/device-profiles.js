// device-profiles.js
// ------------------------------------------------------------------
// 「機種プロファイル」(読み取り範囲のセット)の管理。
// - localStorage に保存/読み込み
// - 画像の画素数・縦横比から最も近いプロファイルを自動判別
// - プロファイルの作成・複製・削除・プリセットへのリセット
// ------------------------------------------------------------------

import { state } from './state.js';
import { STORAGE_KEYS, DEFAULT_REGION_PROFILES, BUILTIN_PROFILE_IDS } from './config.js';
import { uid, clampRegion } from './utils.js';

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.DEVICE_PROFILES, JSON.stringify(state.deviceProfiles));
  } catch (e) {
    console.error("プロファイル保存エラー", e);
  }
}

export function loadDeviceProfiles() {
  let loaded = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_PROFILES);
    if (raw) loaded = JSON.parse(raw);
  } catch (e) {
    console.error("プロファイル読み込みエラー", e);
  }

  if (!loaded || !Array.isArray(loaded) || loaded.length === 0) {
    // 初回起動: 組み込みプリセットをシードする
    loaded = deepClone(DEFAULT_REGION_PROFILES);
  } else {
    // 新しい組み込みプリセットが増えていた場合、無ければ追加する (アプリ更新時の救済)
    for (const preset of DEFAULT_REGION_PROFILES) {
      if (!loaded.some(p => p.id === preset.id)) {
        loaded.push(deepClone(preset));
      }
    }
  }
  state.deviceProfiles = loaded;
  persist();
  return state.deviceProfiles;
}

export function getAllProfiles() {
  return state.deviceProfiles;
}

export function getProfileById(id) {
  return state.deviceProfiles.find(p => p.id === id) || null;
}

export function getDefaultProfile() {
  return getProfileById(BUILTIN_PROFILE_IDS.DEFAULT) || state.deviceProfiles[0] || null;
}

export function createProfile(name, baseProfile = null) {
  const base = baseProfile || getDefaultProfile();
  const newProfile = {
    id: uid('profile'),
    name: name || '新しい機種',
    isPreset: false,
    refWidth: null,
    refHeight: null,
    regions: deepClone(base.regions),
  };
  state.deviceProfiles.push(newProfile);
  persist();
  return newProfile;
}

export function duplicateProfile(id, newName) {
  const src = getProfileById(id);
  if (!src) return null;
  const copy = deepClone(src);
  copy.id = uid('profile');
  copy.name = newName || `${src.name} のコピー`;
  copy.isPreset = false;
  state.deviceProfiles.push(copy);
  persist();
  return copy;
}

export function updateProfile(id, patch) {
  const p = getProfileById(id);
  if (!p) return null;
  Object.assign(p, patch);
  persist();
  return p;
}

export function updateProfileRegion(id, regionKey, region) {
  const p = getProfileById(id);
  if (!p) return null;
  p.regions[regionKey] = clampRegion(region);
  persist();
  return p;
}

export function setProfileReferenceSize(id, width, height) {
  const p = getProfileById(id);
  if (!p) return null;
  p.refWidth = width;
  p.refHeight = height;
  persist();
  return p;
}

export function deleteProfile(id) {
  const idx = state.deviceProfiles.findIndex(p => p.id === id);
  if (idx === -1) return false;
  // 最後の1件は削除させない (常に何かしらのプロファイルが選べる状態を保証)
  if (state.deviceProfiles.length <= 1) return false;
  state.deviceProfiles.splice(idx, 1);
  persist();
  return true;
}

export function resetPresetToDefault(id) {
  const preset = DEFAULT_REGION_PROFILES.find(p => p.id === id);
  const current = getProfileById(id);
  if (!preset || !current) return null;
  current.regions = deepClone(preset.regions);
  current.refWidth = preset.refWidth;
  current.refHeight = preset.refHeight;
  current.name = preset.name;
  persist();
  return current;
}

// ------------------------------------------------------------------
// 自動判別: アップロードされた画像の width/height から
// 最も近い機種プロファイルを推定する。
//   1. refWidth/refHeight が設定されているプロファイルの中で、
//      解像度が(ほぼ)完全一致するものを最優先。
//   2. 完全一致が無ければ、アスペクト比が最も近いものを選ぶ(許容誤差内のみ)。
//   3. どれにも近くなければ「デフォルト」プロファイルにフォールバック。
// ------------------------------------------------------------------
export function detectProfileForImage(width, height) {
  const candidates = state.deviceProfiles.filter(p => p.refWidth && p.refHeight);
  if (candidates.length === 0) return getDefaultProfile();

  // 1. 解像度の完全一致 (数ピクセルの誤差は許容)
  const EXACT_TOLERANCE_PX = 4;
  const exact = candidates.find(p =>
    Math.abs(p.refWidth - width) <= EXACT_TOLERANCE_PX &&
    Math.abs(p.refHeight - height) <= EXACT_TOLERANCE_PX
  );
  if (exact) return exact;

  // 2. アスペクト比が最も近いもの
  const targetRatio = width / height;
  let best = null, bestDiff = Infinity;
  for (const p of candidates) {
    const ratio = p.refWidth / p.refHeight;
    const diff = Math.abs(ratio - targetRatio) / targetRatio;
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  const RATIO_TOLERANCE = 0.03; // 3%以内なら「同じ機種系統」とみなす
  if (best && bestDiff <= RATIO_TOLERANCE) return best;

  // 3. フォールバック
  return getDefaultProfile();
}
