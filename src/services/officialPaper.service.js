const attemptModel = require("../models/attempt.model");
const quizModel = require("../models/quiz.model");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const { getProviderMeta } = require("./ai/providerMeta");

const mapImportedQuizToPaper = (quiz, attempt) => ({
  catalogId: null,
  quizId: quiz._id,
  title: quiz.title,
  year: quiz.year || new Date(quiz.createdAt).getFullYear(),
  setCode: quiz.setCode ?? null,
  status: "published",
  currentStage: null,
  extractionMethod: "admin-import",
  extractionLabel: "Admin import",
  extractionModel: null,
  activeProvider: null,
  activeModel: null,
  questionPdfUrl: quiz.sourceUrls?.questionPdf ?? null,
  answerKeyPdfUrl: quiz.sourceUrls?.answerKeyPdf ?? null,
  totalQuestions: quiz.questions?.length || 0,
  durationMinutes: quiz.durationMinutes || 120,
  publishedAt: quiz.createdAt,
  attempted: !!attempt,
  lastScore: attempt?.score ?? null,
  lastScorePercent: attempt?.scorePercent ?? null,
  lastAttemptId: attempt?._id ?? null,
  importSource: "admin-import",
});

const listPapersForExam = async (examId, userId, { isAdmin = false } = {}) => {
  const catalogs = await officialPaperCatalogModel
    .find({
      examId,
      status: { $in: ["linked", "extracting", "extracted", "published", "failed", "pending"] },
    })
    .sort({ year: -1, setCode: 1 })
    .lean();

  const publishedQuizIds = catalogs
    .filter((c) => c.status === "published" && c.quizId)
    .map((c) => c.quizId);

  const quizzes = await quizModel.find({ _id: { $in: publishedQuizIds } }).lean();
  const quizMap = new Map(quizzes.map((q) => [String(q._id), q]));

  const attempts = await attemptModel
    .find({ quizId: { $in: publishedQuizIds }, userId })
    .sort({ submittedAt: -1 })
    .lean();

  const latestByQuiz = new Map();
  for (const a of attempts) {
    const key = String(a.quizId);
    if (!latestByQuiz.has(key)) latestByQuiz.set(key, a);
  }

  const catalogRows = catalogs.map((c) => {
    const quiz = c.quizId ? quizMap.get(String(c.quizId)) : null;
    const attempt = c.quizId ? latestByQuiz.get(String(c.quizId)) : null;
    const attempted = !!attempt;
    const showAnswerKey = isAdmin || attempted;

    const extractionMeta = c.extractionMethod ? getProviderMeta(c.extractionMethod) : null;

    return {
      catalogId: c._id,
      quizId: c.quizId ?? null,
      title: quiz?.title || c.rsmssbTitle,
      year: c.year,
      setCode: c.setCode,
      status: c.status,
      currentStage: c.currentStage,
      extractionMethod: c.extractionMethod,
      extractionLabel: extractionMeta?.label ?? null,
      extractionModel: extractionMeta?.model ?? null,
      activeProvider: c.activeProvider ?? null,
      activeModel: c.activeModel ?? null,
      questionPdfUrl: c.questionPdfUrl,
      answerKeyPdfUrl: showAnswerKey ? c.answerKeyPdfUrl : null,
      totalQuestions:
        quiz?.questions?.length || c.paperData?.questions?.length || 0,
      durationMinutes: quiz?.durationMinutes || 120,
      publishedAt: c.syncedAt,
      attempted,
      lastScore: attempt?.score ?? null,
      lastScorePercent: attempt?.scorePercent ?? null,
      lastAttemptId: attempt?._id ?? null,
      errorMessage: isAdmin ? c.errorMessage : null,
      stageLogs: isAdmin ? (c.stageLogs || []).slice(-20) : undefined,
      providerAttempts: isAdmin ? (c.providerAttempts || []).slice(-20) : undefined,
      paperData: isAdmin ? c.paperData : undefined,
      stats: isAdmin ? c.stats : undefined,
      pageProgress: isAdmin ? c.pageProgress : undefined,
    };
  });

  const catalogQuizIdSet = new Set(
    catalogs.filter((c) => c.quizId).map((c) => String(c.quizId))
  );

  const importedQuizzes = await quizModel
    .find({
      examId,
      type: "official-paper",
      questions: { $exists: true, $not: { $size: 0 } },
    })
    .sort({ year: -1, setCode: 1, createdAt: -1 })
    .lean();

  const standaloneImports = importedQuizzes.filter(
    (q) => !catalogQuizIdSet.has(String(q._id))
  );

  const importQuizIds = standaloneImports.map((q) => q._id);
  const importAttempts = importQuizIds.length
    ? await attemptModel
        .find({ quizId: { $in: importQuizIds }, userId })
        .sort({ submittedAt: -1 })
        .lean()
    : [];

  for (const a of importAttempts) {
    const key = String(a.quizId);
    if (!latestByQuiz.has(key)) latestByQuiz.set(key, a);
  }

  const importRows = standaloneImports.map((q) =>
    mapImportedQuizToPaper(q, latestByQuiz.get(String(q._id)))
  );

  const publishedSetKeys = new Set(
    catalogRows
      .filter((c) => c.status === "published" && c.quizId)
      .map((c) => `${c.year}:${String(c.setCode || "").toUpperCase()}`)
  );

  const filteredCatalogRows = catalogRows.filter((c) => {
    const key = `${c.year}:${String(c.setCode || "").toUpperCase()}`;
    if (c.status === "failed" && publishedSetKeys.has(key)) return false;
    return true;
  });

  const filteredImportRows = importRows.filter((p) => {
    const key = `${p.year}:${String(p.setCode || "").toUpperCase()}`;
    return !publishedSetKeys.has(key);
  });

  return [...filteredCatalogRows, ...filteredImportRows].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return String(a.setCode || "").localeCompare(String(b.setCode || ""));
  });
};

module.exports = {
  listPapersForExam,
};
