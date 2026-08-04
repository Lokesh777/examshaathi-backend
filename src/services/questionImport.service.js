const Groq = require("groq-sdk");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const questionModel = require("../models/question.model");
const quizModel = require("../models/quiz.model");
const {
  getExamQuestionProfile,
  ensureOptionCount,
} = require("../config/examQuestionProfiles");
const { QUESTION_TYPES, buildNormalizeImportPrompt } = require("./ai/newPatternPrompts");
const {
  buildCanonicalPayload,
  questionsMissingTopic,
} = require("./importFormatAdapter");
const {
  linkImportToCatalog,
  resolveCatalogTarget,
  listCatalogForAdmin,
} = require("./officialPaperCatalogLink.service");

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const MAX_IMPORT_QUESTIONS = 200;
const DURATION_MINUTES = parseInt(process.env.OFFICIAL_PAPER_DURATION_MINUTES || "120", 10);

const resolveDurationMinutes = (exam, metadata, payload) =>
  metadata?.durationMinutes ??
  payload?.durationMinutes ??
  exam?.pattern?.durationMinutes ??
  DURATION_MINUTES;

const parseImportPayload = (raw) => {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") throw new Error("Invalid import payload");
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      throw new Error(
        `Invalid JSON: ${err.message}. Check trailing commas and that all brackets are closed (] and }).`
      );
    }
    return { _rawText: trimmed };
  }
};

/** Merge optional answer-key map (legacy path; canonical build handles most cases). */
const preprocessQuestions = (payload) => buildCanonicalPayload(payload).questions || [];

const assignTopicsWithAi = async (questions, exam, topics) => {
  if (!groq) throw new Error("GROQ_API_KEY not configured for auto topic assignment");
  const topicListText = topics
    .map((t, i) => `${i + 1}. ${t.name}`)
    .join("\n");
  const BATCH = 12;
  const qNoToTopic = new Map();

  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH);
    const prompt = `You are tagging MCQs for "${exam.name}" with syllabus topic numbers.

Valid topics (use topicNumber from this list ONLY):
${topicListText}

For each question below, pick the single best topicNumber.
Return ONLY valid JSON:
{"assignments":[{"qNo":1,"topicNumber":5}]}

Questions:
${batch
  .map(
    (q) =>
      `Q${q.qNo}: ${(q.questionText || "").slice(0, 220)}`
  )
  .join("\n")}`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });
    const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    for (const a of parsed.assignments || []) {
      if (a.qNo != null && a.topicNumber != null) {
        qNoToTopic.set(Number(a.qNo), Number(a.topicNumber));
      }
    }
  }

  return questions.map((q) => {
    if (q.topicName || (q.topicNumber != null && q.topicNumber !== "")) return q;
    const tn = qNoToTopic.get(Number(q.qNo));
    return tn != null ? { ...q, topicNumber: tn } : q;
  });
};

const prepareImportPayload = async (body, exam, topics, profile) => {
  let payload = parseImportPayload(body.raw ?? body.payload ?? body);
  let aiNormalized = false;
  let topicsAutoAssigned = false;

  if (payload._rawText) {
    if (body.useAiNormalize === false) {
      throw new Error("Not valid JSON. Fix JSON syntax or enable AI normalize for raw text.");
    }
    payload = await normalizeWithAi(payload._rawText, exam, topics, profile);
    aiNormalized = true;
    payload = buildCanonicalPayload(payload);
  } else {
    payload = buildCanonicalPayload(payload);
  }

  let questions = payload.questions || [];
  const autoAssign =
    body.autoAssignTopics === true || body.metadata?.autoAssignTopics === true;

  if (autoAssign && questionsMissingTopic(questions)) {
    questions = await assignTopicsWithAi(questions, exam, topics);
    topicsAutoAssigned = true;
    payload = { ...payload, questions };
  }

  return { payload, questions, aiNormalized, topicsAutoAssigned };
};

