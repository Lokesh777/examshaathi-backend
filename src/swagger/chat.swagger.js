/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: AI Chat APIs
 */

/**
 * @swagger
 * /api/chat/exams/{examId}/topics/{topicId}/chat:
 *   get:
 *     summary: Get chat history
 *     description: Retrieve the chat history for a specific exam and topic.
 *     tags:
 *       - Chat
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
 *         description: Chat history fetched successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - role: "user"
 *                   message: "Explain Algebra"
 *                   createdAt: "2026-07-31T10:30:00Z"
 *                 - role: "assistant"
 *                   message: "Algebra is a branch of mathematics..."
 *                   createdAt: "2026-07-31T10:30:05Z"
 *       400:
 *         description: Invalid exam or topic ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat history not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/chat/exams/{examId}/topics/{topicId}/chat:
 *   post:
 *     summary: Send a chat message
 *     description: Send a message to the AI assistant for the selected topic.
 *     tags:
 *       - Chat
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: Explain this topic in simple language.
 *     responses:
 *       200:
 *         description: AI response generated successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 role: "assistant"
 *                 message: "Sure! Here's a simple explanation..."
 *                 createdAt: "2026-07-31T10:31:15Z"
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Topic not found
 *       500:
 *         description: Internal server error
 */