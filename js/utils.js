export const $ = id => document.getElementById(id);
export const formatTime = sec => {
  if (isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
export const getDefaultThumbnail = () => "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23eee'/><circle cx='50' cy='50' r='20' fill='%23ccc'/></svg>";
export const escapeHtml = str => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

