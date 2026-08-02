const topicModel = require("../models/topic.model");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const examModel = require("../models/exam.model");
const {
  downloadPdfBuffer,
  pdfBufferToSinglePageBuffer,
  cropPngRegion,
  getPngDimensions,
  letterToOptionText,
} = require("./pdfUtils.service");
const {
  ocrPageWithBoxes,
  findQNoAnchors,
  regionForQNo,
  optionRegionsFromCrop,
  terminateWorker,
} = require("./ocrBbox.service");
const { extractMcqFromCropImage } = require("./ai/geminiVision.provider");
const { isImageKitConfigured, uploadPngBuffer } = require("./imageStorage.service");
const { getMissingQNos, mergeQuestionDocsByQNo } = require("./paperDataFormatter.service");
const { toPaperDataJson } = require("./paperDataFormatter.service");

const getPagesToProcess = async (pdfBuffer) => {
  const { getPdfPageCount } = require("./pdfUtils.service");
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

const letterCorrectAnswer = (answers, qNo, options) => {
  const letter = answers[String(qNo)];
  if (!letter) return null;
  const upper = letter.toUpperCase();
  if (/^[A-D]$/.test(upper) && options.every((o) => /^[A-D]$/.test(o))) {
    return upper;
  }
  return letterToOptionText(letter, options);
};

const buildQuestionDocFromVision = ({
  vision,
  qNo,
  exam,
  catalog,
  paperYear,
  topics,
  answers,
}) => {
  const topic = topics[(vision.topicNumber || 1) - 1];
  if (!topic) return null;

  let options = vision.options || [];
  let answerMode = "text";
  if (vision.imageOptions) {
    options = ["A", "B", "C", "D"];
    answerMode = "letter";
  }
  if (options.length !== 4) return null;

  const correctAnswer = letterCorrectAnswer(answers, qNo, options);
  if (!correctAnswer) return null;

  return {
    examId: exam._id,
    topicId: topic._id,
    questionText: vision.questionText || `प्रश्न ${qNo}`,
    options,
    correctAnswer,
    answerMode,
    explanation: `Official RSSB previous-year paper (${paperYear}) — ${exam.name}.`,
    referenceLinks: [catalog.questionPdfUrl, catalog.answerKeyPdfUrl],
    difficulty: "moderate",
    pattern: "old",
    source: "previous-paper",
    year: paperYear,
    qNo,
  };
};

/**
 * Process image/diagram questions by cropping PDF regions + Gemini vision + optional ImageKit.
 */
const processImageQuestionsForCatalog = async ({
  catalog,
  exam,
  targetQNos,
  answers = {},
  onLog,
}) => {
  const topicListText = (
    await topicModel.find({ examId: exam._id }).sort({ order: 1 })
  )
    .map((t, i) => `${i + 1}. ${t.name}`)
    .join("\n");
  const topics = await topicModel.find({ examId: exam._id }).sort({ order: 1 });

  const questionPdfBuffer = await downloadPdfBuffer(catalog.questionPdfUrl);
  const pagesToScan = await getPagesToProcess(questionPdfBuffer);
  const catalogId = catalog._id.toString();
  const imageFallback = process.env.OFFICIAL_PAPER_IMAGE_FALLBACK || "imagekit";
  const results = [];

  const log = async (stage, message, level = "info") => {
    if (onLog) await onLog(stage, message, level);
  };

  await log("image_scan", `Scanning ${pagesToScan} page(s) for ${targetQNos.length} image qNo(s)`);

  for (let p = 1; p <= pagesToScan; p++) {
    const pageBuf = pdfBufferToSinglePageBuffer(questionPdfBuffer, p, `img-q-${p}`);
    const { width, height } = await getPngDimensions(pageBuf);
    const { words } = await ocrPageWithBoxes(pageBuf);
    const anchors = findQNoAnchors(words);

    for (const qNo of targetQNos) {
      const region = regionForQNo(anchors, qNo, width, height);
      if (!region) continue;

      await log("image_crop", `Cropping q${qNo} from page ${p}/${pagesToScan}`, "info");

      try {
        const cropBuf = await cropPngRegion(pageBuf, region);
        const vision = await extractMcqFromCropImage(
          exam.name,
          topicListText,
          qNo,
          cropBuf
        );

        if (vision.describable && vision.questionText && vision.options?.length === 4) {
          const doc = buildQuestionDocFromVision({
            vision,
            qNo,
            exam,
            catalog,
            paperYear: catalog.year,
            topics,
            answers,
          });
          if (doc) {
            results.push(doc);
            await log("image_vision", `q${qNo}: text MCQ from vision`, "info");
            continue;
          }
        }

        if (imageFallback === "describe-only") {
          await log("image_skip", `q${qNo}: not describable, ImageKit disabled`, "warn");
          continue;
        }

        if (!isImageKitConfigured()) {
          await log("image_skip", `q${qNo}: ImageKit not configured`, "warn");
          continue;
        }

        const questionUrl = await uploadPngBuffer(
          cropBuf,
          `official-papers/${catalogId}/q${qNo}-question.png`
        );

        let optionMedia = [];
        let options = ["A", "B", "C", "D"];
        let answerMode = "letter";

        if (vision.imageOptions) {
          const cropMeta = await getPngDimensions(cropBuf);
          const optRegions = optionRegionsFromCrop(cropMeta.width, cropMeta.height);
          for (const opt of optRegions) {
            try {
              const optBuf = await cropPngRegion(cropBuf, {
                left: opt.left,
                top: opt.top,
                width: opt.width,
                height: opt.height,
              });
              const optUrl = await uploadPngBuffer(
                optBuf,
                `official-papers/${catalogId}/q${qNo}-opt-${opt.letter}.png`
              );
              optionMedia.push({ letter: opt.letter, url: optUrl, alt: `Option ${opt.letter}` });
            } catch {
              /* skip bad option crop */
            }
          }
        } else if (vision.options?.length === 4) {
          options = vision.options;
          answerMode = "text";
        }

        const correctAnswer = letterCorrectAnswer(answers, qNo, options);
        if (!correctAnswer) {
          await log("image_skip", `q${qNo}: no answer key match`, "warn");
          continue;
        }

        const topic = topics[(vision.topicNumber || 1) - 1];
        if (!topic) continue;

        results.push({
          examId: exam._id,
          topicId: topic._id,
          questionText: vision.questionText || `प्रश्न ${qNo} (देखें चित्र)`,
          options,
          correctAnswer,
          answerMode,
          questionMedia: { type: "image", url: questionUrl, alt: `Question ${qNo}` },
          optionMedia: optionMedia.length ? optionMedia : undefined,
          explanation: `Official RSSB previous-year paper (${catalog.year}) — ${exam.name}.`,
          referenceLinks: [catalog.questionPdfUrl, catalog.answerKeyPdfUrl],
          difficulty: "moderate",
          pattern: "old",
          source: "previous-paper",
          year: catalog.year,
          qNo,
        });
        await log("image_upload", `q${qNo}: uploaded crop to CDN`, "info");
      } catch (err) {
        await log("image_fail", `q${qNo} page ${p}: ${err.message}`, "warn");
      }
    }
  }

  await terminateWorker();
  return results;
};

/**
 * Run image extraction for catalog, merge into paperData, save to DB.
 */
const extractImageQuestionsForCatalog = async (catalogId, qNos = null, onLog = null) => {
  const catalog = await officialPaperCatalogModel.findById(catalogId);
  if (!catalog) throw new Error("Catalog not found");
  const exam = await examModel.findById(catalog.examId);
  if (!exam) throw new Error("Exam not found");

  const expected = parseInt(process.env.OFFICIAL_PAPER_EXPECTED_QUESTIONS || "150", 10);
  const existing = catalog.paperData?.questions || [];
  const targetQNos =
    qNos && qNos.length > 0
      ? qNos
      : getMissingQNos(existing, expected);

  if (targetQNos.length === 0) {
    return { merged: 0, paperData: catalog.paperData };
  }

  const { extractAnswerKeyFromPdfBuffer } = require("./ai/ocrGroq.provider");
  const answerPdfBuffer = await downloadPdfBuffer(catalog.answerKeyPdfUrl);
  const answers = await extractAnswerKeyFromPdfBuffer(exam.name, answerPdfBuffer, onLog);

  const imageDocs = await processImageQuestionsForCatalog({
    catalog,
    exam,
    targetQNos,
    answers,
    onLog,
  });

  const existingDocs = require("./paperDataFormatter.service").questionDocsFromPaperData(
    catalog.paperData || { questions: [] },
    exam,
    catalog
  );
  const mergedDocs = mergeQuestionDocsByQNo(existingDocs, imageDocs);

  const paperData = toPaperDataJson({
    catalog,
    extractionMethod: catalog.extractionMethod || "ocr",
    stats: {
      ...(catalog.paperData?.stats || {}),
      matched: mergedDocs.length,
      missingCount: getMissingQNos(
        mergedDocs.map((d) => ({ qNo: d.qNo })),
        expected
      ).length,
    },
    questionDocs: mergedDocs,
    providerAttempts: catalog.paperData?.providerAttempts || [],
  });

  await officialPaperCatalogModel.updateOne(
    { _id: catalog._id },
    {
      paperData,
      status: "extracted",
      stats: paperData.stats,
    }
  );

  return {
    extracted: imageDocs.length,
    merged: mergedDocs.length,
    paperData,
  };
};

module.exports = {
  processImageQuestionsForCatalog,
  extractImageQuestionsForCatalog,
};
