// ===================================================================
// ocr-analysis.js
// Turns a loaded result-screenshot <img> into structured data using
// Tesseract.js, reading whichever crop regions the active device
// profile defines (see device-profiles.js).
//
// Extended from the original to also read PERFECT / GREAT (by widening
// the existing breakdown region's parsing, as requested) and COMBO (a
// brand new region), and to recognize EASY / NORMAL difficulty badges.
// ===================================================================

async function createOcrWorker() {
  return await Tesseract.createWorker(['jpn', 'eng']);
}

// Crops `region` (ratio rectangle {x,y,w,h}, 0..1) out of `imageElement`
// and returns a PNG blob, pre-processed for OCR legibility.
// type 'threshold-diff' -> binarized black/white (used for the colourful
//   difficulty pill where plain grayscale contrast isn't reliable).
// type 'filter-standard' -> grayscale + contrast boost (used elsewhere).
async function cropImage(imageElement, region, type = 'filter-standard') {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth;
  const h = imageElement.naturalHeight;
  const ctx = canvas.getContext('2d');
  const xRatio = region.x, yRatio = region.y, wRatio = region.w, hRatio = region.h;

  if (type === 'threshold-diff') {
    const scale = 1.5;
    canvas.width = w * wRatio * scale;
    canvas.height = h * hRatio * scale;
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = (gray > 180) ? 0 : 255;
    }
    ctx.putImageData(imageData, 0, 0);
  } else {
    canvas.width = w * wRatio;
    canvas.height = h * hRatio;
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(imageElement, w * xRatio, h * yRatio, w * wRatio, h * hRatio, 0, 0, canvas.width, canvas.height);
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// Extracts a single "biggest digit run" number out of free-form OCR text.
// Used for the combo region, which is just a label + a number.
function extractLargestNumber(text) {
  const nums = text.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const best = nums.reduce((a, b) => (b.length > a.length ? b : a));
  return parseInt(best, 10);
}

// `profile` is a device profile (see device-profiles.js); its `.regions`
// supplies the four crop rectangles. Falls back to DEFAULT_REGIONS if
// no profile is given.
async function analyzeLoadedImage(imgElement, worker, profile) {
  try {
    const regions = (profile && profile.regions) ? profile.regions : DEFAULT_REGIONS;

    // --- Difficulty badge ---
    const diffBlob = await cropImage(imgElement, regions.difficulty, 'threshold-diff');
    const diffRet = await worker.recognize(diffBlob, { lang: 'eng' });
    const diffText = diffRet.data.text.toUpperCase();
    let dCode = "E", dKey = "expert"; // preserved fallback from the original tool
    if (diffText.match(/A?P{2}E?N?D?/)) { dCode = "A"; dKey = "append"; }
    else if (diffText.includes("MASTER")) { dCode = "M"; dKey = "master"; }
    else if (diffText.includes("EXPERT")) { dCode = "E"; dKey = "expert"; }
    else if (diffText.includes("HARD")) { dCode = "H"; dKey = "hard"; }
    else if (diffText.includes("NORMAL")) { dCode = "N"; dKey = "normal"; }
    else if (diffText.includes("EASY")) { dCode = "EZ"; dKey = "easy"; }

    // --- Title ---
    const titleBlob = await cropImage(imgElement, regions.title, 'filter-standard');
    const titleRet = await worker.recognize(titleBlob, { lang: 'jpn' });
    const matchedMusic = findBestMatchMusic(titleRet.data.text);
    const finalTitle = matchedMusic ? matchedMusic.title : titleRet.data.text.replace(/\r?\n/g, '').trim();
    const musicId = matchedMusic ? matchedMusic.id : null;

    // --- Level (looked up, not OCR'd directly) ---
    let level = "";
    if (musicId) level = getLevelFromDb(musicId, dKey) || "";

    // --- Breakdown: PERFECT / GREAT / GOOD / BAD / MISS ---
    // Same region the original tool used for GOOD/BAD/MISS; PERFECT and
    // GREAT sit just above those lines so widening the parsing (not a new
    // region) is enough, per the request.
    const breakdownBlob = await cropImage(imgElement, regions.breakdown, 'filter-standard');
    const breakdownRet = await worker.recognize(breakdownBlob, { lang: 'jpn' });
    const lines = breakdownRet.data.text.split('\n');
    let cPerfect = 0, cGreat = 0, cGood = 0, cBad = 0, cMiss = 0;
    const parseLine = (line, regex) => { if (regex.test(line)) { const nums = line.match(/\d+/g); if (nums) return parseInt(nums[nums.length - 1], 10); } return 0; };
    lines.forEach(line => {
      if (/PERFECT/i.test(line)) cPerfect = parseLine(line, /PERFECT/i);
      if (/GREAT/i.test(line)) cGreat = parseLine(line, /GREAT/i);
      if (/G[O0QD]{2}D/i.test(line)) cGood = parseLine(line, /G[O0QD]{2}D/i);
      if (/BAD/i.test(line)) cBad = parseLine(line, /BAD/i);
      if (/MISS/i.test(line)) cMiss = parseLine(line, /MISS/i);
    });

    // --- Combo (new, separate region) ---
    let combo = null;
    try {
      const comboBlob = await cropImage(imgElement, regions.combo, 'filter-standard');
      const comboRet = await worker.recognize(comboBlob, { lang: 'eng' });
      combo = extractLargestNumber(comboRet.data.text);
    } catch (e) {
      console.error('コンボ数の読み取りに失敗しました', e);
    }

    return {
      title: finalTitle,
      level: level,
      diff: dCode,
      miss: cGood + cBad + cMiss,
      breakdown: { perfect: cPerfect, great: cGreat, good: cGood, bad: cBad, miss: cMiss },
      combo: combo,
      musicId: musicId,
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}
