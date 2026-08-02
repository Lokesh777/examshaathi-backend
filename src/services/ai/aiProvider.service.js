const openaiProvider = require("./openaiVision.provider");
const geminiProvider = require("./geminiVision.provider");
const ollamaProvider = require("./ollamaVision.provider");
const ocrProvider = require("./ocrGroq.provider");
const { getProviderMeta, formatProviderLabel } = require("./providerMeta");

const PROVIDER_MAP = {
  openai: openaiProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
  ocr: ocrProvider,
};

const getProviderOrder = () => {
  const raw = process.env.AI_VISION_PROVIDER_ORDER || "gemini,ollama,ocr,openai";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((name) => PROVIDER_MAP[name]);
};

const getAdminContactMessage = () =>
  process.env.ADMIN_CONTACT_MESSAGE ||
  "All AI providers failed. Contact the ExamSaathi creator to fix API keys or Poppler setup.";

const checkProviderAvailable = async (name) => {
  const provider = PROVIDER_MAP[name];
  if (!provider) return false;
  const avail = provider.isAvailable;
  if (typeof avail === "function") {
    const result = await avail();
    return result;
  }
  return Boolean(avail);
};

const getAiProviderCapabilities = async () => {
  const order = getProviderOrder();
  const providers = [];

  for (const name of order) {
    const meta = getProviderMeta(name);
    let available = false;
    let reason = null;
    try {
      available = await checkProviderAvailable(name);
      if (!available) {
        if (name === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
          reason = "OPENAI_API_KEY not set";
        } else if (name === "gemini" && !process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY_FALLBACK) {
          reason = "GEMINI_API_KEY not set";
        } else if (name === "ollama") {
          reason = `Ollama not reachable or model ${meta.model} missing`;
        } else if (name === "ocr") {
          reason = !process.env.GROQ_API_KEY?.trim()
            ? "GROQ_API_KEY not set"
            : !require("../pdfUtils.service").getPdftoppmPath()
              ? "Groq OK · Poppler missing (pdf text or Tesseract after render)"
              : null;
        } else {
          reason = "Not configured";
        }
      }
    } catch (err) {
      reason = err.message;
    }
    providers.push({
      id: name,
      label: meta.label,
      model: meta.model,
      available,
      reason,
    });
  }

  return {
    providerOrder: order,
    providers,
    popplerConfigured: Boolean(require("../pdfUtils.service").getPdftoppmPath()),
  };
};

const VISION_PROVIDERS = ["openai", "gemini", "ollama"];

const resolveExtractionMode = (preferredProvider) => {
  if (!preferredProvider) return { mode: "auto", order: getProviderOrder() };
  const p = String(preferredProvider).toLowerCase();
  if (p === "pdf-parse") return { mode: "pdf-parse", order: [] };
  if (p === "ocr") return { mode: "ocr", order: ["ocr"] };
  if (VISION_PROVIDERS.includes(p)) return { mode: "forced-vision", order: [p] };
  return { mode: "auto", order: getProviderOrder() };
};

const makeAttemptRecorder = (onProviderAttempt) => {
  return async (provider, stage, success, error, questionCount = 0) => {
    if (!onProviderAttempt) return;
    const meta = getProviderMeta(provider);
    await onProviderAttempt({
      provider,
      model: meta.model,
      stage,
      success,
      error: error || null,
      questionCount,
    });
  };
};

