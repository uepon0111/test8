import { STORAGE_KEY_SETTINGS, DEFAULT_CROP_SETTINGS } from "./config.js";
import { ensureSettingsShape } from "./device.js";

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function loadSettings() {
  const base = ensureSettingsShape({
    showBestOnly: false,
    activeDeviceKey: "default",
    deviceProfiles: {
      default: { cropRegions: clone(DEFAULT_CROP_SETTINGS), sampleImageDataUrl: "" },
    },
  });

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return ensureSettingsShape({
      ...base,
      ...parsed,
    });
  } catch {
    return base;
  }
}

export function saveSettings(settings) {
  const payload = ensureSettingsShape(settings);
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(payload));
  } catch (e) {
    console.warn("Failed to save settings", e);
  }
}
