const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");
const {
  pdfBufferToSinglePageBuffer,
  splitIntoChunks,
  getPdftoppmPath,
  getPdfPageCount,
  cropPngRegion,
  getPngDimensions,
} = require("../pdfUtils.service");
const {
  ocrPageWithBoxes,
  findQNoAnchors,
  regionForQNo,
  terminateWorker: terminateBboxWorker,
} = require("../ocrBbox.service");
const { extractMcqFromCropImage } = require("./geminiVision.provider");
const { isImageKitConfigured, uploadPngBuffer } = require("../imageStorage.service");
const {
  buildChunkExtractionPrompt,
  buildAnswerKeyPrompt,
  buildOcrPageTextPrompt,
} = require("./prompts");
const { formatProviderLabel } = require("./providerMeta");

const GROQ_MODEL = process.env.GROQ_VISION_MODEL || "llama-3.3-70b-versatile";

let groqClient = null;

const getGroqClient = () => {
  if (!process.env.GROQ_API_KEY?.trim()) return null;
  if (!groqClient) {
    const GroqSdk = require("groq-sdk");
    const Groq = GroqSdk.default || GroqSdk;
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
};

const parseJsonFromText = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
};

const groqComplete = async (prompt) => {
  const groq = getGroqClient();
  if (!groq) throw new Error("GROQ_API_KEY not configured");
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });
  return completion.choices[0].message.content;
};

let tesseractWorkerPromise = null;

const getTesseractWorker = async () => {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = Tesseract.createWorker("hin+eng");
  }
  return tesseractWorkerPromise;
};

const ocrImageBuffer = async (imageBuffer) => {
  const worker = await getTesseractWorker();
  const result = await worker.recognize(imageBuffer);
  return result.data.text || "";
};

const terminateTesseractWorker = async () => {
  if (tesseractWorkerPromise) {
    try {
      await tesseractWorkerPromise.terminate();
    } catch {
      /* ignore */
    }
    tesseractWorkerPromise = null;
  }
};

const getPagesToProcess = async (pdfBuffer) => {
  let pageCount = 0;
  try {
    pageCount = await getPdfPageCount(pdfBuffer);
  } catch {
    pageCount = 0;
  }
  const maxPages = parseInt(process.env.OFFICIAL_PAPER_MAX_PAGES || "0", 10);
  if (maxPages > 0 && pageCount > 0) return Math.min(pageCount, maxPages);
  return pageCount;
};

/** Embedded text path when PDF is not scanned. */
const extractQuestionsFromEmbeddedText = async (
  examName,
  topicListText,
  pdfBuffer,
  onLog
) => {
  const display = formatProviderLabel("ocr");
  let text = "";
  try {
    text = (await pdfParse(pdfBuffer)).text || "";
  } catch {
    return [];
  }
  if (text.trim().length < 500) return [];

  const chunks = splitIntoChunks(text);
  const allQuestions = [];
  const seenQNos = new Set();

  for (let i = 0; i < chunks.length; i++) {
    try {
      if (onLog) {
        await onLog("groq_chunk", `${display} · chunk ${i + 1}/${chunks.length}`, "info", "ocr");
      }
      const prompt = buildChunkExtractionPrompt(examName, topicListText, chunks[i], true);
      const raw = await groqComplete(prompt);
      const result = parseJsonFromText(raw);
      for (const q of result.questions || []) {
        if (seenQNos.has(q.qNo)) continue;
        seenQNos.add(q.qNo);
        allQuestions.push(q);
      }
    } catch (err) {
      if (onLog) await onLog("groq_chunk", `Chunk ${i + 1} failed: ${err.message}`, "warn", "ocr");
    }
  }
  return allQuestions;
};

/**
 * Image PDF: one page at a time — Poppler → Tesseract → Groq (low memory, full paper safe).
 */
