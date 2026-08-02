const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const legacyHttpsAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

const downloadPdfBuffer = async (url) => {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    httpsAgent: legacyHttpsAgent,
    timeout: 120000,
  });
  return Buffer.from(res.data);
};

const getPdftoppmPath = () => {
  const bin = process.env.POPPLER_BIN_PATH;
  if (!bin) return null;
  const winPath = path.join(bin, "pdftoppm.exe");
  const unixPath = path.join(bin, "pdftoppm");
  if (fs.existsSync(winPath)) return winPath;
  if (fs.existsSync(unixPath)) return unixPath;
  return null;
};

const getPdfinfoPath = () => {
  const bin = process.env.POPPLER_BIN_PATH;
  if (!bin) return null;
  const winPath = path.join(bin, "pdfinfo.exe");
  const unixPath = path.join(bin, "pdfinfo");
  if (fs.existsSync(winPath)) return winPath;
  if (fs.existsSync(unixPath)) return unixPath;
  return null;
};

const getPdfPageCountViaPoppler = (pdfBuffer) => {
  const pdfinfo = getPdfinfoPath();
  if (!pdfinfo) return 0;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfinfo-"));
  const pdfPath = path.join(tempDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);

  try {
    const out = execFileSync(pdfinfo, [pdfPath], { encoding: "utf8" });
    const match = out.match(/Pages:\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
};

const pdfParse = require("pdf-parse");

const getPdfPageCount = async (pdfBuffer) => {
  let count = 0;
  try {
    const data = await pdfParse(pdfBuffer);
    count = data.numpages || 0;
  } catch {
    /* fall through */
  }
  if (count <= 0) {
    count = getPdfPageCountViaPoppler(pdfBuffer);
  }
  return count;
};

/** Convert one PDF page to PNG buffer (1-based page index). Lower memory than all pages at once. */
const pdfBufferToSinglePageBuffer = (pdfBuffer, pageNum1Based, label = "pdf") => {
  const pdftoppm = getPdftoppmPath();
  if (!pdftoppm) {
    throw new Error("POPPLER_BIN_PATH not set or pdftoppm not found");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pdfocr-${label}-`));
  const pdfPath = path.join(tempDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);
  const outputPath = path.join(tempDir, "page");

  const dpi = parseInt(process.env.PDF_RENDER_DPI || "150", 10);
  execFileSync(pdftoppm, [
    "-png",
    "-r",
    String(dpi),
    "-f",
    String(pageNum1Based),
    "-l",
    String(pageNum1Based),
    "-singlefile",
    pdfPath,
    outputPath,
  ]);

  const pngPath = `${outputPath}.png`;
  if (!fs.existsSync(pngPath)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error(`Page ${pageNum1Based} PNG not created`);
  }

  const buf = fs.readFileSync(pngPath);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return buf;
};

const pdfBufferToPageBuffers = (pdfBuffer, label = "pdf") => {
  const pdftoppm = getPdftoppmPath();
  if (!pdftoppm) {
    throw new Error("POPPLER_BIN_PATH not set or pdftoppm not found");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pdfocr-${label}-`));
  const pdfPath = path.join(tempDir, "input.pdf");
  fs.writeFileSync(pdfPath, pdfBuffer);
  const outputPrefix = path.join(tempDir, "page");

  execFileSync(pdftoppm, ["-png", "-r", "200", pdfPath, outputPrefix]);

  const files = fs
    .readdirSync(tempDir)
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || "0", 10);
      const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || "0", 10);
      return numA - numB;
    });

  const buffers = files.map((f) => {
    const buf = fs.readFileSync(path.join(tempDir, f));
    try {
      fs.unlinkSync(path.join(tempDir, f));
    } catch {
      /* ignore */
    }
    return buf;
  });

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return buffers;
};

const CHUNK_SIZE = 9000;
const CHUNK_OVERLAP = 400;

const splitIntoChunks = (text) => {
  if (!text || text.length === 0) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
    if (start <= 0) start = end;
  }
  return chunks;
};

const letterToOptionText = (letter, options) => {
  const idx = { A: 0, B: 1, C: 2, D: 3 }[letter?.toUpperCase()];
  if (idx === undefined) return null;
  return options[idx] || null;
};

/** Crop a PNG buffer region (pixels). */
const cropPngRegion = async (pngBuffer, { left, top, width, height }) => {
  const sharp = require("sharp");
  const meta = await sharp(pngBuffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const safeLeft = Math.max(0, Math.min(left, w - 1));
  const safeTop = Math.max(0, Math.min(top, h - 1));
  const safeWidth = Math.max(1, Math.min(width, w - safeLeft));
  const safeHeight = Math.max(1, Math.min(height, h - safeTop));
  return sharp(pngBuffer)
    .extract({
      left: Math.floor(safeLeft),
      top: Math.floor(safeTop),
      width: Math.floor(safeWidth),
      height: Math.floor(safeHeight),
    })
    .png()
    .toBuffer();
};

const getPngDimensions = async (pngBuffer) => {
  const sharp = require("sharp");
  const meta = await sharp(pngBuffer).metadata();
  return { width: meta.width || 0, height: meta.height || 0 };
};

module.exports = {
  legacyHttpsAgent,
  downloadPdfBuffer,
  getPdfPageCount,
  pdfBufferToSinglePageBuffer,
  pdfBufferToPageBuffers,
  getPdftoppmPath,
  getPdfinfoPath,
  getPdfPageCountViaPoppler,
  splitIntoChunks,
  letterToOptionText,
  cropPngRegion,
  getPngDimensions,
  CHUNK_SIZE,
  CHUNK_OVERLAP,
};
