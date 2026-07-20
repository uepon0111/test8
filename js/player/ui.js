// player/ui.js
// Binds a player/engine.js instance to the transport DOM (inline hero block +
// the small docked bar that keeps playback reachable while scrolling).

import { svgIcon } from "../icons.js";
import { formatDuration, clamp } from "../utils.js";

/**
 * @param {ReturnType<typeof import('./engine.js').createPlayer>} player
 * @param {Record<string, HTMLElement>} els
 */
export function bindPlayerUI(player, els) {
  function paintPlayIcon(target, state, size) {
    if (state.hasError) {
      target.innerHTML = svgIcon("close", { size });
      return;
    }
    target.innerHTML = state.isPlaying ? svgIcon("pause", { size }) : svgIcon("play", { size });
    target.classList.toggle("is-loading", state.isLoading && !state.isPlaying);
  }

  function render(state) {
    paintPlayIcon(els.playBtn, state, 26);
    els.playBtn.disabled = !state.isLoaded;

    const pct = state.duration ? clamp((state.currentTime / state.duration) * 100, 0, 100) : 0;
    els.seekFill.style.width = `${pct}%`;
    els.seekThumb.style.left = `${pct}%`;
    els.currentTimeEl.textContent = formatDuration(state.currentTime);
    els.durationEl.textContent = state.isLoaded ? formatDuration(state.duration) : "0:00";
    els.back5Btn.disabled = !state.isLoaded;
    els.fwd5Btn.disabled = !state.isLoaded;

    if (els.errorHint) {
      els.errorHint.style.display = state.hasError ? "block" : "none";
    }
    if (els.playerHint) {
      els.playerHint.style.display = state.isLoaded ? "none" : "flex";
    }

    if (els.miniPlayer) {
      els.miniPlayer.classList.toggle("is-visible", state.isLoaded);
      if (state.isLoaded) {
        paintPlayIcon(els.miniPlayBtn, state, 17);
        els.miniSeekFill.style.width = `${pct}%`;
        els.miniThumb?.classList.toggle("is-playing", state.isPlaying);
      }
    }
  }

  els.playBtn.addEventListener("click", () => player.togglePlay());
  els.back5Btn.addEventListener("click", () => player.seekBy(-5));
  els.fwd5Btn.addEventListener("click", () => player.seekBy(5));
  els.miniPlayBtn?.addEventListener("click", () => player.togglePlay());

  function ratioFromEvent(e) {
    const rect = els.seekTrackWrap.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  }

  let dragging = false;
  els.seekTrackWrap.addEventListener("pointerdown", (e) => {
    if (els.playBtn.disabled) return;
    dragging = true;
    els.seekTrackWrap.setPointerCapture(e.pointerId);
    const state = player.getState();
    player.seekTo(ratioFromEvent(e) * (state.duration || 0));
  });
  els.seekTrackWrap.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const state = player.getState();
    player.seekTo(ratioFromEvent(e) * (state.duration || 0));
  });
  const stopDrag = () => {
    dragging = false;
  };
  els.seekTrackWrap.addEventListener("pointerup", stopDrag);
  els.seekTrackWrap.addEventListener("pointercancel", stopDrag);

  player.subscribe(render);
}
