// drive-api.js
// ------------------------------------------------------------------
// Google Drive REST API の低レベル呼び出しをまとめたモジュール。
// ここには「効率化」のためのフォルダ構造や保存フォーマットの知識は持たせず、
// 純粋な Drive API のラッパーとしてのみ機能させる (上位の意思決定は drive-service.js が担う)。
// ------------------------------------------------------------------

export function getAccessToken() {
  return gapi.client.getToken().access_token;
}

// クエリに一致する全アイテムをページネーション込みで取得
export async function fetchAllDriveItems(query, fields) {
  let items = [];
  let pageToken = null;
  do {
    const response = await gapi.client.drive.files.list({
      q: query, fields: `nextPageToken, files(${fields})`, pageSize: 1000, pageToken: pageToken
    });
    if (response.result.files) items = items.concat(response.result.files);
    pageToken = response.result.nextPageToken;
  } while (pageToken);
  return items;
}

export async function getFolderByName(name, parentId = null) {
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${name}' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const response = await gapi.client.drive.files.list({ q: query, fields: 'files(id, name)', pageSize: 1 });
  return (response.result.files && response.result.files.length > 0) ? response.result.files[0] : null;
}

export async function findOrCreateFolder(name, parentId = null) {
  const existing = await getFolderByName(name, parentId);
  if (existing) return existing;
  const metadata = { 'name': name, 'mimeType': 'application/vnd.google-apps.folder' };
  if (parentId) metadata.parents = [parentId];
  const response = await gapi.client.drive.files.create({ resource: metadata, fields: 'id, name' });
  return response.result;
}

// 新規ファイルのアップロード (multipart)。metadata には name, parents, properties などを渡せる。
export async function uploadFileMultipart(fileBlob, metadata) {
  const accessToken = getAccessToken();
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileBlob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }), body: form
  });
  if (!res.ok) throw new Error(res.statusText);
  return await res.json();
}

// 既存ファイルのメタデータ更新 (name, properties, addParents, removeParents 等)
export async function updateFileMetadata(fileId, params) {
  const request = Object.assign({ fileId }, params);
  const response = await gapi.client.drive.files.update(request);
  return response.result;
}

export async function deleteFile(fileId) {
  await gapi.client.drive.files.delete({ fileId });
}

// 編集時の再解析用に、サムネイルではなく元ファイルの実体(バイト列)を取得する
export async function downloadFileMedia(fileId) {
  const accessToken = getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
  });
  if (!res.ok) throw new Error(res.statusText);
  return await res.blob();
}
