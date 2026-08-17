import { $, formatTime, generateId, escapeHtml } from './utils.js';
import { state, emit } from './state.js';
import { save, remove } from './storage.js';
import { extractMetadata } from './metadata.js';
import { playTrack, togglePlay, setSpeed, audioEl, getCurrentPlaylistTracks } from './audio.js';
import { VirtualScroll } from './virtual-scroll.js';

let vsPlayer;
let currentSort = 'manual';
let currentOrder = 'asc';
let randomOrder = [];

export const initPlayer = () => {
  vsPlayer = new VirtualScroll('track-list', renderTrackItem, 60);

  $('btn-add-file').addEventListener('click', showAddFileModal);
  $('btn-create-playlist').addEventListener('click', createPlaylist);
  $('btn-sort-order-player').addEventListener('click', toggleSortOrder);
  $('select-sort-player').addEventListener('change', e => {
    currentSort = e.target.value; renderPlaylistTracks();
  });
  $('search-bar-player').addEventListener('input', renderPlaylistTracks);

  // コントロール
  $('pw-btn-play').addEventListener('click', togglePlay);
  $('mp-btn-play').addEventListener('click', togglePlay);
  $('pw-btn-next').addEventListener('click', playNext);
  $('mp-btn-next').addEventListener('click', playNext);
  $('pw-btn-prev').addEventListener('click', playPrev);
  $('mp-btn-prev').addEventListener('click', playPrev);
  $('pw-btn-random').addEventListener('click', toggleRandom);
  $('pw-btn-loop').addEventListener('click', toggleLoop);
  $('pw-speed').addEventListener('change', e => setSpeed(parseFloat(e.target.value)));
  
  $('pw-seekbar').addEventListener('input', e => {
    audioEl.currentTime = (e.target.value / 100) * audioEl.duration;
  });

  // 簡易ウィジェット押下で拡大
  $('mini-player-widget').addEventListener('click', (e) => {
    if(e.target.closest('button')) return;
    if(document.body.classList.contains('portrait-mode')) {
      $('player-widget').classList.add('expanded');
    }
  });
  $('btn-close-widget').addEventListener('click', () => {
    $('player-widget').classList.remove('expanded');
  });

  // State listeners
  state.listeners['timeupdate'] = [time => {
    $('pw-time-current').textContent = formatTime(time);
    if(audioEl.duration) {
      $('pw-seekbar').value = (time / audioEl.duration) * 100;
      $('pw-time-total').textContent = formatTime(audioEl.duration);
    }
  }];
  state.listeners['playstatechange'] = [() => {
    const icon = state.isPlaying ? 'pause' : 'play';
    $('pw-btn-play').innerHTML = `<i data-lucide="${icon}"></i>`;
    $('mp-btn-play').innerHTML = `<i data-lucide="${icon}"></i>`;
    window.lucide.createIcons();
  }];
  state.listeners['trackended'] = [() => {
    if (state.loopMode) {
      audioEl.currentTime = 0; audioEl.play();
    } else {
      playNext();
    }
  }];

  renderPlaylists();
};

