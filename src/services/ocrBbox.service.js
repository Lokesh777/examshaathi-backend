const Tesseract = require("tesseract.js");

let workerPromise = null;

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("hin+eng");
  }
  return workerPromise;
};

const terminateWorker = async () => {
  if (workerPromise) {
    try {
      await workerPromise.terminate();
    } catch {
      /* ignore */
    }
    workerPromise = null;
  }
};

/**
 * OCR page image and return word bounding boxes for qNo anchoring.
 */
const ocrPageWithBoxes = async (imageBuffer) => {
  const worker = await getWorker();
  const result = await worker.recognize(imageBuffer);
  const words = (result.data.words || []).map((w) => ({
    text: w.text,
    bbox: w.bbox,
  }));
  return {
    text: result.data.text || "",
    words,
    lines: result.data.lines || [],
  };
};

const parseQNoFromToken = (text) => {
  const t = String(text || "").trim();
  const m = t.match(/^(\d{1,3})[\.\):\-]$/);
  if (m) return parseInt(m[1], 10);
  const m2 = t.match(/^(\d{1,3})$/);
  if (m2 && t.length <= 3) return parseInt(m2[1], 10);
  return null;
};

/** Find question number anchors on a page from OCR word boxes. */
const findQNoAnchors = (words) => {
  const anchors = [];
  for (const w of words) {
    const qNo = parseQNoFromToken(w.text);
    if (!qNo || !w.bbox) continue;
    anchors.push({
      qNo,
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1,
    });
  }
  const byQNo = new Map();
  for (const a of anchors) {
    if (!byQNo.has(a.qNo)) byQNo.set(a.qNo, a);
  }
  return [...byQNo.values()].sort((a, b) => a.y0 - b.y0);
};

/**
 * Compute crop region for one question between qNo anchors.
 */
const regionForQNo = (anchors, qNo, imgWidth, imgHeight) => {
  const sorted = [...anchors].sort((a, b) => a.y0 - b.y0);
  const idx = sorted.findIndex((a) => a.qNo === qNo);
  if (idx === -1) return null;

  const top = Math.max(0, sorted[idx].y0 - 8);
  let bottom = imgHeight;
  if (idx + 1 < sorted.length) {
    bottom = Math.max(top + 40, sorted[idx + 1].y0 - 8);
  }

  const marginX = Math.floor(imgWidth * 0.02);
  return {
    left: marginX,
    top: Math.floor(top),
    width: Math.max(1, imgWidth - marginX * 2),
    height: Math.max(40, Math.floor(bottom - top)),
  };
};

/** Split lower portion of crop into 4 option columns (image options). */
const optionRegionsFromCrop = (cropWidth, cropHeight) => {
  const optionsTop = Math.floor(cropHeight * 0.55);
  const optHeight = Math.max(20, cropHeight - optionsTop);
  const colW = Math.floor(cropWidth / 4);
  const letters = ["A", "B", "C", "D"];
  return letters.map((letter, i) => ({
    letter,
    left: i * colW,
    top: optionsTop,
    width: colW,
    height: optHeight,
  }));
};

module.exports = {
  ocrPageWithBoxes,
  findQNoAnchors,
  regionForQNo,
  optionRegionsFromCrop,
  terminateWorker,
  parseQNoFromToken,
};
