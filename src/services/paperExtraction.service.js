const Groq = require("groq-sdk");
const pdfParse = require("pdf-parse");
const topicModel = require("../models/topic.model");
const { downloadPdfBuffer, letterToOptionText, splitIntoChunks } = require("./pdfUtils.service");
const { extractPaper, getAdminContactMessage } = require("./ai/aiProvider.service");
const { buildChunkExtractionPrompt, buildAnswerKeyPrompt } = require("./ai/prompts");

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const parseJson = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
};

const groqComplete = async (prompt) => {
  if (!groq) throw new Error("GROQ_API_KEY not configured");
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 4096,
  });
  return completion.choices[0].message.content;
};

const tryPdfParseExtraction = async (
  examName,
  topicListText,
  questionPdfBuffer,
  answerPdfBuffer,
  onLog
) => {
  if (onLog) await onLog("pdf_parse", "Trying text extraction via pdf-parse", "info");
  const qText = (await pdfParse(questionPdfBuffer)).text || "";
  const aText = (await pdfParse(answerPdfBuffer)).text || "";
  if (qText.trim().length < 500 || aText.trim().length < 20) {
    if (onLog) await onLog("pdf_parse", "Insufficient embedded text in PDFs — will use vision/OCR", "warn");
    return null;
  }

  const chunks = splitIntoChunks(qText);
  const allQuestions = [];
  const seenQNos = new Set();

  for (let i = 0; i < chunks.length; i++) {
    try {
      if (onLog) await onLog("groq_chunk", `Groq Llama 3.3 · chunk ${i + 1}/${chunks.length}`, "info", "pdf-parse");
      const prompt = buildChunkExtractionPrompt(examName, topicListText, chunks[i], false);
      const raw = await groqComplete(prompt);
      const result = parseJson(raw);
      for (const q of result.questions || []) {
        if (seenQNos.has(q.qNo)) continue;
        seenQNos.add(q.qNo);
        allQuestions.push(q);
      }
    } catch (err) {
      if (onLog) await onLog("groq_chunk", `Chunk ${i + 1} failed: ${err.message}`, "warn");
    }
  }

  const akPrompt = buildAnswerKeyPrompt(examName, aText);
  const akRaw = await groqComplete(akPrompt);
  const akResult = parseJson(akRaw);

  if (allQuestions.length === 0) return null;

  if (onLog) await onLog("pdf_parse", `Groq Llama 3.3 · got ${allQuestions.length} questions from embedded text`, "info", "pdf-parse");
  return {
    questions: allQuestions,
    answers: akResult.answers || {},
    method: "pdf-parse",
  };
};

