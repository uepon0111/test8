// auth.js
// ------------------------------------------------------------------
// Google Identity Services (GIS) と gapi client (Google Drive API) の
// 認証まわりを担当するモジュール。
//
// 注意: index.html では gapi/gsi の外部スクリプトを
//   <script async defer src="..." onload="gapiLoaded()">
// の形で読み込んでいる。これらは type="module" ではない通常スクリプトなので
// いつ onload が発火するか(このモジュールの実行より先か後か)は保証されない。
// そのため index.html 側に極小のブートストラップ用インラインスクリプトを置き、
// window.__prskGapiReady / __prskGisReady フラグと 'prsk:gapi-loaded' /
// 'prsk:gis-loaded' イベントで、実行順序に依存しない形にしている。
// ------------------------------------------------------------------

import { state } from './state.js';
import { CLIENT_ID, API_KEY, DISCOVERY_DOC, SCOPES } from './config.js';
import { fetchDataFromDrive } from './drive-service.js';

function whenGapiReady(cb) {
  if (window.__prskGapiReady) cb();
  else document.addEventListener('prsk:gapi-loaded', cb, { once: true });
}
function whenGisReady(cb) {
  if (window.__prskGisReady) cb();
  else document.addEventListener('prsk:gis-loaded', cb, { once: true });
}

async function initializeGapiClient() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: [DISCOVERY_DOC] });
  state.gapiInited = true;
}

export function initAuth() {
  whenGapiReady(() => gapi.load('client', initializeGapiClient));
  whenGisReady(() => {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '',
    });
    state.gisInited = true;
  });
}

export function handleAuthClick() {
  state.tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    state.isSignedIn = true;
    setAuthUI(true);
    await fetchDataFromDrive();
  };
  if (gapi.client.getToken() === null) state.tokenClient.requestAccessToken({ prompt: 'consent' });
  else state.tokenClient.requestAccessToken({ prompt: '' });
}

export function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    state.isSignedIn = false;
    setAuthUI(false);
    document.getElementById('result-count').innerText = 'ログアウトしました';
    document.getElementById('grid').innerHTML = '';
    state.allRecords = [];
    state.selectedIds.clear();
    // selection.js の updateSelectionUI を直接呼びたいが循環importを避けるため
    // カスタムイベントで通知する
    document.dispatchEvent(new Event('prsk:signed-out'));
  }
}

export function setAuthUI(isLoggedIn) {
  document.getElementById('signout_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('upload_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('settings_button').style.display = isLoggedIn ? 'inline-flex' : 'none';
  document.getElementById('authorize_button').style.display = isLoggedIn ? 'none' : 'inline-flex';
  document.getElementById('auth-status').innerText = isLoggedIn ? 'ログイン済み' : '未ログイン';
}

window.handleAuthClick = handleAuthClick;
window.handleSignoutClick = handleSignoutClick;
