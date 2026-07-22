// controllers/chat.controller.js
const { askQuestion, getChatHistory } = require("../services/chat.service");

const sendMessage = async (req, res) => {
  try {
    const { examId, topicId } = req.params;
    const { message } = req.body;
    const userId = req.user._id || req.user.id;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Message cannot be empty" });
    }

    const result = await askQuestion(userId, examId, topicId, message);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const { topicId } = req.params;
    const userId = req.user._id || req.user.id;

    const history = await getChatHistory(userId, topicId);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { sendMessage, getHistory };