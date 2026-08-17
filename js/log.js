import { state } from './state.js';
import { $ } from './utils.js';

let chartArtists, chartTags;

export const initLog = () => {
  $('log-period').addEventListener('change', renderLogs);
  renderLogs();
};

export const renderLogs = () => {
  const period = $('log-period').value;
  // 期間フィルタリング (簡略化のため今回は全件処理)
  let logs = state.logs;
  
  // 周年情報の計算
  const today = new Date();
  const todayMMDD = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const anniversaries = state.tracks.filter(t => t.date && t.date.endsWith(todayMMDD));
  
  const ban = $('anniversary-banner');
  if(anniversaries.length > 0) {
    ban.classList.remove('hidden');
    ban.innerHTML = `🎉 今日は <b>${anniversaries[0].title}</b> の投稿記念日です！`;
  } else {
    ban.classList.add('hidden');
  }

  // アーティストごとの再生回数集計
  const artCounts = {};
  logs.forEach(l => {
    const t = state.tracks.find(x => x.id === l.trackId);
    if(t && t.artistName) {
      artCounts[t.artistName] = (artCounts[t.artistName] || 0) + 1;
    }
  });

  const ctxA = $('chart-artists').getContext('2d');
  if(chartArtists) chartArtists.destroy();
  chartArtists = new Chart(ctxA, {
    type: 'pie',
    data: {
      labels: Object.keys(artCounts),
      datasets: [{ data: Object.values(artCounts), backgroundColor: ['#ff6384','#36a2eb','#cc65fe','#ffce56'] }]
    },
    options: { plugins: { title: { display: true, text: 'よく聴くアーティスト' } } }
  });

  // よく聴いた曲ハイライト
  const trackCounts = {};
  logs.forEach(l => trackCounts[l.trackId] = (trackCounts[l.trackId] || 0) + 1);
  const topTracks = Object.entries(trackCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  
  const tl = $('log-top-tracks');
  tl.innerHTML = '';
  topTracks.forEach(([tid, count]) => {
    const t = state.tracks.find(x => x.id === tid);
    if(t) {
      tl.innerHTML += `<div class="list-row"><img src="${t.thumbnail}" style="width:30px;height:30px"> <span style="flex:1">${t.title}</span> <b>${count}回</b></div>`;
    }
  });
};

