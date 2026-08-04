/**
 * Adapts alternate import JSON shapes (e.g. CET Q13 export) to canonical question rows.
 */

const extractYear = (examDate) => {
  if (examDate == null) return null;
  const m = String(examDate).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
};

const optionsToArray = (options) => {
  if (Array.isArray(options)) return options.map((o) => String(o).trim()).filter(Boolean);
  if (options && typeof options === "object") {
    return ["A", "B", "C", "D", "E"]
      .map((l) => options[l] ?? options[l.toLowerCase()])
      .filter((v) => v != null && String(v).trim() !== "");
  }
  return [];
};

const letterToOptionText = (letter, options) => {
  if (!letter || !options?.length) return null;
  const idx = String(letter).trim().toUpperCase().charCodeAt(0) - 65;
  return options[idx] || null;
};

const resolveCorrectAnswer = (q, options) => {
  const raw =
    q.correctAnswer ??
    q.correct_answer_text ??
    q.correct_answer ??
    q.correctAnswerText ??
    "";

  if (raw == null || raw === "") return "";

  const trimmed = String(raw).trim();
  if (/^[A-E]$/i.test(trimmed)) {
    return letterToOptionText(trimmed, options) || trimmed;
  }
  return trimmed;
};

/** One question row → canonical shape used by validation. */
const canonicalizeQuestionRow = (q, rootDefaults = {}) => {
  const qNo = q.qNo ?? q.q_no ?? q.qno ?? null;
  const questionText =
    q.questionText || q.question || q.question_text || q.questionTextEng || "";
  const options = optionsToArray(q.options);

  return {
    qNo,
    questionText: String(questionText).trim(),
    options,
    correctAnswer: resolveCorrectAnswer(q, options),
    explanation:
      q.explanation?.trim() ||
      q.explanationEng?.trim() ||
      q.explanation_eng?.trim() ||
      "—",
    topicNumber:
      q.topicNumber ?? q.topic_number ?? rootDefaults.topicNumber ?? null,
    topicName: q.topicName ?? q.topic_name ?? rootDefaults.topicName ?? null,
    topicId: q.topicId ?? null,
    questionType: q.questionType || "direct",
    difficulty: q.difficulty || "moderate",
    answerMode: q.answerMode || "text",
  };
};

/** Full payload → { title, year, setCode, questions[] } in canonical form. */
const buildCanonicalPayload = (payload) => {
  if (payload._rawText) return payload;

  const rootDefaults = {
    topicNumber:
      payload.defaultTopicNumber ?? payload.default_topic_number ?? null,
    topicName: payload.defaultTopicName ?? payload.default_topic_name ?? null,
  };

  const rawQuestions = payload.questions || (Array.isArray(payload) ? payload : []);
  const answerMap = payload.answers || payload.answerKey || null;

  const questions = rawQuestions.map((q) => {
    const row = canonicalizeQuestionRow(q, rootDefaults);
    const qNum = row.qNo;
    if ((!row.correctAnswer || /^[A-E]$/i.test(row.correctAnswer)) && answerMap && qNum != null) {
      const ans = answerMap[String(qNum)];
      if (ans) {
        const fromLetter = letterToOptionText(ans, row.options);
        row.correctAnswer = fromLetter || String(ans).trim();
      }
    }
    if (/^[A-E]$/i.test(row.correctAnswer)) {
      const fromLetter = letterToOptionText(row.correctAnswer, row.options);
      if (fromLetter) row.correctAnswer = fromLetter;
    }
    return row;
  });

  return {
    title: payload.title || payload.exam_name || payload.examName || null,
    year: payload.year || extractYear(payload.exam_date || payload.examDate) || null,
    setCode: payload.setCode || payload.paper_code || payload.paperCode || null,
    durationMinutes: payload.durationMinutes ?? null,
    totalQuestions: payload.total_questions ?? payload.totalQuestions ?? questions.length,
    questions,
  };
};

const questionsMissingTopic = (questions) =>
  questions.some((q) => !q.topicName && (q.topicNumber == null || q.topicNumber === ""));

module.exports = {
  buildCanonicalPayload,
  canonicalizeQuestionRow,
  optionsToArray,
  questionsMissingTopic,
};
