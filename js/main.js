// ===================================================================
// main.js
// Single startup entry point. Kept last in load order and as the only
// place that hooks `window`'s load event, so every module's init logic
// runs exactly once, in a predictable order.
// ===================================================================

async function initApp() {
  initDeviceProfiles();
  restoreBestOnlyToggleState();
  renderSortDirectionButton();

  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'flex';
  const loaderText = document.getElementById('loader-text');
  if (loaderText) loaderText.innerText = "楽曲マスタデータを取得中...";

  await fetchMusicDb();

  if (loader) loader.style.display = 'none';
}

window.addEventListener('load', initApp);
