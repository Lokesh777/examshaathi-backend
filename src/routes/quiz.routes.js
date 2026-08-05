const express = require("express");
const rateLimit = require("express-rate-limit");
const quizController = require("../controllers/quiz.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 6 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many generate requests. Wait a minute." },
});

router.get(
    "/exams/:examId/daily",
    verifyUser,
    quizController.getDailyChallenge
);

router.get(
    "/exams/:examId/streak",
    verifyUser,
    quizController.getDailyStreak
);

router.get(
    "/exams/:examId/topics/:topicId/quizzes",
    verifyUser,
    quizController.listTopicQuizzes
);

router.get(
    "/exams/:examId/topics/:topicId/questions",
    verifyUser,
    quizController.listTopicQuestions
);

router.post(
    "/exams/:examId/topics/:topicId/quiz",
    verifyUser,
    quizController.getTopicQuiz
);

// Legacy GET still creates a practice quiz (same as POST)
router.get(
    "/exams/:examId/topics/:topicId/quiz",
    verifyUser,
    quizController.getTopicQuiz
);

router.post(
    "/exams/:examId/topics/:topicId/generate",
    verifyUser,
    generateLimiter,
    quizController.generateTopicQuestions
);

router.delete(
    "/questions/:questionId",
    verifyUser,
    quizController.deleteQuestion
);

router.post(
    "/quizzes/:quizId/attempt",
    verifyUser,
    quizController.submitQuizAttempt
);

router.get(
    "/quizzes/:quizId/leaderboard",
    verifyUser,
    quizController.getLeaderboard
);

router.get("/quizzes/:quizId", verifyUser, quizController.getQuizBasedOnQuizId);

router.delete(
    "/quizzes/:quizId",
    verifyUser,
    quizController.deleteQuiz
);

router.get(
    "/exams/:examId/real-paper",
    verifyUser,
    quizController.listRealPaperMocksHandler
);

router.post(
    "/exams/:examId/real-paper",
    verifyUser,
    quizController.getRealPaperMock
);

router.patch(
    "/quizzes/:quizId",
    verifyUser,
    quizController.renameQuiz
);

module.exports = router;
