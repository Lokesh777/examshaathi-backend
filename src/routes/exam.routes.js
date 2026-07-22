const express = require("express");
const { verifyUser } = require("../middleware/user.middleware");
const examController = require("../controllers/exam.controller");

const router = express.Router();
/**
 * @swagger
 * /api/exam:
 *   get:
 *     summary: Get all exams
 *     tags:
 *       - Exams
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of exams
 */
router.get("/", verifyUser, examController.listExams);              // GET /api/exams

/**
 * @swagger
 * /api/exam/{examId}/topics:
 *   get:
 *     summary: Get topics of an exam
 *     tags:
 *       - Exams
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: string
 *         description: Exam ID
 *     responses:
 *       200:
 *         description: Topics fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   - id: "123"
 *                     name: "Mathematics"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Exam not found
 */
router.get("/:examId/topics", verifyUser, examController.listTopics);

module.exports = router