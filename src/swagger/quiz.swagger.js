/**
 * @swagger
 * tags:
 *   name: Quiz
 *   description: Quiz and Real Paper APIs
 */

/**
 * @swagger
 * /api/quiz/exams/{examId}/topics/{topicId}/quiz:
 *   get:
 *     summary: Get topic quiz
 *     description: Returns the quiz associated with a topic.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         description: Exam ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: topicId
 *         required: true
 *         description: Topic ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quiz fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quiz not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/quiz/quizzes/{quizId}/attempt:
 *   post:
 *     summary: Submit quiz attempt
 *     description: Submit answers for a quiz and receive the calculated result.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         description: Quiz ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     questionId:
 *                       type: string
 *                     answer:
 *                       type: string
 *     responses:
 *       200:
 *         description: Quiz submitted successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/quiz/quizzes/{quizId}/leaderboard:
 *   get:
 *     summary: Get leaderboard
 *     description: Returns the leaderboard for a quiz.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         description: Quiz ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Leaderboard fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quiz not found
 */

/**
 * @swagger
 * /api/quiz/quizzes/{quizId}:
 *   get:
 *     summary: Get quiz details
 *     description: Returns quiz information and questions for the specified quiz.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         description: Quiz ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quiz fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quiz not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/quiz/quizzes/{quizId}:
 *   patch:
 *     summary: Rename quiz
 *     description: Update the title of a quiz.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: quizId
 *         required: true
 *         description: Quiz ID
 *         schema:
 *           type: string
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
 *                 example: "Mock Test 1"
 *     responses:
 *       200:
 *         description: Quiz renamed successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quiz not found
 */

/**
 * @swagger
 * /api/quiz/exams/{examId}/real-paper:
 *   get:
 *     summary: List real paper mocks
 *     description: Returns all real paper mock quizzes for the authenticated user and exam.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         description: Exam ID
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Real paper mocks fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Exam not found
 */

/**
 * @swagger
 * /api/quiz/exams/{examId}/real-paper:
 *   post:
 *     summary: Create real paper mock
 *     description: Generate a new real paper mock quiz for the authenticated user.
 *     tags:
 *       - Quiz
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         description: Exam ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "SSC CGL Mock Paper 1"
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