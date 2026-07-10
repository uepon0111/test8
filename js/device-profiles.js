// ===================================================================
// device-profiles.js
// "機種ごとの読み取り範囲" - per-device OCR region profiles.
//
// A profile = { id, name, refWidth, refHeight, regions:{title,difficulty,
// breakdown,combo -> {x,y,w,h} ratios 0..1}, updatedAt }.
//
// Persistence: localStorage is the always-available primary store; when
// signed in to Drive, the same payload is also synced to a small JSON
// file so profiles follow the user across browsers/devices. Whole-list,
// last-write-wins (by `savedAt`) - simple and predictable.
// ===================================================================

const DeviceProfiles = {
  list: [],
  ready: false,
  savedAt: 0,
};

function clampRegion(r) {
  const w = clamp(r.w, 0.01, 1);
  const h = clamp(r.h, 0.01, 1);
  const x = clamp(r.x, 0, 1 - w);
  const y = clamp(r.y, 0, 1 - h);
  return { x, y, w, h };
}

function buildProfilePayload() {
  return { savedAt: DeviceProfiles.savedAt, profiles: DeviceProfiles.list };
}

function persistToLocalStorage() {
  try {
    localStorage.setItem(LS_DEVICE_PROFILES_KEY, JSON.stringify(buildProfilePayload()));
  } catch (e) {
    console.error('プロファイルのローカル保存に失敗', e);
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_DEVICE_PROFILES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length) return parsed;
  } catch (e) {
    console.error('プロファイルのローカル読込に失敗', e);
  }
  return null;
}

// Called once at startup (does not require Drive auth).
function initDeviceProfiles() {
  const local = loadFromLocalStorage();
  if (local) {
    DeviceProfiles.list = local.profiles;
    DeviceProfiles.savedAt = local.savedAt || Date.now();
  } else {
    DeviceProfiles.list = [buildDefaultProfile()];
    DeviceProfiles.savedAt = Date.now();
    persistToLocalStorage();
  }
  DeviceProfiles.ready = true;
}

function getProfiles() {
  return DeviceProfiles.list;
}

function getProfile(id) {
  return DeviceProfiles.list.find(p => p.id === id) || null;
}

function getLastUsedProfileId() {
  try {
    const id = localStorage.getItem(LS_LAST_PROFILE_KEY);
    if (id && getProfile(id)) return id;
  } catch (e) { /* ignore */ }
  return DeviceProfiles.list[0] ? DeviceProfiles.list[0].id : null;
}

function setLastUsedProfileId(id) {
  try { localStorage.setItem(LS_LAST_PROFILE_KEY, id); } catch (e) { /* ignore */ }
}

// Persists (create-or-replace by id) and syncs to Drive if logged in.
async function upsertProfile(profile) {
  const clean = {
    id: profile.id || generateId('profile'),
    name: (profile.name || '未設定機種').trim() || '未設定機種',
    refWidth: Math.round(profile.refWidth) || 1080,
    refHeight: Math.round(profile.refHeight) || 1920,
    regions: {
      title: clampRegion(profile.regions.title),
      difficulty: clampRegion(profile.regions.difficulty),
      breakdown: clampRegion(profile.regions.breakdown),
      combo: clampRegion(profile.regions.combo),
    },
    previewImage: (profile.previewImage !== undefined) ? profile.previewImage : null,
    updatedAt: Date.now(),
  };
  const idx = DeviceProfiles.list.findIndex(p => p.id === clean.id);
  if (idx >= 0) {
    // Preserve the existing preview image if this update doesn't supply a new one.
    if (clean.previewImage === null && DeviceProfiles.list[idx].previewImage) {
      clean.previewImage = DeviceProfiles.list[idx].previewImage;
    }
    DeviceProfiles.list[idx] = clean;
  } else {
    DeviceProfiles.list.push(clean);
  }
  DeviceProfiles.savedAt = Date.now();
  persistToLocalStorage();
  syncProfilesToDriveIfPossible();
  return clean;
}

