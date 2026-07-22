const express = require("express");
const quizController = require("../controllers/quiz.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();


/**
 * @swagger
 * tags:
 *   name: Quiz
 *   description: Quiz and exam related APIs
 */


/**
 * @swagger
 * /api/quiz/exams/{examId}/topics/{topicId}/quiz:
 *   get:
 *     summary: Get topic quiz
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: string
 *         example: 12345
 *
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *         example: 67890
 *
 *     responses:
 *       200:
 *         description: Quiz fetched successfully
 *       404:
 *         description: Quiz not found
 */
router.get(
    "/exams/:examId/topics/:topicId/quiz",
    verifyUser,
    quizController.getTopicQuiz
);



/**
 * @swagger
 * /api/quiz/quizzes/{quizId}/attempt:
 *   post:
 *     summary: Submit quiz attempt
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               answers:
 *                 - questionId: "123"
 *                   answer: "A"
 *
 *     responses:
 *       200:
 *         description: Attempt submitted
 */
router.post(
    "/quizzes/:quizId/attempt",
    verifyUser,
    quizController.submitQuizAttempt
);



/**
 * @swagger
 * /api/quiz/quizzes/{quizId}/leaderboard:
 *   get:
 *     summary: Get quiz leaderboard
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         schema:
 *           type: string
 *
 *     responses:
 *       200:
 *         description: Leaderboard fetched
 */
router.get(
    "/quizzes/:quizId/leaderboard",
    verifyUser,
    quizController.getLeaderboard
);



/**
 * @swagger
 * /api/quiz/exams/{examId}/real-paper:
 *   get:
 *     summary: Get real paper mock
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: string
 *
 *     responses:
 *       200:
 *         description: Real paper fetched
 */
router.get(
    "/exams/:examId/real-paper",
    verifyUser,
    quizController.getRealPaperMock
);


module.exports = router;