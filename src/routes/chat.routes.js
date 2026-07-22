const express = require("express");
const chatController = require("../controllers/chat.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();


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
 *     tags: [Chat]
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
 *       - in: path
 *         name: topicId
 *         required: true
 *         schema:
 *           type: string
 *
 *     responses:
 *       200:
 *         description: Chat history fetched
 */
router.get(
    "/exams/:examId/topics/:topicId/chat",
    verifyUser,
    chatController.getHistory
);



/**
 * @swagger
 * /api/chat/exams/{examId}/topics/{topicId}/chat:
 *   post:
 *     summary: Send chat message
 *     tags: [Chat]
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
 *       - in: path
 *         name: topicId
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
 *             properties:
 *               message:
 *                 type: string
 *                 example: Explain this topic
 *
 *     responses:
 *       200:
 *         description: Message sent
 */
router.post(
    "/exams/:examId/topics/:topicId/chat",
    verifyUser,
    chatController.sendMessage
);


module.exports = router;