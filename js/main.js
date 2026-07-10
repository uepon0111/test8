// main.js
// ------------------------------------------------------------------
// アプリのエントリーポイント。
// 各モジュールを読み込む(それぞれの window.xxx 公開・イベント登録が実行される)ほか、
// 起動時の初期化処理をまとめて行う。
// ------------------------------------------------------------------

import { state } from './state.js';
import { initAuth } from './auth.js';
import { loadMusicDb } from './music-db.js';
import { loadDeviceProfiles } from './device-profiles.js';
import { loadSortPrefs, syncSortUI, updateView } from './sort-filter.js';
import { initDropZone } from './batch-modal.js';
import { updateSelectionUI } from './selection.js';

// 副作用(window.xxx への公開)のためだけに読み込むモジュール
import './modals.js';
import './settings-modal.js';
import './notifications.js';

window.addEventListener('DOMContentLoaded', async () => {
  loadDeviceProfiles();
  loadSortPrefs();
  syncSortUI();
  initAuth();
  initDropZone();
  await loadMusicDb();
});

// ログアウト時にグリッド/選択状態をクリアする (auth.js からのイベント)
document.addEventListener('prsk:signed-out', () => {
  state.filteredRecords = [];
  state.selectedIds.clear();
  state.isSelectMode = false;
  updateSelectionUI();
  updateView();
});