async function deleteProfile(id) {
  DeviceProfiles.list = DeviceProfiles.list.filter(p => p.id !== id);
  if (DeviceProfiles.list.length === 0) DeviceProfiles.list.push(buildDefaultProfile());
  DeviceProfiles.savedAt = Date.now();
  persistToLocalStorage();
  syncProfilesToDriveIfPossible();
}

// -------------------------------------------------------------------
// Auto-detection: pick the profile whose reference aspect ratio is
// closest to the uploaded image's aspect ratio. Aspect ratio (not raw
// resolution) is the primary signal because ratio-based crop regions
// stay aligned across different pixel densities of the *same* physical
// layout, but not across different aspect ratios/devices.
// -------------------------------------------------------------------
const ASPECT_RATIO_CONFIDENT_TOLERANCE = 0.035; // ~3.5%

function matchProfileForImage(width, height) {
  const profiles = DeviceProfiles.list;
  if (!profiles.length) return { profile: null, confident: false, score: Infinity };
  const ar = width / height;
  let best = null;
  let bestScore = Infinity;
  for (const p of profiles) {
    const par = p.refWidth / p.refHeight;
    const arDiff = Math.abs(ar - par) / par;
    if (arDiff < bestScore - 1e-9) {
      bestScore = arDiff;
      best = p;
    } else if (Math.abs(arDiff - bestScore) <= 1e-9 && best) {
      // Tie-break: closer total resolution wins.
      const curPixels = Math.abs(width * height - best.refWidth * best.refHeight);
      const newPixels = Math.abs(width * height - p.refWidth * p.refHeight);
      if (newPixels < curPixels) best = p;
    }
  }
  return { profile: best, confident: bestScore <= ASPECT_RATIO_CONFIDENT_TOLERANCE, score: bestScore };
}

// -------------------------------------------------------------------
// Drive sync (best-effort; silently no-ops while signed out).
// Uses the same folder helpers as the rest of the app (see drive-api.js)
// so it benefits from the same folder-id cache.
// -------------------------------------------------------------------
let driveSyncInFlight = null;

function syncProfilesToDriveIfPossible() {
  if (!isSignedIn()) return;
  // Coalesce rapid successive edits (e.g. dragging a handle) into one write.
  clearTimeout(syncProfilesToDriveIfPossible._t);
  syncProfilesToDriveIfPossible._t = setTimeout(() => { pushProfilesToDrive().catch(e => console.error('設定のDrive同期に失敗', e)); }, 800);
}

async function pushProfilesToDrive() {
  if (!isSignedIn()) return;
  const settingsFolder = await findOrCreateFolderCached(SETTINGS_FOLDER_NAME, null);
  const payload = buildProfilePayload();
  await uploadJsonFile(SETTINGS_FILE_NAME, settingsFolder.id, payload);
}

// Called once right after a successful sign-in: reconciles local vs Drive
// (whole-list last-write-wins by `savedAt`) so profiles stay in sync
// across devices without clobbering more-recent local edits.
async function reconcileProfilesWithDrive() {
  try {
    const settingsFolder = await findOrCreateFolderCached(SETTINGS_FOLDER_NAME, null);
    const remote = await downloadJsonFile(SETTINGS_FILE_NAME, settingsFolder.id);
    if (remote && Array.isArray(remote.profiles) && remote.profiles.length) {
      if ((remote.savedAt || 0) > DeviceProfiles.savedAt) {
        DeviceProfiles.list = remote.profiles;
        DeviceProfiles.savedAt = remote.savedAt;
        persistToLocalStorage();
        if (typeof onDeviceProfilesChangedExternally === 'function') onDeviceProfilesChangedExternally();
        return;
      }
    }
    // Local is newer (or Drive had nothing yet) - push local up.
    await uploadJsonFile(SETTINGS_FILE_NAME, settingsFolder.id, buildProfilePayload());
  } catch (e) {
    console.error('設定の同期に失敗しました（ローカル設定を使用します）', e);
  }
}
