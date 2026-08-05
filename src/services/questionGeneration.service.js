const Groq = require("groq-sdk");
const questionModel = require("../models/question.model");
const { getExamQuestionProfile, pickQuestionType, ensureOptionCount } = require("../config/examQuestionProfiles");
const { buildPromptForType } = require("./ai/newPatternPrompts");
const {
  formatExamContext,
  loadSiblingTopics,
  SYSTEM_PROMPT,
} = require("./ai/generationContext");
const {
  fingerprintQuestionText,
  isDuplicateAgainstSet,
  passesQualityGate,
} = require("../utils/questionDedupe");

let groqClient = null;
const getGroq = () => {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
};
const BATCH_SIZE = 4;
const MAX_ATTEMPTS = 20;
const REQUEST_TIMEOUT_MS = 50000;
const MAX_GENERATE_COUNT = 20;
const GENERATE_COOLDOWN_MS = 15000;
const VALID_DIFFICULTIES = ["easy", "moderate", "hard"];
const NEW_PATTERN_TYPES = ["statement", "matching", "assertion_reason", "chronology"];
const generateCooldown = new Map();

const NORMAL_PROFILE_OVERRIDE = {
  defaultPattern: "old",
  enabledQuestionTypes: ["direct"],
  typeMix: { direct: 1 },
};

const NEW_PATTERN_PROFILE_OVERRIDE = {
  defaultPattern: "new",
  enabledQuestionTypes: [...NEW_PATTERN_TYPES],
  typeMix: {
    statement: 0.35,
    matching: 0.25,
    assertion_reason: 0.22,
    chronology: 0.18,
  },
};

const sanitizeDifficulty = (value) => {
  const normalized = (value || "").toLowerCase().trim();
  if (VALID_DIFFICULTIES.includes(normalized)) return normalized;
  if (normalized.includes("hard")) return "hard";
  if (normalized.includes("easy")) return "easy";
  return "moderate";
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);

const mergeProfileOverride = (exam, profileOverride) => {
  const base = getExamQuestionProfile(exam);
  if (!profileOverride) return base;
  return {
    ...base,
    ...profileOverride,
    typeMix: profileOverride.typeMix || base.typeMix,
    enabledQuestionTypes: profileOverride.enabledQuestionTypes || base.enabledQuestionTypes,
    markingScheme: base.markingScheme,
  };
};

const profileOverrideForMode = (mode) => {
  if (mode === "new") return NEW_PATTERN_PROFILE_OVERRIDE;
  return NORMAL_PROFILE_OVERRIDE;
};

const assertGenerateCooldown = (userId, topicId) => {
  const key = `${userId}:${topicId}`;
  const last = generateCooldown.get(key) || 0;
  const now = Date.now();
  if (now - last < GENERATE_COOLDOWN_MS) {
    const waitSec = Math.ceil((GENERATE_COOLDOWN_MS - (now - last)) / 1000);
    throw new Error(`Please wait ${waitSec}s before generating more for this topic.`);
  }
  generateCooldown.set(key, now);
};

/** Prefer official/imported stems (+ explanations) as style references. */
const loadReferenceExamples = async (topicId, preferredType) => {
  const typeFilter =
    preferredType && preferredType !== "auto" ? { questionType: preferredType } : {};

  const preferred = await questionModel
    .find({
      topicId,
      source: { $in: ["previous-paper", "admin"] },
      ...typeFilter,
    })
    .select("questionText options questionType source explanation")
    .sort({ updatedAt: -1 })
    .limit(8)
    .lean();

  let docs = preferred;
  if (docs.length < 3) {
    const more = await questionModel
      .find({ topicId })
      .select("questionText options questionType source explanation")
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
    const seen = new Set(docs.map((d) => String(d._id)));
    for (const d of more) {
      if (seen.has(String(d._id))) continue;
      docs.push(d);
      if (docs.length >= 6) break;
    }
  }

  const rank = (d) => {
    let s = 0;
    if (d.source === "previous-paper") s += 4;
    if (d.source === "admin") s += 3;
    if (preferredType && d.questionType === preferredType) s += 2;
    if (d.explanation && d.explanation.length > 40) s += 1;
    return s;
  };

  return [...docs]
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 5)
    .map((d) => ({
      questionText: d.questionText,
      options: d.options,
      questionType: d.questionType,
      source: d.source,
      explanation: d.explanation,
    }));
};

const buildExamContextCached = async (exam, topic, cache) => {
  if (cache.examContext) return cache.examContext;
  const siblings = await loadSiblingTopics(exam._id, topic);
  cache.examContext = formatExamContext(exam, topic, siblings);
  return cache.examContext;
};

