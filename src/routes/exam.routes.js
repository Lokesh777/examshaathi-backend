const express = require("express");
const { verifyUser } = require("../middleware/user.middleware");
const examController = require("../controllers/exam.controller");

const router = express.Router();

router.get("/", verifyUser, examController.listExams);

router.get("/:examId/topics", verifyUser, examController.listTopics);

module.exports = router;