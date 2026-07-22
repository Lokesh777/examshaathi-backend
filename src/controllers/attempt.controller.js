const attemptModel = require("../models/attempt.model");

// GET /api/quiz/attempts?examId=xxx&type=real-paper
const getMyAttempts = async (req, res) => {
  try {
    const userId = req.user._id; // from your auth middleware
    const { examId, type } = req.query;

    const match = { userId };
    if (examId) match.examId = examId;

    let attempts = await attemptModel.find(match)
      .sort({ submittedAt: -1 }) // newest first
      .populate({ path: "quizId", select: "title type topicId examId" })
      .lean();

    if (type) {
      attempts = attempts.filter((a) => a.quizId?.type === type);
    }

    const data = attempts.map((a) => ({
      attemptId: a._id,
      quizId: a.quizId?._id,
      quizTitle: a.quizId?.title,
      quizType: a.quizId?.type, // "topic-wise" | "real-paper"
      score: a.score,
      totalQuestions: a.answers?.length ?? 0,
      scorePercent: a.scorePercent,
      timeTakenSeconds: a.timeTakenSeconds,
      submittedAt: a.submittedAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch attempts" });
  }
};


// GET /api/quiz/attempts/:attemptId
const getAttemptDetail = async (req, res) => {
  try {
    const userId = req.user._id;
    const { attemptId } = req.params;

    const attempt = await attemptModel.findOne({ _id: attemptId, userId }).lean();
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }

    const questionIds = attempt.answers.map((a) => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const results = attempt.answers.map((a) => {
      const q = qMap.get(String(a.questionId));
      return {
        questionId: a.questionId,
        questionText: q?.questionText ?? "",
        options: q?.options ?? [],
        correctAnswer: q?.correctAnswer ?? null,
        explanation: q?.explanation ?? "",
        referenceLinks: q?.referenceLinks ?? [], // adjust field name if yours differs
        selectedOption: a.selectedOption,
        isCorrect: a.isCorrect,
      };
    });

    return res.status(200).json({
      success: true,
      attemptId: attempt._id,
      quizId: attempt.quizId,
      score: attempt.score,
      totalQuestions: attempt.answers.length,
      scorePercent: attempt.scorePercent,
      timeTakenSeconds: attempt.timeTakenSeconds,
      submittedAt: attempt.submittedAt,
      results,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch attempt detail" });
  }
};

module.exports = { getMyAttempts, getAttemptDetail };