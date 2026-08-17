import { getAll, save, generateId } from './storage.js';

export const state = {
  tracks: [], playlists: [], tags: [], artists: [], logs: [],
  currentPlaylistId: 'default',
  currentTrackIndex: -1,
  isPlaying: false, isRandom: false, loopMode: false,
  selectedTracks: new Set(),
  listeners: {}
};

export const on = (event, cb) => {
  if (!state.listeners[event]) state.listeners[event] = [];
  state.listeners[event].push(cb);
};
export const emit = (event, data) => {
  if (state.listeners[event]) state.listeners[event].forEach(cb => cb(data));
};

export const loadData = async () => {
  state.tracks = await getAll('tracks');
  state.playlists = await getAll('playlists');
  if (!state.playlists.find(p => p.id === 'default')) {
    const def = { id: 'default', name: 'すべての曲', trackIds: state.tracks.map(t=>t.id), isDefault: true };
    await save('playlists', def);
    state.playlists.push(def);
  } else {
    // 同期
    const def = state.playlists.find(p => p.id === 'default');
    def.trackIds = state.tracks.map(t=>t.id);
    await save('playlists', def);
  }
  state.tags = await getAll('tags');
  state.artists = await getAll('artists');
  state.logs = await getAll('logs');
};