const normalizeTopicKey = (s) =>
  (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Match topic by Hindi/English name from JSON (exact, then partial). */
const matchTopicByName = (topicName, topics) => {
  const key = normalizeTopicKey(topicName);
  if (!key) return null;

  const exact = topics.find((t) => normalizeTopicKey(t.name) === key);
  if (exact) return exact._id.toString();

  const partial = topics.find((t) => {
    const tn = normalizeTopicKey(t.name);
    return tn.includes(key) || key.includes(tn);
  });
  return partial?._id.toString() || null;
};

const resolveTopicId = (q, topics, defaultTopicId, { allowFormDefault = false } = {}) => {
  if (q.topicId) return q.topicId;

  if (q.topicName) {
    const byName = matchTopicByName(q.topicName, topics);
    if (byName) return byName;
  }

  const num = q.topicNumber;
  if (num != null && num !== "" && !Number.isNaN(Number(num))) {
    const idx = Number(num) - 1;
    if (topics[idx]) return topics[idx]._id.toString();
  }

  if (allowFormDefault && defaultTopicId) return defaultTopicId;
  return null;
};

const normalizeCorrectAnswer = (q, options) => {
  let correctAnswer = q.correctAnswer;
  if (correctAnswer == null || correctAnswer === "") return { correctAnswer: null, answerMode: "text" };
  const trimmed = String(correctAnswer).trim();
  if (/^[A-E]$/i.test(trimmed)) {
    const letter = trimmed.toUpperCase();
    const idx = letter.charCodeAt(0) - 65;
    if (options[idx]) {
      return { correctAnswer: options[idx], answerMode: q.answerMode || "text" };
    }
    return { correctAnswer: letter, answerMode: "letter" };
  }
  if (options.includes(trimmed)) {
    return { correctAnswer: trimmed, answerMode: q.answerMode || "text" };
  }
  return { correctAnswer: trimmed, answerMode: q.answerMode || "text" };
};

const validateQuestion = (q, profile, topics, defaultTopicId, importOpts = {}) => {
  const { allowFormDefault = false } = importOpts;
  const errors = [];
  const options = ensureOptionCount(q.options, profile);
  const expectedCount = profile.optionCount || 4;

  if (!q.questionText?.trim()) errors.push("Missing questionText");
  if (options.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} options, got ${options.length}`);
  }
  const correctAnswerResult = normalizeCorrectAnswer(q, options);
  const correctAnswer = correctAnswerResult.correctAnswer;
  if (!correctAnswer) errors.push("Missing or invalid correctAnswer (use A/B/C/D or full option text)");
  else if (
    correctAnswerResult.answerMode === "text" &&
    !options.includes(correctAnswer)
  ) {
    errors.push("correctAnswer does not match any option");
  }
  const topicId = resolveTopicId(q, topics, defaultTopicId, { allowFormDefault });
  if (!topicId) {
    if (allowFormDefault) {
      errors.push("Missing topic — pick a topic above or set topicNumber / topicName in JSON");
    } else if (q.topicName && !matchTopicByName(q.topicName, topics)) {
      errors.push(`Unknown topicName "${q.topicName}" — must match a syllabus topic`);
    } else {
      errors.push(
        'Missing topic — add "topicName" or "topicNumber" per question, set "defaultTopicName" at root, or enable AI assign topics'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      ...q,
      options,
      correctAnswer,
      answerMode: correctAnswerResult.answerMode,
      topicId,
      explanation: q.explanation?.trim() || q.explanationEng?.trim() || "—",
      questionType: q.questionType || "direct",
      difficulty: q.difficulty || "moderate",
    },
  };
};

const normalizeWithAi = async (rawText, exam, topics, profile) => {
  if (!groq) throw new Error("GROQ_API_KEY not configured");

  const CHUNK_SIZE = 9000;
  const CHUNK_OVERLAP = 400;
  const chunks = [];
  let start = 0;
  while (start < rawText.length) {
    const end = Math.min(start + CHUNK_SIZE, rawText.length);
    chunks.push(rawText.slice(start, end));
    start = end - CHUNK_OVERLAP;
    if (start >= rawText.length - CHUNK_OVERLAP) break;
  }
  if (chunks.length === 0) chunks.push(rawText);

  const allQuestions = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const prompt = buildNormalizeImportPrompt(exam, topics, chunk, profile);
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 8192,
    });
    const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    for (const q of parsed.questions || []) {
      const key = (q.questionText || "").trim().toLowerCase().slice(0, 80);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      allQuestions.push(q);
    }
  }

  return { questions: allQuestions };
};

const usesFormTopicDefault = (mode) =>
  mode === "topic-wise" || mode === "bank-manual" || mode === "bank-ai";

const mapToQuestionDocs = (questions, exam, topics, opts = {}) => {
  const profile = getExamQuestionProfile(exam);
  const {
    source = "admin",
    year = null,
    pattern = profile.defaultPattern || "new",
    defaultTopicId = null,
    mode = "bank-manual",
  } = opts;

  const allowFormDefault = usesFormTopicDefault(mode);

  return questions
    .map((q) => {
      const v = validateQuestion(q, profile, topics, defaultTopicId, { allowFormDefault });
      if (!v.valid) return null;
      const n = v.normalized;
      return {
        examId: exam._id,
        topicId: n.topicId,
        questionText: n.questionText,
        options: n.options,
        correctAnswer: n.correctAnswer,
        explanation: n.explanation,
        referenceLinks: n.referenceLinks || [],
        difficulty: n.difficulty,
        pattern: n.pattern || pattern,
        questionType: n.questionType,
        source,
        ...(year != null ? { year } : {}),
        ...(n.questionMedia ? { questionMedia: n.questionMedia } : {}),
        ...(n.optionMedia ? { optionMedia: n.optionMedia } : {}),
        answerMode: n.answerMode || "text",
        qNo: n.qNo,
      };
    })
    .filter(Boolean);
};

const validateImport = async (examId, body) => {
  const exam = await examModel.findById(examId);
  if (!exam) throw new Error("Exam not found");

  const topics = await topicModel.find({ examId, deprecated: false }).sort({ order: 1 });
  const profile = getExamQuestionProfile(exam);
  const defaultTopicId = body.metadata?.topicId || body.metadata?.defaultTopicId || null;
  const mode = body.mode || "bank-manual";
  const allowFormDefault = usesFormTopicDefault(mode);

  const { payload, questions, aiNormalized, topicsAutoAssigned } = await prepareImportPayload(
    body,
    exam,
    topics,
    profile
  );

  if (questions.length === 0) {
    throw new Error(
      'No questions found. JSON must include a "questions" array with at least one item.'
    );
  }
  if (questions.length > MAX_IMPORT_QUESTIONS) {
    throw new Error(`Maximum ${MAX_IMPORT_QUESTIONS} questions per import`);
  }

  const preview = questions.map((q, i) => {
    const v = validateQuestion(q, profile, topics, defaultTopicId, { allowFormDefault });
    return {
      index: i + 1,
      questionText: (q.questionText || "").slice(0, 100),
      questionType: q.questionType || "direct",
      optionCount: (q.options || []).length,
      valid: v.valid,
      errors: v.errors,
    };
  });

  const validCount = preview.filter((p) => p.valid).length;

  let catalogMatch = null;
  if ((body.mode || "bank-manual") === "official-paper") {
    const metadata = body.metadata || {};
    const catalog = await resolveCatalogTarget(exam._id, metadata, payload);
    if (catalog) {
      catalogMatch = {
        catalogId: String(catalog._id),
        title: catalog.rsmssbTitle,
        year: catalog.year,
        setCode: catalog.setCode,
        status: catalog.status,
        hasQuiz: Boolean(catalog.quizId),
      };
    }
  }

  return {
    preview,
    validCount,
    totalCount: questions.length,
    aiNormalized,
    topicsAutoAssigned,
    catalogMatch,
    detectedFormat: payload.setCode ? "cet-paper-export" : "standard",
    profile: {
      optionCount: profile.optionCount,
      defaultPattern: profile.defaultPattern,
      enabledQuestionTypes: profile.enabledQuestionTypes,
    },
    normalized: questions,
  };
};

const importQuestionsAndQuiz = async (examId, body, userId) => {
  const exam = await examModel.findById(examId);
  if (!exam) throw new Error("Exam not found");

  const topics = await topicModel.find({ examId, deprecated: false }).sort({ order: 1 });
  const profile = getExamQuestionProfile(exam);
  const mode = body.mode || "bank-manual";
  const metadata = body.metadata || {};

  const defaultTopicId = metadata.topicId || metadata.defaultTopicId || null;

  const { payload, questions } = await prepareImportPayload(body, exam, topics, profile);

  if (body.questions?.length) {
    questions.push(...body.questions);
  }
  if (questions.length === 0) throw new Error("No questions to import");
  if (questions.length > MAX_IMPORT_QUESTIONS) {
    throw new Error(`Maximum ${MAX_IMPORT_QUESTIONS} questions per import`);
  }

  const sourceMap = {
    "official-paper": "previous-paper",
    "real-paper": "admin",
    "topic-wise": "admin",
    "bank-manual": "admin",
    "bank-ai": "ai",
  };
  const source = sourceMap[mode] || "admin";
  const pattern =
    mode === "official-paper" ? "old" : profile.defaultPattern || "new";

  const questionDocs = mapToQuestionDocs(questions, exam, topics, {
    source,
    year: metadata.year ?? payload.year ?? null,
    pattern,
    defaultTopicId: usesFormTopicDefault(mode) ? defaultTopicId : null,
    mode,
  });

  if (questionDocs.length === 0) {
    throw new Error(
      "No valid questions after validation. Common fixes: choose a default topic, set topicNumber, use correctAnswer A/B/C/D or full option text, ensure 4 options for CET."
    );
  }

  const existing = await questionModel
    .find({ examId: exam._id })
    .select("questionText")
    .lean();
  const seenTexts = new Set(existing.map((d) => d.questionText.trim().toLowerCase()));

  const toInsert = questionDocs.filter((d) => {
    const key = d.questionText.trim().toLowerCase();
    if (seenTexts.has(key)) return false;
    seenTexts.add(key);
    return true;
  });

  const inserted = await questionModel.insertMany(
    toInsert.map(({ qNo, ...rest }) => rest)
  );
  const questionIds = inserted.map((q) => q._id);

  let quizId = null;
  let catalogId = null;
  let catalogCreated = false;

  if (mode === "official-paper" || mode === "real-paper") {
    const title =
      metadata.title ||
      payload.title ||
      `${exam.name} ${metadata.year || ""} Import`.trim();
    const yearVal = metadata.year ?? payload.year ?? null;
    const setCodeVal = metadata.setCode ?? payload.setCode ?? null;
    const sourceUrls = {
      questionPdf:
        metadata.questionPdfUrl ||
        metadata.sourceUrls?.questionPdf ||
        payload.questionPdfUrl ||
        null,
      answerKeyPdf:
        metadata.answerKeyPdfUrl ||
        metadata.sourceUrls?.answerKeyPdf ||
        payload.answerKeyPdfUrl ||
        null,
    };

    let existingQuizId = null;
    if (mode === "official-paper") {
      const targetCatalog = await resolveCatalogTarget(exam._id, metadata, payload);
      if (targetCatalog?.quizId) existingQuizId = targetCatalog.quizId;
    }

    if (existingQuizId) {
      await quizModel.updateOne(
        { _id: existingQuizId },
        {
          $set: {
            title,
            year: yearVal,
            setCode: setCodeVal,
            durationMinutes: resolveDurationMinutes(exam, metadata, payload),
            sourceUrls,
            questions: questionIds,
          },
        }
      );
      quizId = existingQuizId;
    } else {
      const quiz = await quizModel.create({
        examId: exam._id,
        topicId: null,
        type: mode === "official-paper" ? "official-paper" : "real-paper",
        title,
        year: yearVal,
        setCode: setCodeVal,
        durationMinutes: resolveDurationMinutes(exam, metadata, payload),
        sourceUrls,
        questions: questionIds,
        createdBy: mode === "real-paper" ? userId : null,
        pullRule: { sections: [] },
      });
      quizId = quiz._id;
    }

    if (mode === "official-paper") {
      const linkResult = await linkImportToCatalog({
        examId: exam._id,
        exam,
        metadata,
        payload,
        quizId,
        questionIds,
        insertedCount: inserted.length,
        totalValid: questionDocs.length,
        skippedCount: questionDocs.length - toInsert.length,
      });
      catalogId = linkResult.catalogId;
      catalogCreated = linkResult.created;
    }
  } else if (mode === "topic-wise" && metadata.createQuiz && metadata.topicId) {
    const topic = await topicModel.findById(metadata.topicId);
    const quiz = await quizModel.create({
      examId: exam._id,
      topicId: metadata.topicId,
      type: "topic-wise",
      title: metadata.title || `${topic?.name || "Topic"} Practice`,
      questions: questionIds,
      createdBy: userId,
      pullRule: { topicId: metadata.topicId, count: questionIds.length },
    });
    quizId = quiz._id;
  }

  return {
    inserted: inserted.length,
    skipped: questionDocs.length - toInsert.length,
    quizId,
    catalogId,
    catalogCreated,
    questionIds,
  };
};

const getAdminProfile = async (examId) => {
  const exam = await examModel.findById(examId).select("name slug questionProfile");
  if (!exam) throw new Error("Exam not found");
  const profile = getExamQuestionProfile(exam);
  return {
    examName: exam.name,
    examSlug: exam.slug,
    optionCount: profile.optionCount,
    fifthOptionText: profile.fifthOptionText,
    defaultPattern: profile.defaultPattern,
    enabledQuestionTypes: profile.enabledQuestionTypes,
    typeMix: profile.typeMix,
    markingScheme: profile.markingScheme,
    questionTypes: Object.values(QUESTION_TYPES).filter((t) =>
      profile.enabledQuestionTypes.includes(t.id)
    ),
  };
};

module.exports = {
  parseImportPayload,
  validateImport,
  importQuestionsAndQuiz,
  getAdminProfile,
  listCatalogForAdmin,
  mapToQuestionDocs,
  normalizeWithAi,
};
