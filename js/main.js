import { loadData } from './state.js';
import { initDB } from './storage.js';
import { initPlayer } from './player.js';
import { initEditor } from './editor.js';
import { initLog } from './log.js';
import { initSettings } from './settings.js';
import { initEqualizer } from './equalizer.js';

document.addEventListener('DOMContentLoaded', async () => {
  // レイアウト（縦横）の初期判定
  const checkOrientation = () => {
    if (window.innerHeight > window.innerWidth) {
      document.body.classList.add('portrait-mode');
      document.body.classList.remove('landscape-mode');
    } else {
      document.body.classList.add('landscape-mode');
      document.body.classList.remove('portrait-mode');
    }
  };
  window.addEventListener('resize', checkOrientation);
  checkOrientation();

  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
      
      // ログ画面表示時にグラフ再描画
      if(btn.dataset.target === 'log-view') {
        import('./log.js').then(m => m.renderLogs());
      }
    });
  });

  // 初期化プロセス
  try {
    await initDB();
    await loadData();
    
    initEqualizer();
    initPlayer();
    initEditor();
    initLog();
    initSettings();

    lucide.createIcons();
  } catch (e) {
    console.error("初期化エラー:", e);
    alert("データの読み込みに失敗しました。シークレットモード等の制限を確認してください。");
  }
});

