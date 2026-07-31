const express = require("express");
const quizController = require("../controllers/quiz.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();

router.get(
    "/exams/:examId/topics/:topicId/quiz",
    verifyUser,
    quizController.getTopicQuiz
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

// RETAKE — fetch an existing paper's frozen questions
// (already exists, just make sure controller now uses getRealPaperMockById, not populate('questions') directly —
//  the old populate() leaked correctAnswer/explanation to frontend, this fixes that)
router.get("/quizzes/:quizId", verifyUser, quizController.getQuizBasedOnQuizId)

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