const extractQuestionsFromPdfBuffer = async (
  examName,
  topicListText,
  pdfBuffer,
  onLog
) => {
  const display = formatProviderLabel("ocr");
  const embedded = await extractQuestionsFromEmbeddedText(
    examName,
    topicListText,
    pdfBuffer,
    onLog
  );
  if (embedded.length > 0) {
    await terminateTesseractWorker();
    return embedded;
  }

  const pageCount = await getPdfPageCount(pdfBuffer);
  const pagesToOcr = await getPagesToProcess(pdfBuffer);
  const hasPoppler = Boolean(getPdftoppmPath());

  if (!hasPoppler) {
    await terminateTesseractWorker();
    throw new Error("POPPLER_BIN_PATH required for scanned/image PDFs");
  }
  if (pagesToOcr <= 0) {
    await terminateTesseractWorker();
    throw new Error("Could not determine PDF page count");
  }

  if (onLog) {
    await onLog(
      "ocr_page",
      `${display} · page-by-page OCR ${pagesToOcr}/${pageCount} page(s)`,
      "info",
      "ocr"
    );
  }

  const allQuestions = [];
  const seenQNos = new Set();

  for (let p = 1; p <= pagesToOcr; p++) {
    if (onLog) {
      await onLog(
        "ocr_page",
        `${display} · page ${p}/${pagesToOcr} (${allQuestions.length} questions so far)`,
        "info",
        "ocr"
      );
    }
    try {
      const pageBuf = pdfBufferToSinglePageBuffer(pdfBuffer, p, `ocr-q-${p}`);
      const { text: pageText, words } = await ocrPageWithBoxes(pageBuf);
      const { width, height } = await getPngDimensions(pageBuf);

      if (pageText.trim().length >= 40) {
        if (onLog) await onLog("groq_page", `${display} · structuring page ${p}/${pagesToOcr}`, "info", "ocr");
        const prompt = buildOcrPageTextPrompt(examName, topicListText, pageText);
        const raw = await groqComplete(prompt);
        const result = parseJsonFromText(raw);
        for (const q of result.questions || []) {
          if (seenQNos.has(q.qNo)) continue;
          seenQNos.add(q.qNo);
          allQuestions.push(q);
        }
      }

      const anchors = findQNoAnchors(words);
      const imageFallback = process.env.OFFICIAL_PAPER_IMAGE_FALLBACK || "imagekit";
      for (const anchor of anchors) {
        if (seenQNos.has(anchor.qNo)) continue;
        const region = regionForQNo(anchors, anchor.qNo, width, height);
        if (!region) continue;

        if (onLog) {
          await onLog("image_crop", `${display} · vision crop q${anchor.qNo} page ${p}`, "info", "ocr");
        }

        try {
          const cropBuf = await cropPngRegion(pageBuf, region);
          const vision = await extractMcqFromCropImage(
            examName,
            topicListText,
            anchor.qNo,
            cropBuf
          );

          if (vision.describable && vision.questionText && vision.options?.length === 4) {
            seenQNos.add(anchor.qNo);
            allQuestions.push({
              qNo: anchor.qNo,
              questionText: vision.questionText,
              options: vision.imageOptions ? ["A", "B", "C", "D"] : vision.options,
              topicNumber: vision.topicNumber || 1,
              answerMode: vision.imageOptions ? "letter" : "text",
            });
            continue;
          }

          if (imageFallback !== "describe-only" && isImageKitConfigured()) {
            const url = await uploadPngBuffer(
              cropBuf,
              `official-papers/page-${p}-q${anchor.qNo}.png`
            );
            seenQNos.add(anchor.qNo);
            allQuestions.push({
              qNo: anchor.qNo,
              questionText: vision.questionText || `प्रश्न ${anchor.qNo} (देखें चित्र)`,
              options: vision.imageOptions ? ["A", "B", "C", "D"] : vision.options || ["A", "B", "C", "D"],
              topicNumber: vision.topicNumber || 1,
              questionMedia: { type: "image", url, alt: `Question ${anchor.qNo}` },
              answerMode: vision.imageOptions ? "letter" : "text",
            });
          }
        } catch (visionErr) {
          if (onLog) await onLog("image_crop", `q${anchor.qNo}: ${visionErr.message}`, "warn", "ocr");
        }
      }

      if (onLog) {
        await onLog(
          "ocr_page_done",
          `${display} · page ${p}/${pagesToOcr} done (${allQuestions.length} questions so far)`,
          "info",
          "ocr"
        );
      }
    } catch (err) {
      if (onLog) await onLog("ocr_page", `Page ${p} failed: ${err.message}`, "warn", "ocr");
    }
  }

  await terminateTesseractWorker();
  await terminateBboxWorker();

  if (allQuestions.length === 0) {
    throw new Error("OCR page-by-page produced no questions");
  }
  return allQuestions;
};