const extractQuestionsFromPages = async (examName, topicListText, pageBuffers, onLog) => {
  const order = getProviderOrder();
  const errors = [];

  for (const name of order) {
    if (name === "ocr") continue;
    if (!(await checkProviderAvailable(name))) {
      const msg = `${formatProviderLabel(name)}: not available`;
      errors.push(msg);
      if (onLog) await onLog("ai_provider", msg, "warn");
      continue;
    }

    const provider = PROVIDER_MAP[name];
    const display = formatProviderLabel(name);
    try {
      if (onLog) await onLog("ai_provider", `Using ${display} for question extraction`, "info", name);
      const allQuestions = [];
      const seenQNos = new Set();

      for (let i = 0; i < pageBuffers.length; i++) {
        if (onLog) {
          await onLog(
            "vision_page",
            `${display} · page ${i + 1}/${pageBuffers.length}`,
            "info",
            name
          );
        }
        const pageQs = await provider.extractQuestionsFromPage(
          examName,
          topicListText,
          pageBuffers[i]
        );
        for (const q of pageQs) {
          if (seenQNos.has(q.qNo)) continue;
          seenQNos.add(q.qNo);
          allQuestions.push(q);
        }
      }

      if (allQuestions.length > 0) {
        if (onLog) {
          await onLog(
            "ai_provider",
            `${display} extracted ${allQuestions.length} questions`,
            "info",
            name
          );
        }
        return { questions: allQuestions, method: name };
      }
      const msg = `${display}: no questions extracted`;
      errors.push(msg);
      if (onLog) await onLog("ai_provider", msg, "warn", name);
    } catch (err) {
      const msg = `${display}: ${err.message}`;
      errors.push(msg);
      if (onLog) await onLog("ai_provider", msg, "error", name);
    }
  }

  return { questions: null, method: null, errors };
};

const extractQuestionsFromPdfIncremental = async (
  examName,
  topicListText,
  questionPdfBuffer,
  pagesToProcess,
  onLog,
  { providerOrder, onProviderAttempt } = {}
) => {
  const order = (providerOrder || getProviderOrder()).filter((n) => n !== "ocr");
  const errors = [];
  const record = makeAttemptRecorder(onProviderAttempt);
  const { pdfBufferToSinglePageBuffer } = require("../pdfUtils.service");

  for (const name of order) {
    if (!(await checkProviderAvailable(name))) {
      const msg = `${formatProviderLabel(name)}: not available`;
      errors.push(msg);
      await record(name, "questions", false, msg);
      if (onLog) await onLog("ai_provider", msg, "warn");
      continue;
    }

    const provider = PROVIDER_MAP[name];
    const display = formatProviderLabel(name);
    try {
      if (onLog) await onLog("ai_provider", `Using ${display} for question extraction`, "info", name);
      const allQuestions = [];
      const seenQNos = new Set();

      for (let p = 1; p <= pagesToProcess; p++) {
        if (onLog) await onLog("poppler", `Rendering page ${p}/${pagesToProcess} to image`, "info");
        let pageBuf = pdfBufferToSinglePageBuffer(questionPdfBuffer, p, `qp-${p}`);
        if (onLog) {
          await onLog("vision_page", `${display} · page ${p}/${pagesToProcess}`, "info", name);
        }
        const pageQs = await provider.extractQuestionsFromPage(
          examName,
          topicListText,
          pageBuf
        );
        pageBuf = null;
        for (const q of pageQs) {
          if (seenQNos.has(q.qNo)) continue;
          seenQNos.add(q.qNo);
          allQuestions.push(q);
        }
      }

      if (allQuestions.length > 0) {
        await record(name, "questions", true, null, allQuestions.length);
        if (onLog) {
          await onLog(
            "ai_provider",
            `${display} extracted ${allQuestions.length} questions`,
            "info",
            name
          );
        }
        return { questions: allQuestions, method: name };
      }
      const msg = `${display}: no questions extracted`;
      errors.push(msg);
      await record(name, "questions", false, msg);
      if (onLog) await onLog("ai_provider", msg, "warn", name);
    } catch (err) {
      const msg = `${display}: ${err.message}`;
      errors.push(msg);
      await record(name, "questions", false, err.message);
      if (onLog) await onLog("ai_provider", msg, "error", name);
    }
  }

  return { questions: null, method: null, errors };
};

