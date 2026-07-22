// controllers/quiz.controller.js
const { getOrCreateTopicQuiz } = require("../services/quiz.service");
const { submitAttempt } = require("../services/attempt.service");
const { getQuizLeaderboard } = require("../services/leaderboard.service");
const { getOrCreateRealPaperMock } = require("../services/mockPaper.service");

const getTopicQuiz = async (req, res) => {
  try {
    const { examId, topicId } = req.params;
    const count = parseInt(req.query.count) || 20;

    const { quiz, questions } = await getOrCreateTopicQuiz(examId, topicId, count);
    res.json({ success: true, quizId: quiz._id, questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const submitQuizAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers, timeTakenSeconds } = req.body;
    const userId = req.user._id || req.user.id;

    const { attempt, resultDetails } = await submitAttempt(
      userId,
      quizId,
      answers,
      timeTakenSeconds
    );

    res.json({
      success: true,
      attemptId: attempt._id,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      scorePercent: attempt.scorePercent,
      results: resultDetails, // full breakdown — answers + explanations, shown AFTER submit
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id || req.user.id;

    const result = await getQuizLeaderboard(quizId, userId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getRealPaperMock = async (req, res) => {
  try {
    const { examId } = req.params;
    const { quiz, questions, shortfalls } = await getOrCreateRealPaperMock(examId);

    res.json({
      success: true,
      quizId: quiz._id,
      totalQuestions: questions.length,
      questions,
      shortfalls, // frontend/admin ko dikha sakte ho "bank still filling up" jaisa
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
module.exports = { getTopicQuiz, submitQuizAttempt, getLeaderboard, getRealPaperMock };