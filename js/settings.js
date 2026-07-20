// settings.js
// The one setting the brief asks for: whether playback should jump past the
// silent lead-in. Also wires the gear-icon sheet that hosts it (shared markup
// exists on both index.html and song.html).

import { getPersisted, setPersisted } from "./utils.js";

const KEY_SKIP_SILENCE = "sekaiLib:skipSilence";
export const SILENCE_SKIP_SECONDS = 8; // "0:08" per the brief

export function getSkipSilence() {
  return getPersisted(KEY_SKIP_SILENCE, false);
}

export function setSkipSilence(value) {
  setPersisted(KEY_SKIP_SILENCE, !!value);
}

/**
 * Wires the settings gear button + sheet. Expects this markup to exist:
 *   #settingsTrigger, #settingsSheet, #skipSilenceToggle
 * @param {{ sheets: ReturnType<typeof import('./utils.js').createSheetManager> }} deps
 */
export function initSettingsPanel({ sheets }) {
  const trigger = document.getElementById("settingsTrigger");
  const sheet = document.getElementById("settingsSheet");
  const toggle = document.getElementById("skipSilenceToggle");
  if (!trigger || !sheet || !toggle) return;

  const sync = () => {
    const on = getSkipSilence();
    toggle.classList.toggle("is-on", on);
    toggle.setAttribute("aria-checked", String(on));
  };
  sync();

  toggle.addEventListener("click", () => {
    setSkipSilence(!getSkipSilence());
    sync();
  });

  trigger.addEventListener("click", () => sheets.open(sheet));
}
