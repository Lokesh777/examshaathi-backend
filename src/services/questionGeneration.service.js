const Groq = require("groq-sdk");
const questionModel = require("../models/question.model");
const { getExamQuestionProfile, pickQuestionType, ensureOptionCount } = require("../config/examQuestionProfiles");
const { buildPromptForType } = require("./ai/newPatternPrompts");

let groqClient = null;
const getGroq = () => {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
};
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 15;
const REQUEST_TIMEOUT_MS = 30000;
const VALID_DIFFICULTIES = ["easy", "moderate", "hard"];

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

const generateQuestionsWithGroq = async (exam, topic, count, existingTexts, questionType) => {
  const profile = getExamQuestionProfile(exam);
  const type = pickQuestionType(profile, questionType);
  const avoidList = existingTexts.slice(-40);
  const prompt = buildPromptForType(type, {
    exam,
    topic,
    count,
    profile,
    avoidList,
  });

  const completion = await withTimeout(
    getGroq().chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
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

const generateQuestionsForTopic = async (topic, exam, requestedCount, opts = {}) => {
  const profile = getExamQuestionProfile(exam);
  const questionType = opts.questionType || "auto";

  const existingDocs = await questionModel
    .find({ topicId: topic._id })
    .select("questionText")
    .lean();
  const seenTexts = new Set(existingDocs.map((d) => d.questionText.trim().toLowerCase()));
  let currentTotal = existingDocs.length;

  if (currentTotal >= requestedCount && !opts.force) {
    return { inserted: 0, finalCount: currentTotal, skipped: true };
  }

  let totalInserted = 0;
  let attempts = 0;
  const target = opts.force ? requestedCount : requestedCount - currentTotal;

  while (totalInserted < target && attempts < MAX_ATTEMPTS) {
    attempts++;
    const thisBatchSize = Math.min(BATCH_SIZE, target - totalInserted);

    let result;
    try {
      result = await generateQuestionsWithGroq(
        exam,
        topic,
        thisBatchSize,
        Array.from(seenTexts),
        questionType
      );
    } catch (err) {
      try {
        result = await generateQuestionsWithGroq(
          exam,
          topic,
          thisBatchSize,
          Array.from(seenTexts),
          questionType
        );
      } catch {
        continue;
      }
    }

    const { structured, questionType: resolvedType, profile: batchProfile } = result;
    const validQuestions = (structured.questions || []).filter(
      (q) => q.explanation && q.explanation.trim().length > 0 && q.questionText
    );

    const freshQuestions = [];
    for (const q of validQuestions) {
      const key = q.questionText.trim().toLowerCase();
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      freshQuestions.push(q);
    }

    const questionDocs = freshQuestions.map((q) => {
      const options = ensureOptionCount(q.options, batchProfile);
      let correctAnswer = q.correctAnswer;
      if (correctAnswer?.length === 1 && /^[A-E]$/i.test(correctAnswer)) {
        const idx = correctAnswer.toUpperCase().charCodeAt(0) - 65;
        if (options[idx]) correctAnswer = options[idx];
      }
      return {
        examId: exam._id,
        topicId: topic._id,
        questionText: q.questionText,
        options,
        correctAnswer,
        explanation: q.explanation,
        referenceLinks: topic.weightageSourceLinks || [],
        difficulty: sanitizeDifficulty(q.difficulty),
        pattern: batchProfile.defaultPattern || "new",
        questionType: q.questionType || resolvedType || "direct",
        source: "ai",
      };
    });

    if (questionDocs.length > 0) {
      try {
        await questionModel.insertMany(questionDocs, { ordered: false });
        totalInserted += questionDocs.length;
        currentTotal += questionDocs.length;
      } catch {
        /* partial insert ok */
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

/** Admin API: generate N questions for a topic, return preview. */
const generateQuestionsForAdmin = async (exam, topic, count, questionType = "auto") => {
  const profile = getExamQuestionProfile(exam);
  const existingDocs = await questionModel
    .find({ topicId: topic._id })
    .select("questionText")
    .lean();
  const seenTexts = existingDocs.map((d) => d.questionText);

  const result = await generateQuestionsWithGroq(exam, topic, count, seenTexts, questionType);
  const { structured, questionType: resolvedType, profile: batchProfile } = result;

  const validQuestions = (structured.questions || []).filter(
    (q) => q.explanation && q.questionText
  );

  const questionDocs = [];
  for (const q of validQuestions) {
    const key = q.questionText.trim().toLowerCase();
    if (seenTexts.some((t) => t.trim().toLowerCase() === key)) continue;
    const options = ensureOptionCount(q.options, batchProfile);
    let correctAnswer = q.correctAnswer;
    if (correctAnswer?.length === 1 && /^[A-E]$/i.test(correctAnswer)) {
      const idx = correctAnswer.toUpperCase().charCodeAt(0) - 65;
      if (options[idx]) correctAnswer = options[idx];
    }
    questionDocs.push({
      examId: exam._id,
      topicId: topic._id,
      questionText: q.questionText,
      options,
      correctAnswer,
      explanation: q.explanation,
      referenceLinks: topic.weightageSourceLinks || [],
      difficulty: sanitizeDifficulty(q.difficulty),
      pattern: batchProfile.defaultPattern || "new",
      questionType: q.questionType || resolvedType || "direct",
      source: "ai",
    });
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

module.exports = { generateQuestionsForTopic, generateQuestionsForAdmin, generateQuestionsWithGroq };
