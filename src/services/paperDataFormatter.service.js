/**
 * Standard paper JSON shape (like paper_data.json) for review and publish.
 */
const mapQuestionToPaperData = (q) => ({
  qNo: q.qNo,
  questionText: q.questionText,
  options: q.options,
  correctAnswer: q.correctAnswer,
  topicId: q.topicId?.toString?.() ?? q.topicId,
  questionMedia: q.questionMedia || undefined,
  optionMedia: q.optionMedia || undefined,
  answerMode: q.answerMode || "text",
});

const toPaperDataJson = ({
  catalog,
  extractionMethod,
  stats,
  questionDocs,
  providerAttempts = [],
}) => ({
  catalogId: catalog._id?.toString(),
  title: catalog.rsmssbTitle,
  year: catalog.year,
  setCode: catalog.setCode || "",
  questionPdfUrl: catalog.questionPdfUrl,
  answerKeyPdfUrl: catalog.answerKeyPdfUrl,
  extractionMethod: extractionMethod || null,
  stats: stats || {},
  providerAttempts,
  questions: (questionDocs || []).map(mapQuestionToPaperData),
});

/** Rebuild DB insert docs from stored paperData (no re-OCR). */
const questionDocsFromPaperData = (paperData, exam, catalog) => {
  const year = catalog.year;
  const refs = [catalog.questionPdfUrl, catalog.answerKeyPdfUrl];
  return (paperData?.questions || [])
    .filter((q) => q.options?.length === 4 && q.correctAnswer && q.topicId)
    .map((q) => ({
      examId: exam._id,
      topicId: q.topicId,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: `Official RSSB previous-year paper (${year}) — ${exam.name}. Source: Rajasthan RSSB.`,
      referenceLinks: refs,
      difficulty: "moderate",
      pattern: "old",
      source: "previous-paper",
      year,
      qNo: q.qNo,
      questionMedia: q.questionMedia || undefined,
      optionMedia: q.optionMedia || undefined,
      answerMode: q.answerMode || "text",
    }));
};

/** Prefer complete records when merging re-extract with existing paperData. */
const mergeQuestionDocsByQNo = (existing = [], incoming = []) => {
  const map = new Map();
  const put = (q) => {
    if (!q?.qNo) return;
    const prev = map.get(q.qNo);
    if (!prev) {
      map.set(q.qNo, q);
      return;
    }
    const score = (x) =>
      (x.correctAnswer ? 4 : 0) +
      (x.questionMedia?.url ? 3 : 0) +
      (x.optionMedia?.length ? 2 : 0) +
      (x.questionText?.length || 0) / 100;
    if (score(q) >= score(prev)) map.set(q.qNo, q);
  };
  for (const q of existing) put(q);
  for (const q of incoming) put(q);
  return [...map.values()].sort((a, b) => a.qNo - b.qNo);
};

const mergePaperDataQuestions = (existing = [], incoming = []) =>
  mergeQuestionDocsByQNo(existing, incoming);

const getMissingQNos = (questions, expectedTotal = 150) => {
  const have = new Set((questions || []).map((q) => q.qNo).filter(Boolean));
  const missing = [];
  for (let i = 1; i <= expectedTotal; i++) {
    if (!have.has(i)) missing.push(i);
  }
  return missing;
};

module.exports = {
  toPaperDataJson,
  questionDocsFromPaperData,
  mergeQuestionDocsByQNo,
  mergePaperDataQuestions,
  getMissingQNos,
  mapQuestionToPaperData,
};