const extractAnswerKey = async (
  examName,
  textOrPdfBuffer,
  isPdfBuffer = false,
  onLog,
  { providerOrder, onProviderAttempt } = {}
) => {
  const order = providerOrder || getProviderOrder();
  const errors = [];
  const record = makeAttemptRecorder(onProviderAttempt);

  for (const name of order) {
    if (name === "ocr" && isPdfBuffer) {
      if (!(await checkProviderAvailable("ocr"))) {
        const msg = "Groq+OCR not available for answer key";
        await record("ocr", "answer_key", false, msg);
        if (onLog) await onLog("answer_key", msg, "warn", "ocr");
        continue;
      }
      try {
        if (onLog) await onLog("answer_key", "Using Groq + Tesseract OCR for answer key", "info", "ocr");
        const answers = await ocrProvider.extractAnswerKeyFromPdfBuffer(
          examName,
          textOrPdfBuffer,
          onLog
        );
        if (Object.keys(answers).length > 0) {
          await record("ocr", "answer_key", true, null, Object.keys(answers).length);
          return { answers, method: "ocr" };
        }
        await record("ocr", "answer_key", false, "No answers parsed");
      } catch (err) {
        errors.push(`ocr: ${err.message}`);
        await record("ocr", "answer_key", false, err.message);
        if (onLog) await onLog("answer_key", `OCR answer key failed: ${err.message}`, "error", "ocr");
      }
      continue;
    }

    if (!(await checkProviderAvailable(name))) continue;
    const provider = PROVIDER_MAP[name];
    const display = formatProviderLabel(name);
    try {
      if (onLog) await onLog("answer_key", `Using ${display} for answer key`, "info", name);
      let text = textOrPdfBuffer;
      if (isPdfBuffer && name !== "ocr") {
        const pdfParse = require("pdf-parse");
        const parsed = await pdfParse(textOrPdfBuffer);
        text = parsed.text || "";
      }
      if (typeof text !== "string" || text.trim().length < 10) {
        const msg = "insufficient text in answer key PDF";
        await record(name, "answer_key", false, msg);
        if (onLog) await onLog("answer_key", `${display}: ${msg}`, "warn", name);
        continue;
      }

      const answers = await provider.extractAnswerKeyFromText(examName, text);
      if (Object.keys(answers).length > 0) {
        await record(name, "answer_key", true, null, Object.keys(answers).length);
        return { answers, method: name };
      }
      await record(name, "answer_key", false, "No answers parsed");
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
      await record(name, "answer_key", false, err.message);
      if (onLog) await onLog("answer_key", `${display}: ${err.message}`, "error", name);
    }
  }

  return { answers: null, method: null, errors };
};

const extractFromPdfBufferOcr = async (
  examName,
  topicListText,
  questionPdfBuffer,
  answerPdfBuffer,
  onLog,
  onProviderAttempt
) => {
  const record = makeAttemptRecorder(onProviderAttempt);
  if (!(await checkProviderAvailable("ocr"))) {
    const msg = "ocr: Groq API key not configured";
    await record("ocr", "full", false, msg);
    return { questions: null, answers: null, method: null, errors: [msg] };
  }
  const display = formatProviderLabel("ocr");
  try {
    if (onLog) await onLog("ocr_fallback", `Using ${display} (Tesseract + Groq)`, "info", "ocr");
    const questions = await ocrProvider.extractQuestionsFromPdfBuffer(
      examName,
      topicListText,
      questionPdfBuffer,
      onLog
    );
    const answers = await ocrProvider.extractAnswerKeyFromPdfBuffer(examName, answerPdfBuffer, onLog);
    if (questions?.length && answers && Object.keys(answers).length > 0) {
      await record("ocr", "full", true, null, questions.length);
      return {
        questions,
        answers,
        method: "ocr",
        errors: [],
      };
    }
    const failMsg = "OCR path returned empty questions or answers";
    await record("ocr", "full", false, failMsg);
    return { questions: null, answers: null, method: null, errors: [failMsg] };
  } catch (err) {
    await record("ocr", "full", false, err.message);
    if (onLog) await onLog("ocr_fallback", `${display} failed: ${err.message}`, "error", "ocr");
    return {
      questions: null,
      answers: null,
      method: null,
      errors: [`ocr: ${err.message}`],
    };
  }
};

