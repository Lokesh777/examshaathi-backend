const examModel = require("../models/exam.model");
const topicModel = require("../models/topic.model");

const listExams = async (req, res) => {
  try {
    const exams = await examModel.find().select("name slug syllabusStatus pattern.totalQuestions");
    res.json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listTopics = async (req, res) => {
  try {
    const { examId } = req.params;
    const topics = await topicModel
      .find({ examId, deprecated: false })
      .select("name order weightage patternSection")
      .sort({ order: 1 });
    res.json({ success: true, data:topics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


module.exports = { listExams, listTopics };