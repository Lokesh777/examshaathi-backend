const express = require("express");
const chatController = require("../controllers/chat.controller");
const { verifyUser } = require("../middleware/user.middleware");

const router = express.Router();

router.get(
  "/exams/:examId/topics/:topicId/chat",
  verifyUser,
  chatController.getHistory,
);

router.post(
  "/exams/:examId/topics/:topicId/chat",
  verifyUser,
  chatController.sendMessage,
);

module.exports = router;