const extractPaper = async ({
  examName,
  topicListText,
  questionPdfBuffer,
  answerPdfBuffer,
  onLog,
  preferredProvider = null,
  onProviderAttempt = null,
}) => {
  const allErrors = [];
  const maxPages = parseInt(process.env.OFFICIAL_PAPER_MAX_PAGES || "0", 10);
  const { mode, order } = resolveExtractionMode(preferredProvider);
  const providerOpts = { providerOrder: order, onProviderAttempt };

  const { getPdfPageCount } = require("../pdfUtils.service");

  if (mode === "ocr") {
    const ocrResult = await extractFromPdfBufferOcr(
      examName,
      topicListText,
      questionPdfBuffer,
      answerPdfBuffer,
      onLog,
      onProviderAttempt
    );
    allErrors.push(...(ocrResult.errors || []));
    if (ocrResult.questions?.length && ocrResult.answers) {
      return {
        questions: ocrResult.questions,
        answers: ocrResult.answers,
        method: ocrResult.method,
        errors: allErrors,
      };
    }
    return {
      questions: null,
      answers: null,
      method: null,
      errors: allErrors,
      contactMessage: getAdminContactMessage(),
    };
  }

  let pageCount = 0;
  try {
    pageCount = await getPdfPageCount(questionPdfBuffer);
    if (onLog) await onLog("pdf_pages", `Question PDF has ${pageCount} page(s)`, "info");
  } catch (err) {
    allErrors.push(`pdf-pages: ${err.message}`);
    if (onLog) await onLog("pdf_pages", `Failed to read page count: ${err.message}`, "error");
  }

  const pagesToProcess = maxPages > 0 ? Math.min(pageCount, maxPages) : pageCount;
  const visionOrder = order.filter((n) => n !== "ocr");

  if (pagesToProcess > 0 && visionOrder.length > 0) {
    try {
      const visionResult = await extractQuestionsFromPdfIncremental(
        examName,
        topicListText,
        questionPdfBuffer,
        pagesToProcess,
        onLog,
        providerOpts
      );
      allErrors.push(...(visionResult.errors || []));

      const akResult = await extractAnswerKey(
        examName,
        answerPdfBuffer,
        true,
        onLog,
        providerOpts
      );
      allErrors.push(...(akResult.errors || []));

      if (visionResult.questions?.length && akResult.answers) {
        return {
          questions: visionResult.questions,
          answers: akResult.answers,
          method: visionResult.method || akResult.method,
          errors: allErrors,
        };
      }
    } catch (err) {
      allErrors.push(`vision: ${err.message}`);
      if (onLog) await onLog("vision", `Vision pipeline failed: ${err.message}`, "error");
    }
  } else if (onLog && pagesToProcess <= 0) {
    await onLog(
      "pdf_pages",
      "Could not detect page count — trying OCR fallback directly",
      "warn"
    );
  }

  if (mode === "forced-vision") {
    if (onLog) await onLog("failed", `Chosen provider failed — no auto-fallback`, "error");
    return {
      questions: null,
      answers: null,
      method: null,
      errors: allErrors,
      contactMessage: getAdminContactMessage(),
    };
  }

  if (onLog) await onLog("ocr_fallback", "Auto mode — trying Tesseract + Groq", "warn");
  const ocrResult = await extractFromPdfBufferOcr(
    examName,
    topicListText,
    questionPdfBuffer,
    answerPdfBuffer,
    onLog,
    onProviderAttempt
  );
  allErrors.push(...(ocrResult.errors || []));

  if (ocrResult.questions?.length && ocrResult.answers) {
    if (onLog) {
      await onLog(
        "ocr_fallback",
        `OCR extracted ${ocrResult.questions.length} questions`,
        "info",
        "ocr"
      );
    }
    return {
      questions: ocrResult.questions,
      answers: ocrResult.answers,
      method: ocrResult.method,
      errors: allErrors,
    };
  }

  if (onLog) await onLog("failed", "All AI providers failed for this paper", "error");
  return {
    questions: null,
    answers: null,
    method: null,
    errors: allErrors,
    contactMessage: getAdminContactMessage(),
  };
};

module.exports = {
  getProviderOrder,
  getAdminContactMessage,
  getAiProviderCapabilities,
  extractPaper,
  extractQuestionsFromPages,
  extractAnswerKey,
};
