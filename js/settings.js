import { $ } from './utils.js';
import { clearAll } from './storage.js';

export const initSettings = async () => {
  $('btn-clear-cache').onclick = async () => {
    if(confirm("本当にすべてのデータを削除しますか？\n（ IndexedDB のデータが全て消去され、アプリが再起動します）")) {
      await clearAll();
      location.reload();
    }
  };

  // ストレージ使用量
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const usageMB = (est.usage / (1024*1024)).toFixed(2);
    const quotaMB = (est.quota / (1024*1024)).toFixed(2);
    const percent = (est.usage / est.quota) * 100;
    
    $('storage-usage').textContent = `使用量: ${usageMB} MB / ${quotaMB} MB`;
    $('storage-progress').style.width = `${percent}%`;
    
    if (percent > 80) {
      $('storage-warning').classList.remove('hidden');
      $('storage-progress').style.background = 'var(--danger-color)';
    }
  } else {
    $('storage-usage').textContent = "お使いのブラウザでは容量取得がサポートされていません";
  }
};

