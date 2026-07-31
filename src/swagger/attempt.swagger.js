/**
 * @swagger
 * tags:
 *   name: Paper Attempts
 *   description: APIs for viewing quiz attempt history and details.
 */

/**
 * @swagger
 * /api/paper/attempts:
 *   get:
 *     summary: Get my quiz attempts
 *     description: Returns all quiz attempts of the authenticated user.
 *     tags:
 *       - Paper Attempts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quiz attempts fetched successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attempts fetched successfully
 *               data:
 *                 - _id: "64f2b8d4c1a2b34567890abc"
 *                   quizId: "64f2b8d4c1a2b34567890def"
 *                   score: 18
 *                   totalQuestions: 25
 *                   submittedAt: "2026-07-22T10:30:00.000Z"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/paper/attempts/{attemptId}:
 *   get:
 *     summary: Get attempt details
 *     description: Returns detailed information about a specific quiz attempt.
 *     tags:
 *       - Paper Attempts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         description: Attempt ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attempt details fetched successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Attempt details fetched successfully
 *               data:
 *                 _id: "64f2b8d4c1a2b34567890abc"
 *                 quizId: "64f2b8d4c1a2b34567890def"
 *                 score: 18
 *                 totalQuestions: 25
 *                 submittedAt: "2026-07-22T10:30:00.000Z"
 *                 answers:
 *                   - questionId: "123"
 *                     selectedAnswer: "A"
 *                     correctAnswer: "B"
 *                     isCorrect: false
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Attempt not found
 *       500:
 *         description: Internal server error
 */