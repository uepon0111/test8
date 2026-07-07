import { DEFAULT_CROP_SETTINGS } from "./config.js";

export const DEFAULT_DEVICE_KEY = "default";

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function makeDeviceKey(width, height) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  return `${w}x${h}`;
}

export function getDeviceLabel(key) {
  if (!key) return "未設定";
  if (key === DEFAULT_DEVICE_KEY) return "標準";
  return String(key).replace(/x/g, " × ");
}

export function buildDeviceProfile(key, overrides = {}) {
  return {
    key,
    label: overrides.label || getDeviceLabel(key),
    cropRegions: clone(overrides.cropRegions || DEFAULT_CROP_SETTINGS),
    sampleImageDataUrl: overrides.sampleImageDataUrl || "",
    lastDetectedWidth: overrides.lastDetectedWidth || 0,
    lastDetectedHeight: overrides.lastDetectedHeight || 0,
    lastDetectedRatio: overrides.lastDetectedRatio || 0,
  };
}

export function ensureSettingsShape(settings) {
  const base = settings && typeof settings === "object" ? settings : {};
  const deviceProfiles = base.deviceProfiles && typeof base.deviceProfiles === "object" ? base.deviceProfiles : {};
  const normalized = {};

  for (const [key, value] of Object.entries(deviceProfiles)) {
    normalized[key] = buildDeviceProfile(key, value || {});
  }

  if (base.cropRegions && !normalized[DEFAULT_DEVICE_KEY]) {
    normalized[DEFAULT_DEVICE_KEY] = buildDeviceProfile(DEFAULT_DEVICE_KEY, {
      cropRegions: base.cropRegions,
      sampleImageDataUrl: base.sampleImageDataUrl || "",
    });
  }

  if (!Object.keys(normalized).length) {
    normalized[DEFAULT_DEVICE_KEY] = buildDeviceProfile(DEFAULT_DEVICE_KEY);
  }

  const activeDeviceKey = normalized[base.activeDeviceKey] ? base.activeDeviceKey : Object.keys(normalized)[0];

  return {
    showBestOnly: !!base.showBestOnly,
    activeDeviceKey,
    deviceProfiles: normalized,
  };
}

export function getDeviceProfile(settings, deviceKey) {
  const normalized = ensureSettingsShape(settings);
  const key = deviceKey && normalized.deviceProfiles[deviceKey] ? deviceKey : normalized.activeDeviceKey;
  return normalized.deviceProfiles[key] || normalized.deviceProfiles[Object.keys(normalized.deviceProfiles)[0]];
}

export function listDeviceProfiles(settings) {
  const normalized = ensureSettingsShape(settings);
  return Object.values(normalized.deviceProfiles)
    .slice()
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "ja"));
}

export function ensureDeviceProfile(settings, deviceKey, meta = {}) {
  const normalized = ensureSettingsShape(settings);
  if (!normalized.deviceProfiles[deviceKey]) {
    normalized.deviceProfiles[deviceKey] = buildDeviceProfile(deviceKey, meta);
  }
  return normalized.deviceProfiles[deviceKey];
}

function compareDeviceCandidate(candidate, targetRatio, targetArea) {
  const ratioDiff = Math.abs((candidate.lastDetectedRatio || 0) - targetRatio);
  const candidateArea = (candidate.lastDetectedWidth || 0) * (candidate.lastDetectedHeight || 0);
  const areaDiff = targetArea > 0 ? Math.abs(candidateArea - targetArea) / targetArea : 1;
  return ratioDiff * 4 + areaDiff;
}

export function detectDeviceKeyFromImage(width, height, settings) {
  const normalized = ensureSettingsShape(settings);
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const exactKey = makeDeviceKey(w, h);
  if (normalized.deviceProfiles[exactKey]) return exactKey;

  const ratio = w / h;
  const area = w * h;
  let bestKey = exactKey;
  let bestScore = Infinity;

  for (const profile of Object.values(normalized.deviceProfiles)) {
    const score = compareDeviceCandidate(profile, ratio, area);
    if (score < bestScore) {
      bestScore = score;
      bestKey = profile.key;
    }
  }

  if (bestScore < 0.45) return bestKey;
  return exactKey;
}

export function updateDeviceProfileFromImage(settings, deviceKey, width, height) {
  const normalized = ensureSettingsShape(settings);
  const profile = ensureDeviceProfile(normalized, deviceKey, {
    label: getDeviceLabel(deviceKey),
  });
  profile.lastDetectedWidth = Math.max(1, Math.round(Number(width) || 0));
  profile.lastDetectedHeight = Math.max(1, Math.round(Number(height) || 0));
  profile.lastDetectedRatio = profile.lastDetectedWidth / profile.lastDetectedHeight;
  return normalized;
}
