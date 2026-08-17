import { state, emit } from './state.js';
import { save } from './storage.js';

export const audioEl = document.getElementById('core-audio');
export const sampleAudioEl = document.getElementById('sample-audio');
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const sourceNode = audioCtx.createMediaElementSource(audioEl);
const sampleSourceNode = audioCtx.createMediaElementSource(sampleAudioEl);

export const filters = [];
const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

freqs.forEach(freq => {
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'peaking';
  filter.frequency.value = freq;
  filter.Q.value = 1;
  filter.gain.value = 0;
  filters.push(filter);
});

// 直列接続
sourceNode.connect(filters[0]);
sampleSourceNode.connect(filters[0]);
for (let i = 0; i < filters.length - 1; i++) {
  filters[i].connect(filters[i + 1]);
}
filters[filters.length - 1].connect(audioCtx.destination);

// 再生ログ用変数
let playStartTime = 0;

audioEl.addEventListener('timeupdate', () => emit('timeupdate', audioEl.currentTime));
audioEl.addEventListener('ended', async () => {
  // ログ記録 (半分以上再生されたら記録など。ここでは終了時記録とする)
  if (state.currentTrackIndex >= 0) {
    const track = getCurrentPlaylistTracks()[state.currentTrackIndex];
    const log = { trackId: track.id, date: new Date().toISOString().split('T')[0], duration: audioEl.currentTime };
    await save('logs', log);
    state.logs.push(log);
  }
  emit('trackended');
});

export const playTrack = async (blob) => {
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  audioEl.src = URL.createObjectURL(blob);
  audioEl.play();
  state.isPlaying = true;
  emit('playstatechange');
};
export const togglePlay = () => {
  if (state.isPlaying) audioEl.pause();
  else audioEl.play();
  state.isPlaying = !state.isPlaying;
  emit('playstatechange');
};
export const setSpeed = speed => audioEl.playbackRate = speed;

export const getCurrentPlaylistTracks = () => {
  const pl = state.playlists.find(p => p.id === state.currentPlaylistId);
  return pl.trackIds.map(id => state.tracks.find(t => t.id === id)).filter(Boolean);
};

