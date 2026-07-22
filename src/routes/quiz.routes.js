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
// router.get(
//     "/exams/:examId/real-paper",
//     verifyUser,
//     quizController.getRealPaperMock
// );


/**
 * @swagger
 * /api/quiz/quizzes/{quizId}:
 *   get:
 *     summary: Get quiz details by quiz ID
 *     description: Returns the complete quiz, including its questions and metadata, for the specified quiz ID.
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         description: Unique ID of the quiz
 *         schema:
 *           type: string
 *         example: "64f2b8d4c1a2b34567890abc"
 *
 *     responses:
 *       200:
 *         description: Quiz fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 message: Quiz fetched successfully
 *                 data:
 *                   _id: "64f2b8d4c1a2b34567890abc"
 *                   title: "Indian Polity Mock Test"
 *                   totalQuestions: 25
 *
 *       401:
 *         description: Unauthorized
 *
 *       404:
 *         description: Quiz not found
 *
 *       500:
 *         description: Internal server error
 */

// RETAKE — fetch an existing paper's frozen questions
// (already exists, just make sure controller now uses getRealPaperMockById, not populate('questions') directly —
//  the old populate() leaked correctAnswer/explanation to frontend, this fixes that)
router.get("/quizzes/:quizId", verifyUser, quizController.getQuizBasedOnQuizId)


/**
 * @swagger
 * /api/quiz/exams/{examId}/real-paper:
 *   get:
 *     summary: List all real paper mocks for an exam
 *     description: Returns all saved real paper mock quizzes created for the specified exam by the authenticated user.
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         description: Exam ID
 *         schema:
 *           type: string
 *         example: "6a5bacd656eaedbfde97dd22"
 *
 *     responses:
 *       200:
 *         description: Real paper mocks fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Exam not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/exams/:examId/real-paper",
    verifyUser,
    quizController.listRealPaperMocksHandler
);


/**
 * @swagger
 * /api/quiz/exams/{examId}/real-paper:
 *   post:
 *     summary: Create a new real paper mock
 *     description: Generates a new real paper mock quiz for the authenticated user.
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         description: Exam ID
 *         schema:
 *           type: string
 *         example: "6a5bacd656eaedbfde97dd22"
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - title
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "6a5bacd656eaedbfde97dd22"
 *               title:
 *                 type: string
 *                 example: "Mock Paper 1"
 *
 *     responses:
 *       201:
 *         description: Real paper mock created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Exam not found
 *       500:
 *         description: Internal server error
 */
router.post(
    "/exams/:examId/real-paper",
    verifyUser,
    quizController.getRealPaperMock
);


/**
 * @swagger
 * /api/quiz/quizzes/{quizId}:
 *   patch:
 *     summary: Rename a quiz
 *     description: Updates the title of an existing quiz.
 *     tags: [Quiz]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         description: Quiz ID
 *         schema:
 *           type: string
 *         example: "6a5bacd656eaedbfde97dd22"
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: "AI Generated 1"
 *
 *     responses:
 *       200:
 *         description: Quiz renamed successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quiz not found
 *       500:
 *         description: Internal server error
 */
router.patch(
    "/quizzes/:quizId",
    verifyUser,
    quizController.renameQuiz
);

module.exports = router;