const showAddFileModal = () => {
  const m = $('modal-overlay');
  $('modal-content').innerHTML = `
    <h3>ファイル追加</h3>
    <p>音声ファイルをドラッグ＆ドロップ、または選択</p>
    <input type="file" id="file-input" multiple accept="audio/*" style="margin:20px 0; width:100%">
    <div id="upload-progress"></div>
    <button onclick="document.getElementById('modal-overlay').classList.add('hidden')">閉じる</button>
  `;
  m.classList.remove('hidden');

  const handleFiles = async files => {
    const prog = $('upload-progress');
    let count = 0;
    for(const file of files) {
      count++;
      prog.innerHTML = `読み込み中... ${count}/${files.length}`;
      const meta = await extractMetadata(file);
      
      // Blobにして保存
      const trackId = generateId();
      const track = {
        id: trackId,
        title: meta.title,
        artistIds: [], // 文字列として一旦保存するか、デフォルトアーティストIDを割り当てる（簡略化のため文字列を許容）
        artistName: meta.artist, 
        tagIds: [],
        date: meta.date,
        thumbnail: meta.thumbnail,
        blob: file,
        duration: 0, // 再生時に取得
        addedAt: new Date().toISOString()
      };
      await save('tracks', track);
      state.tracks.push(track);
      
      // 初期リストに追加
      const defPl = state.playlists.find(p => p.id === 'default');
      defPl.trackIds.push(trackId);
      await save('playlists', defPl);
    }
    prog.innerHTML = `完了！`;
    renderPlaylists();
    renderPlaylistTracks();
  };

  $('file-input').addEventListener('change', e => handleFiles(e.target.files));
  
  // D&D
  const mc = $('modal-content');
  mc.ondragover = e => { e.preventDefault(); mc.style.background = '#f0f8ff'; };
  mc.ondragleave = () => mc.style.background = '#fff';
  mc.ondrop = e => { e.preventDefault(); mc.style.background = '#fff'; handleFiles(e.dataTransfer.files); };
};

export const renderPlaylists = () => {
  const c = $('playlist-tabs');
  c.innerHTML = '';
  state.playlists.forEach(pl => {
    const btn = document.createElement('button');
    btn.className = `pl-tab ${pl.id === state.currentPlaylistId ? 'active' : ''}`;
    btn.textContent = pl.name;
    btn.onclick = () => {
      state.currentPlaylistId = pl.id;
      renderPlaylists();
      renderPlaylistTracks();
    };
    c.appendChild(btn);
  });
};

const renderPlaylistTracks = () => {
  let tracks = getCurrentPlaylistTracks();
  
  // 検索
  const q = $('search-bar-player').value.toLowerCase();
  if (q) {
    tracks = tracks.filter(t => t.title.toLowerCase().includes(q) || (t.artistName && t.artistName.toLowerCase().includes(q)));
  }
  
  // ソート
  if (currentSort !== 'manual') {
    tracks.sort((a, b) => {
      let valA = a[currentSort] || '';
      let valB = b[currentSort] || '';
      if(valA < valB) return currentOrder === 'asc' ? -1 : 1;
      if(valA > valB) return currentOrder === 'asc' ? 1 : -1;
      return 0;
    });
  } else if (currentOrder === 'desc') {
    tracks.reverse();
  }

  vsPlayer.setItems(tracks);

  // Sortable (手動順のときのみ有効化)
  if(currentSort === 'manual' && currentOrder === 'asc' && !q) {
    Sortable.create($('track-list').querySelector('.vs-content'), {
      handle: '.drag-handle',
      onEnd: async e => {
        const pl = state.playlists.find(p => p.id === state.currentPlaylistId);
        const item = pl.trackIds.splice(e.oldIndex, 1)[0];
        pl.trackIds.splice(e.newIndex, 0, item);
        await save('playlists', pl);
        renderPlaylistTracks();
      }
    });
  }
};

const renderTrackItem = (track, index) => {
  const div = document.createElement('div');
  div.className = 'track-item';
  
  // タグ表示
  const tagsHtml = track.tagIds.map(tid => {
    const tag = state.tags.find(tg => tg.id === tid);
    return tag ? `<span class="tag-chip" style="background:${tag.color}"></span>` : '';
  }).join('');

  div.innerHTML = `
    <img src="${track.thumbnail}" alt="thumb">
    <div class="track-info" style="cursor:pointer" onclick="window.startPlayback('${track.id}')">
      <div class="track-title">${escapeHtml(track.title)}</div>
      <div class="track-meta">${escapeHtml(track.artistName)} ${tagsHtml}</div>
    </div>
    <div class="track-actions row">
      <button onclick="window.addToPlaylist('${track.id}')" title="リストに追加"><i data-lucide="plus-circle"></i></button>
      <button onclick="window.deleteTrack('${track.id}')" title="削除" class="danger-btn" style="padding:2px"><i data-lucide="trash"></i></button>
      <button class="drag-handle" style="cursor:grab"><i data-lucide="menu"></i></button>
    </div>
  `;
  return div;
};

