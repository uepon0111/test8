// region-editor.js
// ------------------------------------------------------------------
// 読み取り範囲(x, y, w, h の比率)を「画像上でのドラッグ&ドロップ」と
// 「数値入力」の両方から編集できる、双方向同期のウィジェット。
//
// - 4つの領域(タイトル/難易度/判定内訳/コンボ)を同時に表示し、
//   どこに何があるか視覚的に分かるようにする (アクティブなものだけ操作可能)。
// - ドラッグでの移動・右下ハンドルでのリサイズに対応 (Pointer Events使用)。
// - ドラッグで変更すると数値入力にリアルタイムで反映され、
//   数値入力を変更するとドラッグ枠にもリアルタイムで反映される。
// ------------------------------------------------------------------

import { REGION_DEFS } from './config.js';
import { clampRegion } from './utils.js';

function pct(v) { return `${(v * 100).toFixed(2)}%`; }

export function mountRegionEditor(container, opts) {
  const { imageUrl, regions, onChange } = opts;
  let activeKey = opts.activeKey || 'title';
  let naturalWidth = 0, naturalHeight = 0;

  container.innerHTML = `
    <div class="re-canvas-wrap">
      <div class="re-canvas">
        <img class="re-bg-image" src="${imageUrl}" draggable="false" alt="サンプル画像">
        ${REGION_DEFS.map(def => `
          <div class="re-rect" data-key="${def.key}" style="border-color:${def.color};">
            <div class="re-label" style="background:${def.color};">${def.label}</div>
            <div class="re-resize-handle" style="background:${def.color};"></div>
          </div>
        `).join('')}
      </div>
      <div class="re-hint">枠をドラッグで移動、右下の丸でサイズ変更できます</div>
    </div>
    <div class="re-legend">
      ${REGION_DEFS.map(def => `
        <button type="button" class="re-legend-btn" data-key="${def.key}">
          <span class="re-swatch" style="background:${def.color};"></span>${def.label}
        </button>
      `).join('')}
    </div>
    <div class="re-numeric">
      <label>X (%) <input type="number" step="0.1" id="re-num-x"></label>
      <label>Y (%) <input type="number" step="0.1" id="re-num-y"></label>
      <label>幅 (%) <input type="number" step="0.1" id="re-num-w"></label>
      <label>高さ (%) <input type="number" step="0.1" id="re-num-h"></label>
    </div>
  `;

  const canvas = container.querySelector('.re-canvas');
  const img = container.querySelector('.re-bg-image');
  const rectEls = {};
  REGION_DEFS.forEach(def => { rectEls[def.key] = container.querySelector(`.re-rect[data-key="${def.key}"]`); });
  const legendBtns = Array.from(container.querySelectorAll('.re-legend-btn'));
  const numX = container.querySelector('#re-num-x');
  const numY = container.querySelector('#re-num-y');
  const numW = container.querySelector('#re-num-w');
  const numH = container.querySelector('#re-num-h');

  function paintRect(key) {
    const r = regions[key];
    const el = rectEls[key];
    if (!el || !r) return;
    el.style.left = pct(r.x);
    el.style.top = pct(r.y);
    el.style.width = pct(r.w);
    el.style.height = pct(r.h);
  }

  function paintAll() {
    REGION_DEFS.forEach(def => paintRect(def.key));
  }

  function refreshNumericInputs() {
    const r = regions[activeKey];
    if (!r) return;
    numX.value = (r.x * 100).toFixed(2);
    numY.value = (r.y * 100).toFixed(2);
    numW.value = (r.w * 100).toFixed(2);
    numH.value = (r.h * 100).toFixed(2);
  }

  function setActiveVisualState() {
    REGION_DEFS.forEach(def => {
      const isActive = def.key === activeKey;
      rectEls[def.key].classList.toggle('active', isActive);
    });
    legendBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.key === activeKey));
  }

  function emitChange(key) {
    if (onChange) onChange(key, regions[key]);
  }

  function setActiveKey(key) {
    activeKey = key;
    setActiveVisualState();
    refreshNumericInputs();
  }

  // --- 数値入力からの変更 ---
  function onNumericInput() {
    const r = clampRegion({
      x: (parseFloat(numX.value) || 0) / 100,
      y: (parseFloat(numY.value) || 0) / 100,
      w: (parseFloat(numW.value) || 0.1) / 100,
      h: (parseFloat(numH.value) || 0.1) / 100,
    });
    regions[activeKey] = r;
    paintRect(activeKey);
    emitChange(activeKey);
  }
  [numX, numY, numW, numH].forEach(inp => inp.addEventListener('input', onNumericInput));

  // --- 凡例クリックでアクティブ領域切り替え ---
  legendBtns.forEach(btn => btn.addEventListener('click', () => setActiveKey(btn.dataset.key)));

  // --- ドラッグ操作 (移動 & リサイズ) ---
  let dragMode = null; // 'move' | 'resize'
  let dragStart = null; // {px, py, region:{x,y,w,h}}

  function canvasRect() { return canvas.getBoundingClientRect(); }

  function beginDrag(mode, ev, key) {
    if (key !== activeKey) { setActiveKey(key); return; }
    dragMode = mode;
    const cr = canvasRect();
    dragStart = {
      px: (ev.clientX - cr.left) / cr.width,
      py: (ev.clientY - cr.top) / cr.height,
      region: { ...regions[key] },
    };
    if (ev.target.setPointerCapture) { try { ev.target.setPointerCapture(ev.pointerId); } catch (e) {} }
    ev.preventDefault();
    ev.stopPropagation();
  }

  REGION_DEFS.forEach(def => {
    const el = rectEls[def.key];
    el.addEventListener('pointerdown', (ev) => {
      if (ev.target.classList.contains('re-resize-handle')) return; // ハンドル側で処理
      beginDrag('move', ev, def.key);
    });
    const handle = el.querySelector('.re-resize-handle');
    handle.addEventListener('pointerdown', (ev) => beginDrag('resize', ev, def.key));
  });

  window.addEventListener('pointermove', (ev) => {
    if (!dragMode) return;
    const cr = canvasRect();
    const curX = (ev.clientX - cr.left) / cr.width;
    const curY = (ev.clientY - cr.top) / cr.height;
    const dx = curX - dragStart.px;
    const dy = curY - dragStart.py;
    const base = dragStart.region;

    let next;
    if (dragMode === 'move') {
      next = clampRegion({ x: base.x + dx, y: base.y + dy, w: base.w, h: base.h });
    } else {
      next = clampRegion({ x: base.x, y: base.y, w: Math.max(0.01, base.w + dx), h: Math.max(0.01, base.h + dy) });
    }
    regions[activeKey] = next;
    paintRect(activeKey);
    refreshNumericInputs();
    emitChange(activeKey);
  });

  window.addEventListener('pointerup', () => { dragMode = null; dragStart = null; });

  // --- 画像読み込み完了時に自然な解像度を通知 ---
  function handleImgLoad() {
    naturalWidth = img.naturalWidth;
    naturalHeight = img.naturalHeight;
    if (opts.onImageLoaded) opts.onImageLoaded(naturalWidth, naturalHeight);
  }
  if (img.complete && img.naturalWidth > 0) handleImgLoad();
  else img.addEventListener('load', handleImgLoad);

  paintAll();
  setActiveVisualState();
  refreshNumericInputs();

  return {
    setActiveKey,
    getRegions: () => regions,
    setImage(url) { img.src = url; },
    refresh() { paintAll(); refreshNumericInputs(); },
  };
}
