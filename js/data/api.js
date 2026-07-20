// data/api.js
// Loads the sekai-world master-db JSON files. Note that audio (.mp3) is
// intentionally NOT handled here — see player.js, which only requests a track
// once a specific song is open AND a vocal has been picked.

import { MASTER_URLS } from "../urls.js";

const CACHE_PREFIX = "sekaiLib:v1:";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchWithSessionCache(name, url) {
  const key = CACHE_PREFIX + name;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch (_) {
    /* sessionStorage unavailable or corrupt entry - fall through to network */
  }
  const data = await fetchJson(url);
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (_) {
    /* quota exceeded - fine, we just won't cache this particular file */
  }
  return data;
}

let masterPromise = null;

/**
 * Fetch (or reuse a cached copy of) every master data file in parallel.
 * Safe to call from both index.html and song.html; the in-flight promise is
 * memoized per page load and the resolved JSON is memoized across page loads
 * via sessionStorage.
 * @param {{onProgress?: (done:number, total:number, name:string) => void}} [opts]
 */
export function loadMasterData(opts = {}) {
  if (masterPromise) return masterPromise;
  const entries = Object.entries(MASTER_URLS);
  let done = 0;
  masterPromise = Promise.all(
    entries.map(async ([name, url]) => {
      const data = await fetchWithSessionCache(name, url);
      done += 1;
      opts.onProgress?.(done, entries.length, name);
      return [name, data];
    })
  )
    .then((pairs) => Object.fromEntries(pairs))
    .catch((err) => {
      masterPromise = null; // allow retry on next call
      throw err;
    });
  return masterPromise;
}
