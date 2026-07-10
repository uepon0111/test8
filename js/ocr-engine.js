/**
 * ocr-engine.js
 * ---------------------------------------------------------------------------
 * Tesseract.js を用いた画像解析（OCR）処理。
 * 機種プロファイルの読み取り範囲（比率）に従って画像を切り出し、
 * 曲名・難易度・PERFECT/GREAT/GOOD/BAD/MISS数・最大コンボ数を読み取る。
 *
 * Tesseractワーカーはこのモジュール内でキャッシュ・再利用する。
 * （毎回作成/破棄していた旧実装より、連続解析・再解析が高速になる）
 * ---------------------------------------------------------------------------
 */
const OcrEngine = (() => {
  let worker = null;
  let workerPromise = null;

  async function getWorker() {
    if (worker) return worker;
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker(['jpn', 'eng']).then((w) => { worker = w; return w; });
    }
    return workerPromise;
  }

  async function terminateWorker() {
    const w = worker;
    worker = null;
    workerPromise = null;
    if (w) {
      try { await w.terminate(); } catch (e) { /* noop */ }
    }
  }

  function _clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  function _normalizeRegion(region) {
    return {
      x: _clamp01(region.x),
      y: _clamp01(region.y),
      w: _clamp01(region.w),
      h: _clamp01(region.h),
    };
  }

  // region: {x,y,w,h} 比率(0〜1)。type: 'filter-standard' | 'threshold-diff'
  // scale: OCR用に切り出し画像を拡大する倍率
  async function cropImage(imageElement, region, type = 'filter-standard', scale = 1) {
    const canvas = document.createElement('canvas');
    const w = imageElement.naturalWidth;
    const h = imageElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    const r = _normalizeRegion(region);
    const srcW = Math.max(1, w * r.w);
    const srcH = Math.max(1, h * r.h);

    if (type === 'threshold-diff') {
      const diffScale = Math.max(1, scale || 1.5);
      canvas.width = Math.max(1, Math.round(srcW * diffScale));
      canvas.height = Math.max(1, Math.round(srcH * diffScale));
      ctx.drawImage(imageElement, w * r.x, h * r.y, srcW, srcH, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = (gray > 180) ? 0 : 255;
      }
      ctx.putImageData(imageData, 0, 0);
    } else {
      const stdScale = Math.max(1, scale || 1);
      canvas.width = Math.max(1, Math.round(srcW * stdScale));
      canvas.height = Math.max(1, Math.round(srcH * stdScale));
      ctx.filter = 'grayscale(100%) contrast(150%)';
      ctx.drawImage(imageElement, w * r.x, h * r.y, srcW, srcH, 0, 0, canvas.width, canvas.height);
    }
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function _parseLine(line, regex) {
    if (regex.test(line)) {
      const nums = line.match(/\d+/g);
      if (nums) return parseInt(nums[nums.length - 1], 10);
    }
    return 0;
  }

  function _labelRegexes(labelKey) {
    switch (labelKey) {
      case 'perfect':
        return [/P.?E.?R.?F.?E.?C.?T/i, /P.?E.?R.?F.?E.?C/i];
      case 'great':
        return [/G.?R.?E.?A.?T/i];
      case 'good':
        return [/G.?O.?O.?D/i, /G.?0.?0.?D/i, /G.?O.?0.?D/i, /G.?O.?O.?B/i];
      case 'bad':
        return [/B.?A.?D/i, /B.?4.?D/i];
      case 'miss':
        return [/M.?I.?S.?S/i, /M.?1.?S.?S/i, /M.?I.?5.?S/i];
      default:
        return [];
    }
  }

  function _matchLabel(line, labelKey) {
    return _labelRegexes(labelKey).some((re) => re.test(line));
  }

  async function _recognizeBand(worker, imageElement, bandRegion, lang = 'eng', scale = 2) {
    const blob = await cropImage(imageElement, bandRegion, 'filter-standard', scale);
    const ret = await worker.recognize(blob, { lang });
    return (ret && ret.data && ret.data.text) ? ret.data.text : '';
  }

  async function _extractBreakdownCounts(imgElement, region, worker) {
    const r = _normalizeRegion(region);
    const labels = ['perfect', 'great', 'good', 'bad', 'miss'];
    const bandH = r.h / labels.length;
    const pad = bandH * 0.18;
    const result = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };

    for (let i = 0; i < labels.length; i++) {
      const key = labels[i];
      const y = Math.max(0, r.y + bandH * i - pad);
      const h = Math.min(1 - y, bandH + pad * 2);
      const bandRegion = { x: r.x, y, w: r.w, h };

      // 英字ラベルが主なので eng を優先。見つからない場合だけ jpn で再確認する。
      const attempts = [
        await _recognizeBand(worker, imgElement, bandRegion, 'eng', 2.4),
        await _recognizeBand(worker, imgElement, bandRegion, 'jpn', 2.4),
      ];

      let parsed = 0;
      for (const text of attempts) {
        const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        for (const line of lines) {
          if (_matchLabel(line, key)) {
            const value = _parseLine(line, /\d+/);
            if (value > 0) {
              parsed = value;
              break;
            }
          }
        }
        if (parsed > 0) break;

        // 行全体で拾えない場合は、テキスト全体からラベルと数字の近さをざっくり確認する。
        if (_matchLabel(text, key)) {
          const nums = text.match(/\d+/g);
          if (nums && nums.length > 0) {
            parsed = parseInt(nums[nums.length - 1], 10) || 0;
            if (parsed > 0) break;
          }
        }
      }
      result[key] = parsed;
    }

    return result;
  }

  async function analyze(imgElement, profile) {
    const regions = (profile && profile.regions) || Config.DEFAULT_REGIONS;
    const w = await getWorker();
    try {
      // --- 難易度 ---
      const diffBlob = await cropImage(imgElement, regions.difficulty, 'threshold-diff');
      const diffRet = await w.recognize(diffBlob, { lang: 'eng' });
      const diffText = diffRet.data.text.toUpperCase();
      let diffKey = 'expert';
      if (diffText.match(/A?P{2}E?N?D?/)) diffKey = 'append';
      else if (diffText.includes('MASTER')) diffKey = 'master';
      else if (diffText.includes('EXPERT')) diffKey = 'expert';
      else if (diffText.includes('HARD')) diffKey = 'hard';
      else if (diffText.includes('NORMAL')) diffKey = 'normal';
      else if (diffText.includes('EASY')) diffKey = 'easy';

      // --- 曲名 ---
      const titleBlob = await cropImage(imgElement, regions.title, 'filter-standard', 1.1);
      const titleRet = await w.recognize(titleBlob, { lang: 'jpn' });
      const matchedMusic = MusicDB.findBestMatchMusic(titleRet.data.text);
      const finalTitle = matchedMusic ? matchedMusic.title : titleRet.data.text.replace(/\r?\n/g, '').trim();
      const musicId = matchedMusic ? matchedMusic.id : null;

      // --- レベル ---
      let level = '';
      if (musicId != null) level = MusicDB.getLevelFromDb(musicId, diffKey) || '';

      // --- 判定内訳（PERFECT / GREAT / GOOD / BAD / MISS） ---
      const breakdown = await _extractBreakdownCounts(imgElement, regions.breakdown, w);

      // --- 最大コンボ数 ---
      const comboBlob = await cropImage(imgElement, regions.combo, 'filter-standard', 1.15);
      const comboRet = await w.recognize(comboBlob, { lang: 'eng' });
      const comboNums = comboRet.data.text.match(/\d+/g);
      const combo = comboNums && comboNums.length > 0 ? parseInt(comboNums[comboNums.length - 1], 10) : 0;

      return {
        title: finalTitle, level, diffKey, musicId,
        perfect: breakdown.perfect, great: breakdown.great, good: breakdown.good, bad: breakdown.bad, miss: breakdown.miss,
        missCount: breakdown.good + breakdown.bad + breakdown.miss,
        combo,
      };
    } catch (e) {
      console.error('OCR analyze error', e);
      return null;
    }
  }

  return { getWorker, terminateWorker, cropImage, analyze };
})();
