const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");
const {
  validateImport,
  importQuestionsAndQuiz,
  getAdminProfile,
  listCatalogForAdmin,
} = require("../services/questionImport.service");
const { generateQuestionsForAdmin } = require("../services/questionGeneration.service");

const getProfile = async (req, res) => {
  try {
    const data = await getAdminProfile(req.params.examId);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const listCatalogHandler = async (req, res) => {
  try {
    const data = await listCatalogForAdmin(req.params.examId);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const validateImportHandler = async (req, res) => {
  try {
    const data = await validateImport(req.params.examId, req.body);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const importHandler = async (req, res) => {
  try {
    const data = await importQuestionsAndQuiz(
      req.params.examId,
      req.body,
      req.user.id
    );
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

const generateHandler = async (req, res) => {
  try {
    const exam = await examModel.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    const { topicId, count = 5, questionType = "auto" } = req.body;
    if (!topicId) {
      return res.status(400).json({ success: false, message: "topicId is required" });
    }
    const topic = await topicModel
      .findOne({ _id: topicId, examId: exam._id })
      .select("name patternSection weightageSourceLinks");
    if (!topic) {
      return res.status(404).json({ success: false, message: "Topic not found" });
    }

    const safeCount = Math.min(Math.max(1, Number(count) || 5), 20);
    const userId = req.user._id || req.user.id;
    const data = await generateQuestionsForAdmin(exam, topic, safeCount, questionType, userId);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  getProfile,
  listCatalogHandler,
  validateImportHandler,
  importHandler,
  generateHandler,
};
