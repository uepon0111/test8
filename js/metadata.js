import { getDefaultThumbnail } from './utils.js';

export const extractMetadata = file => new Promise(resolve => {
  jsmediatags.read(file, {
    onSuccess: tag => {
      const tags = tag.tags;
      let thumbnail = getDefaultThumbnail();
      if (tags.picture) {
        let base64String = "";
        for (let i = 0; i < tags.picture.data.length; i++) {
          base64String += String.fromCharCode(tags.picture.data[i]);
        }
        thumbnail = `data:${tags.picture.format};base64,${window.btoa(base64String)}`;
      }
      resolve({
        title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
        artist: tags.artist || '不明のアーティスト',
        date: tags.year || '',
        thumbnail
      });
    },
    onError: () => {
      resolve({
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: '不明のアーティスト',
        date: '',
        thumbnail: getDefaultThumbnail()
      });
    }
  });
});