const generateQuestionsWithGroq = async (
  exam,
  topic,
  count,
  existingTexts,
  questionType,
  profileOverride,
  referenceExamples = [],
  examContext = ""
) => {
  const profile = mergeProfileOverride(exam, profileOverride);
  const type = pickQuestionType(profile, questionType);
  const avoidList = existingTexts.slice(-60);
  const prompt = buildPromptForType(type, {
    exam,
    topic,
    count,
    profile,
    avoidList,
    referenceExamples,
    examContext,
  });

  const temperature = type === "direct" ? 0.45 : 0.3;

  const completion = await withTimeout(
    getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature,
      max_tokens: 4096,
    }),
    REQUEST_TIMEOUT_MS,
    `Groq call for topic "${topic.name}" type "${type}"`
  );

  const text = completion.choices[0].message.content.replace(/```json|```/g, "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  return { structured: parsed, questionType: type, profile };
};

const toQuestionDoc = (q, exam, topic, resolvedType, batchProfile, createdBy = null) => {
  const options = ensureOptionCount(q.options, batchProfile);
  let correctAnswer = q.correctAnswer;
  if (correctAnswer?.length === 1 && /^[A-E]$/i.test(correctAnswer)) {
    const idx = correctAnswer.toUpperCase().charCodeAt(0) - 65;
    if (options[idx]) correctAnswer = options[idx];
  }
  if (!options.includes(correctAnswer)) {
    const hit = options.find((o) => o.trim() === String(correctAnswer || "").trim());
    if (hit) correctAnswer = hit;
  }
  return {
    examId: exam._id,
    topicId: topic._id,
    questionText: q.questionText.trim(),
    options,
    correctAnswer,
    explanation: q.explanation,
    referenceLinks: [],
    difficulty: sanitizeDifficulty(q.difficulty),
    pattern: batchProfile.defaultPattern || "new",
    questionType: resolvedType || q.questionType || "direct",
    source: "ai",
    createdBy: createdBy || null,
  };
};

const filterFreshQuestions = (rawQuestions, resolvedType, fingerprints, optionCount = 4) => {
  const fresh = [];
  for (const q of rawQuestions) {
    if (!passesQualityGate(q, resolvedType, optionCount)) continue;
    if (isDuplicateAgainstSet(q.questionText, fingerprints)) continue;

    const fp = fingerprintQuestionText(q.questionText);
    fingerprints.add(fp);
    fresh.push(q);
  }
  return fresh;
};

const generateQuestionsForTopic = async (topic, exam, requestedCount, opts = {}) => {
  const questionType = opts.questionType || "auto";
  const profileOverride = opts.profileOverride || null;
  const createdBy = opts.createdBy || null;
  const profile = mergeProfileOverride(exam, profileOverride);
  const ctxCache = {};

  const existingDocs = await questionModel
    .find({ topicId: topic._id })
    .select("questionText")
    .lean();
  const fingerprints = new Set(
    existingDocs.map((d) => fingerprintQuestionText(d.questionText)).filter(Boolean)
  );
  const avoidTexts = existingDocs.map((d) => d.questionText.trim()).filter(Boolean);
  let currentTotal = existingDocs.length;

  if (currentTotal >= requestedCount && !opts.force) {
    return { inserted: 0, finalCount: currentTotal, skipped: true };
  }

  let totalInserted = 0;
  let attempts = 0;
  const target = opts.force ? requestedCount : requestedCount - currentTotal;

  const rotateTypes =
    questionType === "auto" &&
    profile.defaultPattern === "new" &&
    (profile.enabledQuestionTypes || []).some((t) => t !== "direct");
  let typeCursor = 0;

  while (totalInserted < target && attempts < MAX_ATTEMPTS) {
    attempts++;
    const thisBatchSize = Math.min(BATCH_SIZE, target - totalInserted);
    const forcedType = rotateTypes
      ? NEW_PATTERN_TYPES[typeCursor % NEW_PATTERN_TYPES.length]
      : questionType;
    if (rotateTypes) typeCursor++;

    const examContext = await buildExamContextCached(exam, topic, ctxCache);
    const referenceExamples = await loadReferenceExamples(
      topic._id,
      forcedType === "auto" ? null : forcedType
    );

    let result;
    try {
      result = await generateQuestionsWithGroq(
        exam,
        topic,
        thisBatchSize,
        avoidTexts,
        forcedType,
        profileOverride,
        referenceExamples,
        examContext
      );
    } catch {
      try {
        result = await generateQuestionsWithGroq(
          exam,
          topic,
          Math.min(2, thisBatchSize),
          avoidTexts,
          forcedType,
          profileOverride,
          referenceExamples,
          examContext
        );
      } catch {
        continue;
      }
    }

    const { structured, questionType: resolvedType, profile: batchProfile } = result;
    const freshQuestions = filterFreshQuestions(
      structured.questions || [],
      resolvedType,
      fingerprints,
      batchProfile.optionCount || 4
    );

    const questionDocs = [];
    for (const q of freshQuestions) {
      const doc = toQuestionDoc(q, exam, topic, resolvedType, batchProfile, createdBy);
      if (!doc.correctAnswer || !doc.options.includes(doc.correctAnswer)) continue;
      questionDocs.push(doc);
      avoidTexts.push(doc.questionText);
    }

    if (questionDocs.length > 0) {
      try {
        await questionModel.insertMany(questionDocs, { ordered: false });
        totalInserted += questionDocs.length;
        currentTotal += questionDocs.length;
      } catch {
        /* duplicate key / partial insert ok */
      }
    }
  }

  return {
    inserted: totalInserted,
    finalCount: currentTotal,
    skipped: false,
    preview: [],
  };
};

