import { $, generateId } from './utils.js';
import { state } from './state.js';
import { save, remove } from './storage.js';
import { renderPlaylists } from './player.js';

let cols = 4;

export const initEditor = () => {
  $('btn-edit-tracks').onclick = () => switchEditorTab('edit-tracks-sec', 'btn-edit-tracks');
  $('btn-edit-tags').onclick = () => switchEditorTab('edit-tags-sec', 'btn-edit-tags');
  $('btn-edit-artists').onclick = () => switchEditorTab('edit-artists-sec', 'btn-edit-artists');

  $('btn-columns-editor').onclick = () => {
    cols = cols === 4 ? 6 : (cols === 2 ? 3 : (document.body.classList.contains('portrait-mode') ? 3 : 6));
    $('edit-track-list').className = `grid-list grid-cols-${cols} virtual-scroll-container`;
  };

  $('btn-create-tag').onclick = showTagModal;
  $('btn-create-artist').onclick = showArtistModal;

  // 簡易的にDOM再描画で仮想スクロールの代用 (Grid用)
  renderEditorTracks();
  renderTags();
  renderArtists();
};

const switchEditorTab = (secId, btnId) => {
  document.querySelectorAll('.editor-sub-sec').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.editor-header button').forEach(el => el.classList.remove('active'));
  $(secId).classList.remove('hidden');
  $(btnId).classList.add('active');
};

const renderEditorTracks = () => {
  const c = $('edit-track-list').querySelector('.vs-content') || $('edit-track-list');
  c.innerHTML = '';
  state.tracks.forEach(t => {
    const d = document.createElement('div');
    d.className = 'grid-item';
    d.innerHTML = `
      <img src="${t.thumbnail}" alt="thumb">
      <div style="font-size:12px; font-weight:bold">${t.title}</div>
      <div style="font-size:10px">${t.artistName}</div>
    `;
    d.onclick = () => showTrackEditModal(t);
    c.appendChild(d);
  });
};

const showTrackEditModal = (track) => {
  const m = $('modal-overlay');
  $('modal-content').innerHTML = `
    <h3>曲情報編集</h3>
    <label>タイトル: <input type="text" id="et-title" value="${track.title}" style="width:100%"></label><br><br>
    <label>アーティスト名: <input type="text" id="et-artist" value="${track.artistName}" style="width:100%"></label><br><br>
    <label>投稿日: <input type="text" id="et-date" value="${track.date || ''}" style="width:100%"></label><br><br>
    <button id="et-save">保存</button>
    <button onclick="document.getElementById('modal-overlay').classList.add('hidden')">キャンセル</button>
  `;
  m.classList.remove('hidden');
  $('et-save').onclick = async () => {
    track.title = $('et-title').value;
    track.artistName = $('et-artist').value;
    track.date = $('et-date').value;
    await save('tracks', track);
    m.classList.add('hidden');
    renderEditorTracks();
    // emit trigger to update player view if needed
  };
};

const renderTags = () => {
  const c = $('tag-list');
  c.innerHTML = '';
  state.tags.forEach(tag => {
    const d = document.createElement('div');
    d.className = 'list-row';
    d.innerHTML = `
      <div class="color-dot" style="background:${tag.color}"></div>
      <div style="flex:1">${tag.name}</div>
      <button class="danger-btn" onclick="window.deleteTag('${tag.id}')"><i data-lucide="trash"></i></button>
    `;
    c.appendChild(d);
  });
  if(window.lucide) window.lucide.createIcons();
};

const showTagModal = () => {
  const m = $('modal-overlay');
  $('modal-content').innerHTML = `
    <h3>タグ作成</h3>
    <label>名前: <input type="text" id="nt-name"></label><br><br>
    <label>色: <input type="color" id="nt-color" value="#007bff"></label><br><br>
    <button id="nt-save">保存</button>
    <button onclick="document.getElementById('modal-overlay').classList.add('hidden')">キャンセル</button>
  `;
  m.classList.remove('hidden');
  $('nt-save').onclick = async () => {
    const tag = { id: generateId(), name: $('nt-name').value, color: $('nt-color').value, order: state.tags.length };
    await save('tags', tag);
    state.tags.push(tag);
    m.classList.add('hidden');
    renderTags();
  };
};

window.deleteTag = async (id) => {
  await remove('tags', id);
  state.tags = state.tags.filter(t => t.id !== id);
  renderTags();
};

const renderArtists = () => {
  const c = $('artist-list');
  c.innerHTML = '';
  state.artists.forEach(a => {
    const d = document.createElement('div');
    d.className = 'list-row';
    d.innerHTML = `
      <img src="${a.icon}" style="width:30px;height:30px;border-radius:50%">
      <div style="flex:1">${a.name}</div>
    `;
    c.appendChild(d);
  });
};

const showArtistModal = () => {
  // 簡略化
  const name = prompt("アーティスト名");
  if(name) {
    const a = { id: generateId(), name, icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23ccc"/></svg>' };
    save('artists', a).then(() => { state.artists.push(a); renderArtists(); });
  }
};

