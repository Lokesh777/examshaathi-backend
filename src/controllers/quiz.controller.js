// controllers/quiz.controller.js
const { getOrCreateTopicQuiz } = require("../services/quiz.service");
const { submitAttempt } = require("../services/attempt.service");
const { getQuizLeaderboard } = require("../services/leaderboard.service");
const { getOrCreateRealPaperMock } = require("../services/mockPaper.service");
const {
  createRealPaperMock,
  getRealPaperMockById,
  listRealPaperMocks,
  renameRealPaperMock,
} = require("../services/mockPaper.service");
const quizModel = require("../models/quiz.model");

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

    const { attempt, summary, resultDetails } = await submitAttempt(
      userId,
      quizId,
      answers,
      timeTakenSeconds
    );

    res.json({
      success: true,
      attemptId: attempt._id,
      summary,
      results: resultDetails,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
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

// const getRealPaperMock = async (req, res) => {
//   try {
//     const { examId } = req.params;
//     const { quiz, questions, shortfalls } = await getOrCreateRealPaperMock(examId);

//     res.json({
//       success: true,
//       quizId: quiz._id,
//       totalQuestions: questions.length,
//       questions,
//       shortfalls, // frontend/admin ko dikha sakte ho "bank still filling up" jaisa
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };



// const getQuizBasedOnQuizId = async (req, res) => {
//   try {
//     const { quizId } = req.params;

//     // Assuming you have a service function to fetch quiz by ID
//     const quiz = await quizModel.findById(quizId).populate('questions');

//     if (!quiz) {
//       return res.status(404).json({ success: false, message: 'Quiz not found' });
//     }

//     res.json({ success: true, quiz });
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).json({ success: false, message: err.message });
//   }
// }

// POST /api/quiz/exams/:examId/real-paper  → creates a NEW named paper ("Start Mock Test")
const createRealPaperMockHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const { title } = req.body; // optional, user can name it later via rename too
    const userId = req.user._id || req.user.id;

    const { quiz, questions, shortfalls } = await createRealPaperMock(examId, userId, title);
    res.json({ success: true, quizId: quiz._id, title: quiz.title, totalQuestions: questions.length, questions, shortfalls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/quiz/exams/:examId/real-paper  → LIST all named papers (Real Paper tab landing)
const listRealPaperMocksHandler = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const data = await listRealPaperMocks(examId, userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/quiz/quizzes/:quizId  → serve frozen questions of an EXISTING paper (retake)
const getQuizBasedOnQuizId = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { quiz, questions } = await getRealPaperMockById(quizId);
    res.json({ success: true, quizId: quiz._id, title: quiz.title, totalQuestions: questions.length, questions });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

// PATCH /api/quiz/quizzes/:quizId  → rename ("Sample Paper 1" → custom name)
const renameQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { title } = req.body;
    const userId = req.user._id || req.user.id;
    const quiz = await renameRealPaperMock(quizId, userId, title);
    res.json({ success: true, quizId: quiz._id, title: quiz.title });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


module.exports = {
  getTopicQuiz,
  submitQuizAttempt,
  getLeaderboard,
  // getRealPaperMock,
  getRealPaperMock: createRealPaperMockHandler, // if you want to keep old name for the POST
  listRealPaperMocksHandler,
  getQuizBasedOnQuizId,
  renameQuiz,
 };