/** Shared bank fill: any logged-in user. Always inserts new AI questions. */
const generateSharedTopicQuestions = async (exam, topic, { mode, count, userId }) => {
  const capped = Math.min(Math.max(Number(count) || 10, 10), MAX_GENERATE_COUNT);
  const resolvedMode = ["normal", "new", "mixed"].includes(mode) ? mode : "normal";
  if (userId) assertGenerateCooldown(userId, topic._id);

  if (resolvedMode === "mixed") {
    const half = Math.floor(capped / 2);
    const rest = capped - half;
    let inserted = 0;
    let finalCount = 0;
    if (half > 0) {
      const normalResult = await generateQuestionsForTopic(topic, exam, half, {
        force: true,
        questionType: "direct",
        profileOverride: profileOverrideForMode("normal"),
        createdBy: userId,
      });
      inserted += normalResult.inserted;
      finalCount = normalResult.finalCount;
    }
    if (rest > 0) {
      const newResult = await generateQuestionsForTopic(topic, exam, rest, {
        force: true,
        questionType: "auto",
        profileOverride: profileOverrideForMode("new"),
        createdBy: userId,
      });
      inserted += newResult.inserted;
      finalCount = newResult.finalCount;
    }
    return {
      inserted,
      finalCount,
      mode: resolvedMode,
      skipped: false,
    };
  }

  const result = await generateQuestionsForTopic(topic, exam, capped, {
    force: true,
    questionType: resolvedMode === "new" ? "auto" : "direct",
    profileOverride: profileOverrideForMode(resolvedMode),
    createdBy: userId,
  });
  return { ...result, mode: resolvedMode };
};

/** Admin API: generate N questions for a topic, return preview. */
const generateQuestionsForAdmin = async (exam, topic, count, questionType = "auto", userId = null) => {
  const profile = getExamQuestionProfile(exam);
  const existingDocs = await questionModel
    .find({ topicId: topic._id })
    .select("questionText")
    .lean();
  const fingerprints = new Set(
    existingDocs.map((d) => fingerprintQuestionText(d.questionText)).filter(Boolean)
  );
  const avoidTexts = existingDocs.map((d) => d.questionText);

  const siblings = await loadSiblingTopics(exam._id, topic);
  const examContext = formatExamContext(exam, topic, siblings);
  const referenceExamples = await loadReferenceExamples(
    topic._id,
    questionType === "auto" ? null : questionType
  );
  const result = await generateQuestionsWithGroq(
    exam,
    topic,
    count,
    avoidTexts,
    questionType,
    null,
    referenceExamples,
    examContext
  );
  const { structured, questionType: resolvedType, profile: batchProfile } = result;

  const fresh = filterFreshQuestions(
    structured.questions || [],
    resolvedType,
    fingerprints,
    batchProfile.optionCount || 4
  );
  const questionDocs = [];
  for (const q of fresh) {
    const doc = toQuestionDoc(q, exam, topic, resolvedType, batchProfile, userId);
    if (!doc.correctAnswer || !doc.options.includes(doc.correctAnswer)) continue;
    questionDocs.push(doc);
  }

  if (questionDocs.length > 0) {
    const inserted = await questionModel.insertMany(questionDocs, { ordered: false });
    return {
      inserted: inserted.length,
      preview: inserted.map((d) => ({
        _id: d._id,
        questionType: d.questionType,
        questionText: d.questionText.slice(0, 120),
        options: d.options,
      })),
      profile: {
        optionCount: profile.optionCount,
        defaultPattern: profile.defaultPattern,
      },
    };
  }

  return { inserted: 0, preview: [], profile: { optionCount: profile.optionCount } };
};

module.exports = {
  generateQuestionsForTopic,
  generateQuestionsForAdmin,
  generateQuestionsWithGroq,
  generateSharedTopicQuestions,
  MAX_GENERATE_COUNT,
};
