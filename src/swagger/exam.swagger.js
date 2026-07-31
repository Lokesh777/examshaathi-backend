/**
 * @swagger
 * tags:
 *   name: Exams
 *   description: Exam and Topic APIs
 */

/**
 * @swagger
 * /api/exam:
 *   get:
 *     summary: Get all exams
 *     description: Returns a list of all available exams.
 *     tags:
 *       - Exams
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Exams fetched successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - _id: "6898c8f0d8d6a5f6d7b8c9e0"
 *                   title: "SSC CGL"
 *                 - _id: "6898c8f0d8d6a5f6d7b8c9e1"
 *                   title: "UPSC"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/exam/{examId}/topics:
 *   get:
 *     summary: Get topics for an exam
 *     description: Returns all topics belonging to the specified exam.
 *     tags:
 *       - Exams
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         description: MongoDB ObjectId of the exam.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Topics fetched successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - _id: "6898c8f0d8d6a5f6d7b8c9e2"
 *                   title: "Algebra"
 *                 - _id: "6898c8f0d8d6a5f6d7b8c9e3"
 *                   title: "Geometry"
 *       400:
 *         description: Invalid exam id
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Exam not found
 *       500:
 *         description: Internal server error
 */