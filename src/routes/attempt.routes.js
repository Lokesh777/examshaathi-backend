const express = require("express");
const attemptController = require("../controllers/attempt.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Paper Attempts
 *   description: User quiz attempt APIs
 */


/**
 * @swagger
 * /api/paper/attempts:
 *   get:
 *     summary: Get all attempts of the logged-in user
 *     description: Returns a list of quiz attempts made by the authenticated user.
 *     tags: [Attempts]
 *     security:
 *       - bearerAuth: []
 *
 *     responses:
 *       200:
 *         description: Attempts fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 message: Attempts fetched successfully
 *                 data:
 *                   - _id: "64f2b8d4c1a2b34567890abc"
 *                     quizId: "64f2b8d4c1a2b34567890def"
 *                     score: 18
 *                     totalQuestions: 25
 *                     submittedAt: "2026-07-22T10:30:00.000Z"
 *
 *       401:
 *         description: Unauthorized
 *
 *       500:
 *         description: Internal server error
 */
router.get(
    "/attempts",
    verifyUser,
    attemptController.getMyAttempts
);


/**
 * @swagger
 * /api/paper/attempts/{attemptId}:
 *   get:
 *     summary: Get attempt details
 *     description: Returns detailed information about a specific quiz attempt.
 *     tags: [Attempts]
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         description: Unique ID of the attempt
 *         schema:
 *           type: string
 *         example: "64f2b8d4c1a2b34567890abc"
 *
 *     responses:
 *       200:
 *         description: Attempt details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 message: Attempt details fetched successfully
 *                 data:
 *                   _id: "64f2b8d4c1a2b34567890abc"
 *                   quizId: "64f2b8d4c1a2b34567890def"
 *                   score: 18
 *                   totalQuestions: 25
 *                   submittedAt: "2026-07-22T10:30:00.000Z"
 *                   answers:
 *                     - questionId: "123"
 *                       selectedAnswer: "A"
 *                       correctAnswer: "B"
 *                       isCorrect: false
 *
 *       401:
 *         description: Unauthorized
 *
 *       404:
 *         description: Attempt not found
 *
 *       500:
 *         description: Internal server error
 */
router.get(
    "/attempts/:attemptId",
    verifyUser,
    attemptController.getAttemptDetail
);

module.exports = router;