const attemptModel = require("../models/attempt.model");
const quizModel = require("../models/quiz.model");
const officialPaperCatalogModel = require("../models/officialPaperCatalog.model");
const { getProviderMeta } = require("./ai/providerMeta");

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

  return catalogs.map((c) => {
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
};

module.exports = {
  listPapersForExam,
};