// グローバル関数化（HTMLのonclickから呼ぶため）
window.startPlayback = (trackId) => {
  const tracks = getCurrentPlaylistTracks();
  let idx = tracks.findIndex(t => t.id === trackId);
  if (state.isRandom) {
    randomOrder = [...Array(tracks.length).keys()].sort(() => Math.random() - 0.5);
    state.currentTrackIndex = randomOrder.indexOf(idx);
  } else {
    state.currentTrackIndex = idx;
  }
  loadCurrentTrack();
};

const loadCurrentTrack = () => {
  const tracks = getCurrentPlaylistTracks();
  if(!tracks.length) return;
  let idx = state.isRandom ? randomOrder[state.currentTrackIndex] : state.currentTrackIndex;
  const track = tracks[idx];
  
  $('pw-title').textContent = track.title;
  $('pw-artist').textContent = track.artistName;
  $('pw-thumbnail').src = track.thumbnail;
  
  $('mp-title').textContent = track.title;
  $('mp-artist').textContent = track.artistName;
  $('mp-thumbnail').src = track.thumbnail;
  
  playTrack(track.blob);
};

const playNext = () => {
  const tracks = getCurrentPlaylistTracks();
  if(!tracks.length) return;
  state.currentTrackIndex++;
  if(state.currentTrackIndex >= tracks.length) state.currentTrackIndex = 0;
  loadCurrentTrack();
};
const playPrev = () => {
  const tracks = getCurrentPlaylistTracks();
  if(!tracks.length) return;
  state.currentTrackIndex--;
  if(state.currentTrackIndex < 0) state.currentTrackIndex = tracks.length - 1;
  loadCurrentTrack();
};

const toggleSortOrder = () => {
  currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
  $('btn-sort-order-player').innerHTML = `<i data-lucide="arrow-${currentOrder === 'asc' ? 'up' : 'down'}"></i>`;
  window.lucide.createIcons();
  renderPlaylistTracks();
};

const createPlaylist = async () => {
  const name = prompt("再生リスト名を入力してください");
  if(name) {
    const pl = { id: generateId(), name, trackIds: [], isDefault: false };
    await save('playlists', pl);
    state.playlists.push(pl);
    renderPlaylists();
  }
};

const toggleRandom = () => {
  state.isRandom = !state.isRandom;
  $('pw-btn-random').classList.toggle('active', state.isRandom);
  if(state.isRandom) {
    const len = getCurrentPlaylistTracks().length;
    randomOrder = [...Array(len).keys()].sort(() => Math.random() - 0.5);
    state.currentTrackIndex = 0; // シャッフル後の先頭から
  }
};
const toggleLoop = () => {
  state.loopMode = !state.loopMode;
  $('pw-btn-loop').classList.toggle('active', state.loopMode);
};

window.addToPlaylist = (trackId) => {
  // 簡略化のためプロンプトで選択させる
  const pls = state.playlists.filter(p => !p.isDefault);
  if(!pls.length) return alert("追加先のリストがありません。作成してください。");
  const plNames = pls.map((p,i) => `${i}:${p.name}`).join("\n");
  const res = prompt(`追加先の番号を入力:\n${plNames}`);
  if(res && pls[res]) {
    pls[res].trackIds.push(trackId);
    save('playlists', pls[res]);
    alert("追加しました");
  }
};

window.deleteTrack = async (trackId) => {
  if(!confirm("本当に削除しますか？(ログも削除されます)")) return;
  await remove('tracks', trackId);
  state.tracks = state.tracks.filter(t => t.id !== trackId);
  // 全リストから除去
  for(let p of state.playlists) {
    p.trackIds = p.trackIds.filter(id => id !== trackId);
    await save('playlists', p);
  }
  // ログから除去
  const logsToDelete = state.logs.filter(l => l.trackId === trackId);
  for(let l of logsToDelete) await remove('logs', l.id);
  state.logs = state.logs.filter(l => l.trackId !== trackId);
  
  renderPlaylistTracks();
};