const extractOfficialPaper = async ({
  exam,
  questionPdfUrl,
  answerKeyPdfUrl,
  paperYear,
  onLog,
  preferredProvider = null,
  onProviderAttempt = null,
  fillMissing = false,
  existingQuestionDocs = [],
  expectedQuestionCount = parseInt(process.env.OFFICIAL_PAPER_EXPECTED_QUESTIONS || "150", 10),
}) => {
  const topics = await topicModel.find({ examId: exam._id }).sort({ order: 1 });
  const topicListText = topics.map((t, i) => `${i + 1}. ${t.name}`).join("\n");

  if (onLog) await onLog("download", "Downloading question paper PDF", "info");
  const questionPdfBuffer = await downloadPdfBuffer(questionPdfUrl);
  if (onLog) await onLog("download", `Question PDF downloaded (${questionPdfBuffer.length} bytes)`, "info");

  if (onLog) await onLog("download", "Downloading answer key PDF", "info");
  const answerPdfBuffer = await downloadPdfBuffer(answerKeyPdfUrl);
  if (onLog) await onLog("download", `Answer key PDF downloaded (${answerPdfBuffer.length} bytes)`, "info");

  const { getProviderMeta } = require("./ai/providerMeta");
  const record = async (provider, stage, success, error, questionCount = 0) => {
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

  let result = null;
  const skipPdfParse = Boolean(
    preferredProvider && preferredProvider !== "pdf-parse"
  );

  if (!skipPdfParse) {
    try {
      result = await tryPdfParseExtraction(
        exam.name,
        topicListText,
        questionPdfBuffer,
        answerPdfBuffer,
        onLog
      );
      if (result?.questions?.length) {
        await record("pdf-parse", "full", true, null, result.questions.length);
      } else if (preferredProvider === "pdf-parse") {
        await record("pdf-parse", "full", false, "Insufficient embedded PDF text");
      }
    } catch (err) {
      await record("pdf-parse", "full", false, err.message);
      if (onLog) await onLog("pdf_parse", `pdf-parse failed: ${err.message}`, "warn");
    }
  }

  if (preferredProvider === "pdf-parse") {
    if (!result?.questions?.length) {
      const msg =
        result?.errors?.join("; ") ||
        "pdf-parse/Groq could not extract from embedded PDF text";
      throw new Error(msg);
    }
  } else if (!result || result.questions.length === 0) {
    result = await extractPaper({
      examName: exam.name,
      topicListText,
      questionPdfBuffer,
      answerPdfBuffer,
      onLog,
      preferredProvider,
      onProviderAttempt,
    });
  }

  if (!result.questions || !result.answers) {
    const msg =
      result.contactMessage ||
      getAdminContactMessage() +
        (result.errors?.length ? ` Details: ${result.errors.join("; ")}` : "");
    throw new Error(msg);
  }

  const answers = result.answers;
  const finalDocs = [];
  let skippedNoAnswer = 0;
  let skippedBadTopic = 0;

  const sortedQuestions = [...result.questions].sort((a, b) => a.qNo - b.qNo);

  for (const q of sortedQuestions) {
    const letter = answers[String(q.qNo)];
    const isLetterMode =
      q.answerMode === "letter" ||
      (q.options?.length === 4 && q.options.every((o) => /^[A-D]$/i.test(String(o).trim())));
    const correctAnswer = letter
      ? isLetterMode
        ? letter.toUpperCase()
        : letterToOptionText(letter, q.options)
      : null;
    if (!correctAnswer) {
      skippedNoAnswer++;
      continue;
    }
    const topic = topics[q.topicNumber - 1];
    if (!topic) {
      skippedBadTopic++;
      continue;
    }
    if (!q.options || q.options.length !== 4) continue;

    finalDocs.push({
      examId: exam._id,
      topicId: topic._id,
      questionText: q.questionText,
      options: q.options,
      correctAnswer,
      explanation: `Official RSSB previous-year paper (${paperYear}) — ${exam.name}. Source: Rajasthan RSSB.`,
      referenceLinks: [questionPdfUrl, answerKeyPdfUrl],
      difficulty: "moderate",
      pattern: "old",
      source: "previous-paper",
      year: paperYear,
      qNo: q.qNo,
      questionMedia: q.questionMedia,
      optionMedia: q.optionMedia,
      answerMode: q.answerMode || "text",
    });
  }

  if (onLog) {
    await onLog(
      "merge",
      `Merged ${finalDocs.length}/${sortedQuestions.length} questions with answer key`,
      "info"
    );
  }

  const { mergeQuestionDocsByQNo, getMissingQNos } = require("./paperDataFormatter.service");
  let questionDocs = finalDocs;
  if (fillMissing && existingQuestionDocs.length > 0) {
    questionDocs = mergeQuestionDocsByQNo(existingQuestionDocs, finalDocs);
    const missing = getMissingQNos(questionDocs, expectedQuestionCount);
    await onLog(
      "fill_missing",
      `Merged with ${existingQuestionDocs.length} existing → ${questionDocs.length} total (missing ${missing.length}/${expectedQuestionCount} qNos)`,
      missing.length > 0 ? "warn" : "info"
    );
    if (missing.length > 0 && missing.length <= 30) {
      await onLog("fill_missing", `Missing qNos: ${missing.join(", ")}`, "warn");
    }
  }

  return {
    questionDocs,
    stats: {
      extracted: sortedQuestions.length,
      matched: questionDocs.length,
      skipped: skippedNoAnswer + skippedBadTopic,
      skippedNoAnswer,
      skippedBadTopic,
      expectedQuestionCount,
      missingCount: getMissingQNos(questionDocs, expectedQuestionCount).length,
    },
    extractionMethod: result.method || "pdf-parse",
    topics,
  };
};

module.exports = {
  extractOfficialPaper,
};