const extractAnswerKeyFromPdfBuffer = async (examName, pdfBuffer, onLog) => {
  let text = "";
  try {
    text = (await pdfParse(pdfBuffer)).text || "";
  } catch {
    /* fall through */
  }

  const display = formatProviderLabel("ocr");
  const pagesToOcr = await getPagesToProcess(pdfBuffer);
  const hasPoppler = Boolean(getPdftoppmPath());
  const answers = {};

  const mergeAnswers = (partial) => {
    for (const [k, v] of Object.entries(partial || {})) {
      if (v && /^[A-D]$/i.test(String(v))) answers[k] = String(v).toUpperCase();
    }
  };

  if (text.trim().length < 50 && hasPoppler && pagesToOcr > 0) {
    for (let p = 1; p <= pagesToOcr; p++) {
      if (onLog) {
        await onLog("ocr_page", `${display} · answer key page ${p}/${pagesToOcr}`, "info", "ocr");
      }
      try {
        const pageBuf = pdfBufferToSinglePageBuffer(pdfBuffer, p, `ocr-ak-${p}`);
        const pageText = await ocrImageBuffer(pageBuf);
        if (pageText.trim().length < 8) continue;
        const prompt = buildAnswerKeyPrompt(examName, pageText);
        const raw = await groqComplete(prompt);
        const result = parseJsonFromText(raw);
        mergeAnswers(result.answers);
      } catch (err) {
        if (onLog) await onLog("answer_key", `Answer key page ${p} failed: ${err.message}`, "warn", "ocr");
      }
    }
  } else if (text.trim().length >= 50) {
    const { splitIntoChunks } = require("../pdfUtils.service");
    const chunks = splitIntoChunks(text);
    for (let i = 0; i < chunks.length; i++) {
      if (onLog) {
        await onLog(
          "answer_key_chunk",
          `${display} · answer key chunk ${i + 1}/${chunks.length}`,
          "info",
          "ocr"
        );
      }
      try {
        const prompt = buildAnswerKeyPrompt(examName, chunks[i]);
        const raw = await groqComplete(prompt);
        const result = parseJsonFromText(raw);
        mergeAnswers(result.answers);
      } catch (err) {
        if (onLog) await onLog("answer_key_chunk", `Chunk ${i + 1} failed: ${err.message}`, "warn", "ocr");
      }
    }
  }

  await terminateTesseractWorker();

  if (Object.keys(answers).length === 0) {
    throw new Error("Answer key OCR produced no answers");
  }

  if (onLog) {
    await onLog(
      "answer_key",
      `${display} · ${Object.keys(answers).length} answer(s) from key`,
      "info",
      "ocr"
    );
  }
  return answers;
};

const extractQuestionsFromPage = async () => {
  throw new Error("OCR provider uses full PDF extraction, not single page");
};

const extractAnswerKeyFromText = async (examName, text) => {
  const prompt = buildAnswerKeyPrompt(examName, text);
  const raw = await groqComplete(prompt);
  const result = parseJsonFromText(raw);
  return result.answers || {};
};

const isAvailable = () => Boolean(process.env.GROQ_API_KEY?.trim());

module.exports = {
  name: "ocr",
  isAvailable,
  extractQuestionsFromPage,
  extractAnswerKeyFromText,
  extractQuestionsFromPdfBuffer,
  extractAnswerKeyFromPdfBuffer,
};
