// player/engine.js
// A tiny wrapper around a single <audio> element. Nothing here ever calls
// .play() on its own — the caller (player/ui.js, driven by a button click)
// always initiates playback. `load()` is the only thing that touches the
// network (and only for the vocal actually selected), via preload="metadata".

import { audioUrl } from "../urls.js";
import { clamp } from "../utils.js";
import { getSkipSilence, SILENCE_SKIP_SECONDS } from "../settings.js";

export function createPlayer() {
  const audio = new Audio();
  audio.preload = "none";

  let current = null; // { assetbundleName, title, artistLabel, artworkUrl }
  let skipHandled = false;
  const listeners = new Set();

  function getState() {
    return {
      isLoaded: !!current,
      isPlaying: !audio.paused && !audio.ended && !!current,
      isLoading: !!current && audio.networkState === 2 && audio.readyState < 3,
      hasError: !!audio.error,
      currentTime: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      track: current,
    };
  }

  function emit() {
    const state = getState();
    listeners.forEach((fn) => fn(state));
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getState());
    return () => listeners.delete(fn);
  }

  /** @param {{assetbundleName:string, title:string, artistLabel?:string, artworkUrl?:string}} vocal */
  function load(vocal) {
    current = vocal;
    skipHandled = false;
    audio.pause();
    audio.currentTime = 0;
    audio.src = audioUrl(vocal.assetbundleName);
    audio.preload = "metadata";
    audio.load();
    setupMediaSession(vocal);
    emit();
  }

  function applySkipSilenceIfNeeded() {
    if (skipHandled) return;
    skipHandled = true;
    if (getSkipSilence() && audio.currentTime < 1) {
      audio.currentTime = SILENCE_SKIP_SECONDS;
    }
  }

  async function play() {
    if (!current) return;
    applySkipSilenceIfNeeded();
    try {
      await audio.play();
    } catch (err) {
      console.warn("[player] play() rejected:", err?.message || err);
      emit();
    }
  }

  function pause() {
    audio.pause();
  }

  function togglePlay() {
    if (audio.paused) play();
    else pause();
  }

  function seekBy(deltaSeconds) {
    if (!current) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = clamp(audio.currentTime + deltaSeconds, 0, dur);
    skipHandled = true; // manual seek overrides the auto skip-silence jump
    emit();
  }

  function seekTo(seconds) {
    if (!current) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = clamp(seconds, 0, dur);
    skipHandled = true;
    emit();
  }

  function setupMediaSession(vocal) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: vocal.title || "",
        artist: vocal.artistLabel || "",
        album: "Project SEKAI Music Library",
        artwork: vocal.artworkUrl
          ? [
              { src: vocal.artworkUrl, sizes: "256x256", type: "image/png" },
              { src: vocal.artworkUrl, sizes: "512x512", type: "image/png" },
            ]
          : [],
      });
      navigator.mediaSession.setActionHandler("play", () => play());
      navigator.mediaSession.setActionHandler("pause", () => pause());
      navigator.mediaSession.setActionHandler("seekbackward", (d) => seekBy(-(d?.seekOffset || 5)));
      navigator.mediaSession.setActionHandler("seekforward", (d) => seekBy(d?.seekOffset || 5));
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d?.seekTime != null) seekTo(d.seekTime);
      });
    } catch (_) {
      /* MediaMetadata unsupported in this browser - background lock-screen UI just won't show */
    }
  }

  audio.addEventListener("play", () => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    emit();
  });
  audio.addEventListener("pause", () => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    emit();
  });
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    skipHandled = false; // replaying from the top should re-apply the intro skip
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    emit();
  });
  ["timeupdate", "loadedmetadata", "waiting", "canplay", "playing", "error", "durationchange"].forEach((evt) =>
    audio.addEventListener(evt, emit)
  );

  return { load, play, pause, togglePlay, seekBy, seekTo, getState, subscribe };
}
