// state.js
// ------------------------------------------------------------------
// アプリ全体で共有する状態を1つのオブジェクトにまとめたもの。
// 各モジュールはこの `state` オブジェクトの「プロパティ」を読み書きする
// (state 自体を再代入することはしない。ESモジュールの import は
//  再代入不可のライブバインディングのため、プロパティ変更のみが安全)。
// ------------------------------------------------------------------

export const state = {
  // --- 認証 ---
  tokenClient: null,
  gapiInited: false,
  gisInited: false,
  isSignedIn: false,

  // --- リザルトデータ ---
  allRecords: [],       // Drive から取得した全レコード
  filteredRecords: [],  // フィルタ・ソート後に表示中のレコード

  // --- 選択モード ---
  isSelectMode: false,
  selectedIds: new Set(),

  // --- 楽曲マスターDB ---
  dbMusics: [],
  dbDiffs: [],
  dbLoaded: false,

  // --- アップロード/編集モーダルの一時キュー ---
  editorQueue: [],       // { id, file, imgUrl, status, data:{}, originalId, originalParent, profileId, naturalW, naturalH, legacy }
  activeItemId: null,
  currentMode: 'upload', // 'upload' | 'edit'

  // --- 機種プロファイル (読み取り範囲設定) ---
  deviceProfiles: [],    // localStorageから読み込み

  // --- 並び替え/絞り込み ---
  sortMode: 'level',     // 'name' | 'level' | 'miss' | 'date'
  sortDirections: { name: 'asc', level: 'desc', miss: 'asc', date: 'desc' },
  showBestOnly: false,

  // --- 直前の自己ベスト比較用スナップショット ---
  // (アップロード/編集の実行直前の allRecords を退避しておき、実行後との差分から
  //  「自己ベスト更新」を検出するために使用する)
  preExecutionSnapshot: null,
};
