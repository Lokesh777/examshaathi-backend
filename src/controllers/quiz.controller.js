// controllers/quiz.controller.js
const {
  createTopicPracticeQuiz,
  listTopicPracticeQuizzes,
  deleteQuizForUser,
  listTopicBankQuestions,
  deleteQuestionForUser,
} = require("../services/quiz.service");
const { submitAttempt } = require("../services/attempt.service");
const { getQuizLeaderboard } = require("../services/leaderboard.service");
const { getOrCreateRealPaperMock } = require("../services/mockPaper.service");
const {
  createRealPaperMock,
  getRealPaperMockById,
  listRealPaperMocks,
  renameRealPaperMock,
} = require("../services/mockPaper.service");
const { generateSharedTopicQuestions } = require("../services/questionGeneration.service");
const {
  getOrCreateDailyChallenge,
  getStreakSummary,
} = require("../services/dailyChallenge.service");
const quizModel = require("../models/quiz.model");
const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const getTopicQuiz = async (req, res) => {
  try {
    const { examId, topicId } = req.params;
    const count = parseInt(req.query.count) || 20;
    const userId = req.user._id || req.user.id;

    const { quiz, questions } = await createTopicPracticeQuiz(
      examId,
      topicId,
      userId,
      count
    );
    res.json({
      success: true,
      quizId: quiz._id,
      title: quiz.title,
      totalQuestions: questions.length,
      durationMinutes: quiz.durationMinutes,
      questions,
    });
  } catch (err) {
    const status = /No questions|No unique/i.test(err.message || "") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

const listTopicQuizzes = async (req, res) => {
  try {
    const { examId, topicId } = req.params;
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user?.role === "admin";
    const data = await listTopicPracticeQuizzes(examId, topicId, userId, isAdmin);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listTopicQuestions = async (req, res) => {
  try {
    const { examId, topicId } = req.params;
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user?.role === "admin";
    const data = await listTopicBankQuestions(examId, topicId, userId, isAdmin);
    res.json({ success: true, data, scope: isAdmin ? "all" : "mine" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user?.role === "admin";
    const result = await deleteQuizForUser(quizId, userId, isAdmin);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = /Not allowed|not found/i.test(err.message || "") ? 403 : 500;
    const code = /not found/i.test(err.message || "") ? 404 : status;
    res.status(code === 404 ? 404 : status).json({ success: false, message: err.message });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user._id || req.user.id;
    const isAdmin = req.user?.role === "admin";
    const result = await deleteQuestionForUser(questionId, userId, isAdmin);
    res.json({ success: true, ...result });
  } catch (err) {
    const notFound = /not found/i.test(err.message || "");
    const forbidden = /Not allowed/i.test(err.message || "");
    res.status(notFound ? 404 : forbidden ? 403 : 500).json({ success: false, message: err.message });
  }
};

const generateTopicQuestions = async (req, res) => {
  try {
    const { examId, topicId } = req.params;
    const { mode = "normal", count = 10 } = req.body || {};
    if (!["normal", "new", "mixed"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'mode must be "normal", "new", or "mixed"',
      });
    }

    const exam = await examModel.findById(examId);
    const topic = await topicModel.findById(topicId);
    if (!exam || !topic) {
      return res.status(404).json({ success: false, message: "Exam or topic not found" });
    }
    if (String(topic.examId) !== String(exam._id)) {
      return res.status(400).json({ success: false, message: "Topic does not belong to this exam" });
    }

    const userId = req.user._id || req.user.id;
    const result = await generateSharedTopicQuestions(exam, topic, {
      mode,
      count,
      userId,
    });

    res.json({
      success: true,
      inserted: result.inserted,
      finalCount: result.finalCount,
      mode: result.mode,
      topicId: topic._id,
    });
  } catch (err) {
    const status = /Please wait/i.test(err.message || "") ? 429 : 500;
    res.status(status).json({ success: false, message: err.message });
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
    const { estimateDurationMinutes } = require("../utils/quizTiming");

    let durationMinutes = quiz.durationMinutes ?? null;
    // Never fall back to full-paper time for short topic/daily sets
    if (
      durationMinutes == null ||
      quiz.type === "topic-wise" ||
      quiz.type === "daily-challenge"
    ) {
      const exam = quiz.examId
        ? await examModel.findById(quiz.examId).select("pattern").lean()
        : null;
      const scaled = estimateDurationMinutes(questions.length, exam);
      if (durationMinutes == null || durationMinutes > scaled * 1.5) {
        durationMinutes = scaled;
      }
    }

    res.json({
      success: true,
      quizId: quiz._id,
      title: quiz.title,
      totalQuestions: questions.length,
      durationMinutes,
      questions,
    });
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

const getDailyChallenge = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const data = await getOrCreateDailyChallenge(examId, userId);
    res.json({ success: true, ...data });
  } catch (err) {
    const status = /No questions/i.test(err.message || "") ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

const getDailyStreak = async (req, res) => {
  try {
    const { examId } = req.params;
    const userId = req.user._id || req.user.id;
    const data = await getStreakSummary(examId, userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getTopicQuiz,
  listTopicQuizzes,
  listTopicQuestions,
  deleteQuiz,
  deleteQuestion,
  generateTopicQuestions,
  submitQuizAttempt,
  getLeaderboard,
  // getRealPaperMock,
  getRealPaperMock: createRealPaperMockHandler, // if you want to keep old name for the POST
  listRealPaperMocksHandler,
  getQuizBasedOnQuizId,
  renameQuiz,
  getDailyChallenge,
  getDailyStreak,
